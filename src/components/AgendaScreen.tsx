import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Check, ChevronDown, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { APP_TIME_ZONE, formatDate } from "@/lib/format";
import { createEvent as syncCreateEvent, deleteEvent as syncDeleteEvent, updateEvent as syncUpdateEvent } from "@/lib/calendarSync";

type EventType = "prazo" | "audiencia" | "reuniao" | "compromisso";
type EventStatus = "pendente" | "cumprido";
type FilterCard = "todos" | "vencidos" | "hoje" | "proximos";

type AgendaEvent = {
  id: string;
  tipo: EventType;
  titulo: string;
  descricao: string | null;
  cliente_id: string | null;
  data_inicio: string;
  responsavel: string | null;
  status: EventStatus;
};

type Client = { id: string; name: string };

const labels: Record<EventType, string> = {
  prazo: "Prazo",
  audiencia: "Audiência",
  reuniao: "Reunião",
  compromisso: "Compromisso",
};

const colors: Record<EventType, string> = {
  prazo: "#C48B5F",
  audiencia: "#8B2635",
  reuniao: "#0C2340",
  compromisso: "#6B7280",
};

const emptyForm = {
  tipo: "prazo" as EventType,
  titulo: "",
  descricao: "",
    cliente_id: "",
  contrato_id: "",
  data_inicio: "",
  data_fim: "",
  prazo_fatal: "",
  prazo_interno: "",
  local_link: "",
  responsavel: "",
};

function localDateKey(value: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIME_ZONE }).format(new Date(value));
}

function addDays(date: string, amount: number) {
  const result = new Date(`${date}T12:00:00`);
  result.setDate(result.getDate() + amount);
  return result.toISOString().slice(0, 10);
}

