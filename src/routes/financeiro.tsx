import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { CartesianGrid, LabelList, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { LivroCaixa } from "@/components/LivroCaixa";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/ui/page-header";
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
  const valorCurto = (value: number) =>
    value >= 1000 ? `R$ ${(value / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : `R$ ${value.toLocaleString("pt-BR")}`;

  return (
    <AppShell>
            <PageHeader
        title="Financeiro"
                subtitle="Parcelas dos contratos e Livro-Caixa do escritório (a partir de 01/01/2026)."
      />
      <img
        src="/imagens/imagem-f47c521f.png"
        alt=""
        aria-hidden="true"
        className="hidden"
            />

      <Tabs defaultValue="parcelas" className="mt-6">
        <TabsList>
          <TabsTrigger value="parcelas">Parcelas</TabsTrigger>
          <TabsTrigger value="caixa">Livro-Caixa</TabsTrigger>
        </TabsList>
        <TabsContent value="caixa">
          <LivroCaixa />
        </TabsContent>
        <TabsContent value="parcelas">
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Summary label="Recebido" value={received} />
        <Summary label="A receber" value={pending} />
                <Summary label="Em atraso" value={overdue} tone="danger" />
      </div>
                    <section className="panel mt-6 p-6">
        <h2 className="text-base font-semibold">Previsão dos próximos 12 meses</h2>
        <div className="mt-5 h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={forecast} margin={{ top: 28, right: 28, bottom: 4, left: 8 }}>
              <CartesianGrid stroke="#ECE8E1" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#6b7280" }} tickLine={false} axisLine={{ stroke: "#E6E1D8" }} />
              <YAxis
                width={72}
                domain={[0, Math.ceil((forecastMax * 1.15) / 100) * 100]}
                tick={{ fontSize: 11, fill: "#6b7280" }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value: number) => valorCurto(value)}
              />
              <Tooltip formatter={(value: number) => [formatCurrency(value), "A receber"]} labelStyle={{ color: "#0F2340" }} />
              <Line type="monotone" dataKey="total" stroke="#C08A5E" strokeWidth={2.5} dot={{ r: 4, fill: "#0F2340", stroke: "#0F2340" }} activeDot={{ r: 6 }}>
                <LabelList dataKey="total" position="top" offset={10} style={{ fontSize: 11, fill: "#0F2340", fontWeight: 600 }} formatter={(value: number) => valorCurto(value)} />
              </Line>
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>
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
        </TabsContent>
      </Tabs>
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
                                        tone === "danger" ? "mt-2 whitespace-nowrap text-2xl font-semibold tabular-nums text-[#B42318] xl:text-3xl" : "mt-2 whitespace-nowrap text-2xl font-semibold tabular-nums text-[#0F2340] xl:text-3xl"
        }
      >
        {formatCurrency(value)}
      </p>
    </div>
  );
}
