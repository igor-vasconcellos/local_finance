import "server-only";
import { and, asc, count, eq, inArray, ne, notExists, sql, sum } from "drizzle-orm";
import { db, type DB, type Tx } from "@/db/client";
import { first, touched } from "@/db/query";
import { cardPurchases, categories, creditCards, installments, institutions, invoiceCredits, invoices } from "@/db/schema";
import {
  addMonths,
  firstInvoiceFor,
  installmentSchedule,
  invoiceForClosingMonth,
  todayISO,
  type InvoiceSlot,
  type ISODate,
  type Month,
} from "@/lib/dates";
import { splitInstallments } from "@/lib/money";
import type { CardInput, PurchaseInput } from "@/lib/validation/finance";
import { assertCard, assertCategory, ownsCard } from "./owner";

export type { Tx };
export { ownsCard };

// ------------------------------------------------------------- Status --

export type InvoiceStatus = "open" | "closed" | "overdue" | "paid";

/** Status exibido: só "paga" é gravado; os demais dependem da data de hoje. */
export function invoiceStatus(
  inv: { status: string; closingDate: ISODate; dueDate: ISODate },
  today: ISODate = todayISO(),
): InvoiceStatus {
  if (inv.status === "paid") return "paid";
  if (today > inv.dueDate) return "overdue";
  if (today >= inv.closingDate) return "closed";
  return "open";
}

/** Mês de referência (vencimento) → fatura correspondente do cartão. */
export function slotForReferenceMonth(ref: Month, closingDay: number, dueDay: number): InvoiceSlot {
  const closingMonth = dueDay > closingDay ? ref : addMonths(ref, -1);
  return invoiceForClosingMonth(closingMonth, closingDay, dueDay);
}

// ------------------------------------------------------- Créditos/Totais --

/** Créditos e estornos da fatura (subconsulta correlacionada com `invoices`). */
export const invoiceCreditsSql = sql<number>`(select coalesce(sum(${invoiceCredits.amountCents}), 0) from ${invoiceCredits} where ${invoiceCredits.invoiceId} = ${invoices.id})`;

/** Total da fatura = parcelas − créditos (nunca negativo). Requer LEFT JOIN em installments + GROUP BY invoices.id. */
export const invoiceNetTotalSql =
  sql<number>`greatest(0, coalesce(${sum(installments.amountCents)}, 0) - ${invoiceCreditsSql})`.mapWith(Number);

// ------------------------------------------------------------- Cartões --

export type CardSummary = typeof creditCards.$inferSelect & {
  institutionName: string | null;
  usedCents: number;
  purchasesCount: number;
  currentInvoice: InvoiceSlot & { totalCents: number; status: InvoiceStatus };
};

async function invoiceTotals(cardId: number) {
  return db
    .select({
      referenceMonth: invoices.referenceMonth,
      status: invoices.status,
      closingDate: invoices.closingDate,
      dueDate: invoices.dueDate,
      totalCents: invoiceNetTotalSql,
    })
    .from(invoices)
    .leftJoin(installments, eq(installments.invoiceId, invoices.id))
    .where(eq(invoices.cardId, cardId))
    .groupBy(invoices.id)
    .orderBy(asc(invoices.referenceMonth));
}

export async function listCards(uid: number, today: ISODate = todayISO()): Promise<CardSummary[]> {
  const cards = await db
    .select({ card: creditCards, institutionName: institutions.name })
    .from(creditCards)
    .leftJoin(institutions, eq(institutions.id, creditCards.institutionId))
    .where(eq(creditCards.userId, uid))
    .orderBy(sql`${creditCards.active} DESC`, asc(creditCards.name));

  return Promise.all(
    cards.map(async ({ card, institutionName }) => {
      const totals = await invoiceTotals(card.id);
      const current = firstInvoiceFor(today, card.closingDay, card.dueDay);
      const currentRow = totals.find((t) => t.referenceMonth === current.referenceMonth);
      const purchasesCount =
        (await db.select({ n: count() }).from(cardPurchases).where(eq(cardPurchases.cardId, card.id)).then(first))?.n ?? 0;

      return {
        ...card,
        institutionName,
        // Limite comprometido = tudo que ainda não foi pago (inclui parcelas futuras).
        usedCents: totals.filter((t) => t.status !== "paid").reduce((acc, t) => acc + t.totalCents, 0),
        purchasesCount,
        currentInvoice: {
          ...(currentRow ?? current),
          referenceMonth: current.referenceMonth,
          totalCents: currentRow?.totalCents ?? 0,
          status: invoiceStatus(currentRow ?? { ...current, status: "open" }, today),
        },
      };
    }),
  );
}

