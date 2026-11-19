import "server-only";
import { createHash } from "node:crypto";
import { and, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  cardPurchases,
  categories,
  creditCards,
  installments,
  invoiceCredits,
  invoiceImports,
  invoices,
  merchantRules,
} from "@/db/schema";
import { addMonths, firstInvoiceFor, monthOf, todayISO, type ISODate, type Month } from "@/lib/dates";
import {
  BANK_LABELS,
  checkTotals,
  merchantKey,
  suggestCategoryName,
  type ImportBank,
  type LineKind,
  type ParsedLine,
  type ParsedStatement,
} from "@/lib/import";
import {
  cleanupEmptyInvoices,
  generateInstallments,
  getOrCreateInvoice,
  ownsCard,
  slotForReferenceMonth,
  type Tx,
} from "@/server/finance/cards";
import { assertCategory, NotFoundError } from "@/server/finance/owner";

// ----------------------------------------------------------------- Prévia --

/**
 * new       = entra na importação
 * imported  = já importada antes (mesma linha do banco)
 * duplicate = parece a mesma compra lançada à mão (mesma data e valor) — vem desmarcada
 * ignored   = pagamento da fatura (não é gasto)
 */
export type LineStatus = "new" | "imported" | "duplicate" | "ignored";

export type PreviewLine = ParsedLine & {
  key: string;
  status: LineStatus;
  categoryId: number | null;
  selected: boolean;
};

export type ImportPreview = {
  cardId: number;
  cardName: string;
  bank: ImportBank;
  bankLabel: string;
  fileName: string;
  referenceMonth: Month;
  dueDate: ISODate;
  closingDate: ISODate;
  /** Vencimento/fechamento vieram do arquivo (PDF) ou foram calculados pelo cartão (CSV). */
  datesFromFile: boolean;
  /** O banco usa dias diferentes dos cadastrados no cartão. */
  scheduleMismatch: { closingDay: number | null; dueDay: number; cardClosingDay: number; cardDueDay: number } | null;
  totals: ReturnType<typeof checkTotals>;
  markPaidDefault: boolean;
  multipleCards: boolean;
  lines: PreviewLine[];
};

const hash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 32);

/**
 * Impressão digital de cada linha. Linhas idênticas no mesmo arquivo (3 corridas de
 * R$ 10,00 no mesmo dia) se diferenciam pela ordem de aparição.
 * Parceladas não usam a data nem o nº da parcela: "Loja 2/10" deste mês e "Loja 3/10"
 * do mês que vem são a mesma compra.
 */
export function lineKeys(bank: ImportBank, lines: ParsedLine[]): string[] {
  const seen = new Map<string, number>();
  return lines.map((l) => {
    const desc = l.rawDescription.toLowerCase();
    const base = l.installment
      ? [bank, l.cardFinal ?? "", "parc", l.description.toLowerCase(), l.amountCents, l.installment.count].join("|")
      : [bank, l.cardFinal ?? "", l.kind, l.date, desc, l.amountCents].join("|");
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return hash(`${base}|#${n}`);
  });
}

function categoryResolver(uid: number) {
  const cats = db
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .where(and(eq(categories.userId, uid), eq(categories.kind, "expense")))
    .all();
  const byName = new Map(cats.map((c) => [c.name.toLowerCase(), c.id]));
  const rules = new Map(
    db
      .select({ k: merchantRules.merchantKey, c: merchantRules.categoryId })
      .from(merchantRules)
      .where(eq(merchantRules.userId, uid))
      .all().map((r) => [r.k, r.c]),
  );
  return (description: string): number | null => {
    const learned = rules.get(merchantKey(description));
    if (learned) return learned;
    const name = suggestCategoryName(description);
    return name ? (byName.get(name.toLowerCase()) ?? null) : null;
  };
}

