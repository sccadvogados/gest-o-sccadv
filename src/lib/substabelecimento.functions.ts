import { createServerFn } from "@tanstack/react-start";
import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { formatClientFolderName } from "@/lib/drive-upload.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Database = any;

function limparNomeArquivo(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim();
}

/** 12345 → "12.345" */
function formatarOab(numero: string): string {
  const digitos = numero.replace(/\D/g, "");
  return digitos ? Number(digitos).toLocaleString("pt-BR") : numero.trim();
}

function hojeSaoPaulo(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

/**
 * Gera o substabelecimento (modelo "substabelecimento.docx" do Storage "modelos") para um parceiro do contrato.
 * Só devolve o arquivo para download: não salva no Drive nem em Documentos Gerados.
 * Processo e órgão jurisdicional ficam em amarelo no modelo para preenchimento manual.
 */
export const gerarSubstabelecimento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { vinculo_id: string }) => z.object({ vinculo_id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const database = context.supabase as unknown as Database;
    const { data: isActive, error: activeError } = await database.rpc("is_ativo");
    if (activeError || !isActive) throw new Error("Acesso não autorizado");

    const { data: vinculo, error } = await database
      .from("contrato_parceiros")
      .select("id, parceiros(nome, oab_numero, oab_uf), contracts(parte_contraria, clients(name))")
      .eq("id", data.vinculo_id)
      .single();
    if (error || !vinculo?.parceiros) throw new Error("Parceiro não encontrado.");

    const { data: modelo, error: modeloError } = await database.storage.from("modelos").download("substabelecimento.docx");
    if (modeloError || !modelo) throw new Error("Não foi possível carregar o modelo substabelecimento.docx.");

    const parceiro = vinculo.parceiros as { nome: string; oab_numero: string; oab_uf: string };
    const zip = new PizZip(await modelo.arrayBuffer());
    const documento = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true, nullGetter: () => "" });
    documento.render({
      parceiro_nome: parceiro.nome.trim().toLocaleUpperCase("pt-BR"),
      parceiro_oab: `${formatarOab(parceiro.oab_numero)}/${parceiro.oab_uf}`,
    });
    const base64 = documento.getZip().generate({ type: "base64" });

    const cliente = limparNomeArquivo(formatClientFolderName(vinculo.contracts?.clients?.name ?? "Cliente"));
    const parte = limparNomeArquivo(vinculo.contracts?.parte_contraria ?? "");
    const nomeParceiro = limparNomeArquivo(parceiro.nome);
    const file_name = `${hojeSaoPaulo()} - Substabelecimento - ${cliente}${parte ? ` x ${parte}` : ""} - ${nomeParceiro}.docx`;

    return { file_name, base64 };
  });
