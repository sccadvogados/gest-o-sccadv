import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { SituationBadge } from "@/routes/clientes.$clientId";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import {
  APP_TIME_ZONE,
  currentMonthKey,
  daysLate,
  formatCurrency,
  formatDate,
  installmentSituation,
  todayISO,
} from "@/lib/format";

export const Route = createFileRoute("/financeiro")({
  head: () => ({
    meta: [
      { title: "Financeiro | Gestão Administrativa | SCC Adv" },
      {
        name: "description",
        content:
          "Parcelas a receber, recebidas e em atraso, com previsão de recebimentos do escritório SCC Advogados.",
      },
      { property: "og:title", content: "Financeiro | Gestão Administrativa | SCC Adv" },
      {
        property: "og:description",
        content: "Controle de parcelas, baixas e fluxo de caixa dos próximos 12 meses.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FinancePage,
});

type Row = {
  id: string;
  amount: number;
  due_date: string;
  status: string;
  paid_at: string | null;
  payment_method: string | null;
  category: string | null;
  clients: { id: string; name: string } | null;
};

function FinancePage() {
  const queryClient = useQueryClient();

  const { data: rows, isLoading } = useQuery({
    queryKey: ["installments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("installments")
        .select("id, amount, due_date, status, paid_at, payment_method, category, clients(id, name)")
        .order("due_date");
      if (error) throw error;
      return data as unknown as Row[];
    },
  });

  const markPaid = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("installments")
        .update({ status: "Pago", paid_at: todayISO() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["installments"] });
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
      toast.success("Parcela baixada.");
    },
    onError: () => toast.error("Não foi possível baixar a parcela."),
  });

  const list = rows ?? [];
  const received = list
    .filter((r) => r.status === "Pago")
    .reduce((sum, r) => sum + Number(r.amount), 0);
  const overdue = list
    .filter((r) => installmentSituation(r.due_date, r.status) === "Atrasado")
    .reduce((sum, r) => sum + Number(r.amount), 0);
  const pending = list
    .filter((r) => installmentSituation(r.due_date, r.status) === "Pendente")
    .reduce((sum, r) => sum + Number(r.amount), 0);

  // Distribuição de honorários sobre o já recebido.
  const partnerShare = received * 0.3;
  const firmShare = received * 0.1;

  // Previsão dos próximos 12 meses (parcelas ainda não pagas).
    const [currentYear, currentMonth] = currentMonthKey().split("-").map(Number);
  const forecast = Array.from({ length: 12 }, (_, i) => {
    const month = new Date(Date.UTC(currentYear!, currentMonth! - 1 + i, 15));
    const key = `${month.getUTCFullYear()}-${String(month.getUTCMonth() + 1).padStart(2, "0")}`;
    const total = list
      .filter((r) => r.status !== "Pago" && r.due_date.slice(0, 7) === key)
      .reduce((sum, r) => sum + Number(r.amount), 0);
    return {
      key,
            label: month.toLocaleDateString("pt-BR", {
        timeZone: APP_TIME_ZONE,
        month: "short",
        year: "2-digit",
      }),
      total,
    };
  });
  const forecastMax = Math.max(...forecast.map((f) => f.total), 1);

  return (
    <AppShell>
      <h1 className="text-2xl">Financeiro</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Parcelas de todos os contratos, com baixa de recebimento e previsão de caixa.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Summary label="Recebido" value={received} />
        <Summary label="A receber" value={pending} />
        <Summary label="Em atraso" value={overdue} tone="danger" />
      </div>

      <section className="panel mt-6 p-6">
                <div className="flex flex-wrap items-start justify-between gap-2">
          <h2 className="text-base font-semibold">Distribuição de honorários sobre o recebido</h2>
          <span className="text-sm text-muted-foreground">Base: {formatCurrency(received)} recebidos</span>
        </div>
        <div className="mt-5 flex h-3 overflow-hidden rounded-full" aria-hidden="true">
          <span className="flex-[3] bg-[#0F2340]" />
          <span className="flex-[3] bg-[#C08A5E]" />
          <span className="flex-[3] bg-[#7D8BA0]" />
          <span className="flex-1 bg-[#E6D6C4]" />
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-4">
          {["TAC", "RCMT", "ASS"].map((partner) => (
            <div key={partner}>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {partner} · 30%
              </p>
              <p className="mt-1 text-lg">{formatCurrency(partnerShare)}</p>
            </div>
          ))}
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Escritório · 10%
            </p>
            <p className="mt-1 text-lg">{formatCurrency(firmShare)}</p>
          </div>
        </div>
      </section>

      <section className="panel mt-6 p-6">
        <h2 className="text-base font-semibold">Previsão dos próximos 12 meses</h2>
        <div className="mt-5 flex items-end gap-2">
          {forecast.map((month) => (
            <div key={month.key} className="flex flex-1 flex-col items-center gap-2">
              <div
                className="w-full rounded-t bg-accent/80"
                style={{ height: `${Math.max(4, (month.total / forecastMax) * 120)}px` }}
                title={formatCurrency(month.total)}
              />
              <span className="text-[10px] text-muted-foreground">{month.label}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="panel mt-6 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Forma</TableHead>
              <TableHead>Vencimento</TableHead>
              <TableHead>Atraso</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead className="text-right">Ação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  Carregando parcelas…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && list.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  Nenhuma parcela cadastrada. Cadastre um contrato na ficha do cliente.
                </TableCell>
              </TableRow>
            )}
            {list.map((row) => {
              const situation = installmentSituation(row.due_date, row.status);
              const late = daysLate(row.due_date, row.status);
              return (
                <TableRow key={row.id}>
                  <TableCell>
                    {row.clients ? (
                      <Link
                        to="/clientes/$clientId"
                        params={{ clientId: row.clients.id }}
                        className="underline-offset-4 hover:text-accent hover:underline"
                      >
                        {row.clients.name}
                      </Link>
                    ) : (
                      "—"
                    )}
                    <div className="text-xs text-muted-foreground">{row.category}</div>
                  </TableCell>
                  <TableCell>{formatCurrency(row.amount)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {row.payment_method || "—"}
                  </TableCell>
                  <TableCell>{formatDate(row.due_date)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {late > 0 ? `${late} dia(s)` : "—"}
                  </TableCell>
                  <TableCell>
                    <SituationBadge situation={situation} />
                  </TableCell>
                  <TableCell className="text-right">
                    {row.status === "Pago" ? (
                      <span className="text-xs text-muted-foreground">
                        Baixada em {formatDate(row.paid_at)}
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={markPaid.isPending}
                        onClick={() => markPaid.mutate(row.id)}
                      >
                        Baixar
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </AppShell>
  );
}

function Summary({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "danger";
}) {
  return (
        <div
      className={`panel border-t-4 p-5 ${
        tone === "danger" ? "border-t-[#B42318]" : label === "A receber" ? "border-t-[#C08A5E]" : "border-t-[#0F2340]"
      }`}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={
          tone === "danger" ? "mt-2 text-2xl text-destructive" : "mt-2 text-2xl"
        }
      >
        {formatCurrency(value)}
      </p>
    </div>
  );
}
