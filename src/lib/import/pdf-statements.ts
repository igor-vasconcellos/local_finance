import { cleanDescription } from "./clean";
import { brDate, extractInstallment, inferYear, looksLikePayment, parseAmount, squash } from "./text";
import { ImportParseError, type LineKind, type ParsedLine, type ParsedStatement } from "./types";

/** "dd/mm  DESCRIÇÃO  [R$] 1.234,56" (o valor pode vir com sinal). */
const ROW_RE = /^(\d{2}\/\d{2})\s+(.+?)\s+((?:-\s*)?(?:R\$\s*)?-?\s*\d{1,3}(?:\.\d{3})*,\d{2})$/;
const CREDIT_RE = /\b(estorno|devolu[cç][aã]o|cr[eé]dito|reembolso|cashback|ajuste a cr[eé]dito)\b/i;

function findDate(text: string, re: RegExp): string | null {
  const m = re.exec(text);
  return m ? brDate(m[1]) : null;
}

function findAmount(text: string, re: RegExp): number | null {
  const m = re.exec(text);
  return m ? parseAmount(m[1]) : null;
}

function classify(desc: string, signed: number): LineKind {
  if (looksLikePayment(desc)) return "payment";
  if (signed < 0 || CREDIT_RE.test(desc)) return "credit";
  return "purchase";
}

function toLine(dayMonth: string, desc: string, rawAmount: string, closing: string, cardFinal: string | null): ParsedLine | null {
  const date = inferYear(dayMonth, closing);
  const signed = parseAmount(rawAmount);
  if (!date || signed === null || signed === 0) return null;
  const raw = squash(desc);
  const kind = classify(raw, signed);
  const { description, installment } = extractInstallment(raw);
  return {
    date,
    rawDescription: raw,
    description: kind === "payment" ? "Pagamento da fatura" : cleanDescription(description),
    amountCents: Math.abs(signed),
    kind,
    installment: kind === "purchase" ? installment : null,
    cardFinal,
  };
}

// ------------------------------------------------------------ Mercado Pago --

export function isMercadoPagoText(lines: string[]): boolean {
  const text = lines.join("\n");
  return /mercado\s*pago/i.test(text) && /Movimenta[cç][oõ]es na fatura|Consumos de/i.test(text);
}

export function parseMercadoPago(lines: string[]): ParsedStatement {
  const all = lines.map(squash);
  const text = all.join("\n");
  const closing = findDate(text, /Fechamento da fatura:?\s*(\d{2}\/\d{2}\/\d{4})/i);
  const due = findDate(text, /Vencimento:?\s*(\d{2}\/\d{2}\/\d{4})/i);
  if (!closing || !due) throw new ImportParseError("Não encontrei o vencimento e o fechamento na fatura do Mercado Pago.");

  const out: ParsedLine[] = [];
  let final: string | null = null;
  for (const l of all) {
    const card = /Cart[aã]o\b.*\[\**(\d{4})\]/i.exec(l);
    if (card) {
      final = card[1];
      continue;
    }
    if (/^Movimenta[cç][oõ]es na fatura/i.test(l)) {
      final = null;
      continue;
    }
    const m = ROW_RE.exec(l);
    if (!m) continue;
    const line = toLine(m[1], m[2], m[3], closing, final);
    if (line) out.push(line);
  }

  return {
    bank: "mercadopago",
    dueDate: due,
    closingDate: closing,
    expected: {
      purchasesCents: findAmount(text, /Consumos de \d{2}\/\d{2} a \d{2}\/\d{2}\s+(R\$\s*[\d.,]+)/i),
      creditsCents: null,
    },
    lines: out,
  };
}

// ------------------------------------------------------------------ PicPay --

export function isPicPayText(lines: string[]): boolean {
  const text = lines.join("\n");
  return /picpay/i.test(text) && /Vencimento:.*Fechamento:/i.test(text);
}

export function parsePicPay(lines: string[]): ParsedStatement {
  const all = lines.map(squash);
  const text = all.join("\n");
  const due = findDate(text, /Vencimento:\s*(\d{2}\/\d{2}\/\d{4})/i);
  const closing = findDate(text, /Fechamento:\s*(\d{2}\/\d{2}\/\d{4})/i);
  if (!closing || !due) throw new ImportParseError("Não encontrei o vencimento e o fechamento na fatura do PicPay.");

  const out: ParsedLine[] = [];
  let final: string | null = null;
  for (const l of all) {
    const card = /^Picpay Card(?:\s+final\s+(\d{4}))?$/i.exec(l);
    if (card) {
      final = card[1] ?? null;
      continue;
    }
    const m = ROW_RE.exec(l);
    if (!m) continue;
    const line = toLine(m[1], m[2], m[3], closing, final);
    if (line) out.push(line);
  }

  const credits = findAmount(text, /Cr[eé]ditos e estornos\s+(-?\s*(?:R\$\s*)?[\d.,]+)/i);
  return {
    bank: "picpay",
    dueDate: due,
    closingDate: closing,
    expected: {
      purchasesCents: findAmount(text, /Despesas do m[eê]s\s+((?:R\$\s*)?[\d.,]+)/i),
      creditsCents: credits === null ? null : Math.abs(credits),
    },
    lines: out,
  };
}
