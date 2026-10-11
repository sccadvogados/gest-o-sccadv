import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GOOGLE_CALENDAR_URL = "https://connector-gateway.lovable.dev/google_calendar/calendar/v3/calendars";

type GoogleCalendarItem = {
  id: string;
  summary?: string;
  description?: string;
  colorId?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
};

function getGoogleConfig() {
  const lovableApiKey = process.env["LOVABLE_API_KEY"];
  const calendarApiKey = process.env["GOOGLE_CALENDAR_API_KEY"];
  const calendarId = process.env["GOOGLE_CALENDAR_ID"];

  if (!lovableApiKey || !calendarApiKey || !calendarId) {
    throw new Error("A conexão com o Google Agenda não está disponível.");
  }

  return { lovableApiKey, calendarApiKey, calendarId };
}

export const listGoogleCalendarEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(input))
  .handler(async ({ context, data }) => {
    const { data: isAdmin, error: adminError } = await context.supabase.rpc("is_admin");
    if (adminError || !isAdmin) throw new Error("Apenas administradores podem importar do Google Agenda.");

    const { lovableApiKey, calendarApiKey, calendarId } = getGoogleConfig();
    const params = new URLSearchParams({
      timeMin: `${data.from}T00:00:00Z`,
      singleEvents: "true",
      orderBy: "startTime",
    });
        const events: GoogleCalendarItem[] = [];
    let pageToken: string | undefined;

    do {
      if (pageToken) params.set("pageToken", pageToken);
      const response = await fetch(
        `${GOOGLE_CALENDAR_URL}/${encodeURIComponent(calendarId)}/events?${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${lovableApiKey}`,
            "X-Connection-Api-Key": calendarApiKey,
          },
        },
      );

      if (!response.ok) throw new Error("Não foi possível ler os eventos do Google Agenda.");
      const result = await response.json() as { items?: GoogleCalendarItem[]; nextPageToken?: string };
      events.push(...(result.items ?? []));
      pageToken = result.nextPageToken;
    } while (pageToken);

    return events.filter((event) => event.summary?.startsWith("[SCCAdv]"));
  });
