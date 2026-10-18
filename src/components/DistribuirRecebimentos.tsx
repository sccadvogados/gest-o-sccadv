import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatDate, todayISO } from "@/lib/format";

// Tabelas e funções novas ainda não estão nos tipos gerados.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as unknown as { from: (table: string) => any; rpc: (fn: string, args: Record<string, unknown>) => any };

export const NOMES_SOCIO: Record<string, string> = { TAC: "Tiago Craveiro", RCMT: "Raphael Corradi", ASS: "Alexandre Souza" };
const ORDEM_SOCIOS = ["TAC", "RCMT", "ASS"];
export const CATEGORIAS_DISTRIBUIVEIS = ["(R) Pró-labore", "(R) Honorários de Êxito", "(R) Honorários de Sucumbência"];

export type Recebimento = {
  id: string;
  data: string;
  descricao: string;
  categoria: string;
  valor: number;
  cliente_id: string | null;
  contrato_id: string | null;
  clients: { id: string; name: string } | null;
};

type Contrato = {
  id: string;
  numero: number | null;
  ano: number | null;
  modality: string;
  total_value: number;
  success_fee_percent: number;
  captacao: string | null;
  captacao_percentual: number | null;
  retencao_percentual: number | null;
  socios: string[] | null;
};

type Parceria = { contrato_id: string; valor: number; exito_percentual: number; parceiros: { nome: string } | null };

type Calculo = {
  recebimento: Recebimento;
  problema: string | null;
  retencao: number;
  captacao: number;
  parceiros: Array<{ nome: string; valor: number }>;
  socios: string[];
  porSocio: number;
};

const centavos = (valor: number) => Math.round(valor * 100) / 100;

/** Regra do contrato aplicada a um recebimento: retenção sobre o bruto; captação só no pró-labore;
 *  parceiros proporcionais (valor fixo sobre o pró-labore, % sobre o êxito); o saldo dividido igualmente entre os sócios. */
function calcular(recebimento: Recebimento, contrato: Contrato | undefined, parcerias: Parceria[]): Calculo {
  const base: Calculo = { recebimento, problema: null, retencao: 0, captacao: 0, parceiros: [], socios: [], porSocio: 0 };
  if (!contrato) return { ...base, problema: "Sem contrato vinculado." };
  const socios = ORDEM_SOCIOS.filter((sigla) => (contrato.socios ?? []).includes(sigla));
  if (contrato.retencao_percentual == null) return { ...base, problema: "Contrato sem % de Retenção." };
  if (socios.length === 0) return { ...base, problema: "Contrato sem Sócios Envolvidos." };

  const valor = Number(recebimento.valor);
  const ehExito = recebimento.categoria !== "(R) Pró-labore";
  const retencao = centavos(valor * (Number(contrato.retencao_percentual) / 100));
  const captacao = !ehExito && contrato.captacao_percentual ? centavos(valor * (Number(contrato.captacao_percentual) / 100)) : 0;
  const totalContrato = Number(contrato.total_value) || 0;
  const exitoContrato = Number(contrato.success_fee_percent) || 0;
  const parceiros = parcerias
    .map((parceria) => {
      const fracao = ehExito
        ? exitoContrato > 0 ? Number(parceria.exito_percentual) / exitoContrato : 0
        : totalContrato > 0 ? Number(parceria.valor) / totalContrato : 0;
      return { nome: parceria.parceiros?.nome ?? "Parceiro", valor: centavos(valor * fracao) };
    })
    .filter((parceiro) => parceiro.valor > 0);
  const saldo = valor - retencao - captacao - parceiros.reduce((soma, p) => soma + p.valor, 0);
  if (saldo < 0) return { ...base, problema: "Os custos passam do valor recebido." };
  // Arredonda para baixo: centavos que sobrarem ficam no caixa.
  const porSocio = Math.floor((saldo / socios.length) * 100) / 100;
  return { recebimento, problema: null, retencao, captacao, parceiros, socios, porSocio };
}

