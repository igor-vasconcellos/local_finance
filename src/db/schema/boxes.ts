import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createdAt, DATE_GLOB, id, timestamps } from "./_helpers";
import { users } from "./auth";
import { institutions } from "./base";

/**
 * MÓDULO 3 — Caixinhas / metas. Rendem um percentual do CDI (11500 = 115% do CDI).
 * O saldo NÃO é armazenado: aportes − resgates + rendimento (calculado por período).
 */
export const savingsBoxes = sqliteTable(
  "savings_boxes",
  {
    id: id(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    institutionId: integer("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    cdiPercentBp: integer("cdi_percent_bp").notNull(),
    goalCents: integer("goal_cents"),
    goalDate: text("goal_date"),
    color: text("color"),
    icon: text("icon"),
    archivedAt: text("archived_at"),
    ...timestamps(),
  },
  (t) => [
    index("savings_boxes_institution_idx").on(t.institutionId),
    index("savings_boxes_user_idx").on(t.userId),
    check("boxes_cdi_percent", sql`${t.cdiPercentBp} > 0 AND ${t.cdiPercentBp} <= 50000`),
    check("boxes_goal_positive", sql`${t.goalCents} IS NULL OR ${t.goalCents} > 0`),
    check(
      "boxes_goal_date_fmt",
      sql`${t.goalDate} IS NULL OR ${t.goalDate} GLOB '${sql.raw(DATE_GLOB)}'`,
    ),
  ],
);

/** Aportes e resgates. */
export const boxTransactions = sqliteTable(
  "box_transactions",
  {
    id: id(),
    boxId: integer("box_id")
      .notNull()
      .references(() => savingsBoxes.id, { onDelete: "cascade" }),
    type: text("type", { enum: ["deposit", "withdrawal"] }).notNull(),
    amountCents: integer("amount_cents").notNull(),
    date: text("date").notNull(),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [
    index("box_transactions_box_date_idx").on(t.boxId, t.date),
    check("box_tx_type", sql`${t.type} IN ('deposit', 'withdrawal')`),
    check("box_tx_amount_positive", sql`${t.amountCents} > 0`),
    check("box_tx_date_fmt", sql`${t.date} GLOB '${sql.raw(DATE_GLOB)}'`),
  ],
);
