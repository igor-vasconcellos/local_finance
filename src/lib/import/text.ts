import type { ISODate } from "@/lib/dates";

/** Espaços múltiplos → um. */
export function squash(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Valor em reais como aparece nas faturas → centavos COM sinal.
 * Aceita "R$ 1.234,56", "1234,56", "- 55,20", "-R$ 3,00", "R$ -3,00", "14.00" (CSV antigo).
 */
export function parseAmount(raw: string): number | null {
  let s = raw.replace(/R\$/gi, "").replace(/\s+/g, "");
  let negative = false;
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  }
  if (s.startsWith("+")) s = s.slice(1);
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  }
  let m = /^(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})$/.exec(s);
  if (m) {
    const cents = Number(m[1].replace(/\./g, "")) * 100 + Number(m[2]);
    return negative ? -cents : cents;
  }
  // Formato com ponto decimal (CSV antigo do Nubank: "14.00", "1234.5").
  m = /^(\d+)\.(\d{1,2})$/.exec(s);
  if (m) {
    const cents = Number(m[1]) * 100 + Number(m[2].padEnd(2, "0"));
    return negative ? -cents : cents;
  }
  if (/^\d+$/.test(s)) {
    const cents = Number(s) * 100;
    return negative ? -cents : cents;
  }
  return null;
}

/** "10/11/2026" → "2026-11-10" */
export function brDate(s: string): ISODate | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s.trim());
  if (!m) return null;
  const [, d, mo, y] = m;
  if (+mo < 1 || +mo > 12 || +d < 1 || +d > 31) return null;
  return `${y}-${mo}-${d}`;
}

/**
 * Faturas trazem só "dd/mm". O ano é o que deixa a data mais perto do fechamento
 * (uma compra de 28/12 numa fatura que fecha em 04/01 é do ano anterior).
 */
export function inferYear(dayMonth: string, reference: ISODate): ISODate | null {
  const m = /^(\d{2})\/(\d{2})$/.exec(dayMonth.trim());
  if (!m) return null;
  const [, d, mo] = m;
  if (+mo < 1 || +mo > 12 || +d < 1 || +d > 31) return null;
  const refYear = Number(reference.slice(0, 4));
  const refTime = Date.UTC(refYear, Number(reference.slice(5, 7)) - 1, Number(reference.slice(8, 10)));
  let best: { iso: ISODate; dist: number } | null = null;
  for (const y of [refYear - 1, refYear, refYear + 1]) {
    const t = Date.UTC(y, +mo - 1, +d);
    const dist = Math.abs(t - refTime);
    if (!best || dist < best.dist) best = { iso: `${y}-${mo}-${d}`, dist };
  }
  return best!.iso;
}

/**
 * Detecta "parcela k de n" na descrição e devolve a descrição sem esse trecho.
 * Formatos: "Parcela 2/10", "PARC 02/10", "PARC.02/10", "2 de 10", "- Parcela 2/3", "LOJA 02/10".
 */
export function extractInstallment(desc: string): {
  description: string;
  installment: { number: number; count: number } | null;
} {
  const patterns: RegExp[] = [
    /\s*-?\s*\bparc(?:ela)?\.?\s*(\d{1,2})\s*(?:\/|de)\s*(\d{1,2})\b\s*/i,
    /\s+(\d{1,2})\s+de\s+(\d{1,2})\s*$/i,
    /\s+(\d{1,2})\/(\d{1,2})\s*$/,
  ];
  for (const re of patterns) {
    const m = re.exec(desc);
    if (!m) continue;
    const number = Number(m[1]);
    const count = Number(m[2]);
    if (count >= 2 && count <= 48 && number >= 1 && number <= count) {
      const description = squash(desc.slice(0, m.index) + " " + desc.slice(m.index + m[0].length)).replace(/[\s-]+$/, "");
      return { description: description || desc, installment: { number, count } };
    }
  }
  return { description: desc, installment: null };
}

const PAYMENT_RE = /\b(pagamento (recebido|de fatura|da fatura|efetuado)|pagto|pgto)\b/i;

export function looksLikePayment(desc: string): boolean {
  return PAYMENT_RE.test(desc);
}
