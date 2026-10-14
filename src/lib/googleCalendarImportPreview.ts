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
                                tipo: "prazo" | "protocolo" | "compromisso" | "reuniao" | "audiencia" | "julgamento" | "acompanhamento";
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

/** Procura o cliente pelo nome exato; se não achar, aceita nome abreviado (ex.: "Hiam Mona" → "Hiam Mona Alves El Aouar"). */
function findClient(name: string, clients: Client[]): Client | undefined {
  const alvo = normalize(name);
  if (!alvo) return undefined;
  const exato = clients.find((item) => normalize(item.name) === alvo);
  if (exato) return exato;
  if (alvo.split(/\s+/).length < 2) return undefined;
  const parciais = clients.filter((item) => {
    const nome = normalize(item.name);
    return nome.startsWith(`${alvo} `) || alvo.startsWith(`${nome} `);
  });
  if (parciais.length === 1) return parciais[0];
  // Último recurso: mesmo primeiro e último nome (ex.: "Juliana Conceição Schmitt" → "Juliana Silva Schmitt").
  const palavras = alvo.split(/\s+/);
  const pontas = clients.filter((item) => {
    const nome = normalize(item.name).split(/\s+/);
    return nome[0] === palavras[0] && nome[nome.length - 1] === palavras[palavras.length - 1];
  });
  return pontas.length === 1 ? pontas[0] : undefined;
}

function dateOf(event: GoogleCalendarItem): string {
  return event.start?.date ?? event.start?.dateTime?.slice(0, 10) ?? "";
}


function parseEvent(event: GoogleCalendarItem, clients: Client[], existingIds: Set<string>): GoogleImportPreviewRow {
    // Aceita [SCCadv] (minúsculas) e o "- " logo depois do prefixo.
    const rawTitle = (event.summary ?? "").replace(/^\s*\[SCCAdv\]\s*/i, "").replace(/^[-–]\s*/, "");
        const meeting = /^\[REUNIÃO\]\s*/i.test(rawTitle);
  const hearing = /^\[AUDIÊNCIA\]\s*/i.test(rawTitle) || /^audi[eê]ncia\b/i.test(rawTitle);
  const judgment = /^\[JULGAMENTO\]\s*/i.test(rawTitle) || /^julgamento\b/i.test(rawTitle);
  const followUp = /^\[ACOMPANHAMENTO\]\s*/i.test(rawTitle);
    const titleSource = rawTitle.replace(/^\[(?:REUNIÃO|AUDIÊNCIA|JULGAMENTO|ACOMPANHAMENTO|PROTOCOLO)\]\s*/i, "");
    const protocol = !meeting && !hearing && !judgment && !followUp && /^\[PROTOCOLO\]\s*/i.test(rawTitle);
  const parts = titleSource.split(" - ").map((part) => part.trim()).filter(Boolean);
  const processIndex = parts.findIndex((part) => processPattern.test(part));
  const process = processIndex >= 0 ? (parts[processIndex]?.match(processPattern)?.[1] ?? "") : "";
  const partiesIndex = parts.findIndex((part) => part.includes(" x "));
  const parties = partiesIndex >= 0 ? (parts[partiesIndex] ?? "").split(" x ").map((part) => part.trim()) : [];
    const responsibleIndex = parts.findIndex((part) => /^(Dr\.|Dra\.)\s+/i.test(part));
  const responsible = responsibleIndex >= 0 ? (parts[responsibleIndex] ?? "").replace(/^(Dr\.|Dra\.)\s+/i, "") : "";
  // Cliente: primeiro nome antes do " x "; sem " x ", procura em qualquer trecho do título (ex.: "Petição Inicial - Kelly Alves Vieira").
  let clientName = parties[0] ?? "";
  let client = findClient(clientName, clients);
  let clientPartIndex = -1;
  if (!client && !clientName) {
    for (const [index, part] of parts.entries()) {
      if (index === processIndex || index === responsibleIndex) continue;
      const encontrado = findClient(part, clients);
      if (encontrado) {
        client = encontrado;
        clientName = part;
        clientPartIndex = index;
        break;
      }
    }
  }
                                                                const marker = !/^\[/.test(rawTitle) ? "" : judgment ? "[JULGAMENTO]" : followUp ? "[ACOMPANHAMENTO]" : hearing ? "[AUDIÊNCIA]" : meeting ? "[REUNIÃO]" : "";
        const title = `${marker ? `${marker} ` : ""}${parts.filter((part, index) => index !== processIndex && index !== partiesIndex && index !== responsibleIndex && index !== clientPartIndex && !/^\[PROTOCOLO\]$/i.test(part)).join(" - ")}`.trim();
    const imported = existingIds.has(event.id);
                                                                // Prazo: cor Pavão (7) ou evento de dia inteiro sem cor própria (padrão do escritório para prazos).
  const allDay = Boolean(event.start?.date) && !event.start?.dateTime;
  const kind = judgment ? "julgamento" : followUp ? "acompanhamento" : hearing ? "audiencia" : meeting ? "reuniao" : protocol ? "protocolo" : event.colorId === "7" || (allDay && !event.colorId) ? "prazo" : "compromisso";

    return {
            googleId: event.id,
    tipo: kind,
    titulo: title,
                dataInicio: followUp ? dateOf(event) : event.start?.dateTime ?? event.start?.date ?? "",
    dataFim: followUp ? dateOf(event) : event.end?.dateTime ?? event.end?.dateTime ?? event.end?.date ?? "",
    processo: process,
    cliente: clientName,
    clienteId: client?.id ?? null,
    parteContraria: parties[1] ?? "",
    responsavel: responsible,
            prazo: kind === "prazo" || kind === "protocolo" ? dateOf(event) : "",
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
