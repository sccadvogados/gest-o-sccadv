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
  sexo?: string | null;
};

export type RepresentativeForTemplate = {
  nome: string;
  nacionalidade?: string | null;
  estado_civil?: string | null;
  profissao?: string | null;
  cpf?: string | null;
  qualidade?: string | null;
  ordem?: number | null;
  sexo?: string | null;
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
  nome: string;
  inscrito: string;
  domiciliado: string;
  portador: string;
  denominado: string;
  art_o: string;
  Art_o: string;
  art_do: string;
  ART_DO: string;
  art_ao: string;
  art_pelo: string;
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
  tem_ambos: boolean;
  numero_exito: string;
  numero_prolabore: string;
  exito_percentual: string;
  exito_extenso: string;
  data_extenso: string;
};

const unidades = [
  "zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez",
    "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove",
];

const dezenas = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const centenas = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

function numeroInteiroExtenso(value: number): string {
  const n = Math.trunc(Math.abs(value));
  if (n < 20) return unidades[n] ?? String(n);
  if (n < 100) return dezenas[Math.floor(n / 10)] + (n % 10 ? ` e ${unidades[n % 10]}` : "");
  if (n < 1000) {
    if (n === 100) return "cem";
    return centenas[Math.floor(n / 100)] + (n % 100 ? ` e ${numeroInteiroExtenso(n % 100)}` : "");
  }
  if (n < 1_000_000) {
    const milhares = Math.floor(n / 1000);
    const resto = n % 1000;
    const conector = resto && (resto < 100 || resto % 100 === 0) ? " e " : " ";
    return (milhares === 1 ? "mil" : `${numeroInteiroExtenso(milhares)} mil`) + (resto ? `${conector}${numeroInteiroExtenso(resto)}` : "");
  }
  const milhoes = Math.floor(n / 1_000_000);
  const resto = n % 1_000_000;
  const conector = resto && (resto < 100 || resto % 100 === 0) ? " e " : " ";
  return `${numeroInteiroExtenso(milhoes)} ${milhoes === 1 ? "milhão" : "milhões"}${resto ? `${conector}${numeroInteiroExtenso(resto)}` : ""}`;
}

export function numeroPorExtenso(value: number): string {
  return numeroInteiroExtenso(value);
}

export function valorPorExtenso(value: number): string {
  const normalized = Math.round(Math.abs(value) * 100) / 100;
  const reais = Math.floor(normalized);
  const centavos = Math.round((normalized - reais) * 100);
  const reaisText = `${numeroInteiroExtenso(reais)} ${reais === 1 ? "real" : "reais"}`;
  if (!centavos) return reaisText;
  return `${reaisText} e ${numeroInteiroExtenso(centavos)} centavos`;
}

