export const BRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export function formatCurrency(value: number | string | null | undefined) {
  const n = typeof value === "string" ? Number(value) : (value ?? 0);
  return BRL.format(Number.isFinite(n) ? n : 0);
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const [y, m, d] = value.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export const APP_TIME_ZONE = "America/Sao_Paulo";

export function todayISO() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function currentMonthKey() {
  return todayISO().slice(0, 7);
}

/** Dias de atraso de uma parcela pendente (0 quando não está vencida). */
export function daysLate(dueDate: string, status: string) {
  if (status === "Pago") return 0;
  const due = new Date(`${dueDate.slice(0, 10)}T00:00:00`);
  const now = new Date(`${todayISO()}T00:00:00`);
  const diff = Math.floor((now.getTime() - due.getTime()) / 86_400_000);
  return diff > 0 ? diff : 0;
}

export function installmentSituation(dueDate: string, status: string) {
  if (status === "Pago") return "Pago" as const;
  return daysLate(dueDate, status) > 0 ? ("Atrasado" as const) : ("Pendente" as const);
}

export function onlyDigits(value: string) {
  return value.replace(/\D+/g, "");
}

export function maskCpfCnpj(value: string) {
  const v = onlyDigits(value).slice(0, 14);
  if (v.length <= 11) {
    return v
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  }
  return v
    .replace(/(\d{2})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}

export function maskCep(value: string) {
  const v = onlyDigits(value).slice(0, 8);
  return v.replace(/(\d{5})(\d{1,3})/, "$1-$2");
}

export function maskPhone(value: string) {
  const v = onlyDigits(value).slice(0, 11);
  if (v.length <= 10) {
    return v.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d{1,4})$/, "$1-$2");
  }
  return v.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d{1,4})$/, "$1-$2");
}

export type ContractModality = "parcelado" | "mensal" | "exito";

/** Gera parcelas conforme a modalidade do contrato. */
export function buildContractInstallments(
  value: number,
  count: number,
  firstDueDate: string,
  modality: ContractModality = "parcelado",
) {
  if (modality === "exito") return [];
  const total = modality === "mensal" ? value * Math.max(1, Math.floor(count)) : value;
  return buildInstallments(total, count, firstDueDate);
}

/** Gera as parcelas a partir das condições de pagamento do contrato. */
export function buildInstallments(
  totalValue: number,
  count: number,
  firstDueDate: string,
) {
  const safeCount = Math.max(1, Math.floor(count));
  const cents = Math.round(totalValue * 100);
  const base = Math.floor(cents / safeCount);
  const rest = cents - base * safeCount;

  const [y, m, d] = firstDueDate.slice(0, 10).split("-").map(Number);

  return Array.from({ length: safeCount }, (_, i) => {
    const amount = (base + (i < rest ? 1 : 0)) / 100;
    const date = new Date(Date.UTC(y!, (m! - 1) + i, 1));
    const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    date.setUTCDate(Math.min(d!, lastDay));
    return {
      number: i + 1,
      amount,
      due_date: date.toISOString().slice(0, 10),
    };
  });
}
