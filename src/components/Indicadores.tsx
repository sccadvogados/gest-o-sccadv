import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { CartesianGrid, LabelList, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, todayISO } from "@/lib/format";

// Tabelas novas ainda não estão nos tipos gerados.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as unknown as { from: (table: string) => any };

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const NOMES_SOCIO: Record<string, string> = { TAC: "Tiago Craveiro", RCMT: "Raphael Corradi", ASS: "Alexandre Souza" };
const RECEITAS = ["(R) Pró-labore", "(R) Honorários de Êxito", "(R) Honorários de Sucumbência"];
const DESPESAS_ESCRITORIO = ["(D) Marketing", "(D) Serviços", "(D) Emissão de Nota Fiscal", "(D) Impostos", "(D) Outras Despesas"];

type Contrato = {
  id: string;
  created_at: string;
  rascunho: boolean;
  modality: string;
  total_value: number;
  success_fee_percent: number;
  captacao: string | null;
  captacao_percentual: number | null;
  retencao_percentual: number | null;
};
type Lancamento = { data: string; tipo: string; categoria: string; valor: number; socio: string | null; contrato_id: string | null };
type Parcela = { amount: number; due_date: string; status: string; contract_id: string };
type Parceria = { contrato_id: string; valor: number };

const soma = (valores: number[]) => valores.reduce((total, valor) => total + valor, 0);
const mesDe = (data: string) => data.slice(0, 7);

function anterior(mes: string) {
  const [ano, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(ano!, m! - 2, 15));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function valorCurto(valor: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(valor || 0);
}

export function Indicadores() {
  const hoje = todayISO();
  const anoAtual = Number(hoje.slice(0, 4));
  const [mes, setMes] = useState(mesDe(hoje));

  const { data, isLoading } = useQuery({
    queryKey: ["indicadores"],
    queryFn: async () => {
      const [l, c, p, pa] = await Promise.all([
        db.from("lancamentos").select("data, tipo, categoria, valor, socio, contrato_id"),
        db.from("contracts").select("id, created_at, rascunho, modality, total_value, success_fee_percent, captacao, captacao_percentual, retencao_percentual"),
        db.from("installments").select("amount, due_date, status, contract_id"),
        db.from("contrato_parceiros").select("contrato_id, valor"),
      ]);
      for (const r of [l, c, p, pa]) if (r.error) throw r.error;
      return {
        lancamentos: (l.data ?? []) as Lancamento[],
        contratos: (c.data ?? []) as Contrato[],
        parcelas: (p.data ?? []) as Parcela[],
        parcerias: (pa.data ?? []) as Parceria[],
      };
    },
  });

  if (isLoading || !data) return <p className="mt-8 text-center text-sm text-muted-foreground">Carregando indicadores…</p>;

  const contratoPorId = new Map(data.contratos.map((contrato) => [contrato.id, contrato]));
  const doMes = (m: string) => data.lancamentos.filter((item) => mesDe(item.data) === m);

  // 1) Recebido no mês × mês anterior
  const recebidoEm = (m: string) => soma(doMes(m).filter((i) => i.tipo === "entrada" && RECEITAS.includes(i.categoria)).map((i) => Number(i.valor)));
  const recebido = recebidoEm(mes);
  const recebidoAnterior = recebidoEm(anterior(mes));
  const variacao = recebidoAnterior > 0 ? ((recebido - recebidoAnterior) / recebidoAnterior) * 100 : null;

  // 2) Resultado do escritório = retenção do mês − despesas do escritório
  const retencao = soma(
    doMes(mes)
      .filter((i) => i.tipo === "entrada" && RECEITAS.includes(i.categoria) && i.contrato_id)
      .map((i) => Number(i.valor) * ((Number(contratoPorId.get(i.contrato_id!)?.retencao_percentual) || 0) / 100)),
  );
  const despesas = soma(doMes(mes).filter((i) => i.tipo === "saida" && DESPESAS_ESCRITORIO.includes(i.categoria)).map((i) => Number(i.valor)));
  const resultado = retencao - despesas;

  // 3) Marketing e custo por cliente captado
  const marketing = soma(doMes(mes).filter((i) => i.tipo === "saida" && i.categoria === "(D) Marketing").map((i) => Number(i.valor)));
  const novos = data.contratos.filter((contrato) => !contrato.rascunho && mesDe(contrato.created_at) === mes);
  const novosTrafego = novos.filter((contrato) => contrato.captacao === "Tráfego Pago");
  const honorariosTrafego = soma(novosTrafego.map((contrato) => Number(contrato.total_value) || 0));
  const custoPorCliente = novos.length > 0 ? marketing / novos.length : null;
  const retorno = marketing > 0 ? honorariosTrafego / marketing : null;

  // 4) Inadimplência: parcelas vencidas em 2026 até ontem
  const vencidas = data.parcelas.filter((p) => p.due_date >= "2026-01-01" && p.due_date < hoje);
  const totalVencido = soma(vencidas.map((p) => Number(p.amount)));
  const emAtraso = soma(vencidas.filter((p) => p.status !== "Pago").map((p) => Number(p.amount)));
  const inadimplencia = totalVencido > 0 ? (emAtraso / totalVencido) * 100 : 0;

  // Previsão: bruto a receber e o que sobra para os sócios (após retenção, captação e parceiros)
  const [anoHoje, mesHoje] = hoje.split("-").map(Number);
  const previsao = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(anoHoje!, mesHoje! - 1 + i, 15));
    const chave = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const abertas = data.parcelas.filter((p) => p.status !== "Pago" && mesDe(p.due_date) === chave);
    const bruto = soma(abertas.map((p) => Number(p.amount)));
    const liquido = soma(abertas.map((p) => {
      const contrato = contratoPorId.get(p.contract_id);
      const valor = Number(p.amount);
      if (!contrato) return valor;
      const ret = (Number(contrato.retencao_percentual) || 0) / 100;
      const cap = (Number(contrato.captacao_percentual) || 0) / 100;
      const total = Number(contrato.total_value) || 0;
      const parceiros = total > 0 ? soma(data.parcerias.filter((x) => x.contrato_id === contrato.id).map((x) => Number(x.valor))) / total : 0;
      return Math.max(0, valor * (1 - ret - cap - parceiros));
    }));
    return { rotulo: `${MESES_CURTOS[d.getUTCMonth()]}/${String(d.getUTCFullYear()).slice(2)}`, bruto: Math.round(bruto), liquido: Math.round(liquido) };
  });
  const maximo = Math.max(...previsao.map((p) => p.bruto), 1);

  const porSocio = ["TAC", "RCMT", "ASS"].map((sigla) => ({
    sigla,
    valor: soma(doMes(mes).filter((i) => i.tipo === "saida" && i.categoria === "(D) Distribuição de Honorários" && i.socio === sigla).map((i) => Number(i.valor))),
  }));
  const [anoSel, mesSel] = mes.split("-").map(Number);
  const nomeMes = MESES[mesSel! - 1];
  const nomeAnterior = MESES[Number(anterior(mes).slice(5, 7)) - 1]!.toLowerCase();

  return (
    <div className="mt-6">
      <Select value={mes} onValueChange={setMes}>
        <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
        <SelectContent>
          {MESES.map((nome, index) => {
            const valor = `${anoAtual}-${String(index + 1).padStart(2, "0")}`;
            return <SelectItem key={valor} value={valor}>{`${nome}/${anoAtual}`}</SelectItem>;
          })}
        </SelectContent>
      </Select>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi titulo="Recebido no Mês" cor="#0F2340" valor={formatCurrency(recebido)}
          detalhe={variacao == null ? `Sem recebimentos em ${nomeAnterior}` : `${variacao >= 0 ? "▲" : "▼"} ${Math.abs(variacao).toFixed(0)}% vs. ${nomeAnterior}`}
          detalheCor={variacao == null ? undefined : variacao >= 0 ? "#256b3a" : "#B42318"}
          dica="Pró-labore, êxito e sucumbência que entraram no mês." />
        <Kpi titulo="Resultado do Escritório" cor="#C08A5E" valor={formatCurrency(resultado)} perigo={resultado < 0}
          detalhe={`Retenção ${formatCurrency(retencao)} − despesas ${formatCurrency(despesas)}`}
          dica="Quanto a retenção do mês cobre das despesas do escritório (marketing, serviços, nota fiscal, impostos e outras)." />
        <Kpi titulo="Custo por Cliente Captado" cor="#7D8BA0" valor={custoPorCliente == null ? "—" : formatCurrency(custoPorCliente)}
          detalhe={`Marketing ${formatCurrency(marketing)} ÷ ${novos.length} contrato${novos.length === 1 ? "" : "s"} novo${novos.length === 1 ? "" : "s"}`}
          dica="Gasto com marketing no mês dividido pelos contratos cadastrados no mês." />
        <Kpi titulo="Inadimplência" cor="#B42318" valor={`${inadimplencia.toFixed(1).replace(".", ",")}%`} perigo={inadimplencia > 0}
          detalhe={`${formatCurrency(emAtraso)} vencidos e não pagos`}
          dica="Parcelas vencidas em 2026 que ainda não foram pagas, sobre o total vencido no ano." />
      </div>

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-[1.6fr_1fr]">
        <div className="panel p-5">
          <p className="font-semibold text-[#0F2340]">Previsão dos Próximos 12 Meses</p>
          <div className="mt-3 h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={previsao} margin={{ top: 24, right: 24, bottom: 4, left: 8 }}>
                <CartesianGrid stroke="#ECE8E1" vertical={false} />
                <XAxis dataKey="rotulo" tick={{ fontSize: 11, fill: "#6b7280" }} tickLine={false} axisLine={{ stroke: "#E6E1D8" }} />
                <YAxis width={72} domain={[0, Math.ceil((maximo * 1.15) / 100) * 100]} tick={{ fontSize: 11, fill: "#6b7280" }} tickLine={false} axisLine={false} tickFormatter={valorCurto} />
                <Tooltip formatter={(valor: number, nome: string) => [formatCurrency(valor), nome]} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line name="A Receber (Bruto)" type="monotone" dataKey="bruto" stroke="#C08A5E" strokeWidth={2.5} dot={{ r: 3, fill: "#C08A5E" }}>
                  <LabelList dataKey="bruto" position="top" offset={8} style={{ fontSize: 10, fill: "#7A5A3C" }} formatter={valorCurto} />
                </Line>
                <Line name="Sobra para os Sócios" type="monotone" dataKey="liquido" stroke="#0F2340" strokeWidth={2.5} dot={{ r: 3, fill: "#0F2340" }}>
                  <LabelList dataKey="liquido" position="bottom" offset={8} style={{ fontSize: 10, fill: "#0F2340" }} formatter={valorCurto} />
                </Line>
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">"Sobra para os Sócios" desconta retenção, captação e parceiros de cada contrato.</p>
        </div>

        <div className="panel p-5 text-sm">
          <p className="font-semibold text-[#0F2340]">{`Marketing · ${nomeMes}`}</p>
          <Linha rotulo="Gasto no mês" valor={formatCurrency(marketing)} />
          <Linha rotulo="Contratos novos por Tráfego Pago" valor={String(novosTrafego.length)} />
          <Linha rotulo="Honorários desses contratos" valor={formatCurrency(honorariosTrafego)} />
          <Linha rotulo="Retorno do Marketing" valor={retorno == null ? "—" : `${retorno.toFixed(1).replace(".", ",")}×`} cor={retorno == null ? undefined : retorno >= 1 ? "#256b3a" : "#B42318"} ultima />
          <p className="mt-5 font-semibold text-[#0F2340]">{`Por Sócio · ${nomeMes}/${anoSel}`}</p>
          {porSocio.map(({ sigla, valor }, index) => (
            <Linha key={sigla} rotulo={NOMES_SOCIO[sigla]!} valor={formatCurrency(valor)} ultima={index === porSocio.length - 1} />
          ))}
        </div>
      </div>
    </div>
  );
}

function Kpi({ titulo, valor, detalhe, cor, perigo, detalheCor, dica }: { titulo: string; valor: string; detalhe: string; cor: string; perigo?: boolean | undefined; detalheCor?: string | undefined; dica: string }) {
  return (
    <div className="panel border-t-4 p-5" style={{ borderTopColor: cor }} title={dica}>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</p>
      <p className={`mt-2 whitespace-nowrap text-xl font-semibold tabular-nums xl:text-2xl ${perigo ? "text-[#B42318]" : "text-[#0F2340]"}`}>{valor}</p>
      <p className="mt-1 text-xs text-muted-foreground" style={detalheCor ? { color: detalheCor } : undefined}>{detalhe}</p>
    </div>
  );
}

function Linha({ rotulo, valor, cor, ultima }: { rotulo: string; valor: string; cor?: string | undefined; ultima?: boolean | undefined }) {
  return (
    <div className={`flex justify-between gap-3 py-2 ${ultima ? "" : "border-b border-[#F2EFEA]"}`}>
      <span>{rotulo}</span>
      <b className="whitespace-nowrap tabular-nums" style={cor ? { color: cor } : undefined}>{valor}</b>
    </div>
  );
}