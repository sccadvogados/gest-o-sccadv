import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Check, ChevronDown, Plus, Search, Trash2, X } from "lucide-react";

import { GoogleCalendarImportDialog } from "@/components/GoogleCalendarImportDialog";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { createEvent as syncCreateEvent, deleteEvent as syncDeleteEvent, TIPO_CORES, updateEvent as syncUpdateEvent } from "@/lib/calendarSync";

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
  dia_inteiro: boolean | null;
};

type Client = { id: string; name: string };

function normalizeClientSearch(value: string) {
  return value.normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").toLowerCase();
}

const labels: Record<EventType, string> = {
    prazo: "Prazo",
  protocolo: "Protocolo",
  audiencia: "Audiência",
  reuniao: "Reunião",
    compromisso: "Compromisso",
  julgamento: "Julgamento",
  acompanhamento: "Acompanhamento",
};

const typeColorKeys: Record<EventType, keyof typeof TIPO_CORES> = {
  prazo: "prazo",
  protocolo: "protocolo",
  audiencia: "audiência",
  reuniao: "reunião",
  compromisso: "compromisso",
  julgamento: "julgamento",
  acompanhamento: "acompanhamento",
};

const colors: Record<EventType, string> = Object.fromEntries(
  Object.entries(typeColorKeys).map(([type, colorKey]) => [type, TIPO_CORES[colorKey].hex]),
) as Record<EventType, string>;

function typeTextColor(type: EventType) {
  return type === "protocolo" ? "#0F2340" : "white";
}

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

function defaultTimedValues(selectedDate?: string) {
  const now = new Date();
  now.setMinutes(0, 0, 0);
  now.setHours(now.getHours() + 1);
  const date = selectedDate?.slice(0, 10) || localDateKey(now.toISOString());
  const start = selectedDate?.includes("T") ? selectedDate.slice(11, 16) : `${String(now.getHours()).padStart(2, "0")}:00`;
  return { data_inicio: `${date}T${start}`, data_fim: `${date}T${addOneHourToTime(start)}` };
}

