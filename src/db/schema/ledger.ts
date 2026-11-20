import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text } from "drizzle-orm/pg-core";
import { DATE_GLOB, createdAt, id } from "./_helpers";
import { users } from "./auth";
import { oneTimeExpenses } from "./base";
import { boxTransactions } from "./boxes";
import { invoices } from "./cards";
import { monthlySettlements } from "./settlements";

export const MOVEMENT_KINDS = ["opening", "adjustment", "income", "expense", "invoice", "one_time", "box"] as const;
export type MovementKind = (typeof MOVEMENT_KINDS)[number];

/**
 * DESCONTINUADA (20/11/2026): o saldo em conta passou a ser calculado a partir das
 * confirmações (ver server/finance/ledger.ts). A tabela continua só até ser removida
 * por uma migration futura; nada mais grava nela.
 *
 * Extrato da conta corrente. O saldo em conta é a SOMA dos lançamentos com data
 * até hoje — nunca um número solto. Cada confirmação (renda recebida, gasto pago,
 * fatura paga, gasto avulso, aporte/resgate) gera um lançamento ligado à origem.
 *
 * Origem apagada:
 * - renda/gasto/fatura (SET NULL): o dinheiro já entrou/saiu, o histórico fica;
 *   desfazer a confirmação apaga o lançamento explicitamente;
 * - gasto avulso e movimentação de caixinha (CASCADE): apagar é corrigir um erro.
 */
export const accountMovements = pgTable(
  "account_movements",
  {
    id: id(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: MOVEMENT_KINDS }).notNull(),
    date: text("date").notNull(),
    /** Positivo = entrou na conta; negativo = saiu. */
    amountCents: integer("amount_cents").notNull(),
    description: text("description").notNull(),
    settlementId: integer("settlement_id")
      .unique()
      .references(() => monthlySettlements.id, { onDelete: "set null" }),
    invoiceId: integer("invoice_id")
      .unique()
      .references(() => invoices.id, { onDelete: "set null" }),
    oneTimeId: integer("one_time_id")
      .unique()
      .references(() => oneTimeExpenses.id, { onDelete: "cascade" }),
    boxTxId: integer("box_tx_id")
      .unique()
      .references(() => boxTransactions.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("account_movements_user_date_idx").on(t.userId, t.date),
    check("account_movements_kind", sql`${t.kind} IN ('opening', 'adjustment', 'income', 'expense', 'invoice', 'one_time', 'box')`),
    check("account_movements_date_fmt", sql`${t.date} ~ '${sql.raw(DATE_GLOB)}'`),
    check("account_movements_amount_nonzero", sql`${t.amountCents} <> 0 OR ${t.kind} = 'opening'`),
  ],
);
