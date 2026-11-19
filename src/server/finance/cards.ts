import "server-only";
import { and, asc, count, eq, inArray, ne, notExists, sql, sum } from "drizzle-orm";
import { db } from "@/db/client";
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
import { assertCard, assertCategory } from "./owner";

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

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
export const invoiceNetTotalSql = sql<number>`max(0, coalesce(${sum(installments.amountCents)}, 0) - ${invoiceCreditsSql})`.mapWith(Number);

// ------------------------------------------------------------- Cartões --

export type CardSummary = typeof creditCards.$inferSelect & {
  institutionName: string | null;
  usedCents: number;
  purchasesCount: number;
  currentInvoice: InvoiceSlot & { totalCents: number; status: InvoiceStatus };
};

function invoiceTotals(cardId: number) {
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
    .orderBy(asc(invoices.referenceMonth))
    .all();
}

/** O cartão é da conta? (protege todas as rotas que recebem cardId de fora) */
export function ownsCard(q: typeof db | Tx, uid: number, cardId: number): boolean {
  return Boolean(
    q.select({ id: creditCards.id }).from(creditCards).where(and(eq(creditCards.id, cardId), eq(creditCards.userId, uid))).get(),
  );
}

export function listCards(uid: number, today: ISODate = todayISO()): CardSummary[] {
  const cards = db
    .select({ card: creditCards, institutionName: institutions.name })
    .from(creditCards)
    .leftJoin(institutions, eq(institutions.id, creditCards.institutionId))
    .where(eq(creditCards.userId, uid))
    .orderBy(sql`${creditCards.active} DESC`, asc(creditCards.name))
    .all();

  return cards.map(({ card, institutionName }) => {
    const totals = invoiceTotals(card.id);
    const current = firstInvoiceFor(today, card.closingDay, card.dueDay);
    const currentRow = totals.find((t) => t.referenceMonth === current.referenceMonth);
    const purchasesCount =
      db.select({ n: count() }).from(cardPurchases).where(eq(cardPurchases.cardId, card.id)).get()?.n ?? 0;

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
  });
}

export function getCard(uid: number, id: number) {
  return db
    .select({ card: creditCards, institutionName: institutions.name })
    .from(creditCards)
    .leftJoin(institutions, eq(institutions.id, creditCards.institutionId))
    .where(and(eq(creditCards.id, id), eq(creditCards.userId, uid)))
    .get();
}

export function upsertInstitution(tx: Tx, uid: number, name: string): number | null {
  const clean = name.trim();
  if (!clean) return null;
  const existing = tx
    .select({ id: institutions.id })
    .from(institutions)
    .where(and(eq(institutions.userId, uid), sql`lower(${institutions.name}) = lower(${clean})`))
    .get();
  if (existing) return existing.id;
  return tx.insert(institutions).values({ userId: uid, name: clean }).returning({ id: institutions.id }).get().id;
}

export function listInstitutionNames(uid: number): string[] {
  return db.select({ name: institutions.name }).from(institutions).where(eq(institutions.userId, uid)).orderBy(asc(institutions.name)).all().map((r) => r.name);
}

export function createCard(uid: number, input: CardInput) {
  return db.transaction((tx) =>
    tx
      .insert(creditCards)
      .values({
        userId: uid,
        name: input.name,
        institutionId: upsertInstitution(tx, uid, input.institution),
        limitCents: input.limit,
        closingDay: input.closingDay,
        dueDay: input.dueDay,
        color: input.color,
      })
      .returning({ id: creditCards.id })
      .get(),
  );
}

/** Mudar fechamento/vencimento vale para compras novas; faturas já geradas mantêm suas datas. */
export function updateCard(uid: number, id: number, input: CardInput) {
  return db.transaction(
    (tx) =>
      ownsCard(tx, uid, id) &&
      tx
        .update(creditCards)
        .set({
          name: input.name,
          institutionId: upsertInstitution(tx, uid, input.institution),
          limitCents: input.limit,
          closingDay: input.closingDay,
          dueDay: input.dueDay,
          color: input.color,
        })
        .where(eq(creditCards.id, id))
        .run().changes > 0,
  );
}

export function setCardActive(uid: number, id: number, active: boolean) {
  return db.update(creditCards).set({ active }).where(and(eq(creditCards.id, id), eq(creditCards.userId, uid))).run().changes > 0;
}

