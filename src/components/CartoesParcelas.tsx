import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate, todayISO } from "@/lib/format";

type Parcela = {
  id: string;
  amount: number;
  due_date: string;
  status: string;
  paid_at: string | null;
  payment_method: string | null;
  number?: number | null;
  clients: { id: string; name: string } | null;
  contracts?: { numero: number | null; ano: number | null } | null;
};

const contrato = (p: Parcela) =>
  p.contracts?.numero != null && p.contracts?.ano != null ? `Contrato ${String(p.contracts.numero).padStart(3, "0")}/${p.contracts.ano}` : "";

/** Celular: parcelas em cartões, agrupadas em Em Atraso, A Vencer e Pagas, com o botão Baixar no cartão. */
export function CartoesParcelas({ lista, carregando, ocupado, onBaixar }: { lista: Parcela[]; carregando: boolean; ocupado: boolean; onBaixar: (id: string) => void }) {
  const [verPagas, setVerPagas] = useState(false);
  const hoje = todayISO();
  const abertas = lista.filter((p) => p.status !== "Pago" && p.status !== "Cancelado");
  const atrasadas = abertas.filter((p) => p.due_date < hoje);
  const aVencer = abertas.filter((p) => p.due_date >= hoje);
  const pagas = lista.filter((p) => p.status === "Pago").sort((a, b) => (b.paid_at ?? "").localeCompare(a.paid_at ?? ""));
  const soma = (itens: Parcela[]) => itens.reduce((s, p) => s + (Number(p.amount) || 0), 0);

  const cartao = (p: Parcela, tipo: "atraso" | "vencer" | "paga") => (
    <div key={p.id} className="rounded-xl border border-[#ECE7DF] bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        {p.clients ? (
          <Link to="/clientes/$clientId" params={{ clientId: p.clients.id }} className="min-w-0 text-sm font-semibold leading-snug text-[#0F2340]">{p.clients.name}</Link>
        ) : (
          <span className="text-sm font-semibold text-[#0F2340]">—</span>
        )}
        <span className="shrink-0 whitespace-nowrap text-sm font-bold tabular-nums text-[#0F2340]">{formatCurrency(p.amount)}</span>
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">{[p.number ? `Parcela ${p.number}` : "", contrato(p)].filter(Boolean).join(" · ")}</p>
      <div className="mt-2 flex items-center gap-1.5">
        <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${tipo === "atraso" ? "bg-[#FBE9E7] text-[#B42318]" : tipo === "paga" ? "bg-[#E7F2EA] text-[#256b3a]" : "bg-[#FBF1EA] text-[#8A5A33]"}`}>
          {tipo === "paga" ? `Paga em ${formatDate(p.paid_at)}` : `${tipo === "atraso" ? "Venceu" : "Vence"} ${formatDate(p.due_date)}`}
        </span>
        {p.payment_method ? <span className="rounded-full bg-[#F3F1EC] px-2 py-0.5 text-[11px] text-muted-foreground">{p.payment_method}</span> : null}
        {tipo !== "paga" ? (
          <Button size="sm" className="ml-auto" variant={tipo === "atraso" ? "default" : "outline"} disabled={ocupado} onClick={() => onBaixar(p.id)}>Baixar</Button>
        ) : null}
      </div>
    </div>
  );

  return (
    <div className="mt-5 space-y-2 md:hidden">
      {carregando ? <p className="py-8 text-center text-sm text-muted-foreground">Carregando parcelas…</p> : null}
      {!carregando && lista.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma parcela cadastrada.</p> : null}
      {atrasadas.length ? <p className="px-1 pt-2 text-[11px] font-bold uppercase tracking-wide text-[#B42318]">{`Em atraso · ${atrasadas.length} · ${formatCurrency(soma(atrasadas))}`}</p> : null}
      {atrasadas.map((p) => cartao(p, "atraso"))}
      {aVencer.length ? <p className="px-1 pt-3 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{`A vencer · ${aVencer.length}`}</p> : null}
      {aVencer.slice(0, 30).map((p) => cartao(p, "vencer"))}
      {aVencer.length > 30 ? <p className="px-1 text-xs text-muted-foreground">{`E mais ${aVencer.length - 30} a vencer.`}</p> : null}
      {pagas.length ? (
        <button type="button" onClick={() => setVerPagas((v) => !v)} className="px-1 pt-3 text-xs text-[#B07A4F] underline underline-offset-4">
          {verPagas ? "Ocultar Pagas ▴" : `Mostrar Pagas (${pagas.length}) ▾`}
        </button>
      ) : null}
      {verPagas ? pagas.slice(0, 50).map((p) => cartao(p, "paga")) : null}
    </div>
  );
}
