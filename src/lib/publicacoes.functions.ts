import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { officeDatabase } from "@/lib/office-database";

const entradaSchema = z.object({
  publicacoes: z
    .array(
      z.object({
        id: z.number(),
        cliente: z.string().max(300),
        tipo: z.string().max(120),
        classe: z.string().max(200),
        texto: z.string().max(8000),
      }),
    )
    .min(1)
    .max(25),
});

/** Resume cada publicação do DJEN em uma linha ("Ato"), ex.: "Decisão: gratuidade concedida + liminar parcial contra a Hapvida". */
export const resumirPublicacoes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => entradaSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: isActive, error: activeError } = await officeDatabase(context.supabase).rpc("is_ativo");
    if (activeError || !isActive) throw new Error("Acesso não autorizado");

    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) return {} as Record<string, string>;

    const lista = data.publicacoes
      .map((p) => `### id=${p.id}\nCliente do escritório: ${p.cliente}\nTipo: ${p.tipo}\nClasse: ${p.classe}\nTeor:\n${p.texto}`)
      .join("\n\n");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
              'Você é advogado e lê publicações do Diário de Justiça para um escritório. Para cada publicação, escreva o "ato" em uma linha curta (máximo 15 palavras), no formato "<Tipo do ato>: <o que foi decidido/determinado>", destacando o efeito prático para o cliente do escritório e prazos quando houver (ex.: "Decisão: gratuidade concedida + liminar parcial contra a Hapvida", "Despacho: intimação para réplica em 15 dias", "Sentença: procedente, condena a ré a custear o tratamento"). Não invente nada que não esteja no teor. Retorne somente JSON válido no formato {"resumos":[{"id":123,"ato":"..."}]}.',
          },
          { role: "user", content: lista },
        ],
      }),
    });
    if (!response.ok) return {} as Record<string, string>;

    const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = payload.choices?.[0]?.message?.content ?? "";
    try {
      const json = JSON.parse(content.replace(/^```json\s*|\s*```$/g, "")) as { resumos?: Array<{ id: number; ato: string }> };
      const resultado: Record<string, string> = {};
      for (const item of json.resumos ?? []) {
        if (item && typeof item.ato === "string") resultado[String(item.id)] = item.ato.trim();
      }
      return resultado;
    } catch {
      return {} as Record<string, string>;
    }
  });