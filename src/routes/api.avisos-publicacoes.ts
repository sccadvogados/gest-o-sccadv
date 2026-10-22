import { createFileRoute } from "@tanstack/react-router";

/**
 * Aviso no celular quando sai publicação de cliente no DJEN.
 * Um aviso por publicação: título = nome do cliente; texto = "Ato · Tribunal — resumo da IA".
 * Chamada pelo agendamento do banco (pg_cron) nos dias úteis às 9h05, logo depois de o banco
 * (servidor em São Paulo) buscar as comunicações do dia no DJEN — a API do CNJ só responde para o Brasil.
 * Protegida pelo segredo SCC_CRON_SECRET (cabeçalho x-scc-cron).
 * Mesmas regras da tela Publicações do Dia: OAB/DF 70.293, tribunais acompanhados e só clientes cadastrados.
 */
const TRIBUNAIS = ["TJDFT", "TJGO", "TJPE", "TRT1", "TJMG", "TRF1", "TJSP"];
const API = "https://comunicaapi.pje.jus.br/api/v1/comunicacao";

type Comunicacao = {
  id: number;
  hash: string | null;
  siglaTribunal: string;
  tipoDocumento: string | null;
  numeroprocessocommascara: string | null;
  texto: string | null;
  tipoComunicacao?: string | null;
  nomeClasse?: string | null;
    destinatarios: Array<{ nome: string }> | null;
  link?: string | null;
};

type Publicacao = { id: number; clienteId: string; cliente: string; tribunal: string; tipo: string; classe: string; texto: string };

type Resultado<T> = Promise<{ data: T | null; error: { message: string } | null }>;
type Consulta = {
  select: (colunas: string) => Consulta & Resultado<Array<Record<string, unknown>>>;
  in: (coluna: string, valores: unknown[]) => Resultado<Array<Record<string, unknown>>>;
  insert: (linhas: Array<Record<string, unknown>>) => Resultado<unknown>;
  delete: () => { in: (coluna: string, valores: unknown[]) => Resultado<unknown> };
};
type Banco = {
  from: (tabela: string) => Consulta;
  rpc: (nome: string, args: Record<string, unknown>) => Resultado<Array<Record<string, unknown>>>;
};

function normalizar(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function mesmoNome(parte: string, cliente: string) {
  if (!parte || !cliente) return false;
  if (parte === cliente) return true;
  const menor = parte.length < cliente.length ? parte : cliente;
  const maior = menor === parte ? cliente : parte;
  return menor.length >= 12 && maior.startsWith(menor);
}

function hojeBrasil() {
  return new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
}

function iguais(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diferenca = 0;
  for (let i = 0; i < a.length; i += 1) diferenca |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferenca === 0;
}

function limparTeor(texto: string | null) {
  if (!texto) return "";
  return texto.replace(/<br\s*\/?\s*>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/[ \t]+/g, " ").trim();
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

/** Resumo do ato pela IA (mesmo padrão da tela Publicações do Dia), curto para caber no aviso. */
async function resumir(publicacoes: Publicacao[]) {
  const resultado: Record<string, string> = {};
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) return resultado;
  for (let i = 0; i < publicacoes.length; i += 20) {
    const lista = publicacoes
      .slice(i, i + 20)
      .map((p) => `### id=${p.id}\nCliente do escritório: ${p.cliente}\nTipo: ${p.tipo}\nClasse: ${p.classe}\nTeor:\n${p.texto}`)
      .join("\n\n");
    try {
      const resposta = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                'Você é advogado e lê publicações do Diário de Justiça para um escritório. Para cada publicação, escreva o "ato" em uma linha curta (máximo 15 palavras), no formato "<Tipo do ato>: <o que foi decidido/determinado>", destacando o efeito prático para o cliente do escritório e prazos quando houver (ex.: "Decisão: gratuidade concedida + liminar parcial contra a Hapvida", "Intimação para Réplica: manifestar-se sobre a contestação em 15 dias", "Sentença: procedente, condena a ré a custear o tratamento"). Não invente nada que não esteja no teor. Retorne somente JSON válido no formato {"resumos":[{"id":123,"ato":"..."}]}.',
            },
            { role: "user", content: lista },
          ],
        }),
      });
      if (!resposta.ok) continue;
      const payload = (await resposta.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const conteudo = (payload.choices?.[0]?.message?.content ?? "").replace(/^```json\s*|\s*```$/g, "");
      for (const item of (JSON.parse(conteudo) as { resumos?: Array<{ id: number; ato: string }> }).resumos ?? []) {
        if (item && typeof item.ato === "string") resultado[String(item.id)] = item.ato.trim();
      }
    } catch {
      /* sem resumo: o aviso usa o tipo do documento */
    }
  }
  return resultado;
}

/** Aviso no padrão escolhido: título = cliente; texto = "Ato · Tribunal — resumo". */
function montarAviso(p: Publicacao, ato: string | undefined, data: string) {
  const [tipoIa, ...resto] = (ato ?? "").split(":");
  const tipo = (resto.length ? (tipoIa ?? "").trim() : "") || p.tipo || "Publicação";
  let resumo = (resto.length ? resto.join(":") : ato ?? "").trim();
  resumo = resumo ? resumo.charAt(0).toUpperCase() + resumo.slice(1) : "Toque para ver o teor e agendar o prazo.";
  if (resumo.length > 120) resumo = `${resumo.slice(0, 119)}…`;
  return {
    title: p.cliente,
    body: `${tipo} · ${p.tribunal} — ${resumo}`,
    url: `/inicio?data=${data}&agendar=${p.id}`,
    tag: `publicacao-${p.id}`,
  };
}

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json; charset=utf-8" } });

