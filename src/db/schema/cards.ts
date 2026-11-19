import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, unique, type AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { createdAt, DATE_GLOB, id, MONTH_GLOB, timestamps } from "./_helpers";
import { users } from "./auth";
import { categories, institutions } from "./base";
import { simulations } from "./simulations";

/** MÓDULO 2 — Cartões de crédito. */
export const creditCards = sqliteTable(
  "credit_cards",
  {
    id: id(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
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
    index("credit_cards_user_idx").on(t.userId),
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
    /** Importação de fatura que criou a compra (para "Desfazer importação"). */
    importId: integer("import_id").references((): AnySQLiteColumn => invoiceImports.id, { onDelete: "set null" }),
    /** Impressão digital da linha do arquivo do banco: evita importar a mesma compra duas vezes. */
    importKey: text("import_key"),
    /**
     * Fatura (mês de vencimento) da 1ª parcela, quando definida pelo banco.
     * Nulo = calculada pelo dia de fechamento do cartão (compras lançadas à mão).
     * (Sem CHECK de formato: adicionar CHECK exigiria recriar a tabela na migração.)
     */
    firstInvoiceMonth: text("first_invoice_month"),
    ...timestamps(),
  },
  (t) => [
    index("card_purchases_card_idx").on(t.cardId),
    index("card_purchases_import_idx").on(t.importId),
    unique("card_purchases_import_key_uq").on(t.cardId, t.importKey),

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

/** Bancos com leitor de fatura. */
export const IMPORT_BANKS = ["nubank", "picpay", "mercadopago"] as const;
export type ImportBank = (typeof IMPORT_BANKS)[number];

/** Histórico de importações de fatura (arquivo do banco → compras do cartão). */
export const invoiceImports = sqliteTable(
  "invoice_imports",
  {
    id: id(),
    cardId: integer("card_id")
      .notNull()
      .references(() => creditCards.id, { onDelete: "cascade" }),
    bank: text("bank", { enum: IMPORT_BANKS }).notNull(),
    fileName: text("file_name").notNull(),
    referenceMonth: text("reference_month").notNull(),
    purchasesCount: integer("purchases_count").notNull().default(0),
    creditsCount: integer("credits_count").notNull().default(0),
    /** Compras − créditos importados, em centavos. */
    netCents: integer("net_cents").notNull().default(0),
    /** Faturas que a importação marcou como pagas (JSON de ids), para reverter ao desfazer. */
    paidInvoiceIds: text("paid_invoice_ids").notNull().default("[]"),
    createdAt: createdAt(),
  },
  (t) => [
    index("invoice_imports_card_idx").on(t.cardId),
    check("invoice_imports_bank", sql`${t.bank} IN ('nubank', 'picpay', 'mercadopago')`),
    check("invoice_imports_month_fmt", sql`${t.referenceMonth} GLOB '${sql.raw(MONTH_GLOB)}'`),
    check("invoice_imports_counts", sql`${t.purchasesCount} >= 0 AND ${t.creditsCount} >= 0`),
  ],
);

/** Créditos e estornos da fatura: descontados do total. */
export const invoiceCredits = sqliteTable(
  "invoice_credits",
  {
    id: id(),
    invoiceId: integer("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    creditDate: text("credit_date").notNull(),
    amountCents: integer("amount_cents").notNull(),
    importId: integer("import_id").references(() => invoiceImports.id, { onDelete: "set null" }),
    importKey: text("import_key"),
    createdAt: createdAt(),
  },
  (t) => [
    index("invoice_credits_invoice_idx").on(t.invoiceId),
    index("invoice_credits_import_idx").on(t.importId),
    unique("invoice_credits_import_key_uq").on(t.invoiceId, t.importKey),
    check("invoice_credits_amount_positive", sql`${t.amountCents} > 0`),
    check("invoice_credits_date_fmt", sql`${t.creditDate} GLOB '${sql.raw(DATE_GLOB)}'`),
  ],
);

/** Regras aprendidas: estabelecimento (normalizado) → categoria. */
export const merchantRules = sqliteTable(
  "merchant_rules",
  {
    id: id(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    merchantKey: text("merchant_key").notNull(),
    categoryId: integer("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    ...timestamps(),
  },
  (t) => [
    unique("merchant_rules_user_key_uq").on(t.userId, t.merchantKey),
    check("merchant_rules_key_nonempty", sql`length(${t.merchantKey}) > 0`),
  ],
);
