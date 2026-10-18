import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  atualizarItem,
  baixarConteudo,
  caminhoAte,
  criarPasta,
  enviarArquivo,
  listarConteudo,
  obterItem,
  pastaArquivoMorto,
} from "@/lib/drive-explorer.server";
import { ensureClientFolder } from "@/lib/drive-upload.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Database = any;

const LIMITE_ARQUIVO = 20 * 1024 * 1024; // 20 MB por arquivo pelo sistema

/** Confere acesso e devolve o cliente e as raízes permitidas (pasta do cliente e, se houver, Arquivo Morto › Cliente). */
async function preparar(database: Database, clienteId: string) {
  const { data: ativo, error: erroAtivo } = await database.rpc("is_ativo");
  if (erroAtivo || !ativo) throw new Error("Acesso não autorizado");
  const { data: cliente, error } = await database.from("clients").select("id, name, drive_folder_id").eq("id", clienteId).single();
  if (error || !cliente) throw new Error("Cliente não encontrado.");
  const raizes: Array<{ id: string; nome: string }> = [];
  if (cliente.drive_folder_id) raizes.push({ id: cliente.drive_folder_id, nome: cliente.name });
  const morto = await pastaArquivoMorto(cliente.name).catch(() => null);
  if (morto) raizes.push({ id: morto, nome: "Arquivo Morto" });
  return { cliente: cliente as { id: string; name: string; drive_folder_id: string | null }, raizes, morto };
}

async function registrar(database: Database, acao: "inclusao" | "alteracao" | "exclusao", id: string, antes: unknown, depois: unknown) {
  await Promise.resolve(database.rpc("registrar_arquivo", { p_acao: acao, p_registro: id, p_antes: antes ?? null, p_depois: depois ?? null })).catch(() => undefined);
}

const nomeValido = z.string().trim().min(1).max(200).refine((v) => !/[\\/]/.test(v), "O nome não pode ter barras.");

export const listarPasta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { cliente_id: string; pasta_id?: string | null }) =>
    z.object({ cliente_id: z.string().uuid(), pasta_id: z.string().max(200).nullish() }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const { cliente, raizes, morto } = await preparar(context.supabase, data.cliente_id);
    if (!cliente.drive_folder_id) return { semPasta: true as const, caminho: [], itens: [], morto: null };
    const pastaId = data.pasta_id || cliente.drive_folder_id;
    const caminho = await caminhoAte(pastaId, raizes);
    const itens = await listarConteudo(pastaId);
    return { semPasta: false as const, caminho, itens, morto: pastaId === cliente.drive_folder_id ? morto : null };
  });

export const criarPastaCliente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { cliente_id: string }) => z.object({ cliente_id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { cliente } = await preparar(context.supabase, data.cliente_id);
    const id = await ensureClientFolder(context.supabase, cliente);
    return { id };
  });

export const novaPasta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { cliente_id: string; pasta_id: string; nome: string }) =>
    z.object({ cliente_id: z.string().uuid(), pasta_id: z.string().max(200), nome: nomeValido }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const { raizes, cliente } = await preparar(context.supabase, data.cliente_id);
    await caminhoAte(data.pasta_id, raizes);
    const criada = await criarPasta(data.pasta_id, data.nome);
    await registrar(context.supabase, "inclusao", criada.id, null, { nome: criada.nome, tipo: "Pasta", cliente_id: cliente.id, pasta_id: data.pasta_id });
    return criada;
  });

export const enviarParaPasta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { cliente_id: string; pasta_id: string; nome: string; mime: string; base64: string }) =>
    z
      .object({
        cliente_id: z.string().uuid(),
        pasta_id: z.string().max(200),
        nome: nomeValido,
        mime: z.string().max(200),
        base64: z.string().min(1).max(Math.ceil((LIMITE_ARQUIVO * 4) / 3) + 8),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { raizes, cliente } = await preparar(context.supabase, data.cliente_id);
    await caminhoAte(data.pasta_id, raizes);
    const bytes = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
    const enviado = await enviarArquivo(data.pasta_id, data.nome, data.mime, bytes);
    await registrar(context.supabase, "inclusao", enviado.id, null, { nome: enviado.nome, tipo: "Arquivo", tamanho: enviado.tamanho, cliente_id: cliente.id, pasta_id: data.pasta_id });
    return enviado;
  });

export const alterarItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { cliente_id: string; item_id: string; nome?: string; destino_id?: string; lixeira?: boolean }) =>
    z
      .object({
        cliente_id: z.string().uuid(),
        item_id: z.string().max(200),
        nome: nomeValido.optional(),
        destino_id: z.string().max(200).optional(),
        lixeira: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { raizes, cliente } = await preparar(context.supabase, data.cliente_id);
    if (raizes.some((r) => r.id === data.item_id)) throw new Error("A pasta principal do cliente não pode ser alterada por aqui.");
    await caminhoAte(data.item_id, raizes);
    const antes = await obterItem(data.item_id);
    let mover: { de: string; para: string } | undefined;
    if (data.destino_id) {
      const destino = await caminhoAte(data.destino_id, raizes);
      if (destino.some((p) => p.id === data.item_id)) throw new Error("Não é possível mover uma pasta para dentro dela mesma.");
      mover = { de: antes.parents?.[0] ?? "", para: data.destino_id };
    }
    const depois = await atualizarItem(data.item_id, { ...(data.nome ? { nome: data.nome } : {}), ...(mover ? { mover } : {}), ...(data.lixeira ? { lixeira: true } : {}) });
    await registrar(
      context.supabase,
      data.lixeira ? "exclusao" : "alteracao",
      data.item_id,
      { nome: antes.name, pasta_id: antes.parents?.[0] ?? null, cliente_id: cliente.id },
      data.lixeira ? null : { nome: depois.nome, pasta_id: mover?.para ?? antes.parents?.[0] ?? null, cliente_id: cliente.id },
    );
    return depois;
  });

export const abrirArquivo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { cliente_id: string; item_id: string }) =>
    z.object({ cliente_id: z.string().uuid(), item_id: z.string().max(200) }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const { raizes } = await preparar(context.supabase, data.cliente_id);
    await caminhoAte(data.item_id, raizes);
    const item = await obterItem(data.item_id);
    return baixarConteudo(item, LIMITE_ARQUIVO);
  });