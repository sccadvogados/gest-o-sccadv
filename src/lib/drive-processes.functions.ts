import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type DriveFolder = {
  id: string;
  name: string;
  parents?: string[];
};

type DriveFolderPage = {
  files?: DriveFolder[];
  nextPageToken?: string;
};

const PROCESS_NUMBER = /\b\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b/;

export const getActiveProcessCounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
    .handler(async ({ context }) => {
    const { data: isActive, error: activeError } = await context.supabase.rpc("is_ativo");
    if (activeError || !isActive) {
      throw new Error("Acesso não autorizado");
    }

    const lovableApiKey = process.env["LOVABLE_API_KEY"];
    const driveApiKey = process.env["GOOGLE_DRIVE_API_KEY"];
    if (!lovableApiKey || !driveApiKey) {
      throw new Error("A conexão com o Google Drive não está disponível.");
    }

    const folders: DriveFolder[] = [];
    let pageToken: string | undefined;

    do {
      const params = new URLSearchParams({
        q: "mimeType = 'application/vnd.google-apps.folder' and trashed = false",
        fields: "nextPageToken,files(id,name,parents)",
        pageSize: "1000",
      });
      if (pageToken) params.set("pageToken", pageToken);

      const response = await fetch(
        `https://connector-gateway.lovable.dev/google_drive/drive/v3/files?${params}`,
        {
          headers: {
            Authorization: `Bearer ${lovableApiKey}`,
            "X-Connection-Api-Key": driveApiKey,
          },
        },
      );

      if (!response.ok) {
        throw new Error("Não foi possível consultar os processos no Google Drive.");
      }

      const page = (await response.json()) as DriveFolderPage;
      folders.push(...(page.files ?? []));
      pageToken = page.nextPageToken;
    } while (pageToken);

    const childrenByParent = new Map<string, DriveFolder[]>();
    for (const folder of folders) {
      for (const parent of folder.parents ?? []) {
        const children = childrenByParent.get(parent) ?? [];
        children.push(folder);
        childrenByParent.set(parent, children);
      }
    }

    const counts: Record<string, number> = {};
    for (const root of folders) {
      const seen = new Set<string>();
      const pending = [...(childrenByParent.get(root.id) ?? [])];
      let count = 0;

      while (pending.length > 0) {
        const folder = pending.pop();
        if (!folder || seen.has(folder.id)) continue;
        seen.add(folder.id);
        if (PROCESS_NUMBER.test(folder.name)) count += 1;
        pending.push(...(childrenByParent.get(folder.id) ?? []));
      }

      if (count > 0) counts[root.id] = count;
    }

    return counts;
  });