export async function getCard(uid: number, id: number) {
  return db
    .select({ card: creditCards, institutionName: institutions.name })
    .from(creditCards)
    .leftJoin(institutions, eq(institutions.id, creditCards.institutionId))
    .where(and(eq(creditCards.id, id), eq(creditCards.userId, uid)))
    .then(first);
}

export async function upsertInstitution(tx: DB | Tx, uid: number, name: string): Promise<number | null> {
  const clean = name.trim();
  if (!clean) return null;
  const existing = await tx
    .select({ id: institutions.id })
    .from(institutions)
    .where(and(eq(institutions.userId, uid), sql`lower(${institutions.name}) = lower(${clean})`))
    .then(first);
  if (existing) return existing.id;
  await tx.insert(institutions).values({ userId: uid, name: clean }).onConflictDoNothing();
  const row = await tx
    .select({ id: institutions.id })
    .from(institutions)
    .where(and(eq(institutions.userId, uid), sql`lower(${institutions.name}) = lower(${clean})`))
    .then(first);
  return row!.id;
}

export async function listInstitutionNames(uid: number): Promise<string[]> {
  const rows = await db
    .select({ name: institutions.name })
    .from(institutions)
    .where(eq(institutions.userId, uid))
    .orderBy(asc(institutions.name));
  return rows.map((r) => r.name);
}

export async function createCard(uid: number, input: CardInput) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(creditCards)
      .values({
        userId: uid,
        name: input.name,
        institutionId: await upsertInstitution(tx, uid, input.institution),
        limitCents: input.limit,
        closingDay: input.closingDay,
        dueDay: input.dueDay,
        color: input.color,
      })
      .returning({ id: creditCards.id });
    return row;
  });
}

/** Mudar fechamento/vencimento vale para compras novas; faturas já geradas mantêm suas datas. */
export async function updateCard(uid: number, id: number, input: CardInput) {
  return db.transaction(async (tx) => {
    if (!(await ownsCard(tx, uid, id))) return false;
    const rows = await tx
      .update(creditCards)
      .set({
        name: input.name,
        institutionId: await upsertInstitution(tx, uid, input.institution),
        limitCents: input.limit,
        closingDay: input.closingDay,
        dueDay: input.dueDay,
        color: input.color,
      })
      .where(eq(creditCards.id, id))
      .returning(touched);
    return rows.length > 0;
  });
}

export async function setCardActive(uid: number, id: number, active: boolean) {
  const rows = await db
    .update(creditCards)
    .set({ active })
    .where(and(eq(creditCards.id, id), eq(creditCards.userId, uid)))
    .returning(touched);
  return rows.length > 0;
}

/** Exclui o cartão com todas as compras, parcelas e faturas. */
export async function deleteCard(uid: number, id: number) {
  return db.transaction(async (tx) => {
    if (!(await ownsCard(tx, uid, id))) return false;
    await tx.delete(cardPurchases).where(eq(cardPurchases.cardId, id)); // parcelas vão em cascata
    const rows = await tx.delete(creditCards).where(eq(creditCards.id, id)).returning(touched); // faturas em cascata
    return rows.length > 0;
  });
}

// ------------------------------------------------------------- Compras --

