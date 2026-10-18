import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { CurrencyInput } from "@/components/CurrencyInput";
import { CATEGORIAS_DISTRIBUIVEIS, DistribuirRecebimentos } from "@/components/DistribuirRecebimentos";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatDate, todayISO } from "@/lib/format";

// Tabela nova (lancamentos) ainda não está nos tipos gerados.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as unknown as { from: (table: string) => any };

const CATEGORIAS_ENTRADA = [
  "(R) Pró-labore",
  "(R) Honorários de Êxito",
  "(R) Honorários de Sucumbência",
  "(R) Diligência",
  "(R) Outras Receitas",
] as const;
const CATEGORIAS_SAIDA = [
  "(D) Distribuição de Honorários",
      "(D) Captação/Parceria",
  "(D) Marketing",
  "(D) Serviços",
  "(D) Emissão de Nota Fiscal",
  "(D) Impostos",
  "(D) Outras Despesas",
] as const;
const SOCIOS = ["TAC", "RCMT", "ASS"] as const;
const CORES_SOCIO: Record<string, string> = { TAC: "#0F2340", RCMT: "#C08A5E", ASS: "#7D8BA0" };
const NOMES_SOCIO: Record<string, string> = { TAC: "Tiago Craveiro", RCMT: "Raphael Corradi", ASS: "Alexandre Souza" };
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

type Lancamento = {
  id: string;
  data: string;
  descricao: string;
  tipo: "entrada" | "saida";
  categoria: string;
  valor: number;
  cliente_id: string | null;
  contrato_id: string | null;
  parcela_id: string | null;
  socio: string | null;
  observacao: string | null;
  revisar: boolean;
      origem: "manual" | "parcela" | "importacao" | "saldo_inicial";
  distribuido: boolean;
  lote_id: string | null;
  created_at: string;
  clients: { id: string; name: string } | null;
  contracts: { numero: number | null; ano: number | null } | null;
};

type Form = {
  id?: string;
  data: string;
  tipo: "entrada" | "saida";
  categoria: string;
  descricao: string;
  valor: number;
  socio: string;
          cliente_id: string;
  contrato_id: string;
  observacao: string;
  revisar: boolean;
};

const FORM_VAZIO: Form = {
  data: todayISO(),
  tipo: "saida",
  categoria: "(D) Serviços",
  descricao: "",
  valor: 0,
  socio: "",
          cliente_id: "",
  contrato_id: "",
  observacao: "",
  revisar: false,
};

function assinado(item: Lancamento) {
  return item.tipo === "entrada" ? Number(item.valor) : -Number(item.valor);
}

function numeroContrato(contrato: Lancamento["contracts"]) {
  return contrato?.numero != null && contrato.ano != null ? `${String(contrato.numero).padStart(3, "0")}/${contrato.ano}` : "";
}

