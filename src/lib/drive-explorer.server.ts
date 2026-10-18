/**
 * Explorador do Drive para a aba Arquivos da ficha do cliente (só no servidor).
 * Toda operação é limitada às pastas do próprio cliente: Arquivo Digital › Cliente e Arquivo Morto › Cliente.
 */
import { ARQUIVO_MORTO_FOLDER_ID, formatClientFolderName } from "@/lib/drive-upload.server";

const DRIVE_API_BASE = "https://connector-gateway.lovable.dev/google_drive";
const PASTA = "application/vnd.google-apps.folder";

export type ItemDrive = {
  id: string;
  nome: string;
  mime: string;
  pasta: boolean;
  tamanho: number | null;
  modificado: string | null;
  link: string | null;
};

type ArquivoApi = {
  id: string;
  name?: string;
  mimeType?: string;
  size?: string;
  modifiedTime?: string;
  webViewLink?: string;
  parents?: string[];
  trashed?: boolean;
};

function cabecalhos(): Record<string, string> {
  const lovableApiKey = process.env["LOVABLE_API_KEY"];
  const driveApiKey = process.env["GOOGLE_DRIVE_API_KEY"];
  if (!lovableApiKey || !driveApiKey) throw new Error("A conexão com o Google Drive não está disponível.");
  return { Authorization: `Bearer ${lovableApiKey}`, "X-Connection-Api-Key": driveApiKey };
}

async function chamar(path: string, init?: RequestInit): Promise<Response> {
  const resposta = await fetch(`${DRIVE_API_BASE}${path}`, { ...init, headers: { ...cabecalhos(), ...init?.headers } });
  if (!resposta.ok) {
    const corpo = (await resposta.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(corpo?.error?.message ?? `O Google Drive respondeu ${resposta.status}.`);
  }
  return resposta;
}

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  return (await (await chamar(path, init)).json()) as T;
}

const escapar = (valor: string) => valor.replaceAll("\\", "\\\\").replaceAll("'", "\\'");
const CAMPOS = "id,name,mimeType,size,modifiedTime,webViewLink,parents,trashed";

function paraItem(arquivo: ArquivoApi): ItemDrive {
  return {
    id: arquivo.id,
    nome: arquivo.name ?? "(sem nome)",
    mime: arquivo.mimeType ?? "",
    pasta: arquivo.mimeType === PASTA,
    tamanho: arquivo.size ? Number(arquivo.size) : null,
    modificado: arquivo.modifiedTime ?? null,
    link: arquivo.webViewLink ?? null,
  };
}

export async function obterItem(id: string): Promise<ArquivoApi> {
  return json<ArquivoApi>(`/drive/v3/files/${encodeURIComponent(id)}?fields=${CAMPOS}&supportsAllDrives=true`);
}

/** Conteúdo de uma pasta: pastas primeiro, depois arquivos, em ordem alfabética. */
export async function listarConteudo(pastaId: string): Promise<ItemDrive[]> {
  const itens: ItemDrive[] = [];
  let pagina: string | undefined;
  do {
    const params = new URLSearchParams({
      q: `'${escapar(pastaId)}' in parents and trashed = false`,
      fields: `nextPageToken,files(${CAMPOS})`,
      pageSize: "200",
      orderBy: "folder,name_natural",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
    });
    if (pagina) params.set("pageToken", pagina);
    const resposta = await json<{ files?: ArquivoApi[]; nextPageToken?: string }>(`/drive/v3/files?${params}`);
    itens.push(...(resposta.files ?? []).map(paraItem));
    pagina = resposta.nextPageToken;
  } while (pagina);
  return itens;
}

/** Pasta do cliente dentro do Arquivo Morto (contratos arquivados), se existir. */
export async function pastaArquivoMorto(nomeCliente: string): Promise<string | null> {
  const nome = formatClientFolderName(nomeCliente);
  const params = new URLSearchParams({
    q: `'${ARQUIVO_MORTO_FOLDER_ID}' in parents and mimeType = '${PASTA}' and trashed = false and name = '${escapar(nome)}'`,
    fields: "files(id)",
    pageSize: "5",
  });
  const resposta = await json<{ files?: Array<{ id: string }> }>(`/drive/v3/files?${params}`);
  return resposta.files?.[0]?.id ?? null;
}

