import "server-only";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db/client";
import { touched } from "@/db/query";
import { categories, oneTimeExpenses } from "@/db/schema";
import { daysInMonth, dayOfMonth, type Month } from "@/lib/dates";
import type { OneTimeInput } from "@/lib/validation/finance";
import { assertCategory } from "./owner";

/**
 * Despesas avulsas (não se repetem). Ficam pendentes até a pessoa marcar "Pagar";
 * só então saem do saldo e entram em "Despesas pagas" — igual às fixas.
 */

export type OneTimeRow = {
  id: number;
  description: string;
  amountCents: number;
  date: string;
  categoryId: number | null;
  notes: string | null;
  paidAt: string | null;
  fromSimulation: number | null;
  categoryName: string | null;
  categoryColor: string | null;
};

export async function listOneTimeInMonth(uid: number, month: Month): Promise<OneTimeRow[]> {
  return db
    .select({
      id: oneTimeExpenses.id,
      description: oneTimeExpenses.description,
      amountCents: oneTimeExpenses.amountCents,
      date: oneTimeExpenses.date,
      categoryId: oneTimeExpenses.categoryId,
      notes: oneTimeExpenses.notes,
      paidAt: oneTimeExpenses.paidAt,
      fromSimulation: oneTimeExpenses.simulationId,
      categoryName: categories.name,
      categoryColor: categories.color,
    })
    .from(oneTimeExpenses)
    .leftJoin(categories, eq(categories.id, oneTimeExpenses.categoryId))
    .where(
      and(
        eq(oneTimeExpenses.userId, uid),
        gte(oneTimeExpenses.date, dayOfMonth(month, 1)),
        lte(oneTimeExpenses.date, dayOfMonth(month, daysInMonth(month))),
      ),
    )
    .orderBy(asc(oneTimeExpenses.date), asc(oneTimeExpenses.id));
}

function values(input: OneTimeInput) {
  return {
    description: input.description,
    categoryId: input.categoryId,
    amountCents: input.amount,
    date: input.date,
    notes: input.notes,
  };
}

export async function createOneTime(uid: number, input: OneTimeInput) {
  await assertCategory(db, uid, input.categoryId, "expense");
  const [row] = await db
    .insert(oneTimeExpenses)
    .values({ userId: uid, ...values(input), paidAt: input.paid ? new Date().toISOString() : null })
    .returning();
  return row;
}

/** Editar mantém o status de pago, a menos que a pessoa mude "Já está paga". */
export async function updateOneTime(uid: number, id: number, input: OneTimeInput) {
  await assertCategory(db, uid, input.categoryId, "expense");
  const current = await db
    .select({ paidAt: oneTimeExpenses.paidAt })
    .from(oneTimeExpenses)
    .where(and(eq(oneTimeExpenses.id, id), eq(oneTimeExpenses.userId, uid)));
  if (!current[0]) return false;
  const paidAt = input.paid ? (current[0].paidAt ?? new Date().toISOString()) : null;
  const rows = await db
    .update(oneTimeExpenses)
    .set({ ...values(input), paidAt, updatedAt: new Date().toISOString() })
    .where(and(eq(oneTimeExpenses.id, id), eq(oneTimeExpenses.userId, uid)))
    .returning(touched);
  return rows.length > 0;
}

export async function setOneTimePaid(uid: number, id: number, paid: boolean) {
  const rows = await db
    .update(oneTimeExpenses)
    .set({ paidAt: paid ? new Date().toISOString() : null })
    .where(and(eq(oneTimeExpenses.id, id), eq(oneTimeExpenses.userId, uid)))
    .returning(touched);
  return rows.length > 0;
}

export async function deleteOneTimeExpense(uid: number, id: number) {
  return (
    (
      await db
        .delete(oneTimeExpenses)
        .where(and(eq(oneTimeExpenses.id, id), eq(oneTimeExpenses.userId, uid)))
        .returning(touched)
    ).length > 0
  );
}
