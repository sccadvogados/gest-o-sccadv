import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

export const ARQUIVO_DIGITAL_FOLDER_ID = "1xZRk96MYLqP3A0ecizJNIM-Bhd_6SEfK";

const DRIVE_API_BASE = "https://connector-gateway.lovable.dev/google_drive";

type DriveClient = SupabaseClient<Database>;

type Client = {
  id: string;
  name: string;
  drive_folder_id?: string | null;
};

type Contract = {
  id: string;
  numero: number;
  ano: number;
  drive_folder_id?: string | null;
};

type DriveFile = {
  id: string;
  name?: string;
  mimeType?: string;
  trashed?: boolean;
};

type DriveResponse = {
  files?: DriveFile[];
  id?: string;
  error?: {
    message?: string;
  };
  message?: string;
};

type DriveDatabase = {
  from(table: "clients" | "contracts"): {
    update(values: Record<string, unknown>): {
      eq(column: string, value: string): PromiseLike<{ error: { message: string } | null }>;
    };
  };
};

function getDriveHeaders(): Record<string, string> {
  const lovableApiKey = process.env["LOVABLE_API_KEY"];
  const driveApiKey = process.env["GOOGLE_DRIVE_API_KEY"];

  if (!lovableApiKey || !driveApiKey) {
    throw new Error("A conexão com o Google Drive não está disponível.");
  }

  return {
    Authorization: `Bearer ${lovableApiKey}`,
    "X-Connection-Api-Key": driveApiKey,
  };
}

function escapeDriveQueryValue(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("'", "\\'");
}

async function getGoogleError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as DriveResponse | null;
  return body?.error?.message ?? body?.message ?? response.statusText;
}

async function driveRequest(
  path: string,
  init?: RequestInit,
): Promise<DriveResponse> {
  const response = await fetch(`${DRIVE_API_BASE}${path}`, {
    ...init,
    headers: {
      ...getDriveHeaders(),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    throw new Error(await getGoogleError(response));
  }

  return (await response.json()) as DriveResponse;
}

const KEEP_UPPERCASE = new Set(["ltda", "me", "mei", "epp", "eireli", "sa", "s/a", "s.a.", "slu", "ss"]);

export function formatClientFolderName(name: string): string {
  const lowercaseWords = new Set(["da", "de", "do", "das", "dos", "e"]);
  const words = name.trim().split(/\s+/);
  // Se o nome veio com mistura de maiúsculas e minúsculas, palavras todas em maiúsculas são siglas (ex.: BINDS).
  const mixedCase = words.some((word) => word !== word.toLocaleUpperCase("pt-BR"));

  return words
    .map((word, index) => {
      const upper = word.toLocaleUpperCase("pt-BR");
      const normalized = word.toLocaleLowerCase("pt-BR");
      if (KEEP_UPPERCASE.has(normalized) || /\d/.test(word)) return upper;
      if (mixedCase && word.length > 1 && word === upper) return word;
      if (index > 0 && lowercaseWords.has(normalized)) return normalized;
      return normalized.charAt(0).toLocaleUpperCase("pt-BR") + normalized.slice(1);
    })
    .join(" ");
}

/** Compara nomes ignorando espaços extras, maiúsculas e acentos. */
function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ")
    .trim();
}

async function listChildFolders(parentId: string): Promise<DriveFile[]> {
  const folders: DriveFile[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      q: [
        "mimeType = 'application/vnd.google-apps.folder'",
        "trashed = false",
        `'${escapeDriveQueryValue(parentId)}' in parents`,
      ].join(" and "),
      fields: "nextPageToken,files(id,name)",
      pageSize: "1000",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const result = (await driveRequest(`/drive/v3/files?${params}`)) as DriveResponse & { nextPageToken?: string };
    folders.push(...(result.files ?? []));
    pageToken = result.nextPageToken;
  } while (pageToken);
  return folders;
}

async function createFolder(parentId: string, name: string): Promise<string> {
  const created = await driveRequest("/drive/v3/files", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    }),
  });
  if (!created.id) {
    throw new Error("O Google Drive não retornou o ID da pasta criada.");
  }
  return created.id;
}

