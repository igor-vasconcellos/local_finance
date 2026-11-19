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
export function setSettled(uid: number, kind: SettlementKind, sourceId: number, month: Month, settled: boolean): boolean {
  const col = kind === "income" ? monthlySettlements.incomeId : monthlySettlements.expenseId;

  if (!settled) {
    db.delete(monthlySettlements)
      .where(and(eq(col, sourceId), eq(monthlySettlements.month, month), eq(monthlySettlements.userId, uid)))
      .run();
    return true;
  }

  const source =
    kind === "income"
      ? db.select({ amount: incomeSources.amountCents }).from(incomeSources).where(and(eq(incomeSources.id, sourceId), eq(incomeSources.userId, uid))).get()
      : db.select({ amount: recurringExpenses.amountCents }).from(recurringExpenses).where(and(eq(recurringExpenses.id, sourceId), eq(recurringExpenses.userId, uid))).get();
  if (!source) return false;

  db.insert(monthlySettlements)
    .values({
      userId: uid,
      incomeId: kind === "income" ? sourceId : null,
      expenseId: kind === "expense" ? sourceId : null,
      month,
      amountCents: source.amount,
    })
    .onConflictDoNothing()
    .run();
  return true;
}

export function listSettlements(uid: number, month: Month) {
  return db
    .select()
    .from(monthlySettlements)
    .where(and(eq(monthlySettlements.userId, uid), eq(monthlySettlements.month, month)))
    .all();
}
