import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createdAt, DATE_GLOB, updatedAt } from "./_helpers";

/** Configurações globais (linha única). Limites do farol em basis points sobre a renda do mês. */
export const settings = sqliteTable(
  "settings",
  {
    id: integer("id").primaryKey(),
    greenThresholdBp: integer("green_threshold_bp").notNull().default(2000), // > 20% = Verde
    yellowThresholdBp: integer("yellow_threshold_bp").notNull().default(500), // 5–20% = Amarelo
    // Saldo da conta corrente informado pelo usuário (entra no patrimônio líquido).
    accountBalanceCents: integer("account_balance_cents"),
    accountBalanceDate: text("account_balance_date"),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("settings_single_row", sql`${t.id} = 1`),
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
    annualRateBp: integer("annual_rate_bp").notNull(), // 1490 = 14,90% a.a.
    effectiveFrom: text("effective_from").notNull().unique(),
    createdAt: createdAt(),
  },
  (t) => [
    check("cdi_rates_positive", sql`${t.annualRateBp} > 0 AND ${t.annualRateBp} <= 10000`),
    check("cdi_rates_date_fmt", sql`${t.effectiveFrom} GLOB '${sql.raw(DATE_GLOB)}'`),
  ],
);
