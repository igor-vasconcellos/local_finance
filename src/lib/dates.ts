/**
 * Datas como texto: dia "YYYY-MM-DD" e competência (mês) "YYYY-MM".
 * Funções puras, sem fuso horário — seguras no servidor e no navegador.
 */

export type Month = string; // "YYYY-MM"
export type ISODate = string; // "YYYY-MM-DD"

const pad = (n: number) => String(n).padStart(2, "0");

export function toMonth(year: number, month1to12: number): Month {
  return `${year}-${pad(month1to12)}`;
}

export function parseMonth(m: Month): { year: number; month: number } {
  const [y, mo] = m.split("-").map(Number);
  return { year: y, month: mo };
}

/** Soma N meses a uma competência. addMonths("2026-11", 3) → "2027-02" */
export function addMonths(m: Month, n: number): Month {
  const { year, month } = parseMonth(m);
  const idx = year * 12 + (month - 1) + n;
  return toMonth(Math.floor(idx / 12), (idx % 12) + 1);
}

/** Diferença em meses: monthsBetween("2026-11", "2027-02") → 3 */
export function monthsBetween(from: Month, to: Month): number {
  const a = parseMonth(from);
  const b = parseMonth(to);
  return (b.year - a.year) * 12 + (b.month - a.month);
}

export function daysInMonth(m: Month): number {
  const { year, month } = parseMonth(m);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Dia N do mês, ajustado ao último dia quando o mês é mais curto (31 → 30/28/29). */
export function dayOfMonth(m: Month, day: number): ISODate {
  return `${m}-${pad(Math.min(day, daysInMonth(m)))}`;
}

export function monthOf(date: ISODate): Month {
  return date.slice(0, 7);
}

/** Data local de hoje em "YYYY-MM-DD" (no fuso do computador). */
export function todayISO(now: Date = new Date()): ISODate {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function currentMonth(now: Date = new Date()): Month {
  return todayISO(now).slice(0, 7);
}

const MONTHS_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MONTHS_LONG = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

/** "2026-12" → "dez/2026" */
export function formatMonthShort(m: Month): string {
  const { year, month } = parseMonth(m);
  return `${MONTHS_SHORT[month - 1]}/${year}`;
}

/** "2026-12" → "Dezembro de 2026" */
export function formatMonthLong(m: Month): string {
  const { year, month } = parseMonth(m);
  const name = MONTHS_LONG[month - 1];
  return `${name[0].toUpperCase()}${name.slice(1)} de ${year}`;
}

/** "2026-12-10" → "10/12/2026" */
export function formatDate(d: ISODate): string {
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

/** "2026-12-10" → "10/12" */
export function formatDayMonth(d: ISODate): string {
  const [, m, day] = d.split("-");
  return `${day}/${m}`;
}

// --------------------------------------------------------------------------
// Cartão de crédito: em qual fatura cai cada parcela?
// --------------------------------------------------------------------------

export type InvoiceSlot = {
  /** Mês de referência da fatura = mês do VENCIMENTO (quando o dinheiro sai). */
  referenceMonth: Month;
  closingDate: ISODate;
  dueDate: ISODate;
};

/**
 * Fatura cujo FECHAMENTO acontece no mês `closingMonth`.
 * Se o dia de vencimento for maior que o de fechamento, vence no mesmo mês
 * (ex.: fecha 3, vence 10); senão, vence no mês seguinte (ex.: fecha 28, vence 5).
 */
export function invoiceForClosingMonth(
  closingMonth: Month,
  closingDay: number,
  dueDay: number,
): InvoiceSlot {
  const closingDate = dayOfMonth(closingMonth, closingDay);
  const dueMonth = dueDay > closingDay ? closingMonth : addMonths(closingMonth, 1);
  const dueDate = dayOfMonth(dueMonth, dueDay);
  return { referenceMonth: dueMonth, closingDate, dueDate };
}

/**
 * Fatura em que cai uma compra feita em `purchaseDate`.
 * Compras feitas ANTES do dia de fechamento entram na fatura que fecha naquele
 * mês; compras no dia do fechamento ou depois vão para a fatura seguinte.
 */
export function firstInvoiceFor(
  purchaseDate: ISODate,
  closingDay: number,
  dueDay: number,
): InvoiceSlot {
  const month = monthOf(purchaseDate);
  const closingThisMonth = dayOfMonth(month, closingDay);
  const closingMonth = purchaseDate < closingThisMonth ? month : addMonths(month, 1);
  return invoiceForClosingMonth(closingMonth, closingDay, dueDay);
}

/** Faturas de todas as parcelas de uma compra (parcela 1 = índice 0). */
export function installmentSchedule(
  purchaseDate: ISODate,
  count: number,
  closingDay: number,
  dueDay: number,
): InvoiceSlot[] {
  const first = firstInvoiceFor(purchaseDate, closingDay, dueDay);
  const firstClosingMonth = monthOf(first.closingDate);
  return Array.from({ length: count }, (_, i) =>
    invoiceForClosingMonth(addMonths(firstClosingMonth, i), closingDay, dueDay),
  );
}

// --------------------------------------------------------------------------
// Formato brasileiro para campos de formulário (dd/mm/aaaa e mm/aaaa)
// --------------------------------------------------------------------------

/** "2026-12-20" → "20/12/2026" */
export function isoToBR(iso: string | null | undefined): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/** "20/12/2026" → "2026-12-20"; null se incompleta ou inexistente (ex.: 31/02). */
export function brToISO(text: string): ISODate | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text.trim());
  if (!m) return null;
  const [, d, mo, y] = m.map(Number) as unknown as [number, number, number, number];
  if (mo < 1 || mo > 12 || d < 1 || y < 1900 || y > 2200) return null;
  if (d > daysInMonth(toMonth(y, mo))) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** "2026-12" → "12/2026" */
export function monthToBR(m: string | null | undefined): string {
  if (!m || !/^\d{4}-\d{2}$/.test(m)) return "";
  const [y, mo] = m.split("-");
  return `${mo}/${y}`;
}

/** "12/2026" → "2026-12"; null se inválido. */
export function brToMonth(text: string): Month | null {
  const m = /^(\d{2})\/(\d{4})$/.exec(text.trim());
  if (!m) return null;
  const mo = Number(m[1]);
  const y = Number(m[2]);
  if (mo < 1 || mo > 12 || y < 1900 || y > 2200) return null;
  return toMonth(y, mo);
}

/** Máscara de digitação: "20122026" → "20/12/2026" (progressiva). */
export function maskDateBR(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

/** Máscara de digitação: "122026" → "12/2026". */
export function maskMonthBR(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 6);
  if (d.length <= 2) return d;
  return `${d.slice(0, 2)}/${d.slice(2)}`;
}

export const WEEKDAYS_SHORT = ["D", "S", "T", "Q", "Q", "S", "S"];
export const MONTH_NAMES = MONTHS_LONG.map((n) => n[0].toUpperCase() + n.slice(1));