/** Comunicações do dia: primeiro as que o banco buscou no DJEN; se não houver, tenta direto. */
async function comunicacoesDoDia(db: Banco, data: string) {
  const itens: Comunicacao[] = [];
  const { data: respostas } = await db.rpc("djen_respostas", { p_data: data });
  for (const r of respostas ?? []) {
    if (r["status_code"] !== 200 || typeof r["content"] !== "string") continue;
    try {
      itens.push(...((JSON.parse(r["content"]) as { items?: Comunicacao[] }).items ?? []));
    } catch {
      /* resposta inválida: ignora */
    }
  }
  if ((respostas ?? []).some((r) => r["status_code"] === 200)) return { itens, origem: "banco" };

  const params = new URLSearchParams({ numeroOab: "70293", ufOab: "DF", dataDisponibilizacaoInicio: data, dataDisponibilizacaoFim: data, itensPorPagina: "100", pagina: "1" });
  const resposta = await fetch(`${API}?${params}`).catch(() => null);
  if (!resposta?.ok) return { itens, origem: `sem dados (DJEN ${resposta?.status ?? "inacessível"})` };
  return { itens: ((await resposta.json()) as { items?: Comunicacao[] }).items ?? [], origem: "direto" };
}

export const Route = createFileRoute("/api/avisos-publicacoes")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const segredo = process.env["SCC_CRON_SECRET"];
        const privada = process.env["SCC_VAPID_PRIVATE_KEY"];
        if (!segredo || !privada) return json({ erro: "Configuração ausente" }, 500);
        if (!iguais(request.headers.get("x-scc-cron") ?? "", segredo)) return json({ erro: "Não autorizado" }, 401);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { enviarPush } = await import("@/lib/web-push.server");
        const db = supabaseAdmin as unknown as Banco;
        // Normalmente é o dia de hoje; para teste o banco pode mandar {"data":"AAAA-MM-DD"}.
        const pedido = (await request.json().catch(() => ({}))) as { data?: unknown };
        const data = typeof pedido.data === "string" && /^\d{4}-\d{2}-\d{2}$/.test(pedido.data) ? pedido.data : hojeBrasil();

        const { itens, origem } = await comunicacoesDoDia(db, data);
        const { data: clientes } = await db.from("clients").select("id, name, person_type");
        const lista = (clientes ?? []).map((c) => ({
          id: String(c["id"]),
          nome: nomeCurto(String(c["name"] ?? ""), c["person_type"] === "PJ"),
          chave: normalizar(String(c["name"] ?? "")),
        }));

        const vistos = new Set<string>();
        const publicacoes: Publicacao[] = [];
        for (const item of itens) {
          if (!TRIBUNAIS.includes(item.siglaTribunal)) continue;
                    // A mesma decisão costuma vir em 2 comunicações (uma só para o cliente e outra para as duas partes): avisa uma vez.
          const chave = `${item.numeroprocessocommascara}|${item.tipoDocumento}|${item.link || limparTeor(item.texto).slice(0, 500)}`;
          if (vistos.has(chave)) continue;
          const partes = (item.destinatarios ?? []).map((p) => normalizar(p.nome));
          const cliente = lista.find((c) => partes.some((parte) => mesmoNome(parte, c.chave)));
          if (!cliente) continue;
          vistos.add(chave);
          publicacoes.push({
            id: item.id,
            clienteId: cliente.id,
            cliente: cliente.nome,
            tribunal: item.siglaTribunal,
            tipo: item.tipoDocumento ?? item.tipoComunicacao ?? "",
            classe: item.nomeClasse ?? "",
            texto: limparTeor(item.texto).slice(0, 8000),
          });
        }
        if (publicacoes.length === 0) return json({ data, origem, comunicacoes: itens.length, novas: 0 });

        // Só avisa o que ainda não foi avisado (se a rotina rodar mais de uma vez no dia).
        const { data: avisadas } = await db.from("avisos_publicacoes").select("comunicacao_id").in("comunicacao_id", publicacoes.map((p) => p.id));
        const jaAvisadas = new Set((avisadas ?? []).map((a) => Number(a["comunicacao_id"])));
        const novas = publicacoes.filter((p) => !jaAvisadas.has(p.id));
        if (novas.length === 0) return json({ data, origem, comunicacoes: itens.length, novas: 0 });

        // Um aviso por publicação (no máximo 30 por dia, para não lotar o celular).
        const atos = await resumir(novas.slice(0, 30));
        const avisos = novas.slice(0, 30).map((p) => montarAviso(p, atos[String(p.id)], data));

        const { data: linhas } = await db.rpc("push_inscricoes_ativas", {});
        const inscricoes = (linhas ?? []).map((l) => ({ id: String(l["id"]), endpoint: String(l["endpoint"]), p256dh: String(l["p256dh"]), auth: String(l["auth"]) }));
        const vencidas: string[] = [];
        let enviados = 0;
        for (const inscricao of inscricoes) {
          for (const aviso of avisos) {
            try {
              const status = await enviarPush(inscricao, aviso, privada);
              if (status === 404 || status === 410) {
                vencidas.push(inscricao.id);
                break;
              }
              if (status < 300) enviados += 1;
            } catch {
              /* um aparelho com problema não impede os outros */
            }
          }
        }
        if (vencidas.length) await db.from("push_inscricoes").delete().in("id", vencidas);
        // Só marca como avisado se chegou em algum aparelho (senão uma nova rodada tenta de novo).
        if (enviados > 0) await db.from("avisos_publicacoes").insert(novas.map((p) => ({ comunicacao_id: p.id, data, cliente_id: p.clienteId })));

        return json({ data, origem, comunicacoes: itens.length, novas: novas.length, avisos_enviados: enviados });
      },
    },
  },
});