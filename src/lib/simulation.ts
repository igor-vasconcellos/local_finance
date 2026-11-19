import { installmentSchedule, monthOf, type ISODate, type Month } from "./dates";
import { splitInstallments } from "./money";

export type SimInstallment = { number: number; referenceMonth: Month; amountCents: number };

/**
 * Em quais meses uma compra simulada pesa no caixa.
 * - Crédito: cada parcela no mês de VENCIMENTO da fatura (mesma regra das compras reais).
 * - Débito/Pix: valor inteiro no mês da compra.
 */
export function simulationSchedule(input: {
  paymentMethod: "credit" | "debit";
  totalCents: number;
  installmentsCount: number;
  purchaseDate: ISODate;
  card?: { closingDay: number; dueDay: number } | null;
}): SimInstallment[] {
  if (input.paymentMethod === "debit" || !input.card) {
    return [{ number: 1, referenceMonth: monthOf(input.purchaseDate), amountCents: input.totalCents }];
  }
  const slots = installmentSchedule(input.purchaseDate, input.installmentsCount, input.card.closingDay, input.card.dueDay);
  const amounts = splitInstallments(input.totalCents, input.installmentsCount);
  return slots.map((s, i) => ({ number: i + 1, referenceMonth: s.referenceMonth, amountCents: amounts[i] }));
}
