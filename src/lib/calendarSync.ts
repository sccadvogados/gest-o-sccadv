import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type CalendarEvent = {
  id: string;
  tipo: string;
  titulo: string;
  descricao?: string | null;
  numero_processo?: string | null;
  parte_contraria?: string | null;
  responsavel?: string | null;
  cliente_nome?: string | null;
  data_inicio: string;
  prazo_fatal?: string | null;
  prazo_interno?: string | null;
  local_link?: string | null;
};

type GoogleEvent = {
  id: string;
  summary: string;
  description?: string;
  colorId: string;
  start: { date: string };
  end: { date: string };
};

type GoogleEventIds = {
  fatal: string | null;
  interno: string | null;
  comum: string | null;
};

const GOOGLE_CALENDAR_URL = "https://connector-gateway.lovable.dev/google_calendar/calendar/v3/calendars";

function getGoogleConfig() {
  const lovableApiKey = process.env["LOVABLE_API_KEY"];
  const calendarApiKey = process.env["GOOGLE_CALENDAR_API_KEY"];
  const calendarId = process.env["GOOGLE_CALENDAR_ID"];

  if (!lovableApiKey || !calendarApiKey || !calendarId) {
    throw new Error("A conexão com o Google Agenda não está disponível.");
  }

  return { lovableApiKey, calendarApiKey, calendarId };
}

function dateOnly(value: string): string {
  return value.slice(0, 10);
}

function nextDate(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function reminderOverrides(event: CalendarEvent) {
  const hasTwoReminders = event.tipo === "prazo" || event.titulo.toLowerCase().includes("protocolo");
  const minutes = hasTwoReminders ? [2880, 1440] : [1440];
  return { useDefault: false as const, overrides: minutes.map((value) => ({ method: "popup" as const, minutes: value })) };
}

function compactParts(parts: Array<string | null | undefined>): string {
  return parts.map((part) => part?.trim()).filter(Boolean).join(" - ");
}

function parties(event: CalendarEvent): string | null {
  const client = event.cliente_nome?.trim();
  const opponent = event.parte_contraria?.trim();
  if (client && opponent) return `${client} x ${opponent}`;
  return client || opponent || null;
}

function responsible(event: CalendarEvent): string | null {
  const value = event.responsavel?.trim();
  return value ? `Dr. ${value}` : null;
}

function description(event: CalendarEvent): string | undefined {
  const details = [event.descricao?.trim()];
  if (event.tipo !== "prazo") {
    const time = event.data_inicio.includes("T") ? event.data_inicio.slice(11, 16) : null;
    if (time) details.push(`Hora: ${time}`);
    if (event.local_link?.trim()) details.push(`Local/link: ${event.local_link.trim()}`);
  }
  const value = details.filter(Boolean).join("\\n");
  return value || undefined;
}

function buildGoogleEvents(event: CalendarEvent): GoogleEvent[] {
  const date = dateOnly(event.data_inicio);
  const common = {
    start: { date },
    end: { date: nextDate(date) },
    description: description(event),
  };

  if (event.tipo === "prazo") {
    const process = event.numero_processo?.trim();
    const party = parties(event);
    const doctor = responsible(event);
    const fatalTitle = compactParts(["[SCCAdv]", event.titulo, process, party, doctor]);
    const internalTitle = compactParts(["[SCCAdv] [PROTOCOLO]", event.titulo, party, process, doctor]);
    const events: GoogleEvent[] = [];

    if (event.prazo_fatal) {
      const fatalDate = dateOnly(event.prazo_fatal);
      events.push({
        id: "",
        summary: fatalTitle,
        colorId: "7",
        start: { date: fatalDate },
        end: { date: nextDate(fatalDate) },
        description: common.description,
      });
    }
    if (event.prazo_interno) {
      const internalDate = dateOnly(event.prazo_interno);
      events.push({
        id: "",
        summary: internalTitle,
        colorId: "5",
        start: { date: internalDate },
        end: { date: nextDate(internalDate) },
        description: common.description,
      });
    }
    return events;
  }

  return [{
    id: "",
    summary: compactParts(["[SCCAdv]", event.titulo, event.numero_processo, parties(event), responsible(event)]),
    colorId: "",
    ...common,
  }];
}

async function googleRequest(path: string, init?: RequestInit): Promise<unknown> {
  const { lovableApiKey, calendarApiKey, calendarId } = getGoogleConfig();
  const response = await fetch(`${GOOGLE_CALENDAR_URL}/${encodeURIComponent(calendarId)}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${lovableApiKey}`,
      "X-Connection-Api-Key": calendarApiKey,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    throw new Error("Não foi possível sincronizar o evento com o Google Agenda.");
  }
  return response.status === 204 ? null : response.json();
}

async function insertGoogleEvent(event: GoogleEvent): Promise<string> {
  const payload = { ...event };
  delete payload.id;
  if (!payload.description) delete payload.description;
  if (!payload.colorId) delete payload.colorId;
  const result = await googleRequest("/events", {
    method: "POST",
    body: JSON.stringify(payload),
  }) as { id?: string };
  if (!result.id) throw new Error("O Google Agenda não retornou o ID do evento.");
  return result.id;
}

async function removeGoogleEvent(id: string | null | undefined): Promise<void> {
  if (!id) return;
  await googleRequest(`/events/${encodeURIComponent(id)}`, { method: "DELETE" });
}

async function ensureActive(supabase: Parameters<typeof requireSupabaseAuth>[0] extends never ? never : any) {
  const { data, error } = await supabase.rpc("is_ativo");
  if (error || !data) throw new Error("Acesso não autorizado");
}

export const createEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }: { context: { supabase: any }; data: CalendarEvent }) => {
    await ensureActive(context.supabase);
    const googleEvents = buildGoogleEvents(data);
    const ids: GoogleEventIds = { fatal: null, interno: null, comum: null };
    for (const [index, googleEvent] of googleEvents.entries()) {
      const id = await insertGoogleEvent(googleEvent);
      if (data.tipo === "prazo") {
        if (index === 0) ids.fatal = id;
        else ids.interno = id;
      } else {
        ids.comum = id;
      }
    }
    const { error } = await context.supabase.from("eventos").update({
      google_event_id_fatal: ids.fatal,
      google_event_id_interno: ids.interno,
      google_event_id: ids.comum,
    }).eq("id", data.id);
    if (error) throw error;
    return ids;
  });

export const updateEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }: { context: { supabase: any }; data: { id: string; event: CalendarEvent } }) => {
    await ensureActive(context.supabase);
    const { data: previous, error } = await context.supabase.from("eventos").select("google_event_id, google_event_id_fatal, google_event_id_interno").eq("id", data.id).single();
    if (error) throw error;
    await removeGoogleEvent(previous.google_event_id);
    await removeGoogleEvent(previous.google_event_id_fatal);
    await removeGoogleEvent(previous.google_event_id_interno);
    return createEvent({ data: data.event });
  });

export const deleteEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }: { context: { supabase: any }; data: { id: string } }) => {
    await ensureActive(context.supabase);
    const { data: event, error } = await context.supabase.from("eventos").select("google_event_id, google_event_id_fatal, google_event_id_interno").eq("id", data.id).single();
    if (error) throw error;
    await removeGoogleEvent(event.google_event_id);
    await removeGoogleEvent(event.google_event_id_fatal);
    await removeGoogleEvent(event.google_event_id_interno);
    return { id: data.id };
  });

