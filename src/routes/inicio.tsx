import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, CalendarDays, UserRoundPen, Wallet } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";

import { AppShell } from "@/components/AppShell";
import { ExportSpreadsheetButton } from "@/components/ExportSpreadsheetButton";
import { PageHeader } from "@/components/ui/page-header";
import { supabase } from "@/integrations/supabase/client";
import { officeDatabase } from "@/lib/office-database";
import { TIPO_CORES } from "@/lib/calendarSync";
import { formatCurrency, formatDate, todayISO } from "@/lib/format";

export const Route = createFileRoute("/inicio")({
  head: () => ({
    meta: [
      { title: "Início | Gestão Administrativa | SCC Adv" },
      { name: "description", content: "Resumo do dia: agenda, parcelas e cadastros pendentes." },
      { property: "og:title", content: "Início | Gestão Administrativa | SCC Adv" },
      { property: "og:description", content: "Resumo do dia: agenda, parcelas e cadastros pendentes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HomePage,
});

type EventRow = {
  id: string;
  tipo: string;
  titulo: string;
  data_inicio: string;
  dia_inteiro: boolean;
  status: string;
  cliente_id: string | null;
  clients: { name: string } | null;
};

type InstallmentRow = {
  id: string;
  amount: number;
  due_date: string;
  number: number;
  client_id: string;
  clients: { name: string } | null;
  contracts: { numero: number | null; ano: number | null } | null;
};

type ClientRow = {
  id: string;
  name: string;
  cpf_cnpj: string | null;
  cep: string | null;
  street: string | null;
  email: string | null;
  phone: string | null;
};

const TIPOS: Record<string, string> = {
  prazo: "Prazo",
  protocolo: "Protocolo",
  reuniao: "Reunião",
  audiencia: "Audiência",
  julgamento: "Julgamento",
  acompanhamento: "Acompanhamento",
  compromisso: "Compromisso",
};

const TIMED = ["reuniao", "audiencia", "julgamento"];

function dateKey(value: string | Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(typeof value === "string" ? new Date(value) : value);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map["year"]}-${map["month"]}-${map["day"]}`;
}

function addDays(iso: string, days: number) {
  const date = new Date(`${iso}T12:00:00-03:00`);
  date.setDate(date.getDate() + days);
  return dateKey(date);
}

function missingFields(client: ClientRow) {
  const missing: string[] = [];
  if (!client.cpf_cnpj?.trim()) missing.push("CPF/CNPJ");
  if (!client.cep?.trim() && !client.street?.trim()) missing.push("endereço");
  if (!client.email?.trim()) missing.push("e-mail");
  if (!client.phone?.trim()) missing.push("telefone");
  return missing;
}

function eventWhen(event: EventRow) {
  const day = formatDate(dateKey(event.data_inicio));
  if (event.dia_inteiro && !TIMED.includes(event.tipo)) return day;
  const time = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(new Date(event.data_inicio));
  return `${day} às ${time}`;
}

function contractLabel(row: InstallmentRow) {
  const contract = row.contracts;
  if (!contract || contract.numero == null) return "";
  return ` · Contrato ${String(contract.numero).padStart(3, "0")}/${contract.ano}`;
}

function HomePage() {
    const today = todayISO();
  // Clique num card filtra a tela; clicar de novo (ou em "Mostrar Tudo") volta ao normal.
  const [filtro, setFiltro] = useState<null | "hoje" | "semana" | "atrasadas" | "receber">(null);
  const alternar = (valor: "hoje" | "semana" | "atrasadas" | "receber") => setFiltro((atual) => (atual === valor ? null : valor));
  const NOMES_FILTRO = { hoje: "Agenda de Hoje", semana: "Agenda dos Próximos 7 Dias", atrasadas: "Parcelas Atrasadas", receber: "A Receber em 7 Dias" } as const;
  const in7 = addDays(today, 7);

  const { data: events = [], isLoading: loadingEvents } = useQuery({
    queryKey: ["inicio-eventos", today],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("eventos")
        .select("id, tipo, titulo, data_inicio, dia_inteiro, status, cliente_id, clients(name)")
        .eq("status", "pendente")
        .gte("data_inicio", `${addDays(today, -60)}T03:00:00Z`)
        .lt("data_inicio", `${addDays(today, 8)}T03:00:00Z`)
        .order("data_inicio", { ascending: true })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as unknown as EventRow[];
    },
  });

  const { data: installments = [], isLoading: loadingInstallments } = useQuery({
    queryKey: ["inicio-parcelas", today],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("installments")
        .select("id, amount, due_date, number, client_id, clients(name), contracts(numero, ano)")
        .neq("status", "Pago")
        .lte("due_date", in7)
        .order("due_date", { ascending: true })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as unknown as InstallmentRow[];
    },
  });

  const { data: clients = [], isLoading: loadingClients } = useQuery({
    queryKey: ["inicio-clientes"],
    queryFn: async () => {
            const { data, error } = await officeDatabase(supabase)
        .from("clients")
        .select("id, name, cpf_cnpj, cep, street, email, phone")
        .eq("rascunho", false)
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ClientRow[];
    },
  });

  const overdueEvents = events.filter((event) => dateKey(event.data_inicio) < today);
  const todayEvents = events.filter((event) => dateKey(event.data_inicio) === today);
  const nextEvents = events.filter((event) => {
    const key = dateKey(event.data_inicio);
    return key > today && key <= in7;
  });
  const lateInstallments = installments.filter((row) => row.due_date < today);
  const upcomingInstallments = installments.filter((row) => row.due_date >= today && row.due_date <= in7);
  const incompleteClients = clients.filter((client) => missingFields(client).length > 0);
  const sum = (rows: InstallmentRow[]) => rows.reduce((total, row) => total + (Number(row.amount) || 0), 0);

  const longDate = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  return (
    <AppShell>
      <PageHeader
        title="Início"
        subtitle={longDate.charAt(0).toUpperCase() + longDate.slice(1)}
        action={<ExportSpreadsheetButton />}
      />

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <SummaryCard label="HOJE" description="Agenda do dia" value={loadingEvents ? "—" : String(todayEvents.length)} color="#C48B5F" ativo={filtro === "hoje"} onClick={() => alternar("hoje")} />
        <SummaryCard label="PRÓXIMOS 7 DIAS" description="Agenda da semana" value={loadingEvents ? "—" : String(nextEvents.length)} color="#0C2340" ativo={filtro === "semana"} onClick={() => alternar("semana")} />
        <SummaryCard label="PARCELAS ATRASADAS" description={loadingInstallments ? "" : formatCurrency(sum(lateInstallments))} value={loadingInstallments ? "—" : String(lateInstallments.length)} color="#B42318" ativo={filtro === "atrasadas"} onClick={() => alternar("atrasadas")} />
        <SummaryCard label="A RECEBER EM 7 DIAS" description={loadingInstallments ? "" : formatCurrency(sum(upcomingInstallments))} value={loadingInstallments ? "—" : String(upcomingInstallments.length)} color="#33B679" ativo={filtro === "receber"} onClick={() => alternar("receber")} />
      </div>

      
      {filtro ? (
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
          <span className="text-muted-foreground">Mostrando: <b className="text-[#0F2340]">{NOMES_FILTRO[filtro]}</b></span>
          <button type="button" onClick={() => setFiltro(null)} className="text-xs text-[#B07A4F] underline underline-offset-4 hover:text-[#0F2340]">Mostrar Tudo</button>
        </div>
      ) : null}

      {filtro === "hoje" || filtro === "semana" ? (
        <div className="mt-4">
          <Panel title={NOMES_FILTRO[filtro]} icon={<CalendarDays className="size-4" />} link={{ to: "/agenda", label: "Abrir agenda" }}>
            {loadingEvents ? <Empty text="Carregando…" /> : null}
            {!loadingEvents && (filtro === "hoje" ? todayEvents : nextEvents).length === 0 ? <Empty text={filtro === "hoje" ? "Nada na agenda de hoje." : "Nada na agenda dos próximos 7 dias."} /> : null}
            <EventGroup title={filtro === "hoje" ? "Hoje" : "Próximos 7 dias"} events={filtro === "hoje" ? todayEvents : nextEvents} />
          </Panel>
        </div>
      ) : null}

      {filtro === "atrasadas" || filtro === "receber" ? (
        <div className="mt-4">
          <Panel title={NOMES_FILTRO[filtro]} icon={<Wallet className="size-4" />} link={{ to: "/financeiro", label: "Abrir financeiro" }}>
            {loadingInstallments ? <Empty text="Carregando…" /> : null}
            {!loadingInstallments && (filtro === "atrasadas" ? lateInstallments : upcomingInstallments).length === 0 ? <Empty text={filtro === "atrasadas" ? "Nenhuma parcela atrasada." : "Nenhuma parcela vencendo nos próximos 7 dias."} /> : null}
            <InstallmentGroup title={filtro === "atrasadas" ? "Atrasadas" : "Vencem nos próximos 7 dias"} rows={filtro === "atrasadas" ? lateInstallments : upcomingInstallments} danger={filtro === "atrasadas"} />
          </Panel>
        </div>
      ) : null}

      {filtro === null ? (<>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Panel title="Agenda" icon={<CalendarDays className="size-4" />} link={{ to: "/agenda", label: "Abrir agenda" }}>
          {loadingEvents ? <Empty text="Carregando…" /> : null}
          {!loadingEvents && overdueEvents.length + todayEvents.length + nextEvents.length === 0 ? <Empty text="Nada pendente para hoje e os próximos 7 dias." /> : null}
          <EventGroup title="Vencidos (não cumpridos)" events={overdueEvents} danger />
          <EventGroup title="Hoje" events={todayEvents} />
          <EventGroup title="Próximos 7 dias" events={nextEvents} />
        </Panel>

        <Panel title="Parcelas" icon={<Wallet className="size-4" />} link={{ to: "/financeiro", label: "Abrir financeiro" }}>
          {loadingInstallments ? <Empty text="Carregando…" /> : null}
          {!loadingInstallments && installments.length === 0 ? <Empty text="Nenhuma parcela atrasada ou vencendo nos próximos 7 dias." /> : null}
          <InstallmentGroup title="Atrasadas" rows={lateInstallments} danger />
          <InstallmentGroup title="Vencem nos próximos 7 dias" rows={upcomingInstallments} />
        </Panel>
      </div>

      <div className="mt-6">
        <Panel title={`Cadastros incompletos${loadingClients ? "" : ` (${incompleteClients.length})`}`} icon={<UserRoundPen className="size-4" />}>
          {loadingClients ? <Empty text="Carregando…" /> : null}
          {!loadingClients && incompleteClients.length === 0 ? <Empty text="Todos os cadastros estão completos." /> : null}
          <ul className="divide-y">
            {incompleteClients.slice(0, 15).map((client) => (
              <li key={client.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <Link to="/clientes/$clientId" params={{ clientId: client.id }} className="font-medium text-[#0F2340] hover:underline">
                  {client.name}
                </Link>
                <span className="text-xs text-muted-foreground">Falta: {missingFields(client).join(", ")}</span>
              </li>
            ))}
          </ul>
          {incompleteClients.length > 15 ? (
            <p className="mt-2 text-xs text-muted-foreground">
              E mais {incompleteClients.length - 15}. Veja todos em <Link to="/" className="underline">Clientes</Link>.
            </p>
          ) : null}
        </Panel>
            </div>
      </>) : null}
    </AppShell>
  );
}

function SummaryCard({ label, description, value, color, ativo, onClick }: { label: string; description: string; value: string; color: string; ativo: boolean; onClick: () => void }) {
  return (
        <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      title={ativo ? "Clique para mostrar tudo" : "Clique para ver os detalhes"}
      className={`panel flex min-h-28 cursor-pointer items-center justify-between border-t-4 bg-card p-5 text-left transition hover:shadow-md ${ativo ? "ring-2 ring-offset-2" : ""}`}
      style={{ borderTopColor: color, ["--tw-ring-color" as string]: color }}
    >
      <span>
        <span className="block text-xs font-semibold tracking-wide text-muted-foreground">{label}</span>
        <span className="mt-1 block text-sm text-muted-foreground">{description}</span>
      </span>
            <span className="text-4xl font-semibold" style={{ color }}>{value}</span>
    </button>
  );
}

function Panel({
  title,
  icon,
  link,
  children,
}: {
  title: string;
  icon: ReactNode;
  link?: { to: "/agenda" | "/financeiro"; label: string };
  children: ReactNode;
}) {
  return (
    <section className="panel rounded-xl border border-t-[3px] border-t-accent bg-card p-5 text-card-foreground">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-semibold text-[#0F2340]">{icon}{title}</h2>
        {link ? <Link to={link.to} className="text-xs font-medium text-muted-foreground hover:underline">{link.label}</Link> : null}
      </div>
      {children}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-sm text-muted-foreground">{text}</p>;
}

function EventGroup({ title, events, danger = false }: { title: string; events: EventRow[]; danger?: boolean }) {
  if (events.length === 0) return null;
  return (
    <div className="mb-4">
      <h3 className={`mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide ${danger ? "text-[#B42318]" : "text-muted-foreground"}`}>
        {danger ? <AlertTriangle className="size-3.5" /> : null}
        {title} ({events.length})
      </h3>
      <ul className="divide-y">
        {events.map((event) => {
          const color = TIPO_CORES[event.tipo as keyof typeof TIPO_CORES]?.hex ?? "#616161";
          return (
            <li key={event.id} className="flex items-start gap-3 py-2 text-sm">
              <span className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{event.titulo}</span>
                <span className="block text-xs text-muted-foreground">
                  {TIPOS[event.tipo] ?? event.tipo} · {eventWhen(event)}
                  {event.clients?.name ? ` · ${event.clients.name}` : ""}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function InstallmentGroup({ title, rows, danger = false }: { title: string; rows: InstallmentRow[]; danger?: boolean }) {
  if (rows.length === 0) return null;
  return (
    <div className="mb-4">
      <h3 className={`mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide ${danger ? "text-[#B42318]" : "text-muted-foreground"}`}>
        {danger ? <AlertTriangle className="size-3.5" /> : null}
        {title} ({rows.length})
      </h3>
      <ul className="divide-y">
        {rows.map((row) => (
          <li key={row.id} className="flex items-center justify-between gap-3 py-2 text-sm">
            <span className="min-w-0">
              <Link to="/clientes/$clientId" params={{ clientId: row.client_id }} className="block truncate font-medium text-[#0F2340] hover:underline">
                {row.clients?.name ?? "Cliente"}
              </Link>
              <span className="block text-xs text-muted-foreground">
                Parcela {row.number} · vence {formatDate(row.due_date)}{contractLabel(row)}
              </span>
            </span>
            <span className="shrink-0 font-medium">{formatCurrency(row.amount)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
