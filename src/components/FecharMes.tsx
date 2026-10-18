import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock, LockOpen } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatDate, todayISO } from "@/lib/format";

// Tabelas/funções novas (fechamentos, fechar_mes, reabrir_mes) ainda não estão nos tipos gerados.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as unknown as { from: (table: string) => any; rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: { message?: string } | null }> };

const CATEGORIAS_HONORARIOS = ["(R) Pró-labore", "(R) Honorários de Êxito", "(R) Honorários de Sucumbência"];

type Fechamento = { mes: string; entradas: number; saidas: number; saldo_final: number; fechado_por_email: string | null; fechado_em: string };
type LancamentoMes = { data: string; tipo: string; categoria: string; valor: number; revisar: boolean; distribuido?: boolean; origem: string };

function mensagem(error: unknown, padrao: string) {
  const texto = (error as { message?: string } | null)?.message;
  return texto && texto.length < 200 ? texto : padrao;
}

export function useFechamentos() {
  return useQuery({
    queryKey: ["fechamentos"],
    queryFn: async () => {
      const { data, error } = await db.from("fechamentos").select("*").order("mes");
      if (error) throw error;
      return (data ?? []) as Fechamento[];
    },
  });
}

/** Meses fechados no formato "AAAA-MM" (para travar edição/exclusão na tabela). */
export function useMesesFechados() {
  const { data } = useFechamentos();
  return new Set((data ?? []).map((item) => String(item.mes).slice(0, 7)));
}

