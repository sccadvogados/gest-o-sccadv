import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sendContractPackageToDrive } from "@/lib/drive-upload.server";

/** Reenvia ao Drive os anexos do cliente para a pasta do contrato. */
export const enviarAnexosParaDrive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { contrato_id: string }) => z.object({ contrato_id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { data: isActive, error: activeError } = await context.supabase.rpc("is_ativo");
    if (activeError || !isActive) throw new Error("Acesso não autorizado");
    return sendContractPackageToDrive(context.supabase as never, data.contrato_id);
  });

