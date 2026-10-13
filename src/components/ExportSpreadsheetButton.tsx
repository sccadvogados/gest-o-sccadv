import { useQuery } from "@tanstack/react-query";
import { FileSpreadsheet, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { formatDate, todayISO } from "@/lib/format";
import { buildXlsx, downloadBlob, type XlsxSheet } from "@/lib/xlsx-export";

type AnyRow = Record<string, any>;

const MODALIDADES: Record<string, string> = {
    parcelado: "Pró-labore Parcelado",
    mensal: "Pró-labore Mensal",
        exito: "Somente Êxito",
    probono: "Pro Bono",
};

const TIPOS: Record<string, string> = {
  prazo: "Prazo",
  protocolo: "Protocolo",
  reuniao: "Reunião",
  audiencia: "Audiência",
  julgamento: "Julgamento",
  acompanhamento: "Acompanhamento",
  compromisso: "Compromisso",
};

function numeroContrato(contract: AnyRow | null | undefined) {
  if (!contract || contract["numero"] == null) return "";
  return `${String(contract["numero"]).padStart(3, "0")}/${contract["ano"]}`;
}

function dataHora(value: string | null | undefined, diaInteiro: boolean) {
  if (!value) return "";
  const date = new Date(value);
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(diaInteiro ? {} : { hour: "2-digit", minute: "2-digit" }),
  }).format(date);
}

async function fetchAll(table: string, columns: string, order: string): Promise<AnyRow[]> {
  const client = supabase as unknown as {
    from: (name: string) => {
      select: (cols: string) => {
        order: (column: string, options: { ascending: boolean }) => {
          range: (from: number, to: number) => Promise<{ data: AnyRow[] | null; error: { message: string } | null }>;
        };
      };
    };
  };
  const rows: AnyRow[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client.from(table).select(columns).order(order, { ascending: true }).range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

/** Exporta clientes, contratos, parcelas e agenda numa planilha .xlsx. Visível só para administradores. */
export function ExportSpreadsheetButton() {
  const [busy, setBusy] = useState(false);
  const { data: isAdmin } = useQuery({
    queryKey: ["is-admin"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("is_admin");
      return !error && data === true;
    },
  });

  if (isAdmin !== true) return null;

  async function exportar() {
    setBusy(true);
        try {
      const [clients, contracts, installments, events] = await Promise.all([
        fetchAll("clients", "*", "name"),
        fetchAll("contracts", "*, clients(name)", "created_at"),
        fetchAll("installments", "*, clients(name), contracts(numero, ano)", "due_date"),
        fetchAll("eventos", "*, clients(name)", "data_inicio"),
      ]).then(([allClients, allContracts, allInstallments, allEvents]) => [
        allClients.filter((client) => client["rascunho"] !== true),
        allContracts.filter((contract) => contract["rascunho"] !== true),
        allInstallments,
        allEvents,
      ] as const);

      const sheets: XlsxSheet[] = [
        {
          name: "Clientes",
          header: ["Nome / Razão social", "Tipo", "CPF/CNPJ", "RG", "Órgão expedidor", "Nacionalidade", "Estado civil", "Profissão", "E-mail", "Telefone", "CEP", "Logradouro", "Número", "Complemento", "Bairro", "Cidade", "UF", "Pasta no Drive", "Observações", "Cadastrado em"],
          widths: [40, 6, 20, 16, 14, 16, 16, 20, 30, 18, 12, 36, 10, 18, 20, 20, 6, 50, 40, 14],
          rows: clients.map((client) => [
            client["name"], client["person_type"], client["cpf_cnpj"], client["rg_number"], client["rg_issuer"], client["nationality"],
            client["marital_status"], client["profession"], client["email"], client["phone"], client["cep"], client["street"], client["number"],
            client["complement"], client["district"], client["city"], client["state"], client["drive_folder_url"], client["notes"],
            formatDate(client["created_at"]),
          ]),
        },
                {
                    name: "Contratos",
          header: ["Contrato", "Cliente", "Modalidade", "Categoria", "Valor total", "Parcelas", "1º vencimento", "Forma de pagamento", "Captação", "% Repasse", "% êxito", "% Retenção", "Sócios", "Objeto (relativos …)", "Gratuidade", "Parte contrária", "Cadastrado em"],
          widths: [12, 40, 22, 26, 16, 10, 14, 18, 20, 11, 10, 11, 16, 70, 11, 30, 14],
          rows: contracts.map((contract) => [
            numeroContrato(contract), contract["clients"]?.["name"], MODALIDADES[contract["modality"]] ?? contract["modality"], contract["category"],
                        { money: Number(contract["total_value"]) || 0 }, ["exito", "probono"].includes(contract["modality"]) ? "" : contract["installments_count"],
            ["exito", "probono"].includes(contract["modality"]) ? "" : formatDate(contract["first_due_date"]), contract["payment_method"], contract["captacao"], Number(contract["captacao_percentual"]) || "",
            Number(contract["success_fee_percent"]) || "", contract["retencao_percentual"] ?? "", (contract["socios"] ?? []).join(", "), contract["objeto"], contract["gratuidade"] ? "Sim" : "Não",
            contract["parte_contraria"], formatDate(contract["created_at"]),
          ]),
        },
        {
          name: "Parcelas",
          header: ["Cliente", "Contrato", "Parcela", "Vencimento", "Valor", "Situação", "Pago em", "Forma de pagamento", "Categoria"],
          widths: [40, 12, 9, 13, 16, 12, 13, 18, 26],
          rows: installments.map((installment) => {
            const situacao = installment["status"] === "Pago" ? "Pago" : installment["due_date"] < todayISO() ? "Atrasado" : "Pendente";
            return [
              installment["clients"]?.["name"], numeroContrato(installment["contracts"]), installment["number"], formatDate(installment["due_date"]),
              { money: Number(installment["amount"]) || 0 }, situacao, installment["paid_at"] ? formatDate(installment["paid_at"]) : "",
              installment["payment_method"], installment["category"],
            ];
          }),
        },
        {
          name: "Agenda",
          header: ["Data", "Tipo", "Título", "Situação", "Cliente", "Processo", "Parte contrária", "Responsável", "Local / link", "Descrição"],
          widths: [18, 15, 50, 11, 36, 28, 30, 22, 30, 50],
          rows: events.map((event) => [
            dataHora(event["data_inicio"], Boolean(event["dia_inteiro"])), TIPOS[event["tipo"]] ?? event["tipo"], event["titulo"],
            event["status"], event["clients"]?.["name"], event["numero_processo"], event["parte_contraria"], event["responsavel"],
            event["local_link"], event["descricao"],
          ]),
        },
      ];

      downloadBlob(buildXlsx(sheets), `SCC - Exportação ${todayISO()}.xlsx`);
      toast.success("Planilha exportada.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível exportar a planilha.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button type="button" variant="outline" onClick={() => void exportar()} disabled={busy}>
      {busy ? <LoaderCircle className="size-4 animate-spin" /> : <FileSpreadsheet className="size-4" />}
            Exportar Planilha
    </Button>
  );
}
