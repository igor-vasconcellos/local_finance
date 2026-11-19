import { cleanDescription } from "./clean";
import { extractInstallment, looksLikePayment, parseAmount, squash } from "./text";
import { ImportParseError, type ParsedLine, type ParsedStatement } from "./types";

/** Divide uma linha CSV respeitando aspas ("80,73" tem vírgula dentro). */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

export function isNubankCsv(text: string): boolean {
  const header = text.replace(/^﻿/, "").split(/\r?\n/, 1)[0]?.toLowerCase().replace(/\s/g, "") ?? "";
  return header === "date,title,amount" || header === "date,category,title,amount";
}

/** "Nubank_2026-11-08.csv" → "2026-11-08" (a data do nome do arquivo é o vencimento). */
export function nubankDueDateFromFileName(fileName: string): string | null {
  const m = /(\d{4})-(\d{2})-(\d{2})/.exec(fileName);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/**
 * CSV da fatura do Nubank: "date,title,amount" (atual) ou "date,category,title,amount" (antigo).
 * Valores positivos são compras; negativos são pagamentos ou créditos.
 */
export function parseNubankCsv(text: string, fileName = ""): ParsedStatement {
  const rows = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (!rows.length || !isNubankCsv(rows[0])) throw new ImportParseError("Este CSV não está no formato da fatura do Nubank.");
  const header = splitCsvLine(rows[0].toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const [iDate, iTitle, iAmount] = [col("date"), col("title"), col("amount")];

  const lines: ParsedLine[] = [];
  rows.slice(1).forEach((row, idx) => {
    const cells = splitCsvLine(row);
    const date = cells[iDate];
    const title = squash(cells[iTitle] ?? "");
    const amount = parseAmount(cells[iAmount] ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "") || amount === null || !title) {
      throw new ImportParseError(`Linha ${idx + 2} do CSV não pôde ser lida.`);
    }
    if (amount === 0) return;
    const { description, installment } = extractInstallment(title);
    const kind = amount < 0 ? (looksLikePayment(title) ? "payment" : "credit") : "purchase";
    lines.push({
      date,
      rawDescription: title,
      description: kind === "payment" ? "Pagamento da fatura" : cleanDescription(description),
      amountCents: Math.abs(amount),
      kind,
      installment: kind === "purchase" ? installment : null,
      cardFinal: null,
    });
  });

  const due = nubankDueDateFromFileName(fileName);
  return {
    bank: "nubank",
    dueDate: due,
    closingDate: null,
    expected: { purchasesCents: null, creditsCents: null },
    lines: lines.sort((a, b) => a.date.localeCompare(b.date)),
  };
}