export function DistribuirRecebimentos({
  pendentes,
  open,
  onOpenChange,
}: {
  pendentes: Recebimento[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [data, setData] = useState(todayISO());
  const [desmarcados, setDesmarcados] = useState<Set<string>>(new Set());
  const contratoIds = [...new Set(pendentes.map((item) => item.contrato_id).filter((id): id is string => Boolean(id)))];

  const { data: regras, isLoading } = useQuery({
    queryKey: ["distribuicao-regras", contratoIds.join(",")],
    enabled: open && contratoIds.length > 0,
    queryFn: async () => {
      const [{ data: contratos, error: e1 }, { data: parcerias, error: e2 }] = await Promise.all([
        db.from("contracts").select("id, numero, ano, modality, total_value, success_fee_percent, captacao, captacao_percentual, retencao_percentual, socios").in("id", contratoIds),
        db.from("contrato_parceiros").select("contrato_id, valor, exito_percentual, parceiros(nome)").in("contrato_id", contratoIds),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      return { contratos: (contratos ?? []) as Contrato[], parcerias: (parcerias ?? []) as Parceria[] };
    },
  });

  const calculos = pendentes.map((item) =>
    calcular(
      item,
      regras?.contratos.find((contrato) => contrato.id === item.contrato_id),
      (regras?.parcerias ?? []).filter((parceria) => parceria.contrato_id === item.contrato_id),
    ),
  );
  const selecionados = calculos.filter((calculo) => !calculo.problema && !desmarcados.has(calculo.recebimento.id));
  const totaisSocio = ORDEM_SOCIOS.map((sigla) => ({
    sigla,
    valor: centavos(selecionados.filter((c) => c.socios.includes(sigla)).reduce((soma, c) => soma + c.porSocio, 0)),
  })).filter((total) => total.valor > 0);
  const totalRetido = centavos(selecionados.reduce((soma, c) => soma + c.retencao, 0));
  const totalRepasses = centavos(selecionados.reduce((soma, c) => soma + c.captacao + c.parceiros.reduce((s, p) => s + p.valor, 0), 0));
  const nomeCliente = (c: Calculo) => c.recebimento.clients?.name ?? "Sem cliente";

  const confirmar = useMutation({
    mutationFn: async () => {
      if (selecionados.length === 0) throw new Error("Nenhum recebimento selecionado.");
      const saidas: Array<Record<string, unknown>> = [];
      for (const { sigla, valor } of totaisSocio) {
        const origem = selecionados.filter((c) => c.socios.includes(sigla)).map((c) => `${nomeCliente(c)} (${c.recebimento.descricao.split(" · ").pop()})`);
        saidas.push({
          descricao: `Distribuição de Honorários · ${NOMES_SOCIO[sigla]}`,
          categoria: "(D) Distribuição de Honorários",
          valor,
          socio: sigla,
          observacao: `Referente a: ${origem.join("; ")}`,
        });
      }
      for (const c of selecionados) {
        const contratoId = c.recebimento.contrato_id ?? "";
        const clienteId = c.recebimento.cliente_id ?? "";
        if (c.captacao > 0) {
          saidas.push({ descricao: `Repasse de Captação · ${nomeCliente(c)}`, categoria: "(D) Captação/Parceria", valor: c.captacao, contrato_id: contratoId, cliente_id: clienteId, observacao: `Sobre ${c.recebimento.descricao}` });
        }
        for (const parceiro of c.parceiros) {
          saidas.push({ descricao: `Repasse ao Parceiro ${parceiro.nome} · ${nomeCliente(c)}`, categoria: "(D) Captação/Parceria", valor: parceiro.valor, contrato_id: contratoId, cliente_id: clienteId, observacao: `Sobre ${c.recebimento.descricao}` });
        }
      }
      const { error } = await db.rpc("distribuir_recebimentos", {
        p_data: data,
        p_entradas: selecionados.map((c) => c.recebimento.id),
        p_saidas: saidas,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lancamentos"] });
      toast.success("Distribuição lançada no Livro-Caixa.");
      setDesmarcados(new Set());
      onOpenChange(false);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : (error as { message?: string })?.message ?? "Não foi possível distribuir."),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Distribuir Recebimentos</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Cada recebimento segue a regra do próprio contrato: retenção do escritório, captação, parceiros e divisão igual entre os sócios envolvidos. Confira antes de confirmar.
        </p>
        {isLoading ? <p className="py-6 text-center text-sm text-muted-foreground">Calculando…</p> : null}
        <div className="divide-y divide-border rounded-md border border-border">
          {calculos.map((c) => (
            <label key={c.recebimento.id} className={`flex items-start gap-3 p-3 text-sm ${c.problema ? "opacity-60" : ""}`}>
              <Checkbox
                className="mt-0.5"
                disabled={Boolean(c.problema)}
                checked={!c.problema && !desmarcados.has(c.recebimento.id)}
                onCheckedChange={(marcado) => setDesmarcados((atual) => {
                  const proximo = new Set(atual);
                  if (marcado === true) proximo.delete(c.recebimento.id); else proximo.add(c.recebimento.id);
                  return proximo;
                })}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="font-medium">{`${formatDate(c.recebimento.data)} · ${c.recebimento.descricao}`}</span>
                  <b className="whitespace-nowrap tabular-nums">{formatCurrency(c.recebimento.valor)}</b>
                </div>
                {c.problema ? (
                  <p className="text-xs text-[#B42318]">{`${c.problema} Corrija no contrato para poder distribuir.`}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {[
                      `Retenção ${formatCurrency(c.retencao)}`,
                      c.captacao > 0 ? `Captação ${formatCurrency(c.captacao)}` : "",
                      ...c.parceiros.map((p) => `${p.nome} ${formatCurrency(p.valor)}`),
                      `${c.socios.map((s) => NOMES_SOCIO[s]).join(", ")}: ${formatCurrency(c.porSocio)} cada`,
                    ].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>
            </label>
          ))}
        </div>

        <div className="grid gap-4 rounded-md bg-[#F7F5F1] p-3 text-sm sm:grid-cols-[1fr_auto]">
          <div className="space-y-1">
            {totaisSocio.map(({ sigla, valor }) => (
              <div key={sigla} className="flex justify-between gap-4"><span>{NOMES_SOCIO[sigla]}</span><b className="whitespace-nowrap tabular-nums">{formatCurrency(valor)}</b></div>
            ))}
            {totalRepasses > 0 ? <div className="flex justify-between gap-4"><span>Repasses (captação e parceiros)</span><b className="whitespace-nowrap tabular-nums">{formatCurrency(totalRepasses)}</b></div> : null}
            <div className="flex justify-between gap-4 text-muted-foreground"><span>Fica no escritório (retenção)</span><span className="whitespace-nowrap tabular-nums">{formatCurrency(totalRetido)}</span></div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="dist-data">Data da Distribuição</Label>
            <Input id="dist-data" type="date" min="2026-01-01" value={data} onChange={(e) => setData(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={confirmar.isPending || selecionados.length === 0} onClick={() => confirmar.mutate()}>
            {confirmar.isPending ? "Lançando…" : `Confirmar Distribuição (${selecionados.length})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
