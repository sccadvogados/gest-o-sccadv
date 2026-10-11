import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { officeDatabase } from "@/lib/office-database";

const inputSchema = z.object({
  contrato_id: z.string().uuid(),
});

const resultSchema = z.object({
  situacao: z.enum(["ok", "alerta", "bloqueado"]),
  poderes_especificos: z.string(),
  destino: z.string(),
  tribunais: z.array(z.string()),
  parte_contraria: z.string(),
  alertas: z.array(z.string()),
  motivo_bloqueio: z.string(),
});

type QueryClient = SupabaseClient<any>;

type Tribunal = {
  sigla: string;
  nome_oficial: string;
  uf: string | null;
  segmento_cnj: string;
};

type Example = {
  objeto: string;
  tipo_cliente: "PF" | "PJ";
  uf_domicilio: string | null;
  poderes_especificos: string | null;
  destino: string | null;
  situacao: "ok" | "alerta" | "bloqueado";
  observacao: string | null;
  origem: "inicial" | "aprovado";
};

function objectWords(value: string): Set<string> {
  const ignored = new Set([
    "a", "ao", "aos", "as", "com", "da", "das", "de", "do", "dos", "e", "em", "na", "nas", "no", "nos", "o", "os", "para", "por", "que", "um", "uma",
  ]);
  return new Set(
    value
      .toLocaleLowerCase("pt-BR")
      .normalize("NFD")
      .replace(/[\\u0300-\\u036f]/g, "")
      .match(/[a-z0-9]{3,}/g)
      ?.filter((word) => !ignored.has(word)) ?? [],
  );
}

function commonWords(left: Set<string>, right: Set<string>): number {
  let total = 0;
  for (const word of left) if (right.has(word)) total += 1;
  return total;
}

const forbiddenPowerTerms = [
  "citação",
  "levantar",
  "levantamento",
  "alvará",
  "renunciar",
  "renúncia",
  "confessar",
  "reconhecer a procedência",
  "firmar compromisso",
  "hipossuficiência",
];

const blockedAnalysisResult = (motivo_bloqueio: string) => ({
  situacao: "bloqueado" as const,
  poderes_especificos: "",
  destino: "",
  tribunais: [] as string[],
  parte_contraria: "",
  alertas: [],
  motivo_bloqueio,
});

function applyAnalysisGuards(
  result: z.infer<typeof resultSchema>,
  objeto: string,
  tribunaisAtivos: Tribunal[],
) {
  if (objeto.length < 30) {
    return blockedAnalysisResult("Preencha o objeto do contrato.");
  }

  const alertas = [...result.alertas];
  let poderes = result.poderes_especificos;
  for (const term of forbiddenPowerTerms) {
    if (poderes.toLocaleLowerCase("pt-BR").includes(term)) {
      poderes = poderes.replace(new RegExp(term, "gi"), "").replace(/\\s{2,}/g, " ").trim();
      const alerta = `O objeto menciona ${term}. Avalie se é necessário poder especial.`;
      if (!alertas.includes(alerta)) alertas.push(alerta);
    }
  }

  if (poderes.length > 300 || !poderes.startsWith(", especialmente para ")) {
    if (!alertas.includes("Revise o trecho de poderes específicos.")) {
      alertas.push("Revise o trecho de poderes específicos.");
    }
  }

  const reconhecido = tribunaisAtivos.some((tribunal) =>
    result.destino.includes(tribunal.nome_oficial),
  );
  if (result.destino && !reconhecido && !alertas.includes("Tribunal não reconhecido. Selecione na lista.")) {
    alertas.push("Tribunal não reconhecido. Selecione na lista.");
  }

  return {
    ...result,
    poderes_especificos: poderes,
    alertas,
    situacao: alertas.length > 0 && result.situacao === "ok" ? "alerta" as const : result.situacao,
  };
}


