import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { officeDatabase } from "@/lib/office-database";
import {
  ensureContractDocsFolder,
  fileExistsInFolder,
  uploadToDrive,
} from "@/lib/drive-upload.server";

type ContractRecord = {
  id: string;
  client_id: string;
  numero: number;
  ano: number;
  drive_folder_id?: string | null;
};

type ClientRecord = {
  id: string;
  name: string;
  drive_folder_id?: string | null;
};

type ClientDocument = {
  id: string;
  file_name: string;
  file_path: string;
  kind: string;
};

const DOCUMENT_KINDS = ["identificacao", "contrato_social", "residencia", "outros"];

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : (error as { message?: string })?.message ?? "Erro desconhecido.";
}

export const enviarAnexosParaDrive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { contrato_id: string }) => z.object({ contrato_id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const database = officeDatabase(context.supabase);
    const { data: isActive, error: activeError } = await database.rpc("is_ativo");
    if (activeError || !isActive) throw new Error("Acesso não autorizado");

    let clientId: string | undefined;

    try {
      const { data: contract, error: contractError } = await database
        .from("contracts")
        .select("id, client_id, numero, ano, drive_folder_id")
        .eq("id", data.contrato_id)
        .single();
      if (contractError) throw contractError;

      const contractRecord = contract as unknown as ContractRecord;
      clientId = contractRecord.client_id;

      const { data: client, error: clientError } = await database
        .from("clients")
        .select("id, name, drive_folder_id")
        .eq("id", contractRecord.client_id)
        .single();
      if (clientError) throw clientError;

      const { data: documents, error: documentsError } = await database
        .from("client_documents")
        .select("id, file_name, file_path, kind")
        .eq("client_id", contractRecord.client_id)
        .in("kind", DOCUMENT_KINDS);
      if (documentsError) throw documentsError;

      const folderId = await ensureContractDocsFolder(
        database,
        client as unknown as ClientRecord,
        contractRecord,
      );

      for (const document of (documents ?? []) as ClientDocument[]) {
        if (await fileExistsInFolder(folderId, document.file_name)) continue;

        const { data: file, error: downloadError } = await context.supabase.storage
          .from("client-documents")
          .download(document.file_path);
        if (downloadError) throw downloadError;

        const driveFileId = await uploadToDrive(
          folderId,
          document.file_name,
          file.type || "application/octet-stream",
          new Uint8Array(await file.arrayBuffer()),
        );

        const { error: documentUpdateError } = await database
          .from("client_documents")
          .update({ drive_file_id: driveFileId })
          .eq("id", document.id);
        if (documentUpdateError) throw documentUpdateError;
      }

      return { ok: true as const, pasta_url: `https://drive.google.com/drive/folders/${folderId}` };
    } catch (error) {
      const erro = getErrorMessage(error);
      if (clientId) {
        await database.from("clients").update({ drive_error: erro }).eq("id", clientId);
      }
      return { ok: false as const, erro };
    }
  });