function timeToMinutes(value: string) {
  const match = /^(\\d{1,2}):(\\d{2})$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function minutesToTime(value: number) {
  const normalized = Math.max(0, Math.min(23 * 60 + 59, value));
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
}

function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} min`;
  if (!rest) return `${hours} h`;
  return `${hours} h ${rest} min`;
}

function TimeRangeField({ start, end, onStartChange, onEndChange }: { start: string; end: string; onStartChange: (value: string) => void; onEndChange: (value: string) => void }) {
  const [open, setOpen] = useState<"start" | "end" | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const selectedValue = open === "start" ? start : end;
  const selectedMinutes = timeToMinutes(selectedValue);
  const startMinutes = timeToMinutes(start);
  const endMinutes = timeToMinutes(end);
  const duration = startMinutes !== null && endMinutes !== null && endMinutes > startMinutes ? endMinutes - startMinutes : null;
  const options = Array.from({ length: 96 }, (_, index) => index * 15)
    .filter((minutes) => open !== "end" || startMinutes === null || minutes > startMinutes);

  useEffect(() => {
    if (!open || !listRef.current) return;
    const target = selectedMinutes === null ? 0 : options.findIndex((minutes) => minutes >= selectedMinutes);
    listRef.current.scrollTop = Math.max(0, target) * 36;
  }, [open, selectedMinutes, options.length]);

  const choose = (minutes: number) => {
    const value = minutesToTime(minutes);
    if (open === "start") onStartChange(value);
    if (open === "end") onEndChange(value);
    setOpen(null);
  };

  const input = (kind: "start" | "end", value: string, onChange: (value: string) => void) => (
    <div className="relative min-w-0 flex-1">
      <input
        aria-label={kind === "start" ? "Hora de início" : "Hora de término"}
        value={value}
        onFocus={() => setOpen(kind)}
        onChange={(event) => onChange(event.target.value)}
        onBlur={(event) => {
          if (!event.relatedTarget || !listRef.current?.contains(event.relatedTarget as Node)) setOpen(null);
        }}
        placeholder="00:00"
        inputMode="numeric"
        className={`h-[52px] w-full rounded-lg border border-input bg-white px-3 py-1 text-base shadow-sm transition-colors outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm ${open === kind ? "ring-1 ring-ring" : ""}`}
      />
      {open === kind ? <div ref={listRef} className="absolute left-0 top-11 z-30 max-h-56 w-48 overflow-y-auto rounded-md border bg-popover p-1 shadow-lg">
        {options.map((minutes) => {
          const option = minutesToTime(minutes);
          return <button key={option} type="button" className={`flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm hover:bg-accent ${selectedMinutes === minutes ? "bg-accent font-semibold" : ""}`} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(minutes)}><span>{option}</span>{kind === "end" && startMinutes !== null && minutes > startMinutes ? <span className="text-xs text-muted-foreground">({formatDuration(minutes - startMinutes)})</span> : null}</button>;
        })}
      </div> : null}
    </div>
  );

  return <div className="relative flex min-w-0 flex-1 items-center gap-2"><div className="flex min-w-0 flex-1 items-center gap-2">{input("start", start.slice(0, 5), onStartChange)}<span className="text-sm text-muted-foreground">–</span>{input("end", end.slice(11, 16) || end.slice(0, 5), onEndChange)}</div>{duration !== null ? <span className="pr-2 text-xs text-muted-foreground">{formatDuration(duration)}</span> : null}</div>;
}

function DateField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <Input className="w-[160px] bg-white" type="date" value={value.slice(0, 10)} onChange={(event) => onChange(event.target.value)} />;
}

function WeekCalendar({ currentDate, onDateChange, onSlotClick, events, onEventClick }: { currentDate: Date; onDateChange: (date: Date) => void; onSlotClick: (dateTime: string) => void; events: AgendaEvent[]; onEventClick: (event: AgendaEvent) => void }) {
  const days = calendarDays("semana", currentDate);
  const weekLabel = `${new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(days[0])} – ${new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(days[6])}`;
  const weekDays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const hours = Array.from({ length: 14 }, (_, index) => index + 7);
  const todayKey = localDateKey(new Date().toISOString());
  const timedTypes = ["reuniao", "audiencia", "julgamento"];
  const isTimed = (event: AgendaEvent) => !event.dia_inteiro && (Boolean(event.data_fim) || timedTypes.includes(event.tipo));
  const formatTime = (value: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: APP_TIME_ZONE, hour: "2-digit", minute: "2-digit" }).format(new Date(value));
  const goToWeek = (amount: number) => {
    const next = new Date(currentDate);
    next.setDate(next.getDate() + amount * 7);
    onDateChange(next);
  };

  return <div className="panel mt-6 overflow-hidden">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
      <div className="flex items-center gap-2"><Button type="button" variant="outline" size="sm" onClick={() => goToWeek(-1)}>&lt;</Button><Button type="button" variant="outline" size="sm" onClick={() => goToWeek(1)}>&gt;</Button><Button type="button" variant="outline" size="sm" onClick={() => onDateChange(new Date())}>Hoje</Button></div>
      <h2 className="text-lg font-semibold capitalize text-[#0F2340]">{weekLabel}</h2>
      <div className="w-[156px]" />
    </div>
    <div className="grid min-w-[900px] grid-cols-7 border-b bg-muted/30">{days.map((day, index) => <div key={dateKey(day)} className="border-r p-3 text-center text-xs font-semibold text-muted-foreground"><span className="block">{weekDays[index]}</span><span className={`mx-auto mt-1 flex size-7 items-center justify-center rounded-full text-sm ${dateKey(day) === todayKey ? "bg-[#0F2340] text-white" : ""}`}>{day.getDate()}</span></div>)}</div>
    <div className="max-h-[640px] overflow-auto"><div className="grid min-w-[900px] grid-cols-7">
      {days.map((day) => {
        const key = dateKey(day);
        const dayEvents = events.filter((event) => localDateKey(event.data_inicio) === key);
        const allDayEvents = dayEvents.filter((event) => !isTimed(event));
        const timedEvents = dayEvents.filter(isTimed);
        return <div key={key} className="relative border-r bg-card">
          <div className="min-h-16 border-b p-1.5">{allDayEvents.map((event) => <button key={event.id} type="button" onClick={() => onEventClick(event)} className="mb-1 block w-full truncate rounded px-1.5 py-1 text-left text-[11px] font-medium" style={{ backgroundColor: colors[event.tipo], color: typeTextColor(event.tipo), opacity: event.status === "cumprido" || event.status === "cancelado" ? 0.5 : 1 }} title={event.titulo}>{event.titulo}</button>)}</div>
          <div className="relative" style={{ height: `${hours.length * 56}px` }}>{hours.map((hour) => <button key={hour} type="button" aria-label={`Novo evento em ${key} às ${String(hour).padStart(2, "0")}:00`} onClick={() => onSlotClick(`${key}T${String(hour).padStart(2, "0")}:00`)} className="absolute inset-x-0 h-14 border-b text-left hover:bg-accent/40" style={{ top: `${(hour - 7) * 56}px` }} />)}{key === todayKey ? <div className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-red-500" style={{ top: `${Math.max(0, (new Date().getHours() + new Date().getMinutes() / 60 - 7) * 56)}px` }} /> : null}{timedEvents.map((event) => { const start = new Date(event.data_inicio); const end = event.data_fim ? new Date(event.data_fim) : new Date(start.getTime() + 60 * 60 * 1000); const startMinutes = start.getHours() * 60 + start.getMinutes(); const endMinutes = Math.max(startMinutes + 30, end.getHours() * 60 + end.getMinutes()); return <button key={event.id} type="button" onClick={() => onEventClick(event)} className="absolute z-20 overflow-hidden rounded px-2 py-1 text-left text-xs font-medium shadow-sm" style={{ top: `${Math.max(0, (startMinutes - 7 * 60) / 60 * 56)}px`, height: `${Math.max(28, (endMinutes - startMinutes) / 60 * 56)}px`, left: "4px", right: "4px", backgroundColor: colors[event.tipo], color: typeTextColor(event.tipo), opacity: event.status === "cumprido" || event.status === "cancelado" ? 0.5 : 1 }} title={event.titulo}>{formatTime(event.data_inicio)} {event.titulo}</button>; })}</div>
        </div>;
      })}
    </div></div>
  </div>;
}

function MonthCalendar({ currentDate, onDateChange, onDayClick, events, onEventClick }: { currentDate: Date; onDateChange: (date: Date) => void; onDayClick: (date: string) => void; events: AgendaEvent[]; onEventClick: (event: AgendaEvent) => void }) {
    const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const days = calendarDays("mes", currentDate);
  const monthLabel = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(currentDate);
  const weekDays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const goToMonth = (amount: number) => {
    const next = new Date(currentDate.getFullYear(), currentDate.getMonth() + amount, 1);
    onDateChange(next);
  };

  return <div className="panel mt-6 overflow-hidden">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
      <div className="flex items-center gap-2"><Button type="button" variant="outline" size="sm" onClick={() => goToMonth(-1)}>&lt;</Button><Button type="button" variant="outline" size="sm" onClick={() => goToMonth(1)}>&gt;</Button><Button type="button" variant="outline" size="sm" onClick={() => onDateChange(new Date())}>Hoje</Button></div>
      <h2 className="text-lg font-semibold capitalize text-[#0F2340]">{monthLabel}</h2>
      <div className="w-[156px]" />
    </div>
    <div className="grid grid-cols-7 border-b bg-muted/30">{weekDays.map((day) => <div key={day} className="p-3 text-center text-xs font-semibold text-muted-foreground">{day}</div>)}</div>
    <div className="grid grid-cols-7">{days.map((day) => {
      const inMonth = day.getMonth() === currentDate.getMonth();
      const key = dateKey(day);
      const dayEvents = events.filter((event) => localDateKey(event.data_inicio) === key); const visibleEvents = dayEvents.slice(0, 3); const hiddenEvents = dayEvents.slice(3); const isExpanded = expandedDay === key; const renderEvent = (event: AgendaEvent) => { const hasTime = Boolean(event.data_fim) || ["reuniao", "audiencia", "julgamento"].includes(event.tipo); const time = hasTime ? new Intl.DateTimeFormat("pt-BR", { timeZone: APP_TIME_ZONE, hour: "2-digit", minute: "2-digit" }).format(new Date(event.data_inicio)) : ""; return <button key={event.id} type="button" onClick={(eventClick) => { eventClick.stopPropagation(); onEventClick(event); }} className="block w-full truncate rounded px-1.5 py-0.5 text-left text-[11px] font-medium" style={{ backgroundColor: colors[event.tipo], color: typeTextColor(event.tipo), opacity: event.status === "cumprido" || event.status === "cancelado" ? 0.5 : 1 }} title={event.titulo}>{time ? `${time} ` : ""}{event.titulo}</button>; }; return <div key={key} onClick={() => { if (!dayEvents.length) onDayClick(key); }} className={`min-h-28 border-b border-r p-2 text-left align-top transition-colors hover:bg-accent/40 ${inMonth ? "bg-card" : "bg-muted/20 text-muted-foreground"}`}><span className={`inline-flex size-7 items-center justify-center rounded-full text-sm ${key === localDateKey(new Date().toISOString()) ? "bg-[#0F2340] font-semibold text-white" : ""}`}>{day.getDate()}</span><div className="mt-1 space-y-1">{(isExpanded ? dayEvents : visibleEvents).map(renderEvent)}{!isExpanded && hiddenEvents.length ? <button type="button" onClick={(eventClick) => { eventClick.stopPropagation(); setExpandedDay(key); }} className="text-xs font-medium text-muted-foreground hover:underline">+{hiddenEvents.length} mais</button> : null}{isExpanded && hiddenEvents.length ? <button type="button" onClick={(eventClick) => { eventClick.stopPropagation(); setExpandedDay(null); }} className="text-xs font-medium text-muted-foreground hover:underline">Mostrar menos</button> : null}</div></div>;
    })}</div>
  </div>;
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
                setForm({ ...emptyForm, ...defaultTimedValues(selectedDate) });
    setResponsibleOtherSelected(false);
    setClientSearch("");
    setOpen(true);
  };
  const openEditEvent = (event: AgendaEvent) => {
        setForm({ ...emptyForm, ...event, protocolo: event.titulo.startsWith("[PROTOCOLO]"), descricao: event.descricao ?? "", cliente_id: event.cliente_id ?? "", contrato_id: event.contrato_id ?? "", data_inicio: saoPauloInput(event.data_inicio, ["prazo", "protocolo", "acompanhamento"].includes(event.tipo)), data_fim: saoPauloInput(event.data_fim, false),  parte_contraria: event.parte_contraria ?? "", local_link: event.local_link ?? "", responsavel: event.responsavel ?? "" });
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
      const payload = { ...values, cliente_id: form.cliente_id || null, contrato_id: form.contrato_id || null, data_inicio: ["prazo", "protocolo", "acompanhamento"].includes(form.tipo) ? brazilDate(form.data_inicio) : brazilDateTime(form.data_inicio), data_fim: ["prazo", "protocolo", "acompanhamento"].includes(form.tipo) ? null : brazilDateTime(form.data_fim), dia_inteiro: form.tipo === "acompanhamento" ? true : ["reuniao", "audiencia", "julgamento"].includes(form.tipo) ? false : undefined, local_link: !["prazo", "protocolo", "acompanhamento"].includes(form.tipo) ? form.local_link || null : null, status: form.status, ...(form.id ? {} : { created_by: (await supabase.auth.getUser()).data.user?.id ?? null }) };
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
              <Button size="sm" variant={view === "lista" ? "secondary" : "ghost"} onClick={() => setView("lista")}>Lista</Button>
                            <Button size="sm" variant={view === "mes" ? "secondary" : "ghost"} onClick={() => setView("mes")}>Mês</Button>
              <Button size="sm" variant={view === "semana" ? "secondary" : "ghost"} onClick={() => setView("semana")}>Semana</Button>
                        </div>
            <GoogleCalendarImportDialog onImported={() => queryClient.invalidateQueries({ queryKey: ["agenda-events"] })} />
            <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button><Plus className="size-4" /> Novo evento</Button></DialogTrigger>
              <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{form.id ? "Editar evento" : "Novo evento"}</DialogTitle></DialogHeader>
                <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); const hasRequiredFields = ["prazo", "protocolo", "julgamento", "acompanhamento"].includes(form.tipo) ? form.titulo.trim() && form.data_inicio : ["reuniao", "audiencia", "julgamento"].includes(form.tipo) ? form.titulo.trim() && form.data_inicio.slice(0, 10) && timeToMinutes(form.data_inicio.slice(11, 16)) !== null && timeToMinutes(form.data_fim.slice(11, 16)) !== null : form.titulo.trim() && form.data_inicio; if (!hasRequiredFields) { toast.error(form.tipo === "prazo" ? "Informe o título e o prazo." : ["reuniao", "audiencia", "julgamento"].includes(form.tipo) ? "Informe os horários." : "Informe o título e a data do evento."); return; } if (["reuniao", "audiencia", "julgamento"].includes(form.tipo) && new Date(form.data_fim).getTime() <= new Date(form.data_inicio).getTime()) { toast.error("A hora de término deve ser depois da hora de início."); return; } createEvent.mutate(); }}>
                                    <div className="grid gap-4 sm:grid-cols-2"><Field label="Tipo"><Select value={form.tipo} onValueChange={(value: EventType) => setForm((current) => {
                    const timed = ["reuniao", "audiencia", "julgamento"].includes(value);
                    const hasTimes = timeToMinutes(current.data_inicio.slice(11, 16)) !== null && timeToMinutes(current.data_fim.slice(11, 16)) !== null;
                    return { ...current, ...(timed && !hasTimes ? defaultTimedValues(current.data_inicio.slice(0, 10)) : {}), tipo: value, contrato_id: "" };
                  })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(labels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></Field><Field label="Responsável"><Select value={form.responsavel ? (["Tiago Craveiro", "Raphael Corradi", "Alexandre Souza", "Lauro Trajano"].includes(form.responsavel) ? form.responsavel : "outra") : undefined} onValueChange={(value) => { setResponsibleOtherSelected(value === "outra"); setForm((current) => ({ ...current, responsavel: value === "outra" ? "" : value })); }}><SelectTrigger><SelectValue placeholder="-" /></SelectTrigger><SelectContent><SelectItem value="Tiago Craveiro">Tiago Craveiro</SelectItem><SelectItem value="Raphael Corradi">Raphael Corradi</SelectItem><SelectItem value="Alexandre Souza">Alexandre Souza</SelectItem><SelectItem value="Lauro Trajano">Lauro Trajano</SelectItem><SelectItem value="outra">Outro</SelectItem></SelectContent></Select>{responsibleOtherSelected ? <Input className="mt-2" placeholder="Nome da outra pessoa" value={form.responsavel} onChange={(event) => setForm((current) => ({ ...current, responsavel: event.target.value }))} /> : null}</Field></div>
                                    <Field label="Título"><Input value={form.titulo} onChange={(event) => setForm((current) => ({ ...current, titulo: event.target.value }))} /></Field>
                  <Field label="Situação"><Select value={form.status} onValueChange={(value: EventStatus) => setForm((current) => ({ ...current, status: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pendente">Pendente</SelectItem><SelectItem value="cumprido">Cumprido</SelectItem><SelectItem value="cancelado">Cancelado</SelectItem></SelectContent></Select></Field>
                  {["prazo", "protocolo", "acompanhamento"].includes(form.tipo) ? <div className="grid gap-3"><Field label="Data"><DateField value={form.data_inicio} onChange={(value) => setForm((current) => ({ ...current, data_inicio: value }))} /></Field></div> : <div className="flex flex-wrap items-end gap-2 [&_input[type=date]]:w-[160px]">{["reuniao", "audiencia", "julgamento"].includes(form.tipo) ? <><Field label="Data"><DateField value={form.data_inicio} onChange={(value) => setForm((current) => ({ ...current, data_inicio: value ? `${value}T${current.data_inicio.slice(11, 16) || "09:00"}` : "", data_fim: value && current.data_fim.slice(11, 16) ? `${value}T${current.data_fim.slice(11, 16)}` : current.data_fim }))} /></Field><TimeRangeField start={form.data_inicio.slice(11, 16)} end={form.data_fim.slice(11, 16)} onStartChange={(time) => setForm((current) => { const date = current.data_inicio.slice(0, 10); const previousStart = timeToMinutes(current.data_inicio.slice(11, 16)); const previousEnd = timeToMinutes(current.data_fim.slice(11, 16)); const duration = previousStart !== null && previousEnd !== null && previousEnd > previousStart ? previousEnd - previousStart : 60; const nextStart = timeToMinutes(time); const nextEnd = nextStart !== null ? minutesToTime(nextStart + duration) : current.data_fim.slice(11, 16); return { ...current, data_inicio: date && time ? `${date}T${time}` : current.data_inicio, data_fim: date && nextEnd ? `${date}T${nextEnd}` : current.data_fim }; })} onEndChange={(time) => setForm((current) => { const date = current.data_fim.slice(0, 10) || current.data_inicio.slice(0, 10); return { ...current, data_fim: date && time ? `${date}T${time}` : current.data_fim }; })} /><Field label="Local ou link"><Input value={form.local_link} onChange={(event) => setForm((current) => ({ ...current, local_link: event.target.value }))} /></Field></> : <><Field label="Data"><DateField value={form.data_inicio} onChange={(value) => setForm((current) => ({ ...current, data_inicio: value ? `${value}${current.data_inicio.slice(10)}` : "", data_fim: current.data_fim ? `${value}${current.data_fim.slice(10)}` : current.data_fim }))} /></Field><TimeRangeField start={form.data_inicio.slice(11, 16)} end={form.data_fim.slice(11, 16)} onStartChange={(time) => setForm((current) => { const date = current.data_inicio.slice(0, 10); return { ...current, data_inicio: date && time ? `${date}T${time}` : current.data_inicio }; })} onEndChange={(time) => setForm((current) => { const date = current.data_fim.slice(0, 10) || current.data_inicio.slice(0, 10); return { ...current, data_fim: date && time ? `${date}T${time}` : current.data_fim }; })} /><Field label="Local ou link"><Input value={form.local_link} onChange={(event) => setForm((current) => ({ ...current, local_link: event.target.value }))} /></Field></>}</div>}
                                    <Field label="Cliente (opcional)"><div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9 pr-9" placeholder="Buscar cliente…" value={clientSearch} onChange={(event) => { setClientSearch(event.target.value); setForm((current) => ({ ...current, cliente_id: "", contrato_id: "" })); }} />{selectedClient && selectedClient.name === clientSearch ? <button type="button" aria-label="Limpar cliente" className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-sm p-1 text-muted-foreground hover:bg-accent hover:text-foreground" onClick={() => { setClientSearch(""); setForm((current) => ({ ...current, cliente_id: "", contrato_id: "" })); }}><X className="size-4" /></button> : null}{clientSearch.trim() && !(selectedClient && selectedClient.name === clientSearch) ? <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-md border bg-popover p-1 shadow-md">{clients.filter((client) => normalizeClientSearch(client.name).includes(normalizeClientSearch(clientSearch.trim()))).slice(0, 8).map((client) => <button key={client.id} type="button" className="block w-full rounded-sm px-3 py-2 text-left text-sm hover:bg-accent" onClick={() => { setClientSearch(client.name); setForm((current) => ({ ...current, cliente_id: client.id, contrato_id: "" })); }}>{client.name}</button>)}{clients.filter((client) => normalizeClientSearch(client.name).includes(normalizeClientSearch(clientSearch.trim()))).length === 0 ? <p className="px-3 py-2 text-sm text-muted-foreground">Nenhum cliente encontrado</p> : null}</div> : null}</div></Field>
                  {form.cliente_id && <Field label="Contrato"><Select value={form.contrato_id || "none"} onValueChange={(value) => setForm((current) => ({ ...current, contrato_id: value === "none" ? "" : value }))}><SelectTrigger><SelectValue placeholder="Sem contrato" /></SelectTrigger><SelectContent><SelectItem value="none">Sem contrato</SelectItem>{contracts.map((contract) => <SelectItem key={contract.id} value={contract.id}>{contract.description || contract.category}</SelectItem>)}</SelectContent></Select></Field>}
                  <Field label="Descrição"><Textarea value={form.descricao} onChange={(event) => setForm((current) => ({ ...current, descricao: event.target.value }))} rows={3} /></Field>
                  <DialogFooter><Button type="submit" disabled={createEvent.isPending}>{createEvent.isPending ? "Salvando…" : "Salvar"}</Button></DialogFooter>
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

        {view === "lista" ? <div className="panel mt-6 overflow-hidden"><Table><TableHeader><TableRow><TableHead>Tipo</TableHead><TableHead>Evento</TableHead><TableHead>Data</TableHead><TableHead>Responsável</TableHead><TableHead>Situação</TableHead><TableHead className="text-right">Ação</TableHead></TableRow></TableHeader><TableBody>
          {isLoading ? <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">Carregando agenda…</TableCell></TableRow> : filteredEvents.length === 0 ? <TableRow><TableCell colSpan={6} className="py-16 text-center"><span className="mx-auto flex size-14 items-center justify-center rounded-full bg-[#F1E8DD] text-[#0F2340]"><CalendarDays className="size-7" /></span><p className="mt-4 font-semibold text-[#0F2340]">Nenhum compromisso por aqui</p><p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">Cadastre seu primeiro evento para acompanhar prazos e reuniões.</p><Button className="mt-5" variant="outline" onClick={() => openNewEvent()}><Plus className="size-4" />Cadastrar primeiro evento</Button></TableCell></TableRow> : filteredEvents.map((event) => <TableRow key={event.id}><TableCell><Badge style={{ backgroundColor: colors[event.tipo], color: typeTextColor(event.tipo) }}>{labels[event.tipo]}</Badge></TableCell><TableCell><button type="button" className="font-medium text-left hover:underline" onClick={() => openEditEvent(event)}>{event.titulo}</button><div className="text-xs text-muted-foreground">{clientNames.get(event.cliente_id ?? "") ?? "Sem cliente vinculado"}</div></TableCell><TableCell className="whitespace-nowrap text-sm">{formatDate(event.data_inicio)}<div className="text-xs text-muted-foreground">{new Intl.DateTimeFormat("pt-BR", { timeZone: APP_TIME_ZONE, hour: "2-digit", minute: "2-digit" }).format(new Date(event.data_inicio))}</div></TableCell><TableCell className="text-sm text-muted-foreground">{event.responsavel || "—"}</TableCell><TableCell>{isOverdue(event) ? <Badge variant="destructive">VENCIDO</Badge> : <Badge variant="secondary">{event.status === "cumprido" ? "Cumprido" : event.status === "cancelado" ? "Cancelado" : "Pendente"}</Badge>}</TableCell><TableCell className="text-right"><div className="flex justify-end gap-2">{event.status !== "cumprido" && event.status !== "cancelado" ? <Button size="sm" variant="outline" onClick={() => markDone.mutate(event.id)} disabled={markDone.isPending}><Check className="size-4" />Cumprido</Button> : <span className="text-xs text-muted-foreground">Concluído</span>}<Button size="sm" variant="outline" onClick={() => { if (window.confirm("Excluir este evento?")) deleteEvent.mutate(event.id); }} disabled={deleteEvent.isPending} aria-label="Excluir evento"><Trash2 className="size-4" /></Button></div></TableCell></TableRow>)}
                </TableBody></Table></div> : view === "mes" ? <MonthCalendar currentDate={calendarDate} onDateChange={setCalendarDate} onDayClick={openNewEvent} events={filteredEvents} onEventClick={openEditEvent} /> : view === "semana" ? <WeekCalendar currentDate={calendarDate} onDateChange={setCalendarDate} onSlotClick={openNewEvent} events={filteredEvents} onEventClick={openEditEvent} /> : null}
      </TooltipProvider>
    </AppShell>
  );
}

function SummaryCard({ label, description, value, color, active, onClick }: { label: string; description: string; value: number; color: string; active: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`panel flex min-h-28 items-center justify-between border-t-4 p-5 text-left transition-shadow hover:shadow-md ${active ? "ring-2 ring-accent" : ""}`} style={{ borderTopColor: color }}><span><span className="block text-xs font-semibold tracking-wide text-muted-foreground">{label}</span><span className="mt-1 block text-sm text-muted-foreground">{description}</span></span><span className="text-4xl font-semibold" style={{ color }}>{value}</span></button>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="grid gap-2"><Label>{label}</Label>{children}</div>; }