export async function getOrCreateInvoice(tx: Tx, cardId: number, slot: InvoiceSlot): Promise<number> {
  await tx
    .insert(invoices)
    .values({ cardId, referenceMonth: slot.referenceMonth, closingDate: slot.closingDate, dueDate: slot.dueDate })
    .onConflictDoNothing();
  const row = await tx
    .select({ id: invoices.id })
    .from(invoices)
    .where(and(eq(invoices.cardId, cardId), eq(invoices.referenceMonth, slot.referenceMonth)))
    .then(first);
  return row!.id;
}

/**
 * Gera as parcelas da compra, cada uma na fatura do mês correspondente.
 * `firstInvoiceMonth` (compras importadas) fixa a fatura da 1ª parcela, como o banco informou;
 * sem ele, a fatura sai da data da compra e do dia de fechamento do cartão.
 */
export async function generateInstallments(
  tx: Tx,
  purchaseId: number,
  input: PurchaseInput,
  firstInvoiceMonth: Month | null = null,
) {
  const card = await tx.select().from(creditCards).where(eq(creditCards.id, input.cardId)).then(first);
  if (!card) throw new Error("Cartão não encontrado.");

  const schedule = firstInvoiceMonth
    ? Array.from({ length: input.installmentsCount }, (_, i) =>
        slotForReferenceMonth(addMonths(firstInvoiceMonth, i), card.closingDay, card.dueDay),
      )
    : installmentSchedule(input.purchaseDate, input.installmentsCount, card.closingDay, card.dueDay);
  const amounts = splitInstallments(input.total, input.installmentsCount);

  // Sequencial de propósito: a mesma transação não aceita comandos em paralelo.
  for (let i = 0; i < schedule.length; i++) {
    await tx.insert(installments).values({
      purchaseId,
      invoiceId: await getOrCreateInvoice(tx, card.id, schedule[i]),
      number: i + 1,
      amountCents: amounts[i],
    });
  }
}

/** Remove faturas vazias (sem parcelas nem créditos) que não foram marcadas como pagas. */
export async function cleanupEmptyInvoices(tx: Tx, cardId: number) {
  await tx.delete(invoices).where(
    and(
      eq(invoices.cardId, cardId),
      ne(invoices.status, "paid"),
      notExists(
        tx
          .select({ x: sql`1` })
          .from(installments)
          .where(eq(installments.invoiceId, invoices.id)),
      ),
      notExists(
        tx
          .select({ x: sql`1` })
          .from(invoiceCredits)
          .where(eq(invoiceCredits.invoiceId, invoices.id)),
      ),
    ),
  );
}

function purchaseValues(input: PurchaseInput) {
  return {
    cardId: input.cardId,
    description: input.description,
    categoryId: input.categoryId,
    totalCents: input.total,
    installmentsCount: input.installmentsCount,
    purchaseDate: input.purchaseDate,
    notes: input.notes,
  };
}

/** Cria a compra e suas parcelas dentro de uma transação já aberta. */
export async function createPurchaseTx(tx: Tx, uid: number, input: PurchaseInput, simulationId: number | null = null) {
  await assertCard(tx, uid, input.cardId);
  await assertCategory(tx, uid, input.categoryId, "expense");
  const [{ id }] = await tx
    .insert(cardPurchases)
    .values({ ...purchaseValues(input), simulationId })
    .returning({ id: cardPurchases.id });
  await generateInstallments(tx, id, input);
  return { id };
}

export async function createPurchase(uid: number, input: PurchaseInput) {
  return db.transaction((tx) => createPurchaseTx(tx, uid, input));
}

/** Compra da conta (via cartão). */
async function ownedPurchase(q: DB | Tx, uid: number, id: number) {
  return q
    .select({ id: cardPurchases.id, cardId: cardPurchases.cardId, firstInvoiceMonth: cardPurchases.firstInvoiceMonth })
    .from(cardPurchases)
    .innerJoin(creditCards, eq(creditCards.id, cardPurchases.cardId))
    .where(and(eq(cardPurchases.id, id), eq(creditCards.userId, uid)))
    .then(first);
}

