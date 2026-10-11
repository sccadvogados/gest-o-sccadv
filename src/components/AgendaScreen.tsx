import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Check, ChevronDown, Plus, Search, Trash2 } from "lucide-react";

import { GoogleCalendarImportDialog } from "@/components/GoogleCalendarImportDialog";
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
import { officeDatabase } from "@/lib/office-database";
import { APP_TIME_ZONE, formatDate } from "@/lib/format";
import { createEvent as syncCreateEvent, deleteEvent as syncDeleteEvent, updateEvent as syncUpdateEvent } from "@/lib/calendarSync";

type EventType = "prazo" | "protocolo" | "audiencia" | "reuniao" | "compromisso" | "julgamento" | "acompanhamento";
type EventStatus = "pendente" | "cumprido" | "cancelado";
type FilterCard = "todos" | "vencidos" | "hoje" | "proximos";
type CalendarView = "lista" | "mes" | "semana";

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function startOfSundayWeek(date: Date) {
  const result = new Date(date);
  result.setHours(12, 0, 0, 0);
  result.setDate(result.getDate() - result.getDay());
  return result;
}

function calendarDays(view: CalendarView, current: Date) {
  const start = view === "semana"
    ? startOfSundayWeek(current)
    : startOfSundayWeek(new Date(current.getFullYear(), current.getMonth(), 1));
  const total = view === "semana" ? 7 : 42;
  return Array.from({ length: total }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });
}


type AgendaEvent = {
  id: string;
  tipo: EventType;
  titulo: string;
    descricao: string | null;
    parte_contraria: string | null;
  numero_processo: string | null;
  cliente_id: string | null;
    data_inicio: string;
  data_fim: string | null;
  
  local_link: string | null;
  contrato_id: string | null;
  responsavel: string | null;
  status: EventStatus;
};

type Client = { id: string; name: string };

const labels: Record<EventType, string> = {
    prazo: "Prazo",
  protocolo: "Protocolo",
  audiencia: "Audiência",
  reuniao: "Reunião",
    compromisso: "Compromisso",
  julgamento: "Julgamento",
  acompanhamento: "Acompanhamento",
};

const colors: Record<EventType, string> = {
    prazo: "#C48B5F",
  protocolo: "#E3B505",
  audiencia: "#8B2635",
  reuniao: "#0C2340",
    compromisso: "#6B7280",
  julgamento: "#6B4E9B",
  acompanhamento: "#5F7F6E",
};

const emptyForm = {
  id: "",
  status: "pendente" as EventStatus,
    tipo: "prazo" as EventType,
      titulo: "",
  descricao: "",
  parte_contraria: "",
  cliente_id: "",
  contrato_id: "",
  data_inicio: "",
  data_fim: "",
  
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

function addBusinessDays(date: string, amount: number) {
  const result = new Date(`${date}T12:00:00`);
  let remaining = Math.abs(amount);
  const direction = amount < 0 ? -1 : 1;
  while (remaining > 0) {
    result.setDate(result.getDate() + direction);
    if (result.getDay() !== 0 && result.getDay() !== 6) remaining -= 1;
  }
  return result.toISOString().slice(0, 10);
}

function saoPauloInput(value: string | null | undefined, dateOnly = false) {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(dateOnly ? {} : { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }),
  }).formatToParts(new Date(value));
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return dateOnly ? `${values.year}-${values.month}-${values.day}` : `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}

function saoPauloValue(value: string, dateOnly = false) {
  return value ? `${dateOnly ? value.slice(0, 10) : value}:00-03:00` : "";
}

function addOneHourToTime(value: string) {
  if (!value) return "";
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return "";
  const totalMinutes = (hours * 60 + minutes + 60) % (24 * 60);
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, "0")}:${String(totalMinutes % 60).padStart(2, "0")}`;
}

