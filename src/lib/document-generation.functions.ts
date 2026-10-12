import { createServerFn } from "@tanstack/react-start";
import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { montarDadosModelos } from "@/lib/document-template-data";
import { formatClientFolderName, sendContractPackageToDrive, type DriveExtraFile, type DrivePackageResult } from "@/lib/drive-upload.server";

const inputSchema = z.object({
  contrato_id: z.string().uuid(),
  poderes_especificos: z.string(),
  destino: z.string(),
  parte_contraria: z.string(),
  situacao_analise: z.enum(["ok", "alerta"]).default("ok"),
  editado: z.boolean().default(false),
});

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const PODERES_PROIBIDOS = [
  "citação",
  "citacao",
  "levantar",
  "levantamento",
  "alvará",
  "alvara",
  "renunciar",
  "renúncia",
  "confessar",
  "reconhecer a procedência",
  "firmar compromisso",
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function pareceEmpresa(nome: string): boolean {
  return /\b(s\.?\/?a\.?|ltda|eireli|me|epp|saúde|saude|seguro|seguros|seguradora|banco|bank|unimed|amil|bradesco|hapvida|sulam[eé]rica|porto|plano|operadora|associa[cç][aã]o|cooperativa|munic[ií]pio|estado|uni[aã]o|inss|instituto|companhia|empresa|caixa|fazenda)\b/i.test(nome);
}

function anonimizar(texto: string | null | undefined, nomes: string[], parteContraria: string): string {
  let resultado = texto ?? "";
  for (const nome of nomes.filter((item) => item && item.trim().length > 2)) {
    resultado = resultado.replace(new RegExp(escapeRegExp(nome.trim()), "gi"), "[CLIENTE]");
  }
  if (parteContraria && !pareceEmpresa(parteContraria)) {
    resultado = resultado.replace(new RegExp(escapeRegExp(parteContraria.trim()), "gi"), "[PARTE CONTRÁRIA]");
  }
  return resultado
    .replace(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/g, "[DOCUMENTO]")
    .replace(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/g, "[DOCUMENTO]");
}

type QueryClient = any;

type GeneratedDocument = {
  kind: "procuracao" | "declaracao_hipossuficiencia" | "contrato";
  template: string;
  number: string;
};

const documents: GeneratedDocument[] = [
  { kind: "procuracao", template: "procuracao.docx", number: "01 Procuração" },
  { kind: "declaracao_hipossuficiencia", template: "declaracao_hipossuficiencia.docx", number: "02 Declaração de Hipossuficiência" },
  { kind: "contrato", template: "contrato.docx", number: "03 Contrato" },
];

function required(value: unknown): boolean {
  return typeof value === "string" ? value.trim().length > 0 : value !== null && value !== undefined;
}

function missingData(client: any, contract: any, representatives: any[], installments: any[]): string[] {
  const missing: string[] = [];
  const isPj = String(client.person_type).toUpperCase() === "PJ";
  const addressFields = [
    ["logradouro", client.street],
    ["número", client.number],
    ["bairro", client.district],
    ["cidade", client.city],
    ["UF", client.state],
    ["CEP", client.cep],
  ];

  if (!required(client.name)) missing.push(isPj ? "razão social" : "nome");
  if (isPj) {
    if (!required(client.cpf_cnpj)) missing.push("CNPJ");
    for (const [label, value] of addressFields) if (!required(value)) missing.push(`endereço da sede (${label})`);
    if (representatives.length === 0) missing.push("ao menos um representante completo");
    representatives.forEach((representative, index) => {
      const prefix = `representante ${index + 1}`;
      if (!required(representative.nome)) missing.push(`${prefix}: nome`);
      if (!required(representative.nacionalidade)) missing.push(`${prefix}: nacionalidade`);
      if (!required(representative.estado_civil)) missing.push(`${prefix}: estado civil`);
      if (!required(representative.profissao)) missing.push(`${prefix}: profissão`);
      if (!required(representative.cpf)) missing.push(`${prefix}: CPF`);
      if (!required(representative.sexo)) missing.push(`${prefix}: sexo`);
    });
  } else {
    const personalFields = [
      ["sexo", client.sexo],
      ["nacionalidade", client.nationality],
      ["estado civil", client.marital_status],
      ["profissão", client.profession],
      ["CPF", client.cpf_cnpj],
    ];
    for (const [label, value] of personalFields) if (!required(value)) missing.push(String(label));
    if (!required(client.rg_number)) missing.push("RG");
    if (!required(client.rg_issuer)) missing.push("órgão expedidor do RG");
    for (const [label, value] of addressFields) if (!required(value)) missing.push(`endereço (${label})`);
  }

  if (!required(contract.objeto)) missing.push("objeto do contrato");
    if (contract.modality === "exito") {
    if (!(Number(contract.success_fee_percent) > 0)) missing.push("percentual de êxito");
  } else if (!required(contract.modality) || !required(contract.first_due_date) || installments.length === 0) {
    missing.push("condições de pagamento");
  }
  return missing;
}

function todayInSaoPaulo(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values["year"]}-${values["month"]}-${values["day"]}`;
}

function clientFileName(name: string): string {
  return formatClientFolderName(name);
}

function sanitizeFilePart(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, "").trim();
}

function baseFileName(date: string, number: string, clientName: string, opposingParty: string): string {
  const safeClient = sanitizeFilePart(clientFileName(clientName));
  const safeParty = sanitizeFilePart(opposingParty);
  return `${date} - ${number} - ${safeClient}${safeParty ? ` - ${safeParty}` : ""}.docx`;
}

function versionedName(name: string, existingNames: Set<string>): string {
  if (!existingNames.has(name)) return name;
  const extension = ".docx";
  const stem = name.slice(0, -extension.length);
  let version = 2;
  while (existingNames.has(`${stem} (v${version})${extension}`)) version += 1;
  return `${stem} (v${version})${extension}`;
}

async function downloadTemplate(database: QueryClient, template: string): Promise<ArrayBuffer> {
  const { data, error } = await database.storage.from("modelos").download(template);
  if (error || !data) throw new Error(`Não foi possível carregar o modelo ${template}.`);
  return await data.arrayBuffer();
}

/**
 * Procuração e declaração precisam caber em 1 página. Conforme o tamanho do texto principal,
 * reduz o espaçamento entre linhas e, se preciso, a fonte desse parágrafo (níveis calibrados no modelo).
 */
function ajustarUmaPagina(xml: string): string {
  const paragrafos = xml.match(/<w:p(?=[ >])(?:(?!<\/w:p>)[\s\S])*?<\/w:p>/g) ?? [];
  let principal = "";
  let tamanho = 0;
  for (const paragrafo of paragrafos) {
    const texto = paragrafo.replace(/<[^>]+>/g, "");
    if (texto.length > tamanho) {
      tamanho = texto.length;
      principal = paragrafo;
    }
  }
  if (!principal) return xml;
  const nivel =
    tamanho <= 1350 ? null
      : tamanho <= 1700 ? { linha: 300, fonte: null }
        : tamanho <= 1900 ? { linha: 276, fonte: null }
          : tamanho <= 2250 ? { linha: 276, fonte: 22 }
            : tamanho <= 2650 ? { linha: 240, fonte: 22 }
              : { linha: 240, fonte: 20 };
  if (!nivel) return xml;
  let ajustado = principal.replace(/<w:spacing [^>]*\/>/g, "");
  const espacamento = `<w:spacing w:line="${nivel.linha}" w:lineRule="auto"/>`;
  ajustado = ajustado.includes("<w:pPr>")
    ? ajustado.replace("<w:pPr>", `<w:pPr>${espacamento}`)
    : ajustado.replace(/^(<w:p(?=[ >])[^>]*>)/, `$1<w:pPr>${espacamento}</w:pPr>`);
  if (nivel.fonte) {
    ajustado = ajustado
      .replace(/<w:sz w:val="\d+"\/>/g, "")
      .replace(/<w:szCs w:val="\d+"\/>/g, "")
      .replace(/<w:rPr>/g, `<w:rPr><w:sz w:val="${nivel.fonte}"/><w:szCs w:val="${nivel.fonte}"/>`);
  }
  return xml.replace(principal, ajustado);
}

async function renderTemplate(database: QueryClient, template: string, data: Record<string, unknown>, umaPagina = false): Promise<Uint8Array> {
  const arrayBuffer = await downloadTemplate(database, template);
  const zip = new PizZip(arrayBuffer);
        const document = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true, nullGetter: () => "" });
  document.render(data);
  const renderedZip = document.getZip();
  const xml = renderedZip.file("word/document.xml")?.asText();
  if (xml) {
    // Remove parágrafos numerados que ficaram vazios (ex.: item de êxito quando não há êxito),
    // para não sobrar "(ii)" ou marcador sem texto.
    const cleaned = xml.replace(/<w:p(?=[ >])(?:(?!<\/w:p>)[\s\S])*?<\/w:p>/g, (paragraph) =>
      paragraph.includes("<w:numPr>") && !/<w:t(?: [^>]*)?>[^<]*\S[^<]*<\/w:t>/.test(paragraph) ? "" : paragraph,
    );
        renderedZip.file("word/document.xml", umaPagina ? ajustarUmaPagina(cleaned) : cleaned);
  }
  return renderedZip.generate({ type: "uint8array" });
}

export const gerarPacoteDocumentos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => inputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const database = context.supabase as unknown as QueryClient;
    const { data: isActive, error: activeError } = await database.rpc("is_ativo");
    if (activeError || !isActive) throw new Error("Acesso não autorizado");

    const poderesNormalizados = data.poderes_especificos.toLocaleLowerCase("pt-BR");
    const proibido = PODERES_PROIBIDOS.find((termo) => poderesNormalizados.includes(termo));
    if (proibido) {
      throw new Error(`Os poderes específicos não podem incluir "${proibido}". Poderes especiais exigem autorização expressa e não são gerados pelo sistema.`);
    }
    if (!data.destino.trim()) throw new Error("Informe o tribunal (destino) da procuração.");

    const { data: contract, error: contractError } = await database
      .from("contracts")
      .select("*")
      .eq("id", data.contrato_id)
      .single();
    if (contractError || !contract) throw new Error("Não foi possível localizar o contrato.");

    const [{ data: client, error: clientError }, { data: installments, error: installmentsError }, { data: representatives, error: representativesError }] = await Promise.all([
      database.from("clients").select("*").eq("id", contract.client_id).single(),
      database.from("installments").select("amount, due_date, number").eq("contract_id", data.contrato_id).order("number", { ascending: true }),
      database.from("cliente_representantes").select("nome, nacionalidade, estado_civil, profissao, cpf, qualidade, ordem, sexo").eq("cliente_id", contract.client_id).order("ordem", { ascending: true }),
    ]);
    if (clientError || !client) throw new Error("Não foi possível localizar o cliente do contrato.");
    if (installmentsError || representativesError) throw new Error("Não foi possível carregar os dados do contrato.");

    // Contrato em rascunho (Novo Cliente): as parcelas ainda estão guardadas no próprio contrato.
    const emRascunho = contract.rascunho === true;
    const parcelasRascunho: Array<{ number: number; amount: number; due_date: string; payment_method?: string | null; category?: string | null }> =
      Array.isArray(contract.parcelas_rascunho) ? contract.parcelas_rascunho : [];
    const parcelasContrato = emRascunho
      ? parcelasRascunho.map((parcela) => ({ number: Number(parcela.number), amount: Number(parcela.amount), due_date: String(parcela.due_date) }))
      : installments ?? [];

    const isPj = String(client.person_type).toUpperCase() === "PJ";
    const documentsToGenerate = documents.filter((document) => document.kind !== "declaracao_hipossuficiencia" || (!isPj && contract.gratuidade === true));
    const missing = missingData(client, contract, representatives ?? [], parcelasContrato);
    if (missing.length > 0) return { gerados: [] as Array<{ kind: string; file_name: string; file_path: string }>, faltantes: [...new Set(missing)], drive: null };

    // Finalizar: só agora o contrato recebe número, as parcelas são criadas e o cliente deixa de ser rascunho.
    if (emRascunho) {
      if (contract.modality !== "exito" && parcelasRascunho.length > 0) {
        const { error: parcelasError } = await database.from("installments").insert(
          parcelasRascunho.map((parcela) => ({
            contract_id: data.contrato_id,
            client_id: contract.client_id,
            number: Number(parcela.number),
            amount: Number(parcela.amount),
            due_date: String(parcela.due_date),
            payment_method: parcela.payment_method ?? contract.payment_method ?? null,
            category: parcela.category ?? contract.category,
          })),
        );
        if (parcelasError) throw new Error("Não foi possível criar as parcelas do contrato.");
      }
      const { error: finalizarContratoError } = await database
        .from("contracts")
        .update({ rascunho: false, parcelas_rascunho: null })
        .eq("id", data.contrato_id);
      if (finalizarContratoError) throw new Error("Não foi possível numerar o contrato.");
      const { error: finalizarClienteError } = await database
        .from("clients")
        .update({ rascunho: false })
        .eq("id", contract.client_id);
      if (finalizarClienteError) throw new Error("Não foi possível concluir o cadastro do cliente.");
    }

    const templateData = montarDadosModelos(
      client,
      contract,
      representatives ?? [],
      parcelasContrato,
    );
    const dataWithApprovedReview = {
      ...templateData,
      poderes_especificos: data.poderes_especificos,
      destino: data.destino,
      parte_contraria: data.parte_contraria,
    };

        const { data: existingDocuments, error: documentsError } = await database
      .from("client_documents")
      .select("file_name")
      .eq("client_id", contract.client_id);
    if (documentsError) throw new Error("Não foi possível verificar os nomes de arquivos existentes.");
    const existingNames = new Set<string>((existingDocuments ?? []).map((document: { file_name: string }) => document.file_name));
    const generated: Array<{ kind: string; file_name: string; file_path: string }> = [];
    const driveFiles: DriveExtraFile[] = [];
    const date = todayInSaoPaulo();

    for (const document of documentsToGenerate) {
      const fileName = versionedName(baseFileName(date, document.number, client.name, data.parte_contraria), existingNames);
      const filePath = `${contract.client_id}/gerados/${data.contrato_id}-${document.kind}-${Date.now()}.docx`;
      const content = await renderTemplate(database, document.template, dataWithApprovedReview);
      const { error: uploadError } = await database.storage.from("client-documents").upload(filePath, new Blob([new Uint8Array(content)], { type: DOCX_MIME }), { upsert: false, contentType: DOCX_MIME });
      if (uploadError) throw new Error(`Não foi possível salvar ${fileName}.`);

      const { data: savedDocument, error: documentError } = await database.from("client_documents").insert({
        client_id: contract.client_id,
        contract_id: data.contrato_id,
        file_name: fileName,
        file_path: filePath,
        kind: document.kind,
      }).select("id").single();
      if (documentError || !savedDocument) throw new Error(`Não foi possível registrar ${fileName}.`);
      driveFiles.push({ documentId: savedDocument.id, fileName, mimeType: DOCX_MIME, bytes: content });
      existingNames.add(fileName);
      generated.push({ kind: document.kind, file_name: fileName, file_path: filePath });
    }

    await database
      .from("contracts")
      .update({ parte_contraria: data.parte_contraria.trim() || null })
      .eq("id", data.contrato_id);

    // Aprendizado: guarda o exemplo aprovado, sem nome nem documento do cliente.
    try {
      const nomes = [client.name, ...(representatives ?? []).map((representative: { nome: string }) => representative.nome)];
      await database.from("procuracao_exemplos").insert({
        objeto: anonimizar(contract.objeto, nomes, data.parte_contraria),
        tipo_cliente: isPj ? "PJ" : "PF",
        uf_domicilio: typeof client.state === "string" ? client.state.toUpperCase() : null,
        poderes_especificos: anonimizar(data.poderes_especificos, nomes, data.parte_contraria) || null,
        destino: data.destino,
        situacao: data.situacao_analise,
        observacao: data.editado ? "aprovado com ajuste manual." : "aprovado sem ajuste.",
        origem: "aprovado",
      });
    } catch {
      // O aprendizado nunca impede a geração.
    }

    const drive: DrivePackageResult = await sendContractPackageToDrive(context.supabase as never, data.contrato_id, driveFiles);

    return { gerados: generated, faltantes: [] as string[], drive };
  });



