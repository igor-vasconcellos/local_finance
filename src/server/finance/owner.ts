import "server-only";
import { and, eq } from "drizzle-orm";
import type { db } from "@/db/client";
import { categories, creditCards, institutions, savingsBoxes } from "@/db/schema";
import type { Tx } from "./cards";

/**
 * Isolamento entre contas: todo id que chega de um formulário (categoria, cartão,
 * instituição, caixinha) precisa pertencer à conta logada. Se não pertencer, a
 * operação para com NotFoundError — para quem tentou, é como se o registro não existisse.
 */
export class NotFoundError extends Error {
  constructor(what = "Registro") {
    super(`${what} não encontrado.`);
    this.name = "NotFoundError";
  }
}

type Q = typeof db | Tx;

export function assertCategory(q: Q, uid: number, id: number | null | undefined, kind?: "income" | "expense") {
  if (id == null) return;
  const row = q
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.id, id), eq(categories.userId, uid), kind ? eq(categories.kind, kind) : undefined))
    .get();
  if (!row) throw new NotFoundError("Categoria");
}

export function assertCard(q: Q, uid: number, id: number) {
  const row = q
    .select({ id: creditCards.id })
    .from(creditCards)
    .where(and(eq(creditCards.id, id), eq(creditCards.userId, uid)))
    .get();
  if (!row) throw new NotFoundError("Cartão");
}

export function assertInstitution(q: Q, uid: number, id: number | null | undefined) {
  if (id == null) return;
  const row = q
    .select({ id: institutions.id })
    .from(institutions)
    .where(and(eq(institutions.id, id), eq(institutions.userId, uid)))
    .get();
  if (!row) throw new NotFoundError("Instituição");
}

export function assertBox(q: Q, uid: number, id: number) {
  const row = q
    .select({ id: savingsBoxes.id })
    .from(savingsBoxes)
    .where(and(eq(savingsBoxes.id, id), eq(savingsBoxes.userId, uid)))
    .get();
  if (!row) throw new NotFoundError("Caixinha");
}
