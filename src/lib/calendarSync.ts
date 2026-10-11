import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { z } from "zod";

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
  description?: string | undefined;
  colorId: string;
  start: { date: string };
  end: { date: string };
};

type GoogleEventIds = {
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
        const title = compactParts(["[SCCAdv]", event.titulo, process, party, doctor]);
    const date = dateOnly(event.prazo_fatal || event.data_inicio);
    return [{
      id: "",
      summary: title,
      colorId: "7",
      start: { date },
      end: { date: nextDate(date) },
      description: common.description,
    }];
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
  const { id: omittedId, colorId, ...rest } = event;
  const payload = { ...rest, ...(colorId ? { colorId } : {}) };
  if (!payload.description) delete payload.description;
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

async function ensureActive(supabase: SupabaseClient<Database>) {
  const { data, error } = await supabase.rpc("is_ativo");
  if (error || !data) throw new Error("Acesso não autorizado");
}

const calendarEventSchema = z.object({
  id: z.string().uuid(),
  tipo: z.string(),
  titulo: z.string(),
  data_inicio: z.string(),
  descricao: z.string().nullable().optional(),
  numero_processo: z.string().nullable().optional(),
  parte_contraria: z.string().nullable().optional(),
  responsavel: z.string().nullable().optional(),
  cliente_nome: z.string().nullable().optional(),
  
  local_link: z.string().nullable().optional(),
});

async function syncCreatedEvent(supabase: SupabaseClient<Database>, data: z.infer<typeof calendarEventSchema>) {
  const event: CalendarEvent = {
    id: data.id, tipo: data.tipo, titulo: data.titulo, data_inicio: data.data_inicio,
    descricao: data.descricao ?? null, numero_processo: data.numero_processo ?? null,
    parte_contraria: data.parte_contraria ?? null, responsavel: data.responsavel ?? null,
    cliente_nome: data.cliente_nome ?? null, prazo_fatal: data.prazo_fatal ?? null,
    prazo_interno: data.prazo_interno ?? null, local_link: data.local_link ?? null,
  };
  const ids: GoogleEventIds = { comum: null };
  for (const googleEvent of buildGoogleEvents(event)) {
    ids.comum = await insertGoogleEvent(googleEvent);
  }
  const { error } = await supabase.from("eventos").update({ google_event_id: ids.comum }).eq("id", data.id);
  if (error) throw error;
  return ids;
}

export const createEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => calendarEventSchema.parse(input))
  .handler(async ({ context, data }) => {
    await ensureActive(context.supabase);
    return syncCreatedEvent(context.supabase, data);
  });

export const updateEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid(), event: calendarEventSchema }).parse(input))
  .handler(async ({ context, data }) => {
    await ensureActive(context.supabase);
        const { data: previous, error } = await context.supabase.from("eventos").select("google_event_id").eq("id", data.id).single();
    if (error) throw error;
        await removeGoogleEvent(previous.google_event_id);
    return syncCreatedEvent(context.supabase, data.event);
  });

export const deleteEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    await ensureActive(context.supabase);
        const { data: event, error } = await context.supabase.from("eventos").select("google_event_id").eq("id", data.id).single();
    if (error) throw error;
    await removeGoogleEvent(event.google_event_id);
    return { id: data.id };
  });