export function buildPreview(
  uid: number,
  cardId: number,
  fileName: string,
  st: ParsedStatement,
  today: ISODate = todayISO(),
): ImportPreview {
  const card = db
    .select()
    .from(creditCards)
    .where(and(eq(creditCards.id, cardId), eq(creditCards.userId, uid)))
    .get();
  if (!card) throw new Error("Cartão não encontrado.");

  // Fatura de destino: a do arquivo; no CSV, o vencimento vem do nome do arquivo ou
  // é deduzido pela compra mais recente.
  let referenceMonth: Month;
  let dueDate: ISODate;
  let closingDate: ISODate;
  const datesFromFile = Boolean(st.dueDate && st.closingDate);
  if (st.dueDate && st.closingDate) {
    referenceMonth = monthOf(st.dueDate);
    dueDate = st.dueDate;
    closingDate = st.closingDate;
  } else {
    const latest = st.lines.filter((l) => l.kind !== "payment").map((l) => l.date).sort().at(-1) ?? today;
    referenceMonth = st.dueDate ? monthOf(st.dueDate) : firstInvoiceFor(latest, card.closingDay, card.dueDay).referenceMonth;
    const slot = slotForReferenceMonth(referenceMonth, card.closingDay, card.dueDay);
    dueDate = st.dueDate ?? slot.dueDate;
    closingDate = slot.closingDate <= dueDate ? slot.closingDate : dueDate;
  }

  const fileClosingDay = st.closingDate ? Number(st.closingDate.slice(8, 10)) : null;
  const fileDueDay = st.dueDate ? Number(st.dueDate.slice(8, 10)) : null;
  const scheduleMismatch =
    fileDueDay !== null && (fileDueDay !== card.dueDay || (fileClosingDay !== null && fileClosingDay !== card.closingDay))
      ? { closingDay: fileClosingDay, dueDay: fileDueDay, cardClosingDay: card.closingDay, cardDueDay: card.dueDay }
      : null;

  const keys = lineKeys(st.bank, st.lines);
  const importedPurchaseKeys = new Set(
    db
      .select({ k: cardPurchases.importKey })
      .from(cardPurchases)
      .where(and(eq(cardPurchases.cardId, cardId), isNotNull(cardPurchases.importKey)))
      .all()
      .map((r) => r.k!),
  );
  const importedCreditKeys = new Set(
    db
      .select({ k: invoiceCredits.importKey })
      .from(invoiceCredits)
      .innerJoin(invoices, eq(invoices.id, invoiceCredits.invoiceId))
      .where(and(eq(invoices.cardId, cardId), isNotNull(invoiceCredits.importKey)))
      .all()
      .map((r) => r.k!),
  );
  // Compras lançadas à mão, para apontar possíveis duplicadas.
  const manual = db
    .select({ date: cardPurchases.purchaseDate, total: cardPurchases.totalCents, count: cardPurchases.installmentsCount })
    .from(cardPurchases)
    .where(and(eq(cardPurchases.cardId, cardId), isNull(cardPurchases.importKey)))
    .all();
  const usedManual = new Set<number>();
  const findManual = (l: ParsedLine) => {
    const idx = manual.findIndex((m, i) => {
      if (usedManual.has(i) || m.date !== l.date) return false;
      if (!l.installment) return m.total === l.amountCents && m.count === 1;
      return m.count === l.installment.count && Math.abs(m.total - l.amountCents * l.installment.count) <= l.installment.count;
    });
    if (idx >= 0) usedManual.add(idx);
    return idx >= 0;
  };

  const resolveCategory = categoryResolver(uid);
  const lines: PreviewLine[] = st.lines.map((l, i) => {
    const key = keys[i];
    let status: LineStatus;
    if (l.kind === "payment") status = "ignored";
    else if ((l.kind === "credit" ? importedCreditKeys : importedPurchaseKeys).has(key)) status = "imported";
    else if (l.kind === "purchase" && findManual(l)) status = "duplicate";
    else status = "new";
    return {
      ...l,
      key,
      status,
      categoryId: l.kind === "purchase" ? resolveCategory(l.description) : null,
      selected: status === "new",
    };
  });

  return {
    cardId,
    cardName: card.name,
    bank: st.bank,
    bankLabel: BANK_LABELS[st.bank],
    fileName,
    referenceMonth,
    dueDate,
    closingDate,
    datesFromFile,
    scheduleMismatch,
    totals: checkTotals(st),
    markPaidDefault: dueDate < today,
    multipleCards: new Set(st.lines.map((l) => l.cardFinal ?? "")).size > 1,
    lines,
  };
}