function formatarValor(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarData(value: string): string {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
}

function dataPorExtenso(date = new Date()): string {
  const formatter = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return formatter.format(date);
}


type Genero = "M" | "F" | null;

function generoDe(sexo: string | null | undefined): Genero {
  const valor = (sexo ?? "").trim().toUpperCase();
  if (valor.startsWith("F")) return "F";
  if (valor.startsWith("M")) return "M";
  return null;
}

/** Escolhe a forma masculina ou feminina; sem sexo informado, usa a forma neutra "x(a)". */
function flexao(genero: Genero, masculino: string, feminino: string, neutro: string): string {
  if (genero === "F") return feminino;
  if (genero === "M") return masculino;
  return neutro;
}

function minusculas(valor: string | null | undefined): string {
  return (valor ?? "").trim().toLocaleLowerCase("pt-BR");
}

function maiusculas(valor: string | null | undefined): string {
  return (valor ?? "").trim().toLocaleUpperCase("pt-BR");
}

const PALAVRAS_COM_GENERO = /^(brasileir|solteir|casad|divorciad|separad|viúv|viuv|estrangeir)(o\(a\)|o|a)$/;

/** Nacionalidade e estado civil: minúsculas e concordância com o sexo (ex.: "Casado(a)" -> "casada"). */
function termoComGenero(valor: string | null | undefined, genero: Genero): string {
  const texto = minusculas(valor);
  return texto
    .split(" ")
    .map((palavra) => {
      const match = palavra.match(PALAVRAS_COM_GENERO);
      if (!match) return palavra;
      return `${match[1]}${flexao(genero, "o", "a", "o(a)")}`;
    })
    .join(" ");
}

function enderecoCompleto(client: ClientForTemplate): string {
  const rua = [client.street, client.number, client.complement].filter(Boolean).join(", ");
  const local = [client.district, client.city && client.state ? `${client.city}/${client.state}` : client.city || client.state].filter(Boolean).join(", ");
  return [rua, local, client.cep && `CEP ${client.cep}`].filter(Boolean).join(", ");
}

function qualificacao(representante: RepresentativeForTemplate): string {
  const genero = generoDe(representante.sexo);
  return [
    maiusculas(representante.nome),
    termoComGenero(representante.nacionalidade, genero),
    termoComGenero(representante.estado_civil, genero),
    minusculas(representante.profissao),
    representante.cpf && `${flexao(genero, "inscrito", "inscrita", "inscrito(a)")} no CPF n. ${representante.cpf}`,
  ].filter(Boolean).join(", ");
}

function representantesTexto(representantes: RepresentativeForTemplate[]): string {
  const ordered = [...representantes].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
  if (ordered.length === 0) return "";
  const tipos = ordered.map((representante) => /sóci|soci/i.test(representante.qualidade ?? "") ? "sócio" : "representante legal");
  const tipo = tipos.every((item) => item === "sócio") ? "sócio" : tipos.every((item) => item === "representante legal") ? "representante legal" : "representante";
  const todasMulheres = ordered.every((representante) => generoDe(representante.sexo) === "F");
  let prefixo: string;
  if (ordered.length === 1) {
    const genero = generoDe(ordered[0]?.sexo);
    const nome = tipo === "sócio" ? flexao(genero, "sócio", "sócia", "sócio(a)") : tipo;
    prefixo = `${flexao(genero, "seu", "sua", "seu(sua)")} ${nome}`;
  } else {
    const plural = tipo === "sócio" ? (todasMulheres ? "sócias" : "sócios") : tipo === "representante legal" ? "representantes legais" : "representantes";
    prefixo = `${todasMulheres ? "suas" : "seus"} ${plural}`;
  }
  const qualificacoes = ordered.map((representante) => qualificacao(representante));
  const lista = qualificacoes.length === 1 ? qualificacoes[0] : `${qualificacoes.slice(0, -1).join("; ")} e ${qualificacoes.at(-1)}`;
    return `${prefixo}, ${lista}`;
}

function grupoParcelas(installments: InstallmentForTemplate[]): string {
  const groups: Array<{ count: number; amount: number }> = [];
  for (const installment of installments) {
    const last = groups[groups.length - 1];
    if (last && Math.abs(last.amount - installment.amount) < 0.005) last.count += 1;
    else groups.push({ count: 1, amount: installment.amount });
  }
  return groups.map((group) => `${group.count} (${numeroPorExtenso(group.count)}) de ${formatarValor(group.amount)}`).join(" e ");
}

export function montarProlaboreTexto(contract: ContractForTemplate, installments: InstallmentForTemplate[]): string {
  const parcelas = [...installments].sort((a, b) => (a.number ?? 0) - (b.number ?? 0));
  const first = parcelas[0];
  if (!first || !contract.modality || contract.modality === "exito") return "";
  const total = parcelas.reduce((sum, installment) => sum + installment.amount, 0);
  const firstDate = first.due_date;
  if (contract.modality === "mensal") {
    const mensal = first.amount;
    return `${formatarValor(mensal)} (${valorPorExtenso(mensal)}) mensais, durante ${parcelas.length} (${numeroPorExtenso(parcelas.length)}) meses, totalizando ${formatarValor(total)} (${valorPorExtenso(total)}), com vencimento da primeira em ${formatarData(firstDate)}.`;
  }
  if (parcelas.length === 1) return `${formatarValor(total)} (${valorPorExtenso(total)}), a ser pago em parcela única, com vencimento em ${formatarData(firstDate)}.`;
  const iguais = parcelas.every((installment) => Math.abs(installment.amount - first.amount) < 0.005);
  if (iguais) return `${formatarValor(total)} (${valorPorExtenso(total)}), a serem pagos em ${parcelas.length} (${numeroPorExtenso(parcelas.length)}) parcelas mensais de ${formatarValor(first.amount)} (${valorPorExtenso(first.amount)}), com vencimento da primeira em ${formatarData(firstDate)}.`;
  return `${formatarValor(total)} (${valorPorExtenso(total)}), a serem pagos em ${parcelas.length} (${numeroPorExtenso(parcelas.length)}) parcelas mensais, sendo ${grupoParcelas(parcelas)}, com vencimento da primeira em ${formatarData(firstDate)}.`;
}

function limparTexto<T extends Record<string, unknown>>(dados: T): T {
  const limpo: Record<string, unknown> = {};
  for (const [chave, valor] of Object.entries(dados)) {
    limpo[chave] = typeof valor === "string" ? valor.replace(/\s+/g, " ").trim() : valor;
  }
  return limpo as T;
}

export function montarDadosModelos(client: ClientForTemplate, contract: ContractForTemplate, representatives: RepresentativeForTemplate[] = [], installments: InstallmentForTemplate[] = [], now = new Date()): DocumentTemplateData {
  client = limparTexto(client);
  representatives = representatives.map((representante) => limparTexto(representante));
  const pj = client.person_type.toUpperCase() === "PJ";
  const prolabore = contract.modality !== "exito" && installments.some((installment) => installment.amount > 0);
  const exito = Number(contract.success_fee_percent ?? 0) > 0;
  const percentual = Number(contract.success_fee_percent ?? 0);
  // Pessoa jurídica: sempre no feminino ("a CONTRATANTE", "inscrita", "denominada").
  const genero: Genero = pj ? "F" : generoDe(client.sexo);
  return {
    pf: !pj,
    pj,
    outorgante_nome: maiusculas(client.name),
    nome: maiusculas(client.name),
    inscrito: flexao(genero, "inscrito", "inscrita", "inscrito(a)"),
    domiciliado: flexao(genero, "domiciliado", "domiciliada", "domiciliado(a)"),
    portador: flexao(genero, "portador", "portadora", "portador(a)"),
    denominado: flexao(genero, "denominado", "denominada", "denominado(a)"),
    art_o: flexao(genero, "o", "a", "o(a)"),
    Art_o: flexao(genero, "O", "A", "O(A)"),
    art_do: flexao(genero, "do", "da", "do(a)"),
    ART_DO: flexao(genero, "DO", "DA", "DO(A)"),
    art_ao: flexao(genero, "ao", "à", "ao(à)"),
    art_pelo: flexao(genero, "pelo", "pela", "pelo(a)"),
    nacionalidade: termoComGenero(client.nationality, genero),
    estado_civil: termoComGenero(client.marital_status, genero),
    profissao: minusculas(client.profession),
    cpf: !pj ? client.cpf_cnpj ?? "" : "",
    rg: !pj ? client.rg_number ?? "" : "",
    rg_orgao: !pj ? client.rg_issuer ?? "" : "",
    cnpj: pj ? client.cpf_cnpj ?? "" : "",
    pj_descricao: pj ? client.pj_descricao ?? "" : "",
    endereco_completo: enderecoCompleto(client),
    representantes_texto: pj ? representantesTexto(representatives) : "",
    representantes_assinatura: pj ? representatives.slice().sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0)).map((representante) => maiusculas(representante.nome)).join(" e ") : "",
    assinatura_documento: `${pj ? "CNPJ" : "CPF"} n. ${client.cpf_cnpj ?? ""}`,
    objeto: (contract.objeto ?? "").trim().replace(/[.]$/, ""),
    tem_prolabore: prolabore,
    prolabore_texto: prolabore ? montarProlaboreTexto(contract, installments) : "",
    tem_exito: exito,
    exito_percentual: Number.isInteger(percentual) ? String(percentual) : String(percentual).replace(".", ","),
        exito_extenso: percentual % 1 === 0
      ? numeroPorExtenso(percentual)
      : percentual % 1 === 0.5
        ? `${numeroPorExtenso(Math.floor(percentual))} e meio`
        : `${numeroPorExtenso(Math.floor(percentual))} vírgula ${numeroPorExtenso(Math.round((percentual % 1) * 100))}`, 
    data_extenso: dataPorExtenso(now),
  };
}

export const __templateDataExamples = {
  valor487_80: valorPorExtenso(487.8),
  valor1000: valorPorExtenso(1000),
  valor10000: valorPorExtenso(10000),
  percentual12_5: numeroPorExtenso(12) + " e meio",
};