export const analisarObjetoProcuracao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => inputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const database = officeDatabase(context.supabase) as unknown as QueryClient;
    const { data: isActive, error: activeError } = await database.rpc("is_ativo");
    if (activeError || !isActive) {
      throw new Error("Acesso não autorizado");
    }

    const { data: contract, error: contractError } = await database
      .from("contracts")
      .select("objeto, client_id")
      .eq("id", data.contrato_id)
      .single();
    if (contractError || !contract) {
      throw new Error("Não foi possível localizar o contrato.");
    }

    const { data: client, error: clientError } = await database
      .from("clients")
      .select("person_type, state")
      .eq("id", contract.client_id)
      .single();
    if (clientError || !client) {
      throw new Error("Não foi possível localizar o cliente do contrato.");
    }

    const objeto = typeof contract.objeto === "string" ? contract.objeto.trim() : "";
    const tipoCliente = client.person_type === "PJ" ? "PJ" : "PF";
    const ufDomicilio = typeof client.state === "string" ? client.state.toUpperCase() : "";

    const [{ data: tribunais, error: tribunaisError }, { data: exemplos, error: exemplosError }] = await Promise.all([
      database
        .from("tribunais")
        .select("sigla, nome_oficial, uf, segmento_cnj")
        .eq("ativo", true),
      database
        .from("procuracao_exemplos")
        .select("objeto, tipo_cliente, uf_domicilio, poderes_especificos, destino, situacao, observacao, origem")
        .eq("ativo", true)
        .eq("tipo_cliente", tipoCliente),
    ]);
    if (tribunaisError || exemplosError) {
      throw new Error("Não foi possível carregar as referências para a análise.");
    }

    const objetoWords = objectWords(objeto);
    const exemplosSelecionados = ((exemplos ?? []) as Example[])
      .map((example) => ({
        example,
        score: commonWords(objetoWords, objectWords(example.objeto)),
      }))
      .sort((left, right) => {
        const origemScore = Number(right.example.origem === "aprovado") - Number(left.example.origem === "aprovado");
        return origemScore || right.score - left.score;
      })
      .slice(0, 10)
      .map(({ example }) => example);

    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) {
      throw new Error("A análise automática ainda não está disponível.");
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `Você analisa objetos de contratos advocatícios brasileiros para conferência humana. Responda somente JSON válido com exatamente estas chaves: situacao, poderes_especificos, destino, tribunais, parte_contraria, alertas, motivo_bloqueio. Regras obrigatórias:\n1. Não redija poderes gerais nem especiais: eles já estão fixos no modelo. Produza só poderes_especificos (finalidade do contrato) e destino (órgãos perante os quais haverá representação).\n2. poderes_especificos começa com ", especialmente para " e descreve só o que está no objeto: o ato (propor ação, promover execução, atuar no processo n. …), o tipo de ação se informado e a parte contrária como escrita no objeto. Máximo de 300 caracteres.\n3. Se o tipo de ação não estiver no objeto, use redação neutra: "propor ação judicial em face de {parte} relativa a {assunto}". Nunca escolha o tipo de ação.\n4. Nunca complete nem invente a razão social da parte contrária.\n5. destino usa SOMENTE nome_oficial da lista de tribunais, unidos por " e ". Se o objeto citar o tribunal, use-o; se citar número de processo CNJ, identifique o tribunal pelo segmento J.TR; se não houver indicação, use o TJ da UF do domicílio e gere o alerta "Tribunal inferido pelo domicílio do cliente. Confirme.".\n6. Se o objeto tiver mais de uma finalidade, inclua todas em poderes_especificos e gere o alerta "Mais de uma finalidade. Confirme o tribunal de cada uma.".\n7. Se o objeto não tiver assunto NEM parte contrária identificável, situacao = "bloqueado" e explique o que falta.\n8. Se o objeto mencionar levantamento de valores, alvará, acordo, renúncia, confissão ou citação, NÃO inclua isso em poderes_especificos; gere o alerta "O objeto menciona {item}. Avalie se é necessário poder especial.". Não invente informações e use string vazia quando não houver valor.`,
          },
          {
            role: "user",
            content: JSON.stringify({
              contrato_id: data.contrato_id,
              objeto,
              tipo_cliente: tipoCliente,
              uf_domicilio: ufDomicilio,
              tribunais_ativos: (tribunais ?? []) as Tribunal[],
              exemplos_ativos: exemplosSelecionados,
            }),
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error("Não foi possível analisar o objeto da procuração.");
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error("A análise não retornou um resultado.");

    try {
      return resultSchema.parse(JSON.parse(content.replace(/^```json\\s*|\\s*```$/g, "")));
    } catch {
      throw new Error("A análise retornou um formato inválido.");
    }
  });