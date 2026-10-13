import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/format";

// Tabela nova (contrato_parceiros) ainda não está nos tipos gerados.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as unknown as { from: (table: string) => any };

function pct(value: number) {
  return `${String(Math.round(value * 100) / 100).replace(".", ",")}%`;
}

function arredondar(value: number) {
  return Math.round(value * 100) / 100;
}

/**
 * Custo do contrato (só no sistema): valor bruto menos captação, parceiros e retenção do escritório.
 * - Captação/Indicação: % sobre o pró-labore bruto.
 * - Parceiros: valor fixo (R$) no pró-labore e % no êxito.
 * - Retenção do Escritório: % sobre o valor bruto (pró-labore e êxito).
 */
export function ContractCostSummary({
  contract,
}: {
  contract: {
    id: string;
    modality: string;
    total_value: number;
    success_fee_percent: number;
    captacao?: string | null;
    captacao_percentual?: number | null;
    retencao_percentual?: number | null;
    installments?: Array<{ amount: number; status: string; due_date: string }>;
  };
}) {
  const [aberto, setAberto] = useState(false);
  const { data: parceiros } = useQuery({
    queryKey: ["contract-partners", contract.id],
    queryFn: async () => {
      const { data, error } = await db
        .from("contrato_parceiros")
        .select("id, valor, exito_percentual, parceiros(id, nome, oab_numero, oab_uf)")
        .eq("contrato_id", contract.id)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as Array<{ valor: number; exito_percentual: number }>;
    },
  });

  if (contract.modality === "probono") return null;

  const prolabore = Number(contract.total_value) || 0;
  const exito = Number(contract.success_fee_percent) || 0;
  const temProlabore = contract.modality !== "exito" && prolabore > 0;
  const temExito = exito > 0;
  if (!temProlabore && !temExito) return null;

  const captacaoPct = Number(contract.captacao_percentual) || 0;
  const retencaoPct = Number(contract.retencao_percentual) || 0;

  const captacaoValor = arredondar(prolabore * (captacaoPct / 100));
  const parceirosValor = arredondar((parceiros ?? []).reduce((soma, item) => soma + (Number(item.valor) || 0), 0));
  const parceirosExito = arredondar((parceiros ?? []).reduce((soma, item) => soma + (Number(item.exito_percentual) || 0), 0));
  const retencaoValor = arredondar(prolabore * (retencaoPct / 100));
  const retencaoExito = arredondar(exito * (retencaoPct / 100));

  const saldoValor = arredondar(prolabore - captacaoValor - parceirosValor - retencaoValor);
  const saldoExito = arredondar(exito - parceirosExito - retencaoExito);

  const parcelas = contract.installments ?? [];
  const pagas = parcelas.filter((p) => p.status === "Pago");
  const recebido = arredondar(pagas.reduce((s, p) => s + (Number(p.amount) || 0), 0));
  const aReceber = arredondar(Math.max(0, prolabore - recebido));
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const emAtraso = arredondar(
    parcelas
      .filter((p) => p.status !== "Pago" && p.status !== "Cancelado" && String(p.due_date).slice(0, 10) < hoje)
      .reduce((s, p) => s + (Number(p.amount) || 0), 0),
  );
  const progresso = prolabore > 0 ? Math.min(100, (recebido / prolabore) * 100) : 0;

  const linhas: Array<{ rotulo: string; valor: string; exito: string; destaque?: boolean }> = [
    { rotulo: "Valor do Contrato", valor: formatCurrency(prolabore), exito: pct(exito) },
  ];
  if (retencaoPct > 0) {
    linhas.push({ rotulo: `(–) Retenção do Escritório (${pct(retencaoPct)})`, valor: formatCurrency(retencaoValor), exito: pct(retencaoExito) });
  }
  if (captacaoPct > 0) {
    linhas.push({ rotulo: `(–) ${contract.captacao ?? "Captação"} (${pct(captacaoPct)})`, valor: formatCurrency(captacaoValor), exito: "—" });
  }
  if ((parceiros ?? []).length > 0) {
    linhas.push({ rotulo: "(–) Parceiros", valor: formatCurrency(parceirosValor), exito: pct(parceirosExito) });
  }
  linhas.push({ rotulo: "= Saldo do Contrato", valor: formatCurrency(saldoValor), exito: pct(saldoExito), destaque: true });

  const resumo = `${temProlabore ? formatCurrency(saldoValor) : ""}${temProlabore && temExito ? " + " : ""}${temExito ? `${pct(saldoExito)} do êxito` : ""}`;

  return (
    <div className="border-b border-border px-5 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p>
          <span className="font-medium text-[#0F2340]">Custo do Contrato</span>
          <span className="text-muted-foreground"> · Saldo </span>
          <span className={`font-semibold tabular-nums ${saldoValor < 0 || saldoExito < 0 ? "text-destructive" : "text-[#0F2340]"}`}>{resumo}</span>
        </p>
        <button
          type="button"
          onClick={() => setAberto((atual) => !atual)}
          aria-expanded={aberto}
          className="text-xs text-[#B07A4F] underline underline-offset-4 hover:text-[#0F2340]"
        >
          {aberto ? "Ocultar detalhes ▴" : "Mostrar detalhes ▾"}
        </button>
      </div>

      {aberto ? (
        <div className="mt-3 grid items-start gap-6 lg:grid-cols-[1.35fr_1fr]">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground">
                <th className="py-1 text-left font-normal" />
                {temProlabore ? <th className="py-1 text-right font-normal">Pró-labore</th> : null}
                {temExito ? <th className="py-1 text-right font-normal">Êxito</th> : null}
              </tr>
            </thead>
            <tbody>
              {linhas.map((linha) => (
                <tr key={linha.rotulo} className={linha.destaque ? "border-t border-border font-semibold text-[#0F2340]" : ""}>
                  <td className="py-1">{linha.rotulo}</td>
                  {temProlabore ? <td className={`py-1 text-right tabular-nums${saldoValor < 0 && linha.destaque ? " text-destructive" : ""}`}>{linha.valor}</td> : null}
                  {temExito ? <td className={`py-1 text-right tabular-nums${saldoExito < 0 && linha.destaque ? " text-destructive" : ""}`}>{linha.exito}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>

          {temProlabore ? (
            <div>
              {/* Mesmas cores dos cards da tela Financeiro. */}
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg border border-border border-t-[3px] border-t-[#0F2340] px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Recebido</p>
                  <p className="mt-1 font-semibold tabular-nums text-[#0F2340]">{formatCurrency(recebido)}</p>
                </div>
                <div className="rounded-lg border border-border border-t-[3px] border-t-[#C08A5E] px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">A Receber</p>
                  <p className="mt-1 font-semibold tabular-nums text-[#0F2340]">{formatCurrency(aReceber)}</p>
                </div>
                <div className="rounded-lg border border-border border-t-[3px] border-t-[#B42318] px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Em Atraso</p>
                  <p className="mt-1 font-semibold tabular-nums text-[#B42318]">{formatCurrency(emAtraso)}</p>
                </div>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#E8E2D8]">
                <div className="h-full bg-[#0F2340]" style={{ width: `${progresso}%` }} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{`${pagas.length} de ${parcelas.length} parcelas pagas`}</p>
            </div>
          ) : null}

          {retencaoPct <= 0 ? (
            <p className="text-xs text-muted-foreground lg:col-span-2">Retenção do escritório não informada neste contrato.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