/** Botão Fechar Mês / selo Mês Fechado + Reabrir, para o mês escolhido no Livro-Caixa. */
export function FecharMes({ periodo, nomePeriodo, lancamentos }: { periodo: string; nomePeriodo: string; lancamentos: LancamentoMes[] }) {
  const queryClient = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const { data: fechamentos } = useFechamentos();
  const ehMes = periodo.length === 7;
  const inicio = `${periodo}-01`;
  const fim = ehMes ? new Date(Date.UTC(Number(periodo.slice(0, 4)), Number(periodo.slice(5, 7)), 0)).toISOString().slice(0, 10) : "";
  const fechamento = (fechamentos ?? []).find((item) => String(item.mes).slice(0, 7) === periodo);
  const terminou = ehMes && fim <= todayISO();

  const doMes = lancamentos.filter((item) => item.data >= inicio && item.data <= fim);
  const entradas = doMes.filter((item) => item.tipo === "entrada" && item.origem !== "saldo_inicial").reduce((s, item) => s + Number(item.valor), 0);
  const saidas = doMes.filter((item) => item.tipo === "saida").reduce((s, item) => s + Number(item.valor), 0);
  const saldoFinal = lancamentos.filter((item) => item.data <= fim).reduce((s, item) => s + (item.tipo === "entrada" ? 1 : -1) * Number(item.valor), 0);
  const revisar = doMes.filter((item) => item.revisar).length;
  const aDistribuir = doMes.filter((item) => item.tipo === "entrada" && !item.distribuido && CATEGORIAS_HONORARIOS.includes(item.categoria)).length;

  const { data: parcelasSemBaixa = 0 } = useQuery({
    queryKey: ["parcelas-sem-baixa-mes", periodo],
    enabled: aberto && ehMes,
    queryFn: async () => {
      const { count, error } = await db
        .from("installments")
        .select("id", { count: "exact", head: true })
        .gte("due_date", inicio)
        .lte("due_date", fim)
        .not("status", "in", "(Pago,Cancelado)");
      if (error) throw error;
      return (count ?? 0) as number;
    },
  });

  const fechar = useMutation({
    mutationFn: async () => {
      const { error } = await db.rpc("fechar_mes", { p_mes: inicio });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fechamentos"] });
      toast.success(`${nomePeriodo} fechado.`);
      setAberto(false);
    },
    onError: (error) => toast.error(mensagem(error, "Não foi possível fechar o mês.")),
  });

  const reabrir = useMutation({
    mutationFn: async () => {
      const { error } = await db.rpc("reabrir_mes", { p_mes: inicio });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fechamentos"] });
      toast.success(`${nomePeriodo} reaberto.`);
    },
    onError: (error) => toast.error(mensagem(error, "Não foi possível reabrir o mês.")),
  });

  if (!ehMes) return <div className="ml-auto" />;

  if (fechamento) {
    return (
      <div className="ml-auto flex flex-wrap items-center gap-2 text-sm">
        <span
          className="inline-flex items-center gap-1.5 rounded-full bg-[#E7EEF6] px-3 py-1 text-xs font-medium text-[#0F2340]"
          title={`Fechado em ${formatDate(fechamento.fechado_em)}${fechamento.fechado_por_email ? ` por ${fechamento.fechado_por_email}` : ""} · Saldo final ${formatCurrency(fechamento.saldo_final)}`}
        >
          <Lock className="size-3.5" /> Mês Fechado
        </span>
        <Button
          variant="ghost"
          size="sm"
          disabled={reabrir.isPending}
          onClick={() => {
            if (window.confirm(`Reabrir ${nomePeriodo}? Os lançamentos voltam a poder ser alterados.`)) reabrir.mutate();
          }}
        >
          <LockOpen className="size-4" /> Reabrir Mês
        </Button>
      </div>
    );
  }

  const pendencias = [
    revisar ? `${revisar} lançamento${revisar > 1 ? "s" : ""} marcado${revisar > 1 ? "s" : ""} para revisar` : "",
    aDistribuir ? `${aDistribuir} recebimento${aDistribuir > 1 ? "s" : ""} ainda sem distribuição` : "",
    parcelasSemBaixa ? `${parcelasSemBaixa} parcela${parcelasSemBaixa > 1 ? "s" : ""} com vencimento no mês sem baixa` : "",
  ].filter(Boolean);

  return (
    <div className="ml-auto">
      <Button variant="outline" onClick={() => setAberto(true)}>
        <Lock className="size-4" /> Fechar Mês
      </Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{`Fechar Mês · ${nomePeriodo}`}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg border border-border border-t-[3px] border-t-[#0F2340] px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Entradas</p>
                <p className="mt-1 whitespace-nowrap font-semibold tabular-nums">{formatCurrency(entradas)}</p>
              </div>
              <div className="rounded-lg border border-border border-t-[3px] border-t-[#B42318] px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Saídas</p>
                <p className="mt-1 whitespace-nowrap font-semibold tabular-nums">{formatCurrency(saidas)}</p>
              </div>
              <div className="rounded-lg border border-border border-t-[3px] border-t-[#C08A5E] px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Saldo Final</p>
                <p className={`mt-1 whitespace-nowrap font-semibold tabular-nums ${saldoFinal < 0 ? "text-[#B42318]" : ""}`}>{formatCurrency(saldoFinal)}</p>
              </div>
            </div>

            {pendencias.length > 0 ? (
              <div className="rounded-md border border-[#E8B9A5] bg-[#FBF1EC] px-3 py-2 text-[#7A3F2D]">
                <p className="font-medium">Antes de fechar, confira:</p>
                <ul className="mt-1 list-disc pl-5">{pendencias.map((texto) => <li key={texto}>{texto}</li>)}</ul>
              </div>
            ) : (
              <p className="text-muted-foreground">Nenhuma pendência encontrada neste mês.</p>
            )}

            <p className="text-muted-foreground">
              Depois de fechado, ninguém inclui, altera ou exclui lançamentos deste mês (nem baixa parcelas com pagamento nele) até um administrador reabrir.
            </p>
            {!terminou ? <p className="text-[#B42318]">O mês só pode ser fechado a partir do último dia dele.</p> : null}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAberto(false)}>Cancelar</Button>
            <Button disabled={!terminou || fechar.isPending} onClick={() => fechar.mutate()}>
              {fechar.isPending ? "Fechando…" : "Fechar Mês"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
