type GoogleCalendarItem = {
  id: string;
  summary?: string;
  colorId?: string;
    start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
};

type ExistingEvent = {
  google_event_id: string | null;
};

type Client = { id: string; name: string };

export type GoogleImportPreviewRow = {
      googleId: string;
        tipo: "prazo" | "compromisso" | "reunião" | "julgamento" | "acompanhamento";
  titulo: string;
  dataInicio: string;
  dataFim: string;
  processo: string;
  cliente: string;
  clienteId: string | null;
  parteContraria: string;
  responsavel: string;
    prazo: string;
    aviso: string;
  jaImportado: boolean;
  selecionado: boolean;
};

const processPattern = /(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})/;

function normalize(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function dateOf(event: GoogleCalendarItem): string {
  return event.start?.date ?? event.start?.dateTime?.slice(0, 10) ?? "";
}

function parseEvent(event: GoogleCalendarItem, clients: Client[], existingIds: Set<string>): GoogleImportPreviewRow {
    const rawTitle = event.summary?.replace(/^\[SCCAdv\]\s*/, "") ?? "";
  const meeting = /^\[REUNIÃO\]\s*/i.test(rawTitle);
  const titleSource = rawTitle.replace(/^\[REUNIÃO\]\s*/i, "");
    const protocol = /\[PROTOCOLO\]/i.test(titleSource) || event.colorId === "7";
  const parts = titleSource.split(" - ").map((part) => part.trim()).filter(Boolean);
  const processIndex = parts.findIndex((part) => processPattern.test(part));
  const process = processIndex >= 0 ? (parts[processIndex]?.match(processPattern)?.[1] ?? "") : "";
  const partiesIndex = parts.findIndex((part) => part.includes(" x "));
  const parties = partiesIndex >= 0 ? (parts[partiesIndex] ?? "").split(" x ").map((part) => part.trim()) : [];
  const responsibleIndex = parts.findIndex((part) => /^(Dr\.|Dra\.)\s+/i.test(part));
  const responsible = responsibleIndex >= 0 ? (parts[responsibleIndex] ?? "").replace(/^(Dr\.|Dra\.)\s+/i, "") : "";
        const title = `${meeting ? "[REUNIÃO] " : ""}${protocol ? "[PROTOCOLO] " : ""}${parts.filter((part, index) => index !== processIndex && index !== partiesIndex && index !== responsibleIndex && !/^\[PROTOCOLO\]$/i.test(part)).join(" - ")}`.trim();
  const clientName = parties[0] ?? "";
  const client = clients.find((item) => normalize(item.name) === normalize(clientName));
    const imported = existingIds.has(event.id);
    const kind = meeting ? "reunião" : protocol ? "prazo" : "compromisso";

    return {
            googleId: event.id,
    tipo: kind,
    titulo: title,
    dataInicio: event.start?.dateTime ?? event.start?.date ?? "",
    dataFim: event.end?.dateTime ?? event.end?.date ?? "",
    processo: process,
    cliente: clientName,
    clienteId: client?.id ?? null,
    parteContraria: parties[1] ?? "",
    responsavel: responsible,
            prazo: kind === "prazo" ? dateOf(event) : "",
        aviso: [
      !client && clientName ? "cliente não encontrado" : "",
      imported ? "evento já importado antes" : "",
    ].filter(Boolean).join("; "),
    jaImportado: imported,
    selecionado: false,
  };
}

export function buildGoogleImportPreview(events: GoogleCalendarItem[], clients: Client[], existing: ExistingEvent[]): GoogleImportPreviewRow[] {
    const existingIds = new Set(existing.map((event) => event.google_event_id).filter(Boolean) as string[]);
    const rows = events.map((event) => parseEvent(event, clients, existingIds));

  return rows.map((row) => ({
    ...row,
        selecionado: !row.jaImportado,
  }));
}