export function AgendaScreen() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"todos" | EventType>("todos");
  const [responsibleFilter, setResponsibleFilter] = useState("todos");
  const [statusFilter, setStatusFilter] = useState<"todos" | EventStatus>("todos");
  const [cardFilter, setCardFilter] = useState<FilterCard>("todos");
  const [form, setForm] = useState(emptyForm);
  const [open, setOpen] = useState(false);
  const today = localDateKey(new Date().toISOString());
  const nextWeek = addDays(today, 7);

  const { data: events = [], isLoading } = useQuery({
    queryKey: ["agenda-events"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("eventos" as never)
                .select("id, tipo, titulo, descricao, cliente_id, contrato_id, data_inicio, data_fim, prazo_fatal, prazo_interno, local_link, responsavel, status")
        .order("data_inicio");
      if (error) throw error;
      return (data ?? []) as unknown as AgendaEvent[];
    },
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["agenda-clients"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("id, name").order("name");
      if (error) throw error;
      return data as Client[];
    },
  });

    const clientNames = useMemo(() => new Map(clients.map((client) => [client.id, client.name])), [clients]);
  const { data: contracts = [] } = useQuery({
    queryKey: ["agenda-contracts", form.cliente_id],
    enabled: Boolean(form.cliente_id),
    queryFn: async () => {
      const { data, error } = await supabase.from("contracts").select("id, description, category").eq("client_id", form.cliente_id).order("created_at", { ascending: false });
      if (error) throw error;
      return data as { id: string; description: string | null; category: string }[];
    },
  });
  const selectedClient = clients.find((client) => client.id === form.cliente_id);
  const responsibleNames = useMemo(
    () => [...new Set(events.map((event) => event.responsavel).filter(Boolean) as string[])].sort(),
    [events],
  );
  const isOverdue = (event: AgendaEvent) => event.status !== "cumprido" && localDateKey(event.data_inicio) < today;
  const isToday = (event: AgendaEvent) => localDateKey(event.data_inicio) === today;
  const isNextWeek = (event: AgendaEvent) => localDateKey(event.data_inicio) > today && localDateKey(event.data_inicio) <= nextWeek;

  const counts = {
    vencidos: events.filter(isOverdue).length,
    hoje: events.filter((event) => event.status !== "cumprido" && isToday(event)).length,
    proximos: events.filter((event) => event.status !== "cumprido" && isNextWeek(event)).length,
  };

  const filteredEvents = useMemo(() => {
    const term = search.trim().toLowerCase();
    return [...events]
      .filter((event) => {
        const clientName = clientNames.get(event.cliente_id ?? "") ?? "";
        const matchesSearch = !term || [event.titulo, event.descricao, clientName, event.responsavel]
          .filter(Boolean).some((value) => value!.toLowerCase().includes(term));
        const matchesCard = cardFilter === "todos" || (cardFilter === "vencidos" && isOverdue(event)) ||
          (cardFilter === "hoje" && isToday(event) && event.status !== "cumprido") ||
          (cardFilter === "proximos" && isNextWeek(event) && event.status !== "cumprido");
        return matchesSearch && matchesCard &&
          (typeFilter === "todos" || event.tipo === typeFilter) &&
          (responsibleFilter === "todos" || event.responsavel === responsibleFilter) &&
          (statusFilter === "todos" || event.status === statusFilter);
      })
      .sort((a, b) => Number(isOverdue(b)) - Number(isOverdue(a)) ||
        new Date(a.data_inicio).getTime() - new Date(b.data_inicio).getTime());
  }, [cardFilter, clientNames, events, responsibleFilter, search, statusFilter, today, typeFilter]);

  const createEvent = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("eventos" as never).insert({ ...form, cliente_id: form.cliente_id || null, status: "pendente" } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agenda-events"] });
      setForm(emptyForm);
      setOpen(false);
      toast.success("Evento criado na agenda.");
    },
    onError: () => toast.error("Não foi possível criar o evento."),
  });

  const markDone = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("eventos" as never).update({ status: "cumprido" } as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agenda-events"] });
      toast.success("Evento marcado como cumprido.");
    },
    onError: () => toast.error("Não foi possível atualizar o evento."),
  });

  return (
    <AppShell>
      <TooltipProvider>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><h1 className="text-2xl">Prazos e Reuniões</h1><p className="mt-1 text-sm text-muted-foreground">Acompanhe os compromissos do escritório.</p></div>
          <div className="flex items-center gap-3">
            <div className="flex rounded-md border bg-card p-1">
              <Button size="sm" variant="secondary">Lista</Button>
              {(["Mês", "Semana"] as const).map((label) => <Tooltip key={label}><TooltipTrigger asChild><span><Button size="sm" variant="ghost" disabled>{label}</Button></span></TooltipTrigger><TooltipContent>em breve</TooltipContent></Tooltip>)}
            </div>
            <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button><Plus className="size-4" /> Novo evento</Button></DialogTrigger>
              <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>Novo evento</DialogTitle></DialogHeader>
                <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); if (!form.titulo.trim() || !form.data_inicio) return toast.error("Informe o título e a data do evento."); createEvent.mutate(); }}>
                  <div className="grid gap-4 sm:grid-cols-2"><Field label="Tipo"><Select value={form.tipo} onValueChange={(value: EventType) => setForm((current) => ({ ...current, tipo: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(labels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></Field><Field label="Data e hora"><Input type="datetime-local" value={form.data_inicio} onChange={(event) => setForm((current) => ({ ...current, data_inicio: event.target.value }))} /></Field></div>
                  <Field label="Título"><Input value={form.titulo} onChange={(event) => setForm((current) => ({ ...current, titulo: event.target.value }))} /></Field>
                  <div className="grid gap-4 sm:grid-cols-2"><Field label="Cliente"><Select value={form.cliente_id || "none"} onValueChange={(value) => setForm((current) => ({ ...current, cliente_id: value === "none" ? "" : value }))}><SelectTrigger><SelectValue placeholder="Sem cliente" /></SelectTrigger><SelectContent><SelectItem value="none">Sem cliente</SelectItem>{clients.map((client) => <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>)}</SelectContent></Select></Field><Field label="Responsável"><Input value={form.responsavel} onChange={(event) => setForm((current) => ({ ...current, responsavel: event.target.value }))} /></Field></div>
                  <Field label="Descrição"><Textarea value={form.descricao} onChange={(event) => setForm((current) => ({ ...current, descricao: event.target.value }))} rows={3} /></Field>
                  <DialogFooter><Button type="submit" disabled={createEvent.isPending}>{createEvent.isPending ? "Salvando…" : "Salvar evento"}</Button></DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <SummaryCard label="Vencidos (não cumpridos)" value={counts.vencidos} color="#B42318" active={cardFilter === "vencidos"} onClick={() => setCardFilter(cardFilter === "vencidos" ? "todos" : "vencidos")} />
          <SummaryCard label="Hoje" value={counts.hoje} color="#C48B5F" active={cardFilter === "hoje"} onClick={() => setCardFilter(cardFilter === "hoje" ? "todos" : "hoje")} />
          <SummaryCard label="Próximos 7 dias" value={counts.proximos} color="#0C2340" active={cardFilter === "proximos"} onClick={() => setCardFilter(cardFilter === "proximos" ? "todos" : "proximos")} />
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3"><div className="relative min-w-64 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" placeholder="Buscar evento…" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
          <Select value={typeFilter} onValueChange={(value: "todos" | EventType) => setTypeFilter(value)}><SelectTrigger className="w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos os tipos</SelectItem>{Object.entries(labels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
          <Select value={responsibleFilter} onValueChange={setResponsibleFilter}><SelectTrigger className="w-44"><SelectValue placeholder="Responsável" /></SelectTrigger><SelectContent><SelectItem value="todos">Todos os responsáveis</SelectItem>{responsibleNames.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}</SelectContent></Select>
          <Select value={statusFilter} onValueChange={(value: "todos" | EventStatus) => setStatusFilter(value)}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todas situações</SelectItem><SelectItem value="pendente">Pendente</SelectItem><SelectItem value="cumprido">Cumprido</SelectItem></SelectContent></Select>
        </div>

        <div className="panel mt-6 overflow-hidden"><Table><TableHeader><TableRow><TableHead>Tipo</TableHead><TableHead>Evento</TableHead><TableHead>Data</TableHead><TableHead>Responsável</TableHead><TableHead>Situação</TableHead><TableHead className="text-right">Ação</TableHead></TableRow></TableHeader><TableBody>
          {isLoading ? <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">Carregando agenda…</TableCell></TableRow> : filteredEvents.length === 0 ? <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground"><CalendarDays className="mx-auto size-8" /><p className="mt-2">Nenhum evento encontrado.</p></TableCell></TableRow> : filteredEvents.map((event) => <TableRow key={event.id}><TableCell><Badge style={{ backgroundColor: colors[event.tipo], color: "white" }}>{labels[event.tipo]}</Badge></TableCell><TableCell><div className="font-medium">{event.titulo}</div><div className="text-xs text-muted-foreground">{clientNames.get(event.cliente_id ?? "") ?? "Sem cliente vinculado"}</div></TableCell><TableCell className="whitespace-nowrap text-sm">{formatDate(event.data_inicio)}<div className="text-xs text-muted-foreground">{new Intl.DateTimeFormat("pt-BR", { timeZone: APP_TIME_ZONE, hour: "2-digit", minute: "2-digit" }).format(new Date(event.data_inicio))}</div></TableCell><TableCell className="text-sm text-muted-foreground">{event.responsavel || "—"}</TableCell><TableCell>{isOverdue(event) ? <Badge variant="destructive">VENCIDO</Badge> : <Badge variant="secondary">{event.status === "cumprido" ? "Cumprido" : "Pendente"}</Badge>}</TableCell><TableCell className="text-right">{event.status !== "cumprido" ? <Button size="sm" variant="outline" onClick={() => markDone.mutate(event.id)} disabled={markDone.isPending}><Check className="size-4" />Cumprido</Button> : <span className="text-xs text-muted-foreground">Concluído</span>}</TableCell></TableRow>)}
        </TableBody></Table></div>
      </TooltipProvider>
    </AppShell>
  );
}

function SummaryCard({ label, value, color, active, onClick }: { label: string; value: number; color: string; active: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`panel flex min-h-24 items-center justify-between border-l-4 p-5 text-left transition-shadow hover:shadow-md ${active ? "ring-2 ring-accent" : ""}`} style={{ borderLeftColor: color }}><span className="text-sm text-muted-foreground">{label}</span><span className="text-3xl font-semibold" style={{ color }}>{value}</span></button>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="grid gap-2"><Label>{label}</Label>{children}</div>; }
