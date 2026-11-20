import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, unique } from "drizzle-orm/pg-core";
import { MONTH_GLOB, nowIso } from "./_helpers";
import { users } from "./auth";
import { incomeSources, recurringExpenses } from "./base";

/**
 * Confirmação manual de que uma renda foi RECEBIDA ou uma despesa fixa foi PAGA
 * em determinado mês. Sem registro = pendente ("a receber" / "a pagar").
 * O valor é guardado no momento da confirmação: se a renda/gasto mudar de
 * valor depois, os meses já confirmados não são alterados.
 */
export const monthlySettlements = pgTable(
  "monthly_settlements",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    incomeId: integer("income_id").references(() => incomeSources.id, { onDelete: "cascade" }),
    expenseId: integer("expense_id").references(() => recurringExpenses.id, { onDelete: "cascade" }),
    month: text("month").notNull(),
    amountCents: integer("amount_cents").notNull(),
    settledAt: text("settled_at").notNull().default(nowIso),
  },
  (t) => [
    unique("settlements_income_month_uq").on(t.incomeId, t.month),
    unique("settlements_expense_month_uq").on(t.expenseId, t.month),
    index("settlements_user_month_idx").on(t.userId, t.month),
    check(
      "settlements_exactly_one_source",
      sql`(${t.incomeId} IS NOT NULL AND ${t.expenseId} IS NULL) OR (${t.incomeId} IS NULL AND ${t.expenseId} IS NOT NULL)`,
    ),
    check("settlements_amount_positive", sql`${t.amountCents} > 0`),
    check("settlements_month_fmt", sql`${t.month} ~ '${sql.raw(MONTH_GLOB)}'`),
  ],
);
