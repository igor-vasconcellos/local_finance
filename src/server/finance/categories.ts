import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { categories } from "@/db/schema";

export type CategoryOption = { id: number; name: string; color: string | null; icon: string | null };

export function listCategories(kind: "income" | "expense"): CategoryOption[] {
  return db
    .select({ id: categories.id, name: categories.name, color: categories.color, icon: categories.icon })
    .from(categories)
    .where(eq(categories.kind, kind))
    .orderBy(asc(categories.name))
    .all();
}
