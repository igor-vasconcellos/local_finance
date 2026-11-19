import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { categories, oneTimeExpenses } from "@/db/schema";

export function listOneTimeExpenses(uid: number, limit = 50) {
  return db
    .select({
      id: oneTimeExpenses.id,
      description: oneTimeExpenses.description,
      amountCents: oneTimeExpenses.amountCents,
      date: oneTimeExpenses.date,
      fromSimulation: oneTimeExpenses.simulationId,
      categoryName: categories.name,
      categoryColor: categories.color,
    })
    .from(oneTimeExpenses)
    .leftJoin(categories, eq(categories.id, oneTimeExpenses.categoryId))
    .where(eq(oneTimeExpenses.userId, uid))
    .orderBy(desc(oneTimeExpenses.date), desc(oneTimeExpenses.id))
    .limit(limit)
    .all();
}

export function deleteOneTimeExpense(uid: number, id: number) {
  return db.delete(oneTimeExpenses).where(and(eq(oneTimeExpenses.id, id), eq(oneTimeExpenses.userId, uid))).run().changes > 0;
}
