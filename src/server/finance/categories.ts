import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { categories } from "@/db/schema";

export type CategoryOption = { id: number; name: string; color: string | null; icon: string | null };

export async function listCategories(uid: number, kind: "income" | "expense"): Promise<CategoryOption[]> {
  return db
    .select({ id: categories.id, name: categories.name, color: categories.color, icon: categories.icon })
    .from(categories)
    .where(and(eq(categories.userId, uid), eq(categories.kind, kind)))
    .orderBy(asc(categories.name));
}