// ----------------------------------------------------------- Confirmação --

export type CommitLine = {
  key: string;
  kind: Exclude<LineKind, "payment">;
  date: ISODate;
  description: string;
  amountCents: number;
  installment: { number: number; count: number } | null;
  categoryId: number | null;
};

export type CommitInput = {
  cardId: number;
  bank: ImportBank;
  fileName: string;
  referenceMonth: Month;
  dueDate: ISODate;
  closingDate: ISODate;
  datesFromFile: boolean;
  markPaid: boolean;
  updateCardSchedule: boolean;
  lines: CommitLine[];
};

export type CommitResult = {
  importId: number;
  purchases: number;
  credits: number;
  skipped: number;
  netCents: number;
};

function markPaid(tx: Tx, invoiceId: number, paidIds: number[]) {
  const changed = tx
    .update(invoices)
    .set({ status: "paid", paidAt: new Date().toISOString() })
    .where(and(eq(invoices.id, invoiceId), sql`${invoices.status} <> 'paid'`))
    .run().changes;
  if (changed) paidIds.push(invoiceId);
}

export function commitImport(uid: number, input: CommitInput): CommitResult {
  return db.transaction((tx) => {
    const card = tx
      .select()
      .from(creditCards)
      .where(and(eq(creditCards.id, input.cardId), eq(creditCards.userId, uid)))
      .get();
    if (!card) throw new NotFoundError("Cartão");
    for (const l of input.lines) assertCategory(tx, uid, l.categoryId, "expense");

    if (input.updateCardSchedule && input.datesFromFile) {
      tx.update(creditCards)
        .set({ closingDay: Number(input.closingDate.slice(8, 10)), dueDay: Number(input.dueDate.slice(8, 10)) })
        .where(eq(creditCards.id, card.id))
        .run();
    }
    // Recarrega (os dias podem ter mudado) para gerar as parcelas futuras com o calendário certo.
    const fresh = tx.select().from(creditCards).where(eq(creditCards.id, card.id)).get()!;

    // A fatura do arquivo: cria ou ajusta as datas para as que o banco informou.
    const ref = input.referenceMonth;
    let dueDate = input.dueDate;
    let closingDate = input.closingDate;
    if (monthOf(dueDate) !== ref) {
      const slot = slotForReferenceMonth(ref, fresh.closingDay, fresh.dueDay);
      dueDate = slot.dueDate;
      closingDate = slot.closingDate;
    }
    if (closingDate > dueDate) closingDate = dueDate;
    const invoiceId = getOrCreateInvoice(tx, card.id, { referenceMonth: ref, closingDate, dueDate });
    if (input.datesFromFile) {
      tx.update(invoices).set({ closingDate, dueDate }).where(eq(invoices.id, invoiceId)).run();
    }

    const importId = tx
      .insert(invoiceImports)
      .values({ cardId: card.id, bank: input.bank, fileName: input.fileName.slice(0, 200), referenceMonth: ref })
      .returning({ id: invoiceImports.id })
      .get().id;

    const paidIds: number[] = [];
    let purchases = 0;
    let credits = 0;
    let skipped = 0;
    let netCents = 0;

    for (const l of input.lines) {
      if (l.kind === "credit") {
        const exists = tx
          .select({ id: invoiceCredits.id })
          .from(invoiceCredits)
          .innerJoin(invoices, eq(invoices.id, invoiceCredits.invoiceId))
          .where(and(eq(invoices.cardId, card.id), eq(invoiceCredits.importKey, l.key)))
          .get();
        if (exists) {
          skipped++;
          continue;
        }
        tx.insert(invoiceCredits)
          .values({ invoiceId, description: l.description, creditDate: l.date, amountCents: l.amountCents, importId, importKey: l.key })
          .run();
        credits++;
        netCents -= l.amountCents;
        continue;
      }

      const exists = tx
        .select({ id: cardPurchases.id })
        .from(cardPurchases)
        .where(and(eq(cardPurchases.cardId, card.id), eq(cardPurchases.importKey, l.key)))
        .get();
      if (exists) {
        skipped++;
        continue;
      }

      // Parcela k/n nesta fatura → compra completa de n parcelas, com a 1ª fatura k−1 meses antes.
      const count = l.installment?.count ?? 1;
      const number = l.installment?.number ?? 1;
      const firstMonth = addMonths(ref, -(number - 1));
      const purchaseInput = {
        cardId: card.id,
        description: l.description.slice(0, 120),
        categoryId: l.categoryId,
        total: l.amountCents * count,
        installmentsCount: count,
        purchaseDate: l.date,
        notes: null,
      };
      const { id } = tx
        .insert(cardPurchases)
        .values({
          cardId: purchaseInput.cardId,
          description: purchaseInput.description,
          categoryId: purchaseInput.categoryId,
          totalCents: purchaseInput.total,
          installmentsCount: count,
          purchaseDate: l.date,
          importId,
          importKey: l.key,
          firstInvoiceMonth: firstMonth,
        })
        .returning({ id: cardPurchases.id })
        .get();
      generateInstallments(tx, id, purchaseInput, firstMonth);

      // Parcelas anteriores já foram cobradas em faturas passadas: ficam pagas.
      if (number > 1) {
        const earlier = tx
          .select({ id: invoices.id })
          .from(installments)
          .innerJoin(invoices, eq(invoices.id, installments.invoiceId))
          .where(and(eq(installments.purchaseId, id), sql`${invoices.referenceMonth} < ${ref}`))
          .all();
        for (const e of earlier) markPaid(tx, e.id, paidIds);
      }

      if (l.categoryId) {
        const key = merchantKey(l.description);
        if (key) {
          tx.insert(merchantRules)
            .values({ userId: uid, merchantKey: key, categoryId: l.categoryId })
            .onConflictDoUpdate({ target: [merchantRules.userId, merchantRules.merchantKey], set: { categoryId: l.categoryId, updatedAt: new Date().toISOString() } })
            .run();
        }
      }
      purchases++;
      netCents += l.amountCents;
    }

    if (input.markPaid) markPaid(tx, invoiceId, paidIds);

    tx.update(invoiceImports)
      .set({ purchasesCount: purchases, creditsCount: credits, netCents, paidInvoiceIds: JSON.stringify(paidIds) })
      .where(eq(invoiceImports.id, importId))
      .run();
    cleanupEmptyInvoices(tx, card.id);

    return { importId, purchases, credits, skipped, netCents };
  });
}