/**
 * Procura uma subpasta que satisfaça o critério (comparação sem acentos, maiúsculas
 * e espaços extras); se não houver, cria com o nome informado.
 */
async function findOrCreateMatchingFolder(
  parentId: string,
  matches: (normalizedName: string) => boolean,
  nameToCreate: string,
): Promise<string> {
  const existing = (await listChildFolders(parentId)).find((folder) => folder.name && matches(normalizeName(folder.name)));
  if (existing?.id) return existing.id;
  return createFolder(parentId, nameToCreate);
}

export async function findOrCreateFolder(parentId: string, name: string): Promise<string> {
  const target = normalizeName(name);
  return findOrCreateMatchingFolder(parentId, (folderName) => folderName === target, name);
}

export async function ensureClientFolder(
  database: DriveClient,
  client: Client,
): Promise<string> {
  if (client.drive_folder_id) return client.drive_folder_id;

  const folderId = await findOrCreateFolder(ARQUIVO_DIGITAL_FOLDER_ID, formatClientFolderName(client.name));
  const driveDatabase = database as unknown as DriveDatabase;
  const { error } = await driveDatabase
    .from("clients")
    .update({
      drive_folder_id: folderId,
      drive_folder_url: `https://drive.google.com/drive/folders/${folderId}`,
    })
    .eq("id", client.id);

  if (error) throw new Error(error.message);
  return folderId;
}

/**
 * Pasta do contrato: "NNN-AAAA" (ou "NNN-AAAA_<número do processo>", sem espaços).
 * Dentro dela ficam as pastas de praxe: "1. Peças do Escritório" e "2. Documentos Prévios".
 * Devolve o id da pasta de Documentos Prévios.
 */
export async function ensureContractDocsFolder(
  database: DriveClient,
  client: Client,
  contract: Contract,
): Promise<string> {
  const clientFolderId = await ensureClientFolder(database, client);
  const contractPrefix = `${String(contract.numero).padStart(3, "0")}-${contract.ano}`;
  const contractFolderId = contract.drive_folder_id ?? await findOrCreateMatchingFolder(
    clientFolderId,
    (folderName) => folderName === contractPrefix || folderName.startsWith(`${contractPrefix}_`) || folderName.startsWith(`${contractPrefix}-`),
    contractPrefix,
  );

  if (!contract.drive_folder_id) {
    const driveDatabase = database as unknown as DriveDatabase;
    const { error } = await driveDatabase
      .from("contracts")
      .update({ drive_folder_id: contractFolderId })
      .eq("id", contract.id);
    if (error) throw new Error(error.message);
  }

  // Se houver uma pasta de processo dentro do contrato com as pastas de praxe, usa a dela.
  const children = await listChildFolders(contractFolderId);
  const hasOwnPraxe = children.some((folder) => folder.name && normalizeName(folder.name).includes("documentos previos"));
  let praxeParentId = contractFolderId;
  if (!hasOwnPraxe) {
    const processFolders = children.filter((folder) => folder.name && /\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/.test(folder.name));
    if (processFolders.length === 1 && processFolders[0]?.id) praxeParentId = processFolders[0].id;
  }

  await findOrCreateMatchingFolder(praxeParentId, (folderName) => folderName.includes("pecas do escritorio"), "1. Peças do Escritório");
  return findOrCreateMatchingFolder(praxeParentId, (folderName) => folderName.includes("documentos previos"), "2. Documentos Prévios");
}

export async function fileExistsInFolder(
  folderId: string,
  fileName: string,
): Promise<boolean> {
  const query = [
    `'${escapeDriveQueryValue(folderId)}' in parents`,
    `name = '${escapeDriveQueryValue(fileName)}'`,
    "trashed = false",
  ].join(" and ");
  const params = new URLSearchParams({ q: query, fields: "files(id)" });
  const result = await driveRequest(`/drive/v3/files?${params}`);
  return (result.files?.length ?? 0) > 0;
}

