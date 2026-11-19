import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";
import { DATE_GLOB, id, MONTH_GLOB, timestamps } from "./_helpers";
import { users } from "./auth";
import { categories } from "./base";
import { creditCards } from "./cards";

/**
 * MÓDULO 4 — Compras simuladas (não afetam os dados reais).
 * - credit: exige card_id; parcelas caem nas faturas do cartão.
 * - debit:  sem cartão; sai integralmente no mês da compra (1 parcela).
 * Ao efetivar: credit → card_purchases; debit → one_time_expenses.
 */
export const simulations = sqliteTable(
  "simulations",
  {
    id: id(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    paymentMethod: text("payment_method", { enum: ["credit", "debit"] }).notNull(),
    cardId: integer("card_id").references(() => creditCards.id, { onDelete: "cascade" }),
    categoryId: integer("category_id").references(() => categories.id, { onDelete: "set null" }),
    totalCents: integer("total_cents").notNull(),
    installmentsCount: integer("installments_count").notNull().default(1),
    purchaseDate: text("purchase_date").notNull(),
    status: text("status", { enum: ["active", "archived", "effectivated"] })
      .notNull()
      .default("active"),
    isVisible: integer("is_visible", { mode: "boolean" }).notNull().default(true),
    effectivatedAt: text("effectivated_at"),
    ...timestamps(),
  },
  (t) => [
    index("simulations_user_status_idx").on(t.userId, t.status),
    check("simulations_method", sql`${t.paymentMethod} IN ('credit', 'debit')`),
    check(
      "simulations_method_fields",
      sql`(${t.paymentMethod} = 'credit' AND ${t.cardId} IS NOT NULL AND ${t.installmentsCount} BETWEEN 1 AND 48)
       OR (${t.paymentMethod} = 'debit' AND ${t.cardId} IS NULL AND ${t.installmentsCount} = 1)`,
    ),
    check("simulations_total_positive", sql`${t.totalCents} > 0`),
    check("simulations_status", sql`${t.status} IN ('active', 'archived', 'effectivated')`),
    check("simulations_date_fmt", sql`${t.purchaseDate} GLOB '${sql.raw(DATE_GLOB)}'`),
    check(
      "simulations_effectivated",
      sql`(${t.status} = 'effectivated') = (${t.effectivatedAt} IS NOT NULL)`,
    ),
  ],
);

/** Parcelas hipotéticas, por mês de impacto no caixa (YYYY-MM). */
export const simulationInstallments = sqliteTable(
  "simulation_installments",
  {
    id: id(),
    simulationId: integer("simulation_id")
      .notNull()
      .references(() => simulations.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    referenceMonth: text("reference_month").notNull(),
    amountCents: integer("amount_cents").notNull(),
  },
  (t) => [
    unique("sim_installments_number_uq").on(t.simulationId, t.number),
    index("sim_installments_month_idx").on(t.referenceMonth),
    check("sim_installments_number_positive", sql`${t.number} >= 1`),
    check("sim_installments_amount_positive", sql`${t.amountCents} > 0`),
    check("sim_installments_month_fmt", sql`${t.referenceMonth} GLOB '${sql.raw(MONTH_GLOB)}'`),
  ],
);
