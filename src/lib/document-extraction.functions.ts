import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const documentSchema = z.object({
  kind: z.enum(["identificacao", "residencia"]),
  fileName: z.string().min(1).max(240),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "application/pdf"]),
  base64: z.string().min(1).max(18_000_000),
});

const extractedSchema = z.object({
  name: z.string().default(""),
  nationality: z.string().default(""),
  marital_status: z.string().default(""),
  profession: z.string().default(""),
  rg_number: z.string().default(""),
  rg_issuer: z.string().default(""),
  cpf_cnpj: z.string().default(""),
  cep: z.string().default(""),
  street: z.string().default(""),
  number: z.string().default(""),
  complement: z.string().default(""),
  district: z.string().default(""),
  city: z.string().default(""),
  state: z.string().default(""),
});

export type ExtractedClientData = z.infer<typeof extractedSchema>;

export const extractClientDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => documentSchema.parse(input))
  .handler(async ({ data }) => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) {
      throw new Error("A leitura automática ainda não está disponível. Preencha os dados manualmente.");
    }

    const focus =
      data.kind === "identificacao"
        ? "nome completo, nacionalidade, estado civil, profissão, RG, órgão expedidor/UF e CPF"
        : "CEP, logradouro, número, complemento, bairro, cidade e UF";

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
            content:
              "Você extrai dados de documentos brasileiros para conferência humana. Não invente dados. Retorne somente JSON válido com estas chaves: name, nationality, marital_status, profession, rg_number, rg_issuer, cpf_cnpj, cep, street, number, complement, district, city, state. Use string vazia quando o dado não estiver legível ou não constar. Preserve nomes próprios e normalize UF em duas letras.",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Leia o arquivo ${data.fileName}. Extraia prioritariamente: ${focus}.`,
              },
              {
                type: "image_url",
                image_url: { url: `data:${data.mimeType};base64,${data.base64}` },
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error("Não foi possível ler este documento. Confira o arquivo ou preencha os dados manualmente.");
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error("O documento não apresentou dados legíveis.");

    try {
      return extractedSchema.parse(JSON.parse(content.replace(/^```json\s*|\s*```$/g, "")));
    } catch {
      throw new Error("Não foi possível conferir os dados extraídos. Preencha-os manualmente.");
    }
  });