export async function uploadToDrive(
  folderId: string,
  fileName: string,
  mimeType: string,
  bytes: Uint8Array,
): Promise<string> {
  const metadata = JSON.stringify({ name: fileName, parents: [folderId] });
  const form = new FormData();
  form.append("metadata", new Blob([metadata], { type: "application/json" }));
  form.append("file", new Blob([new Uint8Array(bytes)], { type: mimeType }), fileName);

  const result = await driveRequest("/upload/drive/v3/files?uploadType=multipart", {
    method: "POST",
    body: form,
  });

  if (!result.id) {
    throw new Error("O Google Drive não retornou o ID do arquivo enviado.");
  }
  return result.id;
}

const ATTACHMENT_KINDS = ["identificacao", "contrato_social", "residencia", "outros"];

export type DriveExtraFile = {
  documentId: string;
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
};

export type DrivePackageResult =
  | { ok: true; pasta_url: string }
  | { ok: false; erro: string };

function driveErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : (error as { message?: string })?.message ?? "Erro desconhecido.";
}

/**
 * Envia para a pasta "2. Documentos Prévios" do contrato os anexos do cliente
 * e os arquivos extras (documentos gerados). Não duplica arquivos com o mesmo nome.
 * Nunca lança erro: devolve { ok: false, erro } e registra clients.drive_error.
 */
export async function sendContractPackageToDrive(
  supabase: SupabaseClient<any>,
  contractId: string,
  extraFiles: DriveExtraFile[] = [],
): Promise<DrivePackageResult> {
  let clientId: string | undefined;
  try {
    const { data: contract, error: contractError } = await supabase
      .from("contracts")
      .select("id, client_id, numero, ano, drive_folder_id")
      .eq("id", contractId)
      .single();
    if (contractError || !contract) throw contractError ?? new Error("Contrato não encontrado.");
    clientId = contract.client_id as string;

    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("id, name, drive_folder_id")
      .eq("id", clientId)
      .single();
    if (clientError || !client) throw clientError ?? new Error("Cliente não encontrado.");

    const { data: attachments, error: attachmentsError } = await supabase
      .from("client_documents")
      .select("id, file_name, file_path")
      .eq("client_id", clientId)
      .in("kind", ATTACHMENT_KINDS);
    if (attachmentsError) throw attachmentsError;

    const folderId = await ensureContractDocsFolder(
      supabase as unknown as DriveClient,
      client as Client,
      contract as Contract,
    );

    for (const attachment of (attachments ?? []) as { id: string; file_name: string; file_path: string }[]) {
      if (await fileExistsInFolder(folderId, attachment.file_name)) continue;
      const { data: file, error: downloadError } = await supabase.storage
        .from("client-documents")
        .download(attachment.file_path);
      if (downloadError || !file) throw downloadError ?? new Error(`Não foi possível ler ${attachment.file_name}.`);
      const driveFileId = await uploadToDrive(
        folderId,
        attachment.file_name,
        file.type || "application/octet-stream",
        new Uint8Array(await file.arrayBuffer()),
      );
      await supabase.from("client_documents").update({ drive_file_id: driveFileId }).eq("id", attachment.id);
    }

    for (const extra of extraFiles) {
      if (await fileExistsInFolder(folderId, extra.fileName)) continue;
      const driveFileId = await uploadToDrive(folderId, extra.fileName, extra.mimeType, extra.bytes);
      await supabase.from("client_documents").update({ drive_file_id: driveFileId }).eq("id", extra.documentId);
    }

    await supabase.from("clients").update({ drive_error: null }).eq("id", clientId);
    return { ok: true, pasta_url: `https://drive.google.com/drive/folders/${folderId}` };
  } catch (error) {
    const erro = driveErrorMessage(error);
    if (clientId) {
      await supabase.from("clients").update({ drive_error: erro }).eq("id", clientId);
    }
    return { ok: false, erro };
  }
}