/** Editar uma compra recalcula todas as parcelas (valor, quantidade, data ou cartão). */
export async function updatePurchase(uid: number, id: number, input: PurchaseInput) {
  return db.transaction(async (tx) => {
    const before = await ownedPurchase(tx, uid, id);
    if (!before) return false;
    await assertCard(tx, uid, input.cardId);
    await assertCategory(tx, uid, input.categoryId, "expense");
    // Fatura fixada pelo banco só vale no mesmo cartão.
    const firstInvoiceMonth = before.cardId === input.cardId ? before.firstInvoiceMonth : null;
    await tx.delete(installments).where(eq(installments.purchaseId, id));
    await tx
      .update(cardPurchases)
      .set({ ...purchaseValues(input), firstInvoiceMonth })
      .where(eq(cardPurchases.id, id));
    await generateInstallments(tx, id, input, firstInvoiceMonth);
    await cleanupEmptyInvoices(tx, before.cardId);
    if (before.cardId !== input.cardId) await cleanupEmptyInvoices(tx, input.cardId);
    return true;
  });
}

export async function deletePurchase(uid: number, id: number) {
  return db.transaction(async (tx) => {
    const row = await ownedPurchase(tx, uid, id);
    if (!row) return false;
    await tx.delete(cardPurchases).where(eq(cardPurchases.id, id));
    await cleanupEmptyInvoices(tx, row.cardId);
    return true;
  });
}

export async function getPurchase(uid: number, id: number) {
  if (!(await ownedPurchase(db, uid, id))) return undefined;
  return db.select().from(cardPurchases).where(eq(cardPurchases.id, id)).then(first);
}

// ------------------------------------------------------------- Faturas --

export type InvoiceMonth = {
  referenceMonth: Month;
  totalCents: number;
  status: InvoiceStatus;
};

/** Meses com fatura (com lançamentos) do cartão, em ordem. */
export async function listInvoiceMonths(uid: number, cardId: number, today: ISODate = todayISO()): Promise<InvoiceMonth[]> {
  if (!(await ownsCard(db, uid, cardId))) return [];
  return (await invoiceTotals(cardId)).map((t) => ({
    referenceMonth: t.referenceMonth,
    totalCents: t.totalCents,
    status: invoiceStatus(t, today),
  }));
}

export type InvoiceItem = {
  installmentId: number;
  purchaseId: number;
  description: string;
  purchaseDate: ISODate;
  number: number;
  installmentsCount: number;
  amountCents: number;
  categoryName: string | null;
  categoryColor: string | null;
};

export async function getInvoiceDetail(uid: number, cardId: number, referenceMonth: Month, today: ISODate = todayISO()) {
  const card = await db
    .select()
    .from(creditCards)
    .where(and(eq(creditCards.id, cardId), eq(creditCards.userId, uid)))
    .then(first);
  if (!card) return null;

  const row = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.cardId, cardId), eq(invoices.referenceMonth, referenceMonth)))
    .then(first);

  const slot = row ?? { ...slotForReferenceMonth(referenceMonth, card.closingDay, card.dueDay), status: "open" };

  const items: InvoiceItem[] = row
    ? await db
        .select({
          installmentId: installments.id,
          purchaseId: cardPurchases.id,
          description: cardPurchases.description,
          purchaseDate: cardPurchases.purchaseDate,
          number: installments.number,
          installmentsCount: cardPurchases.installmentsCount,
          amountCents: installments.amountCents,
          categoryName: categories.name,
          categoryColor: categories.color,
        })
        .from(installments)
        .innerJoin(cardPurchases, eq(cardPurchases.id, installments.purchaseId))
        .leftJoin(categories, eq(categories.id, cardPurchases.categoryId))
        .where(eq(installments.invoiceId, row.id))
        .orderBy(asc(cardPurchases.purchaseDate), asc(cardPurchases.id))
    : [];

  const credits = row
    ? await db
        .select({
          id: invoiceCredits.id,
          description: invoiceCredits.description,
          creditDate: invoiceCredits.creditDate,
          amountCents: invoiceCredits.amountCents,
        })
        .from(invoiceCredits)
        .where(eq(invoiceCredits.invoiceId, row.id))
        .orderBy(asc(invoiceCredits.creditDate), asc(invoiceCredits.id))
    : [];

  const chargesCents = items.reduce((acc, i) => acc + i.amountCents, 0);
  const creditsCents = credits.reduce((acc, c) => acc + c.amountCents, 0);
  return {
    referenceMonth,
    closingDate: slot.closingDate,
    dueDate: slot.dueDate,
    status: invoiceStatus(slot, today),
    exists: Boolean(row),
    chargesCents,
    creditsCents,
    totalCents: Math.max(0, chargesCents - creditsCents),
    items,
    credits,
  };
}

