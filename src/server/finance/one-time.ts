import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { categories, oneTimeExpenses } from "@/db/schema";

export function listOneTimeExpenses(limit = 50) {
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
    .orderBy(desc(oneTimeExpenses.date), desc(oneTimeExpenses.id))
    .limit(limit)
    .all();
}

export function deleteOneTimeExpense(id: number) {
  return db.delete(oneTimeExpenses).where(eq(oneTimeExpenses.id, id)).run().changes > 0;
}