export function LivroCaixa() {
  const queryClient = useQueryClient();
  const hoje = todayISO();
  const anoAtual = Number(hoje.slice(0, 4));
  const [periodo, setPeriodo] = useState(hoje.slice(0, 7)); // "AAAA-MM" ou "AAAA"
  const [tipo, setTipo] = useState("todos");
  const [categoria, setCategoria] = useState("todas");
  const [socio, setSocio] = useState("todos");
  const [form, setForm] = useState<Form | null>(null);

  const { data: lancamentos, isLoading } = useQuery({
    queryKey: ["lancamentos"],
    queryFn: async () => {
      const { data, error } = await db
        .from("lancamentos")
        .select("*, clients(id, name), contracts(numero, ano)")
        .order("data")
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as Lancamento[];
    },
  });

  const { data: clientes } = useQuery({
    queryKey: ["clients-lista-caixa"],
    enabled: form !== null,
    queryFn: async () => {
      const { data, error } = await db.from("clients").select("id, name").eq("rascunho", false).order("name");
      if (error) throw error;
                              return (data ?? []) as Array<{ id: string; name: string }>;
    },
  });

  // Contratos do cliente escolhido no formulário (igual aos outros campos de cliente do sistema).
  const clienteForm = form?.cliente_id ?? "";
  const { data: contratosCliente } = useQuery({
    queryKey: ["contratos-cliente-caixa", clienteForm],
    enabled: Boolean(clienteForm),
    queryFn: async () => {
      const { data, error } = await db
        .from("contracts")
        .select("id, numero, ano, objeto")
        .eq("client_id", clienteForm)
        .eq("rascunho", false)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; numero: number | null; ano: number | null; objeto: string | null }>;
    },
  });

  // Período: mês ("2026-08") ou ano inteiro ("2026").
  const inicio = periodo.length === 4 ? `${periodo}-01-01` : `${periodo}-01`;
  const fim = periodo.length === 4 ? `${periodo}-12-31` : `${periodo}-31`;
  const todos = lancamentos ?? [];
  const saldoInicial = todos
    .filter((item) => item.data < inicio || (item.origem === "saldo_inicial" && item.data <= fim))
    .reduce((soma, item) => soma + assinado(item), 0);
  const doPeriodo = todos.filter((item) => item.origem !== "saldo_inicial" && item.data >= inicio && item.data <= fim);
  const entradas = doPeriodo.filter((item) => item.tipo === "entrada").reduce((soma, item) => soma + Number(item.valor), 0);
  const saidas = doPeriodo.filter((item) => item.tipo === "saida").reduce((soma, item) => soma + Number(item.valor), 0);
  const saldoFinal = saldoInicial + entradas - saidas;

  // Saldo corrido é sempre calculado sobre o período inteiro; os filtros só escondem linhas.
  let corrente = saldoInicial;
  const linhas = doPeriodo.map((item) => {
    corrente += assinado(item);
    return { item, saldo: corrente };
  });
  const visiveis = linhas.filter(({ item }) =>
    (tipo === "todos" || item.tipo === tipo) &&
    (categoria === "todas" || item.categoria === categoria) &&
    (socio === "todos" || item.socio === socio),
  );
  const filtrado = tipo !== "todos" || categoria !== "todas" || socio !== "todos";

  const porSocio = SOCIOS.map((sigla) => ({
    sigla,
    valor: doPeriodo
      .filter((item) => item.tipo === "saida" && item.categoria === "(D) Distribuição de Honorários" && item.socio === sigla)
      .reduce((soma, item) => soma + Number(item.valor), 0),
  }));
  const porCategoria = [...new Set(doPeriodo.map((item) => item.categoria))]
    .map((nome) => ({
      nome,
      valor: doPeriodo.filter((item) => item.categoria === nome).reduce((soma, item) => soma + Number(item.valor), 0),
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome));
        const paraRevisar = todos.filter((item) => item.revisar).length;
  const [distribuirAberto, setDistribuirAberto] = useState(false);
  const pendentes = todos.filter((item) => item.tipo === "entrada" && !item.distribuido && CATEGORIAS_DISTRIBUIVEIS.includes(item.categoria));
  const totalPendente = pendentes.reduce((soma, item) => soma + Number(item.valor), 0);



  const salvar = useMutation({
    mutationFn: async (dados: Form) => {
      if (!dados.data) throw new Error("Informe a data.");
      if (dados.data < "2026-01-01") throw new Error("O caixa começa em 01/01/2026.");
      if (!dados.descricao.trim()) throw new Error("Informe a descrição.");
      if (!(dados.valor > 0)) throw new Error("Informe um valor maior que zero.");
      if (dados.categoria === "(D) Distribuição de Honorários" && !dados.socio) throw new Error("Escolha o sócio da distribuição.");
      const registro = {
        data: dados.data,
        tipo: dados.tipo,
        categoria: dados.categoria,
        descricao: dados.descricao.trim(),
        valor: dados.valor,
        socio: dados.categoria === "(D) Distribuição de Honorários" ? dados.socio : null,
                                        cliente_id: dados.cliente_id || null,
        contrato_id: dados.cliente_id && dados.contrato_id ? dados.contrato_id : null,
        observacao: dados.observacao.trim() || null,
        revisar: dados.revisar,
        updated_at: new Date().toISOString(),
      };
      const { error } = dados.id
        ? await db.from("lancamentos").update(registro).eq("id", dados.id)
        : await db.from("lancamentos").insert({ ...registro, origem: "manual" });
      if (error) throw error;
    },
    onSuccess: (_, dados) => {
      queryClient.invalidateQueries({ queryKey: ["lancamentos"] });
      toast.success(dados.id ? "Lançamento atualizado." : "Lançamento incluído.");
      setForm(null);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Não foi possível salvar o lançamento."),
  });

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("lancamentos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lancamentos"] });
      toast.success("Lançamento excluído.");
    },
    onError: () => toast.error("Não foi possível excluir o lançamento."),
  });

  
  const desfazer = useMutation({
    mutationFn: async (lote: string) => {
      const { error } = await (supabase as unknown as { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: unknown }> }).rpc("desfazer_distribuicao", { p_lote: lote });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lancamentos"] });
      toast.success("Distribuição desfeita. Os recebimentos voltaram para A Distribuir.");
    },
    onError: () => toast.error("Não foi possível desfazer a distribuição."),
  });

  function editar(item: Lancamento) {
    setForm({
      id: item.id,
      data: item.data,
      tipo: item.tipo,
      categoria: item.categoria,
      descricao: item.descricao,
      valor: Number(item.valor),
      socio: item.socio ?? "",
                              cliente_id: item.cliente_id ?? "",
      contrato_id: item.contrato_id ?? "",
      observacao: item.observacao ?? "",
      revisar: item.revisar,
    });
  }

  const categoriasForm = form?.tipo === "entrada" ? CATEGORIAS_ENTRADA : CATEGORIAS_SAIDA;
          const nomePeriodo = periodo.length === 4 ? `Ano de ${periodo}` : `${MESES[Number(periodo.slice(5, 7)) - 1]}/${periodo.slice(0, 4)}`;

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={periodo} onValueChange={setPeriodo}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            {MESES.map((mes, index) => {
              const valor = `${anoAtual}-${String(index + 1).padStart(2, "0")}`;
              return <SelectItem key={valor} value={valor}>{`${mes}/${anoAtual}`}</SelectItem>;
            })}
            <SelectItem value={String(anoAtual)}>{`Ano de ${anoAtual}`}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={tipo} onValueChange={setTipo}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os Tipos</SelectItem>
            <SelectItem value="entrada">Entradas</SelectItem>
            <SelectItem value="saida">Saídas</SelectItem>
          </SelectContent>
        </Select>
        <Select value={categoria} onValueChange={setCategoria}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as Categorias</SelectItem>
            {[...CATEGORIAS_ENTRADA, ...CATEGORIAS_SAIDA].map((nome) => <SelectItem key={nome} value={nome}>{nome}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={socio} onValueChange={setSocio}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os Sócios</SelectItem>
                                    {SOCIOS.map((sigla) => <SelectItem key={sigla} value={sigla}>{NOMES_SOCIO[sigla]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button className="ml-auto" onClick={() => setForm({ ...FORM_VAZIO, data: hoje })}>
          <Plus className="size-4" />
          Novo Lançamento
        </Button>
      </div>

                  {pendentes.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-[#E6D6C4] bg-[#FBF7F1] px-4 py-3 text-sm">
          <span>
            <b className="whitespace-nowrap text-[#0F2340]">{`${formatCurrency(totalPendente)} a distribuir`}</b>
            <span className="text-muted-foreground">{` · ${pendentes.length} recebimento${pendentes.length > 1 ? "s" : ""} ainda sem distribuição`}</span>
          </span>
          <Button variant="outline" className="border-[#D4A782]" onClick={() => setDistribuirAberto(true)}>Distribuir Recebimentos</Button>
        </div>
      ) : null}
      <DistribuirRecebimentos pendentes={pendentes} open={distribuirAberto} onOpenChange={setDistribuirAberto} />

      {paraRevisar > 0 ? (
        <p className="mt-3 rounded-md border border-[#E8B9A5] bg-[#FBF1EC] px-3 py-2 text-sm text-[#7A3F2D]">
          {`${paraRevisar} lançamento${paraRevisar > 1 ? "s" : ""} marcado${paraRevisar > 1 ? "s" : ""} para revisar (etiqueta "Revisar" na tabela).`}
        </p>
      ) : null}

      <div className="mt-4 grid gap-4 sm:grid-cols-4">
        <Card titulo={periodo.length === 4 ? "Saldo Inicial do Ano" : "Saldo Inicial do Mês"} valor={saldoInicial} cor="#C9BFAE" />
        <Card titulo="Entradas" valor={entradas} cor="#0F2340" />
        <Card titulo="Saídas" valor={saidas} cor="#B42318" perigo />
        <Card titulo="Saldo Atual" valor={saldoFinal} cor="#C08A5E" perigo={saldoFinal < 0} />
      </div>

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-[1fr_270px]">
        <div className="panel overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Cliente / Contrato</TableHead>
                <TableHead>Sócio</TableHead>
                <TableHead className="text-right">Entrada</TableHead>
                <TableHead className="text-right">Saída</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow className="bg-[#FBFAF7] italic text-muted-foreground">
                <TableCell colSpan={7}>{periodo.length === 4 ? "Saldo inicial" : "Saldo vindo do mês anterior"}</TableCell>
                                                <TableCell className="whitespace-nowrap text-right tabular-nums">{formatCurrency(saldoInicial)}</TableCell>
                <TableCell />
              </TableRow>
              {isLoading ? (
                <TableRow><TableCell colSpan={9} className="py-8 text-center text-muted-foreground">Carregando lançamentos…</TableCell></TableRow>
              ) : null}
              {!isLoading && visiveis.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="py-8 text-center text-muted-foreground">Nenhum lançamento neste período.</TableCell></TableRow>
              ) : null}
              {visiveis.map(({ item, saldo }) => (
                <TableRow key={item.id}>
                  <TableCell className="whitespace-nowrap">{formatDate(item.data)}</TableCell>
                                    <TableCell className="min-w-52">
                    {(() => {
                      // "Cliente · Parcela 1/4" → nome em cima e "Parcela 1 de 4" embaixo.
                      const m = /^(.*) · Parcela (\d+)(?:\/(\d+))?$/.exec(item.descricao);
                      return m ? (
                        <>
                          {m[1]}
                          {item.origem === "parcela" ? <span className="ml-2 text-[10px] font-semibold text-[#B07A4F]">AUTOMÁTICO</span> : null}
                          <div className="text-xs text-muted-foreground">{`Parcela ${m[2]}${m[3] ? ` de ${m[3]}` : ""}`}</div>
                        </>
                      ) : (
                        <>
                          {item.descricao}
                          {item.origem === "parcela" ? <span className="ml-2 text-[10px] font-semibold text-[#B07A4F]">AUTOMÁTICO</span> : null}
                        </>
                      );
                    })()}
                    {item.revisar ? (
                      <span title={item.observacao ?? ""} className="ml-2 cursor-help rounded bg-[#FBF1EC] px-1.5 py-0.5 text-[10px] font-semibold text-[#7A3F2D]">REVISAR</span>
                    ) : null}
                    {!item.revisar && item.observacao ? <div className="text-xs text-muted-foreground">{item.observacao}</div> : null}
                  </TableCell>
                  <TableCell>
                                        <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] ${item.tipo === "entrada" ? "bg-[#E7EEF6] text-[#0F2340]" : "bg-[#F6E9E1] text-[#7A3F2D]"}`}>{item.categoria.replace(/^\(([RD])\)\s*/, "")}</span>
                  </TableCell>
                                    <TableCell className="min-w-44 text-sm">
                    {item.clients ? (
                      <Link to="/clientes/$clientId" params={{ clientId: item.clients.id }} className="underline-offset-4 hover:text-accent hover:underline">
                        {item.clients.name}
                      </Link>
                    ) : "—"}
                    {numeroContrato(item.contracts) ? <span className="text-muted-foreground">{` · ${numeroContrato(item.contracts)}`}</span> : null}
                  </TableCell>
                                    <TableCell className="whitespace-nowrap">{item.socio ? NOMES_SOCIO[item.socio] ?? item.socio : ""}</TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums text-[#256b3a]">{item.tipo === "entrada" ? formatCurrency(item.valor) : ""}</TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums text-[#B42318]">{item.tipo === "saida" ? formatCurrency(item.valor) : ""}</TableCell>
                  <TableCell className={`whitespace-nowrap text-right tabular-nums ${saldo < 0 ? "text-[#B42318]" : ""}`}>{filtrado ? "" : formatCurrency(saldo)}</TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    {item.origem === "parcela" ? (
                      <span className="text-[11px] text-muted-foreground" title="Gerado pela baixa da parcela. Para desfazer, desfaça a baixa na parcela.">—</span>
                    ) : (
                      <>
                        <Button variant="ghost" size="icon" aria-label="Editar Lançamento" title="Editar Lançamento" onClick={() => editar(item)}>
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Excluir Lançamento"
                          title="Excluir Lançamento"
                          disabled={excluir.isPending}
                                                    onClick={() => {
                            if (item.lote_id && item.tipo === "saida") {
                              if (window.confirm("Este lançamento faz parte de uma distribuição. Desfazer a distribuição inteira? As saídas dela serão apagadas e os recebimentos voltam para A Distribuir.")) desfazer.mutate(item.lote_id);
                              return;
                            }
                            if (window.confirm(`Excluir o lançamento "${item.descricao}"?`)) excluir.mutate(item.id);
                          }}
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-[#FBFAF7] font-semibold text-[#0F2340]">
                <TableCell colSpan={5}>{`Total · ${nomePeriodo}`}</TableCell>
                                <TableCell className="whitespace-nowrap text-right tabular-nums text-[#256b3a]">{formatCurrency(entradas)}</TableCell>
                <TableCell className="whitespace-nowrap text-right tabular-nums text-[#B42318]">{formatCurrency(saidas)}</TableCell>
                <TableCell className="whitespace-nowrap text-right tabular-nums">{formatCurrency(saldoFinal)}</TableCell>
                <TableCell />
              </TableRow>
            </TableBody>
          </Table>
          {filtrado ? <p className="px-4 py-2 text-xs text-muted-foreground">Com filtro aplicado, a coluna Saldo fica oculta para não confundir; os cards mostram o período inteiro.</p> : null}
        </div>

        <div className="panel p-4 text-sm">
          <p className="font-semibold text-[#0F2340]">{`Distribuição por Sócio · ${nomePeriodo}`}</p>
          <div className="mt-2 space-y-1.5">
            {porSocio.map(({ sigla, valor }) => (
              <div key={sigla} className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <span className="inline-block size-2.5 rounded-full" style={{ background: CORES_SOCIO[sigla] }} />
                  {NOMES_SOCIO[sigla]}
                </span>
                                <b className="whitespace-nowrap tabular-nums">{formatCurrency(valor)}</b>
              </div>
            ))}
          </div>
          <p className="mt-5 font-semibold text-[#0F2340]">Por Categoria</p>
          <div className="mt-2 space-y-1.5">
            {porCategoria.length === 0 ? <p className="text-muted-foreground">—</p> : null}
            {porCategoria.map(({ nome, valor }) => (
                            <div key={nome} className="flex items-start justify-between gap-3">
                <span className="min-w-0">{nome.replace(/^\(([RD])\)\s*/, "")}</span>
                <span className="shrink-0 whitespace-nowrap tabular-nums">{formatCurrency(valor)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Dialog open={form !== null} onOpenChange={(aberto) => { if (!aberto) setForm(null); }}>
                                <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{form?.id ? "Editar Lançamento" : "Novo Lançamento"}</DialogTitle>
          </DialogHeader>
          {form ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="lanc-data">Data</Label>
                <Input id="lanc-data" className="w-[160px] bg-white" type="date" min="2026-01-01" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select
                  value={form.tipo}
                  onValueChange={(valor: "entrada" | "saida") => setForm({ ...form, tipo: valor, categoria: valor === "entrada" ? CATEGORIAS_ENTRADA[0] : "(D) Serviços", socio: "" })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="entrada">Entrada</SelectItem>
                    <SelectItem value="saida">Saída</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Categoria</Label>
                <Select value={form.categoria} onValueChange={(valor) => setForm({ ...form, categoria: valor })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{categoriasForm.map((nome) => <SelectItem key={nome} value={nome}>{nome}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="lanc-descricao">Descrição</Label>
                <Input id="lanc-descricao" value={form.descricao} placeholder="Tráfego Pago (Meta + Google)" onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lanc-valor">Valor</Label>
                <CurrencyInput id="lanc-valor" value={form.valor} onChange={(valor) => setForm({ ...form, valor })} />
              </div>
              {form.categoria === "(D) Distribuição de Honorários" ? (
                <div className="space-y-2">
                  <Label>Sócio</Label>
                  <Select value={form.socio} onValueChange={(valor) => setForm({ ...form, socio: valor })}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>{SOCIOS.map((sigla) => <SelectItem key={sigla} value={sigla}>{sigla}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              ) : <div />}
              <div className="space-y-2 sm:col-span-2">
                                                <Label>Cliente</Label>
                <Select value={form.cliente_id || "nenhum"} onValueChange={(valor) => setForm({ ...form, cliente_id: valor === "nenhum" ? "" : valor, contrato_id: "" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nenhum">Nenhum</SelectItem>
                    {(clientes ?? []).map((cliente) => <SelectItem key={cliente.id} value={cliente.id}>{cliente.name}</SelectItem>)}
                  </SelectContent>
                                </Select>
              </div>
              {form.cliente_id ? (
                <div className="space-y-2 sm:col-span-2">
                  <Label>Contrato</Label>
                  <Select value={form.contrato_id || "nenhum"} onValueChange={(valor) => setForm({ ...form, contrato_id: valor === "nenhum" ? "" : valor })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nenhum">Sem contrato</SelectItem>
                      {(contratosCliente ?? []).map((contrato) => (
                        <SelectItem key={contrato.id} value={contrato.id}>
                          {`${contrato.numero != null && contrato.ano != null ? `Contrato ${String(contrato.numero).padStart(3, "0")}/${contrato.ano}` : "Contrato"}${contrato.objeto ? ` · ${contrato.objeto.slice(0, 50)}${contrato.objeto.length > 50 ? "…" : ""}` : ""}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="lanc-obs">Observação</Label>
                <Textarea id="lanc-obs" rows={2} value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} />
              </div>
              {form.id ? (
                <label className="flex items-center gap-2 text-sm sm:col-span-2">
                  <Checkbox checked={form.revisar} onCheckedChange={(marcado) => setForm({ ...form, revisar: marcado === true })} />
                  Marcar para revisar
                </label>
              ) : null}
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>Cancelar</Button>
            <Button disabled={salvar.isPending} onClick={() => form && salvar.mutate(form)}>
              {salvar.isPending ? "Salvando…" : form?.id ? "Salvar Alterações" : "Incluir Lançamento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Card({ titulo, valor, cor, perigo }: { titulo: string; valor: number; cor: string; perigo?: boolean }) {
  return (
    <div className="panel border-t-4 p-5" style={{ borderTopColor: cor }}>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</p>
      <p className={`mt-2 text-2xl font-semibold tabular-nums ${perigo ? "text-[#B42318]" : "text-[#0F2340]"}`}>{formatCurrency(valor)}</p>
    </div>
  );
}

