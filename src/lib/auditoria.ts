/** Textos e formatação da tela de Auditoria (registros gravados pelo gatilho do banco). */
import { todayISO } from "@/lib/format";

export type Registro = {
  id: number;
  quando: string;
  usuario_id: string | null;
  usuario_nome: string | null;
  usuario_email: string | null;
  acao: "inclusao" | "alteracao" | "exclusao" | "login" | "logout";
  tabela: string | null;
  registro_id: string | null;
  campos: string[] | null;
  antes: Record<string, unknown> | null;
  depois: Record<string, unknown> | null;
};

export const MODULOS = [
  { valor: "clientes", rotulo: "Clientes", tabelas: ["clients", "cliente_representantes", "client_documents"] },
  { valor: "contratos", rotulo: "Contratos", tabelas: ["contracts", "contrato_parceiros"] },
  { valor: "parcelas", rotulo: "Parcelas", tabelas: ["installments"] },
  { valor: "caixa", rotulo: "Livro-Caixa", tabelas: ["lancamentos", "fechamentos"] },
  { valor: "agenda", rotulo: "Agenda", tabelas: ["eventos", "feriados"] },
    { valor: "cadastros", rotulo: "Parceiros e Captadores", tabelas: ["parceiros", "captadores"] },
  { valor: "arquivos", rotulo: "Arquivos", tabelas: ["drive"] },
  { valor: "configuracoes", rotulo: "Configurações", tabelas: ["perfis", "procuracao_exemplos", "tribunais"] },
];

export const todayISOAuditoria = todayISO;

export function addDays(iso: string, dias: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

const ROTULOS: Record<string, string> = {
  name: "Nome", nome: "Nome", person_type: "Tipo de Pessoa", cpf_cnpj: "CPF/CNPJ", email: "E-mail", phone: "Telefone",
  nationality: "Nacionalidade", marital_status: "Estado Civil", profession: "Profissão", rg_number: "RG", rg_issuer: "Órgão Expedidor",
  cep: "CEP", street: "Logradouro", number: "Número", complement: "Complemento", district: "Bairro", city: "Cidade", state: "UF",
  sexo: "Sexo", rascunho: "Rascunho", client_id: "Cliente", cliente_id: "Cliente", contract_id: "Contrato", contrato_id: "Contrato",
  numero: "Número", ano: "Ano", modality: "Modalidade", total_value: "Valor Total", installments_count: "Nº de Parcelas",
  first_due_date: "Primeiro Vencimento", success_fee_percent: "% de Êxito", payment_method: "Forma de Pagamento", category: "Categoria",
  captacao: "Forma de Captação", captacao_percentual: "% de Repasse", captador_id: "Captador", retencao_percentual: "Retenção do Escritório",
  socios: "Sócios Envolvidos", situacao: "Situação", arquivado_em: "Arquivado em", objeto: "Objeto", parte_contraria: "Parte Contrária",
  gratuidade: "Gratuidade", amount: "Valor", due_date: "Vencimento", status: "Situação", paid_at: "Data do Pagamento",
  data: "Data", descricao: "Descrição", tipo: "Tipo", categoria: "Categoria", valor: "Valor", socio: "Sócio", observacao: "Observação",
  revisar: "Revisar", distribuido: "Distribuído", lote_id: "Lote de Distribuição", origem: "Origem", titulo: "Título",
  data_inicio: "Início", data_fim: "Fim", dia_inteiro: "Dia Inteiro", local_link: "Local ou Link", numero_processo: "Nº do Processo",
  orgao_vara: "Órgão/Vara", exito_percentual: "% do Êxito", oab_numero: "OAB", oab_uf: "UF da OAB", documento: "CPF/CNPJ",
  ativo: "Ativo", papel: "Papel", entradas: "Entradas", saidas: "Saídas", saldo_final: "Saldo Final", mes: "Mês",
};
const DINHEIRO = ["total_value", "amount", "valor", "entradas", "saidas", "saldo_final"];
const OCULTOS = ["id", "created_at", "updated_at", "created_by", "parcelas_rascunho", "drive_folder_id", "drive_folder_url", "google_event_id"];
const NOMES_SOCIO: Record<string, string> = { TAC: "Tiago Craveiro", RCMT: "Raphael Corradi", ASS: "Alexandre Souza" };

function formatar(campo: string, valor: unknown): string {
  if (valor === null || valor === undefined || valor === "") return "—";
  if (typeof valor === "boolean") return valor ? "Sim" : "Não";
  if (DINHEIRO.includes(campo) && !Number.isNaN(Number(valor))) {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(valor));
  }
  if (campo === "socio" && typeof valor === "string") return NOMES_SOCIO[valor] ?? valor;
  if (Array.isArray(valor)) return valor.map((v) => (typeof v === "string" ? NOMES_SOCIO[v] ?? v : JSON.stringify(v))).join(", ") || "—";
  if (typeof valor === "string" && /^\d{4}-\d{2}-\d{2}(T|$)/.test(valor)) {
    const [y, m, d] = valor.slice(0, 10).split("-");
    return valor.length > 10 && !campo.includes("due") && campo !== "data"
      ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(valor))
      : `${d}/${m}/${y}`;
  }
  if (typeof valor === "object") return JSON.stringify(valor).slice(0, 120);
  const texto = String(valor);
  return texto.length > 140 ? `${texto.slice(0, 140)}…` : texto;
}

/** Campos alterados (ou, com "todos", todos os campos do registro) com valores formatados. */
export function mudancas(r: Registro, todos = false) {
  const base = r.depois ?? r.antes ?? {};
  const campos = todos || r.acao !== "alteracao" ? Object.keys(base) : (r.campos ?? []);
  return campos
    .filter((campo) => !OCULTOS.includes(campo) && !(campo.endsWith("_id") && !["captador_id"].includes(campo) && !todos))
    .map((campo) => ({
      campo,
      rotulo: ROTULOS[campo] ?? campo,
      antes: formatar(campo, r.antes?.[campo]),
      depois: formatar(campo, r.depois?.[campo]),
    }));
}

/** Nome legível do registro (cliente, contrato, parcela, lançamento…). */
export function rotuloRegistro(r: Registro, clientes: Map<string, string>) {
  const d = (r.depois ?? r.antes ?? {}) as Record<string, unknown>;
  const cliente = clientes.get(String(d["client_id"] ?? d["cliente_id"] ?? "")) ?? "";
  const comCliente = (texto: string) => (cliente ? `${texto} · ${cliente}` : texto);
  switch (r.tabela) {
    case "clients":
      return String(d["name"] ?? "Cliente");
    case "contracts":
      return comCliente(d["numero"] != null ? `Contrato ${String(d["numero"]).padStart(3, "0")}/${String(d["ano"] ?? "")}` : "Contrato (rascunho)");
    case "installments":
      return comCliente(`Parcela ${String(d["number"] ?? "")} · ${formatar("amount", d["amount"])}`);
    case "lancamentos":
      return `${String(d["descricao"] ?? "Lançamento")} · ${formatar("valor", d["valor"])}`;
    case "fechamentos":
      return `Fechamento ${formatar("mes", d["mes"]).slice(3)}`;
    case "eventos":
      return comCliente(String(d["titulo"] ?? "Evento"));
    default:
      return comCliente(String(d["nome"] ?? d["name"] ?? d["descricao"] ?? d["titulo"] ?? d["file_name"] ?? r.registro_id ?? "—"));
  }
}