// ------------------------------------------------------ Histórico/Desfazer --

export type ImportHistoryRow = typeof invoiceImports.$inferSelect & { bankLabel: string };

export function listImports(uid: number, cardId: number): ImportHistoryRow[] {
  if (!ownsCard(db, uid, cardId)) return [];
  return db
    .select()
    .from(invoiceImports)
    .where(eq(invoiceImports.cardId, cardId))
    .orderBy(desc(invoiceImports.createdAt), desc(invoiceImports.id))
    .all()
    .map((r) => ({ ...r, bankLabel: BANK_LABELS[r.bank] }));
}

/** Apaga tudo o que a importação criou e desfaz as faturas que ela marcou como pagas. */
export function undoImport(uid: number, cardId: number, importId: number): boolean {
  return db.transaction((tx) => {
    if (!ownsCard(tx, uid, cardId)) return false;
    const imp = tx
      .select()
      .from(invoiceImports)
      .where(and(eq(invoiceImports.id, importId), eq(invoiceImports.cardId, cardId)))
      .get();
    if (!imp) return false;

    tx.delete(cardPurchases).where(eq(cardPurchases.importId, importId)).run(); // parcelas em cascata
    tx.delete(invoiceCredits).where(eq(invoiceCredits.importId, importId)).run();

    let paidIds: number[] = [];
    try {
      paidIds = (JSON.parse(imp.paidInvoiceIds) as unknown[]).filter((x): x is number => typeof x === "number");
    } catch {
      paidIds = [];
    }
    if (paidIds.length) {
      tx.update(invoices)
        .set({ status: "open", paidAt: null })
        .where(and(inArray(invoices.id, paidIds), eq(invoices.cardId, cardId)))
        .run();
    }
    tx.delete(invoiceImports).where(eq(invoiceImports.id, importId)).run();
    cleanupEmptyInvoices(tx, cardId);
    return true;
  });
}