/** Exclui um crédito/estorno de uma fatura do cartão. */
export async function deleteInvoiceCredit(uid: number, cardId: number, creditId: number) {
  return db.transaction(async (tx) => {
    if (!(await ownsCard(tx, uid, cardId))) return false;
    const row = await tx
      .select({ id: invoiceCredits.id })
      .from(invoiceCredits)
      .innerJoin(invoices, eq(invoices.id, invoiceCredits.invoiceId))
      .where(and(eq(invoiceCredits.id, creditId), eq(invoices.cardId, cardId)))
      .then(first);
    if (!row) return false;
    await tx.delete(invoiceCredits).where(eq(invoiceCredits.id, creditId));
    await cleanupEmptyInvoices(tx, cardId);
    return true;
  });
}

export async function setInvoicePaid(uid: number, cardId: number, referenceMonth: Month, paid: boolean) {
  if (!(await ownsCard(db, uid, cardId))) return false;
  const rows = await db
    .update(invoices)
    .set({ status: paid ? "paid" : "open", paidAt: paid ? new Date().toISOString() : null })
    .where(and(eq(invoices.cardId, cardId), eq(invoices.referenceMonth, referenceMonth)))
    .returning(touched);
  return rows.length > 0;
}

// ------------------------------------------------- Compras de um cartão --

export type PurchaseRow = typeof cardPurchases.$inferSelect & {
  categoryName: string | null;
  categoryColor: string | null;
  firstMonth: Month;
  lastMonth: Month;
  remainingCount: number;
  remainingCents: number;
};

/** Compras do cartão com o que ainda falta pagar (faturas não pagas). */
export async function listPurchases(uid: number, cardId: number): Promise<PurchaseRow[]> {
  if (!(await ownsCard(db, uid, cardId))) return [];
  const rows = await db
    .select({ p: cardPurchases, categoryName: categories.name, categoryColor: categories.color })
    .from(cardPurchases)
    .leftJoin(categories, eq(categories.id, cardPurchases.categoryId))
    .where(eq(cardPurchases.cardId, cardId))
    .orderBy(sql`${cardPurchases.purchaseDate} DESC`, sql`${cardPurchases.id} DESC`);
  if (!rows.length) return [];

  const parts = await db
    .select({
      purchaseId: installments.purchaseId,
      amountCents: installments.amountCents,
      referenceMonth: invoices.referenceMonth,
      status: invoices.status,
    })
    .from(installments)
    .innerJoin(invoices, eq(invoices.id, installments.invoiceId))
    .where(
      inArray(
        installments.purchaseId,
        rows.map((r) => r.p.id),
      ),
    );

  return rows.map(({ p, categoryName, categoryColor }) => {
    const mine = parts.filter((x) => x.purchaseId === p.id).sort((a, b) => a.referenceMonth.localeCompare(b.referenceMonth));
    const unpaid = mine.filter((x) => x.status !== "paid");
    return {
      ...p,
      categoryName,
      categoryColor,
      firstMonth: mine[0]?.referenceMonth ?? "",
      lastMonth: mine[mine.length - 1]?.referenceMonth ?? "",
      remainingCount: unpaid.length,
      remainingCents: unpaid.reduce((a, x) => a + x.amountCents, 0),
    };
  });
}
