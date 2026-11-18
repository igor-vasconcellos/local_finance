import "server-only";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { categories, recurringExpenses } from "@/db/schema";
import type { Month } from "@/lib/dates";
import type { ExpenseInput } from "@/lib/validation/finance";

export type ExpenseRow = typeof recurringExpenses.$inferSelect & {
  categoryName: string;
  categoryColor: string | null;
  categoryIcon: string | null;
};

export function listExpenses(): ExpenseRow[] {
  return db
    .select({
      expense: recurringExpenses,
      categoryName: categories.name,
      categoryColor: categories.color,
      categoryIcon: categories.icon,
    })
    .from(recurringExpenses)
    .innerJoin(categories, eq(categories.id, recurringExpenses.categoryId))
    .orderBy(desc(recurringExpenses.active), asc(recurringExpenses.dueDay), asc(recurringExpenses.name))
    .all()
    .map((r) => ({ ...r.expense, categoryName: r.categoryName, categoryColor: r.categoryColor, categoryIcon: r.categoryIcon }));
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

export function createExpense(input: ExpenseInput) {
  return db.insert(recurringExpenses).values(toValues(input)).returning({ id: recurringExpenses.id }).get();
}

export function updateExpense(id: number, input: ExpenseInput) {
  return db.update(recurringExpenses).set(toValues(input)).where(eq(recurringExpenses.id, id)).run().changes > 0;
}

export function setExpenseActive(id: number, active: boolean) {
  return db.update(recurringExpenses).set({ active }).where(eq(recurringExpenses.id, id)).run().changes > 0;
}

export function deleteExpense(id: number) {
  return db.delete(recurringExpenses).where(eq(recurringExpenses.id, id)).run().changes > 0;
}