export function AgendaScreen() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"todos" | EventType>("todos");
  const [responsibleFilter, setResponsibleFilter] = useState("todos");
  const [statusFilter, setStatusFilter] = useState<"todos" | EventStatus>("todos");
    const [cardFilter, setCardFilter] = useState<FilterCard>("todos");
  const [view, setView] = useState<CalendarView>("lista");
  const [calendarDate, setCalendarDate] = useState(() => new Date());
      const [form, setForm] = useState(emptyForm);
  const [responsibleOtherSelected, setResponsibleOtherSelected] = useState(false);
  const [clientSearch, setClientSearch] = useState("");
  const [open, setOpen] = useState(false);
    const openNewEvent = (selectedDate?: string) => {
        setForm({ ...emptyForm, data_inicio: selectedDate ? `${selectedDate}T09:00` : "" });
    setResponsibleOtherSelected(false);
    setClientSearch("");
    setOpen(true);
  };
  const openEditEvent = (event: AgendaEvent) => {
        setForm({ ...emptyForm, ...event, protocolo: event.titulo.startsWith("[PROTOCOLO]"), descricao: event.descricao ?? "", cliente_id: event.cliente_id ?? "", contrato_id: event.contrato_id ?? "", data_inicio: saoPauloInput(event.data_inicio, event.tipo === "prazo" || event.tipo === "acompanhamento"), data_fim: saoPauloInput(event.data_fim, false),  parte_contraria: event.parte_contraria ?? "", local_link: event.local_link ?? "", responsavel: event.responsavel ?? "" });
        setResponsibleOtherSelected(Boolean(event.responsavel && !["Tiago Craveiro", "Raphael Corradi", "Alexandre Souza", "Lauro Trajano"].includes(event.responsavel)));
    setClientSearch(clients.find((client) => client.id === event.cliente_id)?.name ?? "");
    setOpen(true);
  };

  const today = localDateKey(new Date().toISOString());
  const nextWeek = addDays(today, 7);

  const { data: events = [], isLoading } = useQuery({
    queryKey: ["agenda-events"],
    queryFn: async () => {
            const { data, error } = await officeDatabase(supabase)
                .from("eventos")
                .select("id, tipo, titulo, descricao, parte_contraria, numero_processo, cliente_id, contrato_id, data_inicio, data_fim, local_link, responsavel, status, dia_inteiro, google_event_id, created_by, updated_at")
        .order("data_inicio");
      if (error) throw error;
            return (data ?? []) as AgendaEvent[];
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
  const isOverdue = (event: AgendaEvent) => event.status !== "cumprido" && event.status !== "cancelado" && localDateKey(event.data_inicio) < today;
  const isToday = (event: AgendaEvent) => event.status !== "cancelado" && localDateKey(event.data_inicio) === today;
  const isNextWeek = (event: AgendaEvent) => event.status !== "cancelado" && localDateKey(event.data_inicio) > today && localDateKey(event.data_inicio) <= nextWeek;

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
          .filter(Boolean).some((value) => value?.toLowerCase().includes(term));
        const matchesCard = cardFilter === "todos" || (cardFilter === "vencidos" && isOverdue(event)) ||
          (cardFilter === "hoje" && isToday(event) && event.status !== "cumprido" && event.status !== "cancelado") ||
          (cardFilter === "proximos" && isNextWeek(event) && event.status !== "cumprido" && event.status !== "cancelado");
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
      const { id: eventId, protocolo: _protocolo, ...values } = form;
      const brazilDateTime = (value: string) => {
        if (!value) return null;
        const localValue = value.slice(0, 16);
        return `${localValue}:00-03:00`;
      };
      const brazilDate = (value: string) => value ? `${value.slice(0, 10)}T00:00:00-03:00` : null;
      const payload = { ...values, cliente_id: form.cliente_id || null, contrato_id: form.contrato_id || null, data_inicio: ["prazo", "protocolo", "acompanhamento"].includes(form.tipo) ? brazilDate(form.data_inicio) : brazilDateTime(form.data_inicio), data_fim: ["prazo", "acompanhamento"].includes(form.tipo) ? null : brazilDateTime(form.data_fim), dia_inteiro: form.tipo === "acompanhamento" ? true : ["reuniao", "audiencia", "julgamento"].includes(form.tipo) ? false : undefined, local_link: !["prazo", "acompanhamento"].includes(form.tipo) ? form.local_link || null : null, status: form.status, ...(form.id ? {} : { created_by: (await supabase.auth.getUser()).data.user?.id ?? null }) };
      if (form.id) {
                const { error } = await officeDatabase(supabase).from("eventos").update(payload).eq("id", form.id);
        if (error) throw error;
                await syncUpdateEvent({
          data: {
            id: form.id,
            event: {
              ...payload,
              id: form.id,
              cliente_nome: clients.find((client) => client.id === form.cliente_id)?.name ?? null,
            },
          },
        });
        return;
      }
            const { data, error } = await officeDatabase(supabase).from("eventos").insert(payload).select("id").single();
      if (error) throw error;
            await syncCreateEvent({
        data: {
          ...data,
          ...payload,
          id: data.id,
          cliente_nome: clients.find((client) => client.id === form.cliente_id)?.name ?? null,
        },
      });
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
                        const { error } = await officeDatabase(supabase).from("eventos").update({ status: "cumprido" }).eq("id", id);
      if (error) throw error;
            const event = events.find((item) => item.id === id);
      if (event) {
        await syncUpdateEvent({
          data: {
            id,
            event: {
              ...event,
              status: "cumprido",
              cliente_nome: clients.find((client) => client.id === event.cliente_id)?.name ?? null,
            },
          },
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agenda-events"] });
      toast.success("Evento marcado como cumprido.");
    },
    onError: () => toast.error("Não foi possível atualizar o evento."),
  });

    const deleteEvent = useMutation({
    mutationFn: async (id: string) => {
                        await syncDeleteEvent({ data: { id } });
            const { error } = await officeDatabase(supabase).from("eventos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agenda-events"] });
      toast.success("Evento excluído da agenda.");
    },
    onError: () => toast.error("Não foi possível excluir o evento."),
  });

  return (
    <AppShell>
      <img src="/imagens/imagem-e3c618da.png" alt="" aria-hidden="true" className="hidden" />
      <TooltipProvider>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><h1 className="text-[32px] font-bold leading-tight text-[#0F2340]">Prazos e reuniões</h1><p className="mt-1 text-sm text-muted-foreground">Acompanhe prazos, reuniões e compromissos do escritório.</p></div>
          <div className="flex items-center gap-3">
            <div className="flex rounded-md border bg-card p-1">
              <Button size="sm" variant="secondary">Lista</Button>
              {(["Mês", "Semana"] as const).map((label) => <Tooltip key={label}><TooltipTrigger asChild><span><Button size="sm" variant="ghost" disabled>{label}</Button></span></TooltipTrigger><TooltipContent>em breve</TooltipContent></Tooltip>)}
                        </div>
            <GoogleCalendarImportDialog onImported={() => queryClient.invalidateQueries({ queryKey: ["agenda-events"] })} />
            <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button><Plus className="size-4" /> Novo evento</Button></DialogTrigger>
              <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{form.id ? "Editar evento" : "Novo evento"}</DialogTitle></DialogHeader>
                <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); const hasRequiredFields = ["prazo", "julgamento", "acompanhamento"].includes(form.tipo) ? form.titulo.trim() && form.data_inicio : ["reuniao", "audiencia", "julgamento"].includes(form.tipo) ? form.titulo.trim() && form.data_inicio.slice(0, 10) && form.data_inicio.slice(11, 16) && form.data_fim.slice(11, 16) : form.titulo.trim() && form.data_inicio; if (!hasRequiredFields) { toast.error(form.tipo === "prazo" ? "Informe o título e o prazo." : form.tipo === "reuniao" ? "Informe o título, a data e os horários da reunião." : "Informe o título e a data do evento."); return; } if (["reuniao", "audiencia", "julgamento"].includes(form.tipo) && new Date(form.data_fim).getTime() <= new Date(form.data_inicio).getTime()) { toast.error("A hora de término deve ser depois da hora de início."); return; } createEvent.mutate(); }}>
                                    <div className="grid gap-4 sm:grid-cols-2"><Field label="Tipo"><Select value={form.tipo} onValueChange={(value: EventType) => setForm((current) => ({ ...current, tipo: value, contrato_id: "" }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(labels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></Field><Field label="Responsável"><Select value={form.responsavel ? (["Tiago Craveiro", "Raphael Corradi", "Alexandre Souza", "Lauro Trajano"].includes(form.responsavel) ? form.responsavel : "outra") : undefined} onValueChange={(value) => { setResponsibleOtherSelected(value === "outra"); setForm((current) => ({ ...current, responsavel: value === "outra" ? "" : value })); }}><SelectTrigger><SelectValue placeholder="-" /></SelectTrigger><SelectContent><SelectItem value="Tiago Craveiro">Tiago Craveiro</SelectItem><SelectItem value="Raphael Corradi">Raphael Corradi</SelectItem><SelectItem value="Alexandre Souza">Alexandre Souza</SelectItem><SelectItem value="Lauro Trajano">Lauro Trajano</SelectItem><SelectItem value="outra">Outro</SelectItem></SelectContent></Select>{responsibleOtherSelected ? <Input className="mt-2" placeholder="Nome da outra pessoa" value={form.responsavel} onChange={(event) => setForm((current) => ({ ...current, responsavel: event.target.value }))} /> : null}</Field></div>
                                    <Field label="Título"><Input value={form.titulo} onChange={(event) => setForm((current) => ({ ...current, titulo: event.target.value }))} /></Field>
                  <Field label="Situação"><Select value={form.status} onValueChange={(value: EventStatus) => setForm((current) => ({ ...current, status: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pendente">Pendente</SelectItem><SelectItem value="cumprido">Cumprido</SelectItem><SelectItem value="cancelado">Cancelado</SelectItem></SelectContent></Select></Field>
                  {["prazo", "protocolo", "acompanhamento"].includes(form.tipo) ? <div className="grid gap-3"><Field label={form.tipo === "prazo" ? "Prazo" : "Data"}><Input type="date" value={form.data_inicio.slice(0, 10)} onChange={(event) => setForm((current) => ({ ...current, data_inicio: event.target.value }))} /></Field></div> : <div className="grid gap-4 sm:grid-cols-2">{["reuniao", "audiencia", "julgamento"].includes(form.tipo) ? <><Field label="Data"><Input type="date" value={form.data_inicio.slice(0, 10)} onChange={(event) => setForm((current) => ({ ...current, data_inicio: event.target.value ? `${event.target.value}T${current.data_inicio.slice(11, 16) || "09:00"}` : "", data_fim: event.target.value && current.data_fim.slice(11, 16) ? `${event.target.value}T${current.data_fim.slice(11, 16)}` : current.data_fim }))} /></Field><Field label="Hora de início"><Input type="time" value={form.data_inicio.slice(11, 16)} onChange={(event) => setForm((current) => { const date = current.data_inicio.slice(0, 10); const time = event.target.value; return { ...current, data_inicio: date && time ? `${date}T${time}` : current.data_inicio, data_fim: date && time ? `${date}T${addOneHourToTime(time)}` : current.data_fim }; })} /></Field><Field label="Hora de término"><Input type="time" value={form.data_fim.slice(11, 16)} onChange={(event) => setForm((current) => ({ ...current, data_fim: current.data_fim.slice(0, 10) && event.target.value ? `${current.data_fim.slice(0, 10)}T${event.target.value}` : current.data_fim }))} /></Field><Field label="Local ou link"><Input value={form.local_link} onChange={(event) => setForm((current) => ({ ...current, local_link: event.target.value }))} /></Field></> : <><Field label="Início"><Input type="datetime-local" value={form.data_inicio} onChange={(event) => setForm((current) => ({ ...current, data_inicio: event.target.value }))} /></Field><Field label="Fim"><Input type="datetime-local" value={form.data_fim} onChange={(event) => setForm((current) => ({ ...current, data_fim: event.target.value }))} /></Field><Field label="Local ou link"><Input value={form.local_link} onChange={(event) => setForm((current) => ({ ...current, local_link: event.target.value }))} /></Field></>}</div>}
                                    <Field label="Cliente"><div className="relative"><Input placeholder="Buscar cliente…" value={clientSearch} onChange={(event) => { setClientSearch(event.target.value); setForm((current) => ({ ...current, cliente_id: "", contrato_id: "" })); }} />{clientSearch.trim() ? <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-md border bg-popover p-1 shadow-md">{clients.filter((client) => client.name.toLowerCase().includes(clientSearch.trim().toLowerCase())).map((client) => <button key={client.id} type="button" className="block w-full rounded-sm px-3 py-2 text-left text-sm hover:bg-accent" onClick={() => { setClientSearch(client.name); setForm((current) => ({ ...current, cliente_id: client.id, contrato_id: "" })); }}>{client.name}</button>)}<button type="button" className="block w-full rounded-sm px-3 py-2 text-left text-sm text-muted-foreground hover:bg-accent" onClick={() => { setClientSearch(""); setForm((current) => ({ ...current, cliente_id: "", contrato_id: "" })); }}>Sem cliente</button></div> : null}{selectedClient && selectedClient.name === clientSearch && <p className="mt-1 text-xs text-muted-foreground">Cliente selecionado</p>}</div></Field>
                  {form.cliente_id && <Field label="Contrato"><Select value={form.contrato_id || "none"} onValueChange={(value) => setForm((current) => ({ ...current, contrato_id: value === "none" ? "" : value }))}><SelectTrigger><SelectValue placeholder="Sem contrato" /></SelectTrigger><SelectContent><SelectItem value="none">Sem contrato</SelectItem>{contracts.map((contract) => <SelectItem key={contract.id} value={contract.id}>{contract.description || contract.category}</SelectItem>)}</SelectContent></Select></Field>}
                  <Field label="Descrição"><Textarea value={form.descricao} onChange={(event) => setForm((current) => ({ ...current, descricao: event.target.value }))} rows={3} /></Field>
                  <DialogFooter><Button type="submit" disabled={createEvent.isPending}>{createEvent.isPending ? "Salvando…" : "Salvar evento"}</Button></DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <SummaryCard label="VENCIDOS" description="Não cumpridos" value={counts.vencidos} color="#B42318" active={cardFilter === "vencidos"} onClick={() => setCardFilter(cardFilter === "vencidos" ? "todos" : "vencidos")} />
          <SummaryCard label="HOJE" description="Compromissos de hoje" value={counts.hoje} color="#C48B5F" active={cardFilter === "hoje"} onClick={() => setCardFilter(cardFilter === "hoje" ? "todos" : "hoje")} />
          <SummaryCard label="PRÓXIMOS 7 DIAS" description="Compromissos futuros" value={counts.proximos} color="#0C2340" active={cardFilter === "proximos"} onClick={() => setCardFilter(cardFilter === "proximos" ? "todos" : "proximos")} />
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3"><div className="relative min-w-64 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" placeholder="Buscar evento…" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
          <Select value={typeFilter} onValueChange={(value: "todos" | EventType) => setTypeFilter(value)}><SelectTrigger className="w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos os tipos</SelectItem>{Object.entries(labels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
          <Select value={responsibleFilter} onValueChange={setResponsibleFilter}><SelectTrigger className="w-44"><SelectValue placeholder="Responsável" /></SelectTrigger><SelectContent><SelectItem value="todos">Todos os responsáveis</SelectItem>{responsibleNames.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}</SelectContent></Select>
          <Select value={statusFilter} onValueChange={(value: "todos" | EventStatus) => setStatusFilter(value)}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todas situações</SelectItem><SelectItem value="pendente">Pendente</SelectItem><SelectItem value="cumprido">Cumprido</SelectItem><SelectItem value="cancelado">Cancelado</SelectItem></SelectContent></Select>
        </div>

        <div className="panel mt-6 overflow-hidden"><Table><TableHeader><TableRow><TableHead>Tipo</TableHead><TableHead>Evento</TableHead><TableHead>Data</TableHead><TableHead>Responsável</TableHead><TableHead>Situação</TableHead><TableHead className="text-right">Ação</TableHead></TableRow></TableHeader><TableBody>
          {isLoading ? <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">Carregando agenda…</TableCell></TableRow> : filteredEvents.length === 0 ? <TableRow><TableCell colSpan={6} className="py-16 text-center"><span className="mx-auto flex size-14 items-center justify-center rounded-full bg-[#F1E8DD] text-[#0F2340]"><CalendarDays className="size-7" /></span><p className="mt-4 font-semibold text-[#0F2340]">Nenhum compromisso por aqui</p><p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">Cadastre seu primeiro evento para acompanhar prazos e reuniões.</p><Button className="mt-5" variant="outline" onClick={() => openNewEvent()}><Plus className="size-4" />Cadastrar primeiro evento</Button></TableCell></TableRow> : filteredEvents.map((event) => <TableRow key={event.id}><TableCell><Badge style={{ backgroundColor: colors[event.tipo], color: "white" }}>{labels[event.tipo]}</Badge></TableCell><TableCell><button type="button" className="font-medium text-left hover:underline" onClick={() => openEditEvent(event)}>{event.titulo}</button><div className="text-xs text-muted-foreground">{clientNames.get(event.cliente_id ?? "") ?? "Sem cliente vinculado"}</div></TableCell><TableCell className="whitespace-nowrap text-sm">{formatDate(event.data_inicio)}<div className="text-xs text-muted-foreground">{new Intl.DateTimeFormat("pt-BR", { timeZone: APP_TIME_ZONE, hour: "2-digit", minute: "2-digit" }).format(new Date(event.data_inicio))}</div></TableCell><TableCell className="text-sm text-muted-foreground">{event.responsavel || "—"}</TableCell><TableCell>{isOverdue(event) ? <Badge variant="destructive">VENCIDO</Badge> : <Badge variant="secondary">{event.status === "cumprido" ? "Cumprido" : event.status === "cancelado" ? "Cancelado" : "Pendente"}</Badge>}</TableCell><TableCell className="text-right"><div className="flex justify-end gap-2">{event.status !== "cumprido" && event.status !== "cancelado" ? <Button size="sm" variant="outline" onClick={() => markDone.mutate(event.id)} disabled={markDone.isPending}><Check className="size-4" />Cumprido</Button> : <span className="text-xs text-muted-foreground">Concluído</span>}<Button size="sm" variant="outline" onClick={() => { if (window.confirm("Excluir este evento?")) deleteEvent.mutate(event.id); }} disabled={deleteEvent.isPending} aria-label="Excluir evento"><Trash2 className="size-4" /></Button></div></TableCell></TableRow>)}
        </TableBody></Table></div>
      </TooltipProvider>
    </AppShell>
  );
}

function SummaryCard({ label, description, value, color, active, onClick }: { label: string; description: string; value: number; color: string; active: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`panel flex min-h-28 items-center justify-between border-t-4 p-5 text-left transition-shadow hover:shadow-md ${active ? "ring-2 ring-accent" : ""}`} style={{ borderTopColor: color }}><span><span className="block text-xs font-semibold tracking-wide text-muted-foreground">{label}</span><span className="mt-1 block text-sm text-muted-foreground">{description}</span></span><span className="text-4xl font-semibold" style={{ color }}>{value}</span></button>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="grid gap-2"><Label>{label}</Label>{children}</div>; }
