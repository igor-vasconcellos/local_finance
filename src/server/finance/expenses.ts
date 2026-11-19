import "server-only";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { touched } from "@/db/query";
import { categories, recurringExpenses } from "@/db/schema";
import type { Month } from "@/lib/dates";
import type { ExpenseInput } from "@/lib/validation/finance";
import { assertCategory } from "./owner";

export type ExpenseRow = typeof recurringExpenses.$inferSelect & {
  categoryName: string;
  categoryColor: string | null;
  categoryIcon: string | null;
};

export async function listExpenses(uid: number): Promise<ExpenseRow[]> {
  const rows = await db
    .select({
      expense: recurringExpenses,
      categoryName: categories.name,
      categoryColor: categories.color,
      categoryIcon: categories.icon,
    })
    .from(recurringExpenses)
    .innerJoin(categories, eq(categories.id, recurringExpenses.categoryId))
    .where(eq(recurringExpenses.userId, uid))
    .orderBy(desc(recurringExpenses.active), asc(recurringExpenses.dueDay), asc(recurringExpenses.name));
  return rows.map((r) => ({
    ...r.expense,
    categoryName: r.categoryName,
    categoryColor: r.categoryColor,
    categoryIcon: r.categoryIcon,
  }));
}

export function expenseAppliesTo(e: Pick<ExpenseRow, "active" | "startMonth" | "endMonth">, month: Month) {
  return e.active && e.startMonth <= month && (!e.endMonth || e.endMonth >= month);
}

function toValues(input: ExpenseInput) {
  return {
    name: input.name,
    categoryId: input.categoryId,
    amountCents: input.amount,
    dueDay: input.dueDay,
    startMonth: input.startMonth,
    endMonth: input.endMonth,
    notes: input.notes,
  };
}

const mine = (uid: number, id: number) => and(eq(recurringExpenses.id, id), eq(recurringExpenses.userId, uid));

export async function createExpense(uid: number, input: ExpenseInput) {
  await assertCategory(db, uid, input.categoryId, "expense");
  const [row] = await db
    .insert(recurringExpenses)
    .values({ ...toValues(input), userId: uid })
    .returning({ id: recurringExpenses.id });
  return row;
}

export async function updateExpense(uid: number, id: number, input: ExpenseInput) {
  await assertCategory(db, uid, input.categoryId, "expense");
  return (await db.update(recurringExpenses).set(toValues(input)).where(mine(uid, id)).returning(touched)).length > 0;
}

export async function setExpenseActive(uid: number, id: number, active: boolean) {
  return (await db.update(recurringExpenses).set({ active }).where(mine(uid, id)).returning(touched)).length > 0;
}

export async function deleteExpense(uid: number, id: number) {
  return (await db.delete(recurringExpenses).where(mine(uid, id)).returning(touched)).length > 0;
}