/** Exclui o cartão com todas as compras, parcelas e faturas. */
export function deleteCard(uid: number, id: number) {
  return db.transaction((tx) => {
    if (!ownsCard(tx, uid, id)) return false;
    tx.delete(cardPurchases).where(eq(cardPurchases.cardId, id)).run(); // parcelas vão em cascata
    return tx.delete(creditCards).where(eq(creditCards.id, id)).run().changes > 0; // faturas em cascata
  });
}

// ------------------------------------------------------------- Compras --

export function getOrCreateInvoice(tx: Tx, cardId: number, slot: InvoiceSlot): number {
  tx.insert(invoices)
    .values({ cardId, referenceMonth: slot.referenceMonth, closingDate: slot.closingDate, dueDate: slot.dueDate })
    .onConflictDoNothing()
    .run();
  return tx
    .select({ id: invoices.id })
    .from(invoices)
    .where(and(eq(invoices.cardId, cardId), eq(invoices.referenceMonth, slot.referenceMonth)))
    .get()!.id;
}

/**
 * Gera as parcelas da compra, cada uma na fatura do mês correspondente.
 * `firstInvoiceMonth` (compras importadas) fixa a fatura da 1ª parcela, como o banco informou;
 * sem ele, a fatura sai da data da compra e do dia de fechamento do cartão.
 */
export function generateInstallments(tx: Tx, purchaseId: number, input: PurchaseInput, firstInvoiceMonth: Month | null = null) {
  const card = tx.select().from(creditCards).where(eq(creditCards.id, input.cardId)).get();
  if (!card) throw new Error("Cartão não encontrado.");

  const schedule = firstInvoiceMonth
    ? Array.from({ length: input.installmentsCount }, (_, i) =>
        slotForReferenceMonth(addMonths(firstInvoiceMonth, i), card.closingDay, card.dueDay),
      )
    : installmentSchedule(input.purchaseDate, input.installmentsCount, card.closingDay, card.dueDay);
  const amounts = splitInstallments(input.total, input.installmentsCount);

  schedule.forEach((slot, i) => {
    tx.insert(installments)
      .values({
        purchaseId,
        invoiceId: getOrCreateInvoice(tx, card.id, slot),
        number: i + 1,
        amountCents: amounts[i],
      })
      .run();
  });
}

