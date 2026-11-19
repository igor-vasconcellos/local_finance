import "server-only";
import { and, eq } from "drizzle-orm";
import type { DB, Tx } from "@/db/client";
import { first } from "@/db/query";
import { categories, creditCards, institutions, savingsBoxes } from "@/db/schema";

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

type Q = DB | Tx;

export async function assertCategory(q: Q, uid: number, id: number | null | undefined, kind?: "income" | "expense") {
  if (id == null) return;
  const row = await q
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.id, id), eq(categories.userId, uid), kind ? eq(categories.kind, kind) : undefined))
    .then(first);
  if (!row) throw new NotFoundError("Categoria");
}

export async function assertCard(q: Q, uid: number, id: number) {
  if (!(await ownsCard(q, uid, id))) throw new NotFoundError("Cartão");
}

/** O cartão é da conta? (protege todas as rotas que recebem cardId de fora) */
export async function ownsCard(q: Q, uid: number, cardId: number): Promise<boolean> {
  const row = await q
    .select({ id: creditCards.id })
    .from(creditCards)
    .where(and(eq(creditCards.id, cardId), eq(creditCards.userId, uid)))
    .then(first);
  return Boolean(row);
}

export async function assertInstitution(q: Q, uid: number, id: number | null | undefined) {
  if (id == null) return;
  const row = await q
    .select({ id: institutions.id })
    .from(institutions)
    .where(and(eq(institutions.id, id), eq(institutions.userId, uid)))
    .then(first);
  if (!row) throw new NotFoundError("Instituição");
}

export async function assertBox(q: Q, uid: number, id: number) {
  const row = await q
    .select({ id: savingsBoxes.id })
    .from(savingsBoxes)
    .where(and(eq(savingsBoxes.id, id), eq(savingsBoxes.userId, uid)))
    .then(first);
  if (!row) throw new NotFoundError("Caixinha");
}
