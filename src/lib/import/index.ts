import { isNubankCsv, parseNubankCsv } from "./nubank";
import { isMercadoPagoText, isPicPayText, parseMercadoPago, parsePicPay } from "./pdf-statements";
import { ImportParseError, type ParsedStatement } from "./types";

export * from "./types";
export { cleanDescription, merchantKey, suggestCategoryName } from "./clean";

/** Lê uma fatura a partir do texto do CSV. */
export function parseCsvStatement(text: string, fileName: string): ParsedStatement {
  if (isNubankCsv(text)) return parseNubankCsv(text, fileName);
  throw new ImportParseError("Não reconheci este CSV. Por enquanto, leio o CSV da fatura do Nubank.");
}

/** Lê uma fatura a partir das linhas de texto extraídas do PDF. */
export function parsePdfStatement(lines: string[]): ParsedStatement {
  if (!lines.some((l) => l.trim())) {
    throw new ImportParseError("O PDF não tem texto legível (parece ser uma imagem escaneada).");
  }
  if (isMercadoPagoText(lines)) return parseMercadoPago(lines);
  if (isPicPayText(lines)) return parsePicPay(lines);
  throw new ImportParseError("Não reconheci este PDF. Por enquanto, leio as faturas do PicPay e do Mercado Pago.");
}

/** Conferência: soma do que foi lido × totais que o próprio arquivo informa. */
export function checkTotals(st: ParsedStatement) {
  const sum = (k: "purchase" | "credit") => st.lines.filter((l) => l.kind === k).reduce((a, l) => a + l.amountCents, 0);
  const purchases = sum("purchase");
  const credits = sum("credit");
  const { purchasesCents, creditsCents } = st.expected;
  return {
    purchasesCents: purchases,
    creditsCents: credits,
    expectedPurchasesCents: purchasesCents,
    expectedCreditsCents: creditsCents,
    checked: purchasesCents !== null || creditsCents !== null,
    ok: (purchasesCents === null || purchasesCents === purchases) && (creditsCents === null || creditsCents === credits),
  };
}
