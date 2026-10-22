import { createFileRoute } from "@tanstack/react-router";

/**
 * Aviso no celular quando um evento da Agenda é agendado ou cumprido.
 * Chamada pelo próprio banco (gatilho em eventos), com o segredo SCC_CRON_SECRET (cabeçalho x-scc-cron).
 * - Agendado: todos os aparelhos ativos recebem.
 * - Cumprido: todos, menos quem deu o evento como cumprido.
 * Eventos importados do Google Agenda não geram aviso.
 */
type Resultado<T> = Promise<{ data: T | null; error: { message: string } | null }>;
type Consulta = {
  select: (colunas: string) => Consulta;
  eq: (coluna: string, valor: unknown) => Consulta;
  maybeSingle: () => Resultado<Record<string, unknown>>;
  delete: () => { in: (coluna: string, valores: unknown[]) => Resultado<unknown> };
};
type Banco = {
  from: (tabela: string) => Consulta;
  rpc: (nome: string, args: Record<string, unknown>) => Resultado<Array<Record<string, unknown>>>;
};

const TIPOS: Record<string, { nome: string; feminino?: boolean }> = {
  prazo: { nome: "Prazo" },
  protocolo: { nome: "Protocolo" },
  audiencia: { nome: "Audiência", feminino: true },
  reuniao: { nome: "Reunião", feminino: true },
  compromisso: { nome: "Compromisso" },
  julgamento: { nome: "Julgamento" },
  acompanhamento: { nome: "Acompanhamento" },
};

function iguais(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diferenca = 0;
  for (let i = 0; i < a.length; i += 1) diferenca |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferenca === 0;
}

/** "JOYCE SOUSA DE ARAÚJO" → "Joyce Araújo" (pessoa física: primeiro nome + último sobrenome). */
function nomeCurto(nome: string, pj: boolean) {
  const limpo = nome.trim().replace(/\s+/g, " ");
  const bonito = (p: string) => (p === p.toUpperCase() ? p.charAt(0) + p.slice(1).toLowerCase() : p);
  if (pj) return limpo.length > 40 ? `${limpo.slice(0, 39)}…` : limpo;
  const partes = limpo.split(" ").filter((p) => !["DE", "DA", "DO", "DOS", "DAS", "E"].includes(p.toUpperCase()));
  const escolhidas = partes.length > 2 ? [partes[0] ?? "", partes[partes.length - 1] ?? ""] : partes;
  return escolhidas.map(bonito).join(" ");
}

/** "30/10" (prazo, protocolo, dia inteiro) ou "30/10 às 14h30" (horário de Brasília). */
function quando(evento: Record<string, unknown>) {
  const data = new Date(String(evento["data_inicio"] ?? ""));
  if (Number.isNaN(data.getTime())) return "";
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(data)
      .map((p) => [p.type, p.value]),
  );
  const dia = `${partes["day"]}/${partes["month"]}`;
  const soData = evento["dia_inteiro"] === true || ["prazo", "protocolo", "acompanhamento"].includes(String(evento["tipo"]));
  if (soData) return dia;
  return `${dia} às ${partes["hour"]}h${partes["minute"] === "00" ? "" : partes["minute"]}`;
}

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json; charset=utf-8" } });

export const Route = createFileRoute("/api/avisos-agenda")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const segredo = process.env["SCC_CRON_SECRET"];
        const privada = process.env["SCC_VAPID_PRIVATE_KEY"];
        if (!segredo || !privada) return json({ erro: "Configuração ausente" }, 500);
        if (!iguais(request.headers.get("x-scc-cron") ?? "", segredo)) return json({ erro: "Não autorizado" }, 401);

        const pedido = (await request.json().catch(() => ({}))) as { evento_id?: unknown; acao?: unknown; autor?: unknown };
        const acao = pedido.acao === "cumprido" ? "cumprido" : pedido.acao === "agendado" ? "agendado" : null;
        if (!acao || typeof pedido.evento_id !== "string") return json({ erro: "Pedido inválido" }, 400);
        const autor = typeof pedido.autor === "string" ? pedido.autor : null;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { enviarPush } = await import("@/lib/web-push.server");
        const db = supabaseAdmin as unknown as Banco;

        const { data: evento } = await db.from("eventos").select("id, tipo, titulo, data_inicio, dia_inteiro, cliente_id").eq("id", pedido.evento_id).maybeSingle();
        if (!evento) return json({ erro: "Evento não encontrado" }, 404);

        let cliente = "";
        if (evento["cliente_id"]) {
          const { data: c } = await db.from("clients").select("name, person_type").eq("id", evento["cliente_id"]).maybeSingle();
          if (c) cliente = nomeCurto(String(c["name"] ?? ""), c["person_type"] === "PJ");
        }

        const tipo = TIPOS[String(evento["tipo"])] ?? { nome: "Evento" };
        const verbo = acao === "agendado" ? (tipo.feminino ? "Agendada" : "Agendado") : tipo.feminino ? "Cumprida" : "Cumprido";
        const titulo = String(evento["titulo"] ?? "").trim();
        const data = quando(evento);
        // Título: "Prazo Agendado" / "Audiência Cumprida". Texto: cliente · título do evento · data.
        const aviso = {
          title: `${tipo.nome} ${verbo}`,
          body: [cliente, titulo, data].filter(Boolean).join(" · ") || "Toque para ver na Agenda.",
          url: "/agenda",
          tag: `evento-${String(evento["id"])}-${acao}`,
        };

        const { data: linhas } = await db.rpc("push_inscricoes_ativas", {});
        const inscricoes = (linhas ?? [])
          .filter((l) => !(acao === "cumprido" && autor && String(l["user_id"]) === autor))
          .map((l) => ({ id: String(l["id"]), endpoint: String(l["endpoint"]), p256dh: String(l["p256dh"]), auth: String(l["auth"]) }));

        const vencidas: string[] = [];
        let enviados = 0;
        for (const inscricao of inscricoes) {
          try {
            const status = await enviarPush(inscricao, aviso, privada);
            if (status === 404 || status === 410) vencidas.push(inscricao.id);
            else if (status < 300) enviados += 1;
          } catch {
            /* um aparelho com problema não impede os outros */
          }
        }
        if (vencidas.length) await db.from("push_inscricoes").delete().in("id", vencidas);
        return json({ acao, avisos_enviados: enviados });
      },
    },
  },
});