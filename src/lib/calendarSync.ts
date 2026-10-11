import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type CalendarEvent = {
  id: string;
  tipo: string;
  titulo: string;
  descricao?: string | null | undefined;
  numero_processo?: string | null | undefined;
  parte_contraria?: string | null | undefined;
  responsavel?: string | null | undefined;
  cliente_nome?: string | null | undefined;
    data_inicio: string;
  data_fim?: string | null | undefined;
  
  local_link?: string | null | undefined;
};

type GoogleEvent = {
  id: string;
  summary: string;
  description?: string | undefined;
  location?: string | undefined;
  colorId: string;
  start: { date?: string; dateTime?: string; timeZone?: string };
    end: { date?: string; dateTime?: string; timeZone?: string };
  reminders?: {
    useDefault: boolean;
    overrides: Array<{ method: "popup"; minutes: number }>;
  };
};

type GoogleEventIds = {
  comum: string | null;
};

const GOOGLE_CALENDAR_URL = "https://connector-gateway.lovable.dev/google_calendar/calendar/v3/calendars";

export const TIPO_CORES = {
  prazo: { colorId: "7", hex: "#039BE5" },
  protocolo: { colorId: "5", hex: "#F6BF26" },
    reuniao: { colorId: "9", hex: "#3F51B5" },
  audiencia: { colorId: "11", hex: "#D50000" },
  julgamento: { colorId: "3", hex: "#8E24AA" },
  acompanhamento: { colorId: "2", hex: "#33B679" },
  compromisso: { colorId: "8", hex: "#616161" },
} as const;


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

function dateTimeSaoPaulo(value: string): string {
  const date = dateOnly(value);
  const time = value.includes("T") ? value.slice(11, 16) : "00:00";
  return `${date}T${time}:00-03:00`;
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
    const value = details.filter(Boolean).join("\n");
  return value || undefined;
}

function buildGoogleEvents(event: CalendarEvent): GoogleEvent[] {
  const date = dateOnly(event.data_inicio);

    if (event.tipo === "reunião" || event.tipo === "audiência" || event.tipo === "julgamento") {
    if (!event.data_fim) throw new Error("A reunião precisa ter horário de término.");
                const marker = event.tipo === "reuniao" ? "[REUNIÃO]" : event.tipo === "audiencia" ? "[AUDIÊNCIA]" : "[JULGAMENTO]";
    const meetingTitle = event.titulo.replace(/^\[(?:REUNIÃO|AUDIÊNCIA|JULGAMENTO)\]\s*/, "");
    return [{
      id: "",
            summary: compactParts([marker, "[SCCAdv]", meetingTitle, event.numero_processo, parties(event), responsible(event)]),
            colorId: TIPO_CORES[event.tipo as keyof typeof TIPO_CORES].colorId,
            start: { dateTime: dateTimeSaoPaulo(event.data_inicio), timeZone: "America/Sao_Paulo" },
      end: { dateTime: dateTimeSaoPaulo(event.data_fim), timeZone: "America/Sao_Paulo" },
      description: description(event),
      location: event.local_link?.trim() || undefined,
      reminders: {
        useDefault: false,
        overrides: [{ method: "popup", minutes: 60 }],
      },
    }];
  }

  const common: Pick<GoogleEvent, "start" | "end" | "description" | "reminders"> = {
    start: { date },
    end: { date: nextDate(date) },
        description: description(event),
    reminders: {
      useDefault: false,
      overrides: event.tipo === "prazo" || event.tipo === "protocolo"
        ? [
            { method: "popup", minutes: 2340 },
            { method: "popup", minutes: 900 },
          ]
        : [{ method: "popup", minutes: 900 }],
    },
  };

    if (event.tipo === "julgamento" || event.tipo === "acompanhamento") {
    const marker = event.tipo === "julgamento" ? "[JULGAMENTO]" : "[ACOMPANHAMENTO]";
    const title = event.titulo.replace(/^\[(?:JULGAMENTO|ACOMPANHAMENTO)\]\s*/, "");
    return [{
      id: "",
            summary: compactParts(["[SCCAdv]", marker, title, event.numero_processo, parties(event), responsible(event)]),
      colorId: TIPO_CORES[event.tipo as keyof typeof TIPO_CORES].colorId,
      ...common,
    }];
  }

  if (event.tipo === "prazo" || event.tipo === "protocolo") {
    const process = event.numero_processo?.trim();
    const party = parties(event);
    const doctor = responsible(event);
            const isProtocol = event.tipo === "protocolo";
    const title = compactParts(["[SCCAdv]", isProtocol ? "[PROTOCOLO]" : null, isProtocol ? event.titulo.replace(/^\[PROTOCOLO\]\s*/, "") : event.titulo, process, party, doctor]);
    const date = dateOnly(event.data_inicio);
    return [{
      id: "",
            summary: title,
      colorId: TIPO_CORES[event.tipo as keyof typeof TIPO_CORES].colorId,
      start: { date },
      end: { date: nextDate(date) },
      description: common.description,
    }];
  }

  return [{
    id: "",
        summary: compactParts(["[SCCAdv]", event.titulo, event.numero_processo, parties(event), responsible(event)]),
    colorId: TIPO_CORES[event.tipo as keyof typeof TIPO_CORES].colorId,
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
    const error = new Error("Não foi possível sincronizar o evento com o Google Agenda.");
    Object.assign(error, { status: response.status });
    throw error;
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
  try {
    await googleRequest(`/events/${encodeURIComponent(id)}`, { method: "DELETE" });
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status !== 404 && status !== 410) throw error;
  }
}

async function updateGoogleEvent(id: string, event: GoogleEvent): Promise<string> {
  const { id: omittedId, colorId, ...rest } = event;
  const payload = { ...rest, ...(colorId ? { colorId } : {}) };
  if (!payload.description) delete payload.description;

  try {
    await googleRequest(`/events/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    return id;
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status !== 404 && status !== 410) throw error;
  }

  return insertGoogleEvent(event);
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
  data_fim: z.string().nullable().optional(),
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
    data_fim: data.data_fim ?? null,
    descricao: data.descricao ?? null, numero_processo: data.numero_processo ?? null,
    parte_contraria: data.parte_contraria ?? null, responsavel: data.responsavel ?? null,
        cliente_nome: data.cliente_nome ?? null, local_link: data.local_link ?? null,
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

        const googleEvents = buildGoogleEvents(data.event);
    const googleEvent = googleEvents[0];
    if (!googleEvent) {
      await removeGoogleEvent(previous.google_event_id);
      const { error: clearError } = await context.supabase
        .from("eventos")
        .update({ google_event_id: null })
        .eq("id", data.id);
      if (clearError) throw clearError;
      return { comum: null };
    }

    const googleId = previous.google_event_id
      ? await updateGoogleEvent(previous.google_event_id, googleEvent)
      : await insertGoogleEvent(googleEvent);

    const { error: updateError } = await context.supabase
      .from("eventos")
      .update({ google_event_id: googleId })
      .eq("id", data.id);
    if (updateError) throw updateError;
    return { comum: googleId };
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