/**
 * Caminho da raiz do cliente até o item (para a navegação no topo e para a checagem de segurança).
 * Lança erro se o item não estiver dentro de uma das raízes permitidas.
 */
export async function caminhoAte(itemId: string, raizes: Array<{ id: string; nome: string }>): Promise<Array<{ id: string; nome: string }>> {
  const caminho: Array<{ id: string; nome: string }> = [];
  let atual = itemId;
  for (let nivel = 0; nivel < 15; nivel += 1) {
    const raiz = raizes.find((r) => r.id === atual);
    if (raiz) return [raiz, ...caminho];
    const item = await obterItem(atual);
    if (item.trashed) break;
    caminho.unshift({ id: item.id, nome: item.name ?? "" });
    const pai = item.parents?.[0];
    if (!pai) break;
    atual = pai;
  }
  throw new Error("Esta pasta não pertence a este cliente.");
}

export async function criarPasta(paiId: string, nome: string): Promise<ItemDrive> {
  const criada = await json<ArquivoApi>(`/drive/v3/files?fields=${CAMPOS}&supportsAllDrives=true`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: nome, mimeType: PASTA, parents: [paiId] }),
  });
  return paraItem(criada);
}

export async function enviarArquivo(paiId: string, nome: string, mime: string, bytes: Uint8Array): Promise<ItemDrive> {
  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify({ name: nome, parents: [paiId] })], { type: "application/json" }));
  form.append("file", new Blob([new Uint8Array(bytes)], { type: mime || "application/octet-stream" }), nome);
  const enviado = await json<ArquivoApi>(`/upload/drive/v3/files?uploadType=multipart&fields=${CAMPOS}&supportsAllDrives=true`, {
    method: "POST",
    body: form,
  });
  return paraItem(enviado);
}

export async function atualizarItem(id: string, mudancas: { nome?: string; mover?: { de: string; para: string }; lixeira?: boolean }) {
  const params = new URLSearchParams({ fields: CAMPOS, supportsAllDrives: "true" });
  if (mudancas.mover) {
    params.set("addParents", mudancas.mover.para);
    params.set("removeParents", mudancas.mover.de);
  }
  const corpo: Record<string, unknown> = {};
  if (mudancas.nome) corpo["name"] = mudancas.nome;
  if (mudancas.lixeira) corpo["trashed"] = true;
  const atualizado = await json<ArquivoApi>(`/drive/v3/files/${encodeURIComponent(id)}?${params}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
  return paraItem(atualizado);
}

/** Conteúdo do arquivo (Docs/Planilhas do Google são exportados em PDF). */
export async function baixarConteudo(item: ArquivoApi, limiteBytes: number): Promise<{ nome: string; mime: string; base64: string }> {
  const nativo = (item.mimeType ?? "").startsWith("application/vnd.google-apps.");
  if (!nativo && item.size && Number(item.size) > limiteBytes) {
    throw new Error("Arquivo grande demais para abrir pelo sistema. Use \"Abrir no Drive\".");
  }
  const caminho = nativo
    ? `/drive/v3/files/${encodeURIComponent(item.id)}/export?mimeType=${encodeURIComponent("application/pdf")}`
    : `/drive/v3/files/${encodeURIComponent(item.id)}?alt=media&supportsAllDrives=true`;
  const resposta = await chamar(caminho);
  const bytes = new Uint8Array(await resposta.arrayBuffer());
  if (bytes.byteLength > limiteBytes) throw new Error("Arquivo grande demais para abrir pelo sistema. Use \"Abrir no Drive\".");
  let binario = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return {
    nome: nativo ? `${item.name ?? "arquivo"}.pdf` : item.name ?? "arquivo",
    mime: nativo ? "application/pdf" : item.mimeType ?? "application/octet-stream",
    base64: btoa(binario),
  };
}
