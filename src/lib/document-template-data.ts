export type ClientForTemplate = {
  name: string;
  nationality?: string | null;
  marital_status?: string | null;
  profession?: string | null;
  cpf_cnpj?: string | null;
  rg_number?: string | null;
  rg_issuer?: string | null;
  street?: string | null;
  number?: string | null;
  complement?: string | null;
  district?: string | null;
  city?: string | null;
  state?: string | null;
  cep?: string | null;
  person_type: string;
  pj_descricao?: string | null;
};

export type RepresentativeForTemplate = {
  nome: string;
  nacionalidade?: string | null;
  estado_civil?: string | null;
  profissao?: string | null;
  cpf?: string | null;
  qualidade?: string | null;
  ordem?: number | null;
};

export type ContractForTemplate = {
  objeto?: string | null;
  modality?: string | null;
  total_value?: number | null;
  installments_count?: number | null;
  success_fee_percent?: number | null;
  first_due_date?: string | null;
};

export type InstallmentForTemplate = {
  amount: number;
  due_date: string;
  number?: number | null;
};

export type DocumentTemplateData = {
  pf: boolean;
  pj: boolean;
  outorgante_nome: string;
  nacionalidade: string;
  estado_civil: string;
  profissao: string;
  cpf: string;
  rg: string;
  rg_orgao: string;
  cnpj: string;
  pj_descricao: string;
  endereco_completo: string;
  representantes_texto: string;
  representantes_assinatura: string;
  assinatura_documento: string;
  objeto: string;
  tem_prolabore: boolean;
  prolabore_texto: string;
  tem_exito: boolean;
  exito_percentual: string;
  exito_extenso: string;
  data_extenso: string;
};

const unidades = [
  "zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez",
  "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete