import type { ISODate } from "@/lib/dates";

export type ImportBank = "nubank" | "picpay" | "mercadopago";

export const BANK_LABELS: Record<ImportBank, string> = {
  nubank: "Nubank",
  picpay: "PicPay",
  mercadopago: "Mercado Pago",
};

/**
 * purchase = compra (entra como compra do cartão)
 * credit   = crédito/estorno/devolução (abate da fatura)
 * payment  = pagamento da fatura (ignorado: não é gasto)
 */
export type LineKind = "purchase" | "credit" | "payment";

export type ParsedLine = {
  date: ISODate;
  /** Texto como veio do banco (espaços normalizados). */
  rawDescription: string;
  /** Descrição limpa, para exibir e gravar. */
  description: string;
  /** Sempre positivo; o sentido vem de `kind`. */
  amountCents: number;
  kind: LineKind;
  /** Parcela "k de n" quando a linha é de compra parcelada. */
  installment: { number: number; count: number } | null;
  /** Final do cartão (titular/adicional/virtual), quando o arquivo separa por cartão. */
  cardFinal: string | null;
};

export type ParsedStatement = {
  bank: ImportBank;
  /** Vencimento e fechamento informados pelo arquivo (o CSV do Nubank não traz). */
  dueDate: ISODate | null;
  closingDate: ISODate | null;
  /** Totais que o próprio arquivo informa, para conferir a leitura. */
  expected: { purchasesCents: number | null; creditsCents: number | null };
  lines: ParsedLine[];
};

export class ImportParseError extends Error {}
