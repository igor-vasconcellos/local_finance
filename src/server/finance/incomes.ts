import "server-only";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { categories, incomeSources } from "@/db/schema";
import { monthOf, type Month } from "@/lib/dates";
import type { IncomeInput } from "@/lib/validation/finance";
import { assertCategory } from "./owner";

export type IncomeRow = typeof incomeSources.$inferSelect & {
  categoryName: string | null;
  categoryColor: string | null;
};

export function listIncomes(uid: number): IncomeRow[] {
  return db
    .select({
      income: incomeSources,
      categoryName: categories.name,
      categoryColor: categories.color,
    })
    .from(incomeSources)
    .leftJoin(categories, eq(categories.id, incomeSources.categoryId))
    .where(eq(incomeSources.userId, uid))
    .orderBy(desc(incomeSources.active), asc(incomeSources.recurrence), desc(incomeSources.amountCents))
    .all()
    .map((r) => ({ ...r.income, categoryName: r.categoryName, categoryColor: r.categoryColor }));
}

/** A renda entra no mês informado? (ativa, dentro da vigência ou paga naquele mês) */
export function incomeAppliesTo(i: Pick<IncomeRow, "active" | "recurrence" | "startMonth" | "endMonth" | "payDate">, month: Month) {
  if (!i.active) return false;
  if (i.recurrence === "once") return i.payDate ? monthOf(i.payDate) === month : false;
  return i.startMonth <= month && (!i.endMonth || i.endMonth >= month);
}

function toValues(input: IncomeInput) {
  const common = {
    name: input.name,
    type: input.type,
    amountCents: input.amount,
    categoryId: input.categoryId,
    notes: input.notes,
  };
  return input.recurrence === "monthly"
    ? { ...common, recurrence: "monthly" as const, payDay: input.payDay, payDate: null, startMonth: input.startMonth, endMonth: input.endMonth }
    : { ...common, recurrence: "once" as const, payDay: null, payDate: input.payDate, startMonth: monthOf(input.payDate), endMonth: null };
}

export function createIncome(uid: number, input: IncomeInput) {
  assertCategory(db, uid, input.categoryId, "income");
  return db.insert(incomeSources).values({ ...toValues(input), userId: uid }).returning({ id: incomeSources.id }).get();
}

const mine = (uid: number, id: number) => and(eq(incomeSources.id, id), eq(incomeSources.userId, uid));

export function updateIncome(uid: number, id: number, input: IncomeInput) {
  assertCategory(db, uid, input.categoryId, "income");
  return db.update(incomeSources).set(toValues(input)).where(mine(uid, id)).run().changes > 0;
}

export function setIncomeActive(uid: number, id: number, active: boolean) {
  return db.update(incomeSources).set({ active }).where(mine(uid, id)).run().changes > 0;
}

export function deleteIncome(uid: number, id: number) {
  return db.delete(incomeSources).where(mine(uid, id)).run().changes > 0;
}