/** Remove faturas vazias (sem parcelas nem créditos) que não foram marcadas como pagas. */
export function cleanupEmptyInvoices(tx: Tx, cardId: number) {
  tx.delete(invoices)
    .where(
      and(
        eq(invoices.cardId, cardId),
        ne(invoices.status, "paid"),
        notExists(tx.select({ x: sql`1` }).from(installments).where(eq(installments.invoiceId, invoices.id))),
        notExists(tx.select({ x: sql`1` }).from(invoiceCredits).where(eq(invoiceCredits.invoiceId, invoices.id))),
      ),
    )
    .run();
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
export function createPurchaseTx(tx: Tx, uid: number, input: PurchaseInput, simulationId: number | null = null) {
  assertCard(tx, uid, input.cardId);
  assertCategory(tx, uid, input.categoryId, "expense");
  const { id } = tx
    .insert(cardPurchases)
    .values({ ...purchaseValues(input), simulationId })
    .returning({ id: cardPurchases.id })
    .get();
  generateInstallments(tx, id, input);
  return { id };
}

export function createPurchase(uid: number, input: PurchaseInput) {
  return db.transaction((tx) => createPurchaseTx(tx, uid, input));
}

/** Editar uma compra recalcula todas as parcelas (valor, quantidade, data ou cartão). */
/** Compra da conta (via cartão). */
function ownedPurchase(q: typeof db | Tx, uid: number, id: number) {
  return q
    .select({ id: cardPurchases.id, cardId: cardPurchases.cardId, firstInvoiceMonth: cardPurchases.firstInvoiceMonth })
    .from(cardPurchases)
    .innerJoin(creditCards, eq(creditCards.id, cardPurchases.cardId))
    .where(and(eq(cardPurchases.id, id), eq(creditCards.userId, uid)))
    .get();
}

export function updatePurchase(uid: number, id: number, input: PurchaseInput) {
  return db.transaction((tx) => {
    const before = ownedPurchase(tx, uid, id);
    if (!before) return false;
    assertCard(tx, uid, input.cardId);
    assertCategory(tx, uid, input.categoryId, "expense");
    // Fatura fixada pelo banco só vale no mesmo cartão.
    const firstInvoiceMonth = before.cardId === input.cardId ? before.firstInvoiceMonth : null;
    tx.delete(installments).where(eq(installments.purchaseId, id)).run();
    tx.update(cardPurchases).set({ ...purchaseValues(input), firstInvoiceMonth }).where(eq(cardPurchases.id, id)).run();
    generateInstallments(tx, id, input, firstInvoiceMonth);
    cleanupEmptyInvoices(tx, before.cardId);
    if (before.cardId !== input.cardId) cleanupEmptyInvoices(tx, input.cardId);
    return true;
  });
}

export function deletePurchase(uid: number, id: number) {
  return db.transaction((tx) => {
    const row = ownedPurchase(tx, uid, id);
    if (!row) return false;
    tx.delete(cardPurchases).where(eq(cardPurchases.id, id)).run();
    cleanupEmptyInvoices(tx, row.cardId);
    return true;
  });
}

export function getPurchase(uid: number, id: number) {
  return ownedPurchase(db, uid, id) ? db.select().from(cardPurchases).where(eq(cardPurchases.id, id)).get() : undefined;
}

// ------------------------------------------------------------- Faturas --

export type InvoiceMonth = {
  referenceMonth: Month;
  totalCents: number;
  status: InvoiceStatus;
};

/** Meses com fatura (com lançamentos) do cartão, em ordem. */
export function listInvoiceMonths(uid: number, cardId: number, today: ISODate = todayISO()): InvoiceMonth[] {
  if (!ownsCard(db, uid, cardId)) return [];
  return invoiceTotals(cardId).map((t) => ({
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

export function getInvoiceDetail(uid: number, cardId: number, referenceMonth: Month, today: ISODate = todayISO()) {
  const card = db
    .select()
    .from(creditCards)
    .where(and(eq(creditCards.id, cardId), eq(creditCards.userId, uid)))
    .get();
  if (!card) return null;

  const row = db
    .select()
    .from(invoices)
    .where(and(eq(invoices.cardId, cardId), eq(invoices.referenceMonth, referenceMonth)))
    .get();

  const slot = row ?? { ...slotForReferenceMonth(referenceMonth, card.closingDay, card.dueDay), status: "open" };

  const items: InvoiceItem[] = row
    ? db
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
        .all()
    : [];

  const credits = row
    ? db
        .select({
          id: invoiceCredits.id,
          description: invoiceCredits.description,
          creditDate: invoiceCredits.creditDate,
          amountCents: invoiceCredits.amountCents,
        })
        .from(invoiceCredits)
        .where(eq(invoiceCredits.invoiceId, row.id))
        .orderBy(asc(invoiceCredits.creditDate), asc(invoiceCredits.id))
        .all()
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
export function deleteInvoiceCredit(uid: number, cardId: number, creditId: number) {
  return db.transaction((tx) => {
    if (!ownsCard(tx, uid, cardId)) return false;
    const row = tx
      .select({ id: invoiceCredits.id })
      .from(invoiceCredits)
      .innerJoin(invoices, eq(invoices.id, invoiceCredits.invoiceId))
      .where(and(eq(invoiceCredits.id, creditId), eq(invoices.cardId, cardId)))
      .get();
    if (!row) return false;
    tx.delete(invoiceCredits).where(eq(invoiceCredits.id, creditId)).run();
    cleanupEmptyInvoices(tx, cardId);
    return true;
  });
}

export function setInvoicePaid(uid: number, cardId: number, referenceMonth: Month, paid: boolean) {
  return (
    ownsCard(db, uid, cardId) &&
    db
      .update(invoices)
      .set({ status: paid ? "paid" : "open", paidAt: paid ? new Date().toISOString() : null })
      .where(and(eq(invoices.cardId, cardId), eq(invoices.referenceMonth, referenceMonth)))
      .run().changes > 0
  );
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
export function listPurchases(uid: number, cardId: number): PurchaseRow[] {
  if (!ownsCard(db, uid, cardId)) return [];
  const rows = db
    .select({ p: cardPurchases, categoryName: categories.name, categoryColor: categories.color })
    .from(cardPurchases)
    .leftJoin(categories, eq(categories.id, cardPurchases.categoryId))
    .where(eq(cardPurchases.cardId, cardId))
    .orderBy(sql`${cardPurchases.purchaseDate} DESC`, sql`${cardPurchases.id} DESC`)
    .all();
  if (!rows.length) return [];

  const parts = db
    .select({
      purchaseId: installments.purchaseId,
      amountCents: installments.amountCents,
      referenceMonth: invoices.referenceMonth,
      status: invoices.status,
    })
    .from(installments)
    .innerJoin(invoices, eq(invoices.id, installments.invoiceId))
    .where(inArray(installments.purchaseId, rows.map((r) => r.p.id)))
    .all();

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
