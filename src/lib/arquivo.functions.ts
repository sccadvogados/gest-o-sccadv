import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  archiveContractFolder,
  findContractFolder,
  restoreContractFolder,
  trashDriveItem,
} from "@/lib/drive-upload.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Database = any;

function mensagem(error: unknown): string {
  return error instanceof Error ? error.message : (error as { message?: string })?.message ?? "Erro desconhecido.";
}

/**
 * Arquivar contrato (trabalho encerrado): marca o contrato como arquivado e move a pasta
 * dele no Drive para Arquivo Morto › Nome do Cliente. "reativar" faz o caminho inverso.
 * Se o Drive falhar, o contrato continua arquivado no sistema e o aviso volta em drive_erro.
 */
export const arquivarContrato = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { contrato_id: string; reativar?: boolean }) =>
    z.object({ contrato_id: z.string().uuid(), reativar: z.boolean().optional() }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const database = context.supabase as unknown as Database;
    const { data: isActive, error: activeError } = await database.rpc("is_ativo");
    if (activeError || !isActive) throw new Error("Acesso não autorizado");

    const { data: contract, error: contractError } = await database
      .from("contracts")
      .select("id, client_id, numero, ano, drive_folder_id, situacao")
      .eq("id", data.contrato_id)
      .single();
    if (contractError || !contract) throw new Error("Contrato não encontrado.");
    const { data: client, error: clientError } = await database
      .from("clients")
      .select("id, name, drive_folder_id")
      .eq("id", contract.client_id)
      .single();
    if (clientError || !client) throw new Error("Cliente não encontrado.");

    const reativar = data.reativar === true;
    const { error: updateError } = await database
      .from("contracts")
      .update({ situacao: reativar ? "ativo" : "arquivado", arquivado_em: reativar ? null : new Date().toISOString() })
      .eq("id", contract.id);
    if (updateError) throw new Error("Não foi possível atualizar a situação do contrato.");

    let driveErro: string | null = null;
    try {
      let contractFolderId: string | null = contract.drive_folder_id ?? null;
      if (!contractFolderId && client.drive_folder_id && contract.numero != null && contract.ano != null) {
        contractFolderId = await findContractFolder(client.drive_folder_id, contract.numero, contract.ano);
        if (contractFolderId) await database.from("contracts").update({ drive_folder_id: contractFolderId }).eq("id", contract.id);
      }
      if (!contractFolderId) {
        driveErro = "A pasta deste contrato não foi encontrada no Drive. Mova-a manualmente, se existir.";
      } else if (reativar) {
        await restoreContractFolder(database, client, contractFolderId);
      } else {
        const { clientFolderRemoved } = await archiveContractFolder(client.name, client.drive_folder_id ?? null, contractFolderId);
        if (clientFolderRemoved) {
          // A pasta do cliente no Arquivo Digital ficou vazia e foi para a lixeira; um contrato novo criará outra.
          await database.from("clients").update({ drive_folder_id: null, drive_folder_url: null }).eq("id", client.id);
        }
      }
    } catch (error) {
      driveErro = `O contrato foi ${reativar ? "reativado" : "arquivado"}, mas a pasta não pôde ser movida no Drive: ${mensagem(error)}`;
    }

    return { situacao: reativar ? "ativo" : "arquivado", drive_erro: driveErro };
  });

/**
 * Excluir cliente (só administrador): apaga cliente, contratos, parcelas, documentos e eventos do sistema,
 * remove os arquivos do Storage e manda as pastas do Drive (cliente e contratos) para a lixeira.
 */
export const excluirClienteCompleto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { cliente_id: string }) => z.object({ cliente_id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const database = context.supabase as unknown as Database;
    const { data: isAdmin, error: adminError } = await database.rpc("is_admin");
    if (adminError || !isAdmin) throw new Error("Somente administradores podem excluir clientes.");

    const { data: client, error: clientError } = await database
      .from("clients")
      .select("id, drive_folder_id")
      .eq("id", data.cliente_id)
      .single();
    if (clientError || !client) throw new Error("Cliente não encontrado.");

    const { data: contracts } = await database.from("contracts").select("id, drive_folder_id").eq("client_id", client.id);
    const { data: documents } = await database.from("client_documents").select("file_path").eq("client_id", client.id);

    // 1) Drive: pastas dos contratos (podem estar no Arquivo Morto) e a pasta do cliente vão para a lixeira.
    const pastas = [
      ...((contracts ?? []) as Array<{ drive_folder_id: string | null }>).map((contract) => contract.drive_folder_id),
      client.drive_folder_id as string | null,
    ].filter((id): id is string => Boolean(id));
    let driveErro: string | null = null;
    for (const pasta of pastas) {
      try {
        await trashDriveItem(pasta);
      } catch (error) {
        driveErro = `Algumas pastas não puderam ser apagadas no Drive: ${mensagem(error)}`;
      }
    }

    // 2) Storage
    const caminhos = ((documents ?? []) as Array<{ file_path: string }>).map((document) => document.file_path);
    if (caminhos.length > 0) await database.storage.from("client-documents").remove(caminhos);

    // 3) Banco
    const contractIds = ((contracts ?? []) as Array<{ id: string }>).map((contract) => contract.id);
    if (contractIds.length > 0) {
      await database.from("installments").delete().in("contract_id", contractIds);
      await database.from("eventos").update({ contrato_id: null }).in("contrato_id", contractIds);
    }
    await database.from("installments").delete().eq("client_id", client.id);
    await database.from("eventos").delete().eq("cliente_id", client.id);
    await database.from("client_documents").delete().eq("client_id", client.id);
    await database.from("cliente_representantes").delete().eq("cliente_id", client.id);
    if (contractIds.length > 0) await database.from("contracts").delete().in("id", contractIds);
    const { error: deleteError } = await database.from("clients").delete().eq("id", client.id);
    if (deleteError) throw new Error(`Não foi possível excluir o cliente: ${mensagem(deleteError)}`);

    return { ok: true, drive_erro: driveErro };
  });
