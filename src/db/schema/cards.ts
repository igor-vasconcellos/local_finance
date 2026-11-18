import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";
import { createdAt, DATE_GLOB, id, MONTH_GLOB, timestamps } from "./_helpers";
import { categories, institutions } from "./base";
import { simulations } from "./simulations";

/** MÓDULO 2 — Cartões de crédito. */
export const creditCards = sqliteTable(
  "credit_cards",
  {
    id: id(),
    name: text("name").notNull(),
    institutionId: integer("institution_id").references(() => institutions.id, {
      onDelete: "set null",
    }),
    limitCents: integer("limit_cents").notNull(),
    closingDay: integer("closing_day").notNull(),
    dueDay: integer("due_day").notNull(),
    color: text("color"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    ...timestamps(),
  },
  (t) => [
    check("cards_limit_nonneg", sql`${t.limitCents} >= 0`),
    check("cards_closing_day", sql`${t.closingDay} BETWEEN 1 AND 31`),
    check("cards_due_day", sql`${t.dueDay} BETWEEN 1 AND 31`),
  ],
);

/**
 * Faturas. Identificadas pelo mês do VENCIMENTO (quando o dinheiro sai da conta).
 * O total não é armazenado: é SUM(installments.amount_cents).
 */
export const invoices = sqliteTable(
  "invoices",
  {
    id: id(),
    cardId: integer("card_id")
      .notNull()
      .references(() => creditCards.id, { onDelete: "cascade" }),
    referenceMonth: text("reference_month").notNull(),
    closingDate: text("closing_date").notNull(),
    dueDate: text("due_date").notNull(),
    status: text("status", { enum: ["open", "closed", "paid"] })
      .notNull()
      .default("open"),
    paidAt: text("paid_at"),
    createdAt: createdAt(),
  },
  (t) => [
    unique("invoices_card_month_uq").on(t.cardId, t.referenceMonth),
    index("invoices_month_idx").on(t.referenceMonth),
    check("invoices_status", sql`${t.status} IN ('open', 'closed', 'paid')`),
    check("invoices_month_fmt", sql`${t.referenceMonth} GLOB '${sql.raw(MONTH_GLOB)}'`),
    check("invoices_dates", sql`${t.closingDate} <= ${t.dueDate}`),
  ],
);

/** Compras no cartão (à vista = 1 parcela). */
export const cardPurchases = sqliteTable(
  "card_purchases",
  {
    id: id(),
    cardId: integer("card_id")
      .notNull()
      .references(() => creditCards.id, { onDelete: "restrict" }),
    categoryId: integer("category_id").references(() => categories.id, { onDelete: "set null" }),
    description: text("description").notNull(),
    totalCents: integer("total_cents").notNull(),
    installmentsCount: integer("installments_count").notNull(),
    purchaseDate: text("purchase_date").notNull(),
    simulationId: integer("simulation_id")
      .unique()
      .references(() => simulations.id, { onDelete: "set null" }),
    notes: text("notes"),
    ...timestamps(),
  },
  (t) => [
    index("card_purchases_card_idx").on(t.cardId),
    check("purchases_total_positive", sql`${t.totalCents} > 0`),
    check("purchases_installments_range", sql`${t.installmentsCount} BETWEEN 1 AND 48`),
    check("purchases_date_fmt", sql`${t.purchaseDate} GLOB '${sql.raw(DATE_GLOB)}'`),
  ],
);

/** Parcelas reais, cada uma vinculada à fatura em que cai. */
export const installments = sqliteTable(
  "installments",
  {
    id: id(),
    purchaseId: integer("purchase_id")
      .notNull()
      .references(() => cardPurchases.id, { onDelete: "cascade" }),
    invoiceId: integer("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "restrict" }),
    number: integer("number").notNull(),
    amountCents: integer("amount_cents").notNull(),
  },
  (t) => [
    unique("installments_purchase_number_uq").on(t.purchaseId, t.number),
    index("installments_invoice_idx").on(t.invoiceId),
    check("installments_number_positive", sql`${t.number} >= 1`),
    check("installments_amount_positive", sql`${t.amountCents} > 0`),
  ],
);
