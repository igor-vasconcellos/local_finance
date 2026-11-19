import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { incomeSources, monthlySettlements, recurringExpenses } from "@/db/schema";
import type { Month } from "@/lib/dates";

export type SettlementKind = "income" | "expense";

/**
 * Marca (ou desmarca) uma renda como recebida / um gasto fixo como pago no mês.
 * Guarda o valor do momento da confirmação.
 */
export function setSettled(kind: SettlementKind, sourceId: number, month: Month, settled: boolean): boolean {
  const col = kind === "income" ? monthlySettlements.incomeId : monthlySettlements.expenseId;

  if (!settled) {
    db.delete(monthlySettlements).where(and(eq(col, sourceId), eq(monthlySettlements.month, month))).run();
    return true;
  }

  const source =
    kind === "income"
      ? db.select({ amount: incomeSources.amountCents }).from(incomeSources).where(eq(incomeSources.id, sourceId)).get()
      : db.select({ amount: recurringExpenses.amountCents }).from(recurringExpenses).where(eq(recurringExpenses.id, sourceId)).get();
  if (!source) return false;

  db.insert(monthlySettlements)
    .values({
      incomeId: kind === "income" ? sourceId : null,
      expenseId: kind === "expense" ? sourceId : null,
      month,
      amountCents: source.amount,
    })
    .onConflictDoNothing()
    .run();
  return true;
}

export function listSettlements(month: Month) {
  return db.select().from(monthlySettlements).where(eq(monthlySettlements.month, month)).all();
}
