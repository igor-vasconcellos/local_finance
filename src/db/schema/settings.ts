import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";
import { createdAt, DATE_GLOB, updatedAt } from "./_helpers";
import { users } from "./auth";

/** Configurações de cada conta (uma linha por pessoa). Limites do farol em basis points sobre a renda do mês. */
export const settings = sqliteTable(
  "settings",
  {
    userId: integer("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    greenThresholdBp: integer("green_threshold_bp").notNull().default(2000), // > 20% = Verde
    yellowThresholdBp: integer("yellow_threshold_bp").notNull().default(500), // 5–20% = Amarelo
    // Saldo da conta corrente informado pelo usuário (entra no patrimônio líquido).
    accountBalanceCents: integer("account_balance_cents"),
    accountBalanceDate: text("account_balance_date"),
    updatedAt: updatedAt(),
  },
  (t) => [
    check(
      "settings_thresholds_order",
      sql`${t.yellowThresholdBp} >= 0 AND ${t.greenThresholdBp} > ${t.yellowThresholdBp} AND ${t.greenThresholdBp} <= 10000`,
    ),
  ],
);

/**
 * Histórico da taxa CDI anual. Uma nova taxa vale a partir de `effective_from`,
 * preservando o rendimento já calculado em períodos anteriores.
 */
export const cdiRates = sqliteTable(
  "cdi_rates",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    annualRateBp: integer("annual_rate_bp").notNull(), // 1490 = 14,90% a.a.
    effectiveFrom: text("effective_from").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("cdi_rates_user_date_uq").on(t.userId, t.effectiveFrom),
    check("cdi_rates_positive", sql`${t.annualRateBp} > 0 AND ${t.annualRateBp} <= 10000`),
    check("cdi_rates_date_fmt", sql`${t.effectiveFrom} GLOB '${sql.raw(DATE_GLOB)}'`),
  ],
);
