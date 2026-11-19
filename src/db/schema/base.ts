import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";
import { createdAt, DATE_GLOB, id, MONTH_GLOB, timestamps } from "./_helpers";
import { users } from "./auth";
import { simulations } from "./simulations";

/** Categorias para rendas e despesas (ícone = nome de ícone Lucide). */
export const categories = sqliteTable(
  "categories",
  {
    id: id(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: text("kind", { enum: ["income", "expense"] }).notNull(),
    color: text("color"),
    icon: text("icon"),
    createdAt: createdAt(),
  },
  (t) => [
    unique("categories_user_name_kind_uq").on(t.userId, t.name, t.kind),
    index("categories_user_idx").on(t.userId),
    check("categories_kind", sql`${t.kind} IN ('income', 'expense')`),
  ],
);

/** Instituições financeiras (compartilhadas por cartões e caixinhas). */
export const institutions = sqliteTable(
  "institutions",
  {
    id: id(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color"),
    createdAt: createdAt(),
  },
  (t) => [unique("institutions_user_name_uq").on(t.userId, t.name)],
);

/** MÓDULO 2 — Fontes de renda (mensais recorrentes ou únicas). */
export const incomeSources = sqliteTable(
  "income_sources",
  {
    id: id(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: text("type", { enum: ["salary", "pro_labore", "extra", "other"] }).notNull(),
    amountCents: integer("amount_cents").notNull(),
    recurrence: text("recurrence", { enum: ["monthly", "once"] }).notNull(),
    payDay: integer("pay_day"), // obrigatório se monthly
    payDate: text("pay_date"), // obrigatório se once
    startMonth: text("start_month").notNull(),
    endMonth: text("end_month"), // NULL = sem data de término
    categoryId: integer("category_id").references(() => categories.id, { onDelete: "set null" }),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    notes: text("notes"),
    ...timestamps(),
  },
  (t) => [
    index("income_sources_user_idx").on(t.userId),
    check("income_type", sql`${t.type} IN ('salary', 'pro_labore', 'extra', 'other')`),
    check("income_amount_positive", sql`${t.amountCents} > 0`),
    check("income_recurrence", sql`${t.recurrence} IN ('monthly', 'once')`),
    check(
      "income_recurrence_fields",
      // IS NOT NULL explícito: em SQL, NULL BETWEEN… resulta NULL e um CHECK NULL é aceito.
      sql`(${t.recurrence} = 'monthly' AND ${t.payDay} IS NOT NULL AND ${t.payDay} BETWEEN 1 AND 31)
       OR (${t.recurrence} = 'once' AND ${t.payDate} IS NOT NULL AND ${t.payDate} GLOB '${sql.raw(DATE_GLOB)}')`,
    ),
    check("income_start_month_fmt", sql`${t.startMonth} GLOB '${sql.raw(MONTH_GLOB)}'`),
    check(
      "income_end_month",
      sql`${t.endMonth} IS NULL OR (${t.endMonth} GLOB '${sql.raw(MONTH_GLOB)}' AND ${t.endMonth} >= ${t.startMonth})`,
    ),
  ],
);

/** MÓDULO 2 — Gastos fixos mensais (aluguel, luz, internet, assinaturas…). */
export const recurringExpenses = sqliteTable(
  "recurring_expenses",
  {
    id: id(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    categoryId: integer("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    amountCents: integer("amount_cents").notNull(),
    dueDay: integer("due_day").notNull(),
    startMonth: text("start_month").notNull(),
    endMonth: text("end_month"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    notes: text("notes"),
    ...timestamps(),
  },
  (t) => [
    index("recurring_expenses_category_idx").on(t.categoryId),
    index("recurring_expenses_user_idx").on(t.userId),
    check("recurring_amount_positive", sql`${t.amountCents} > 0`),
    check("recurring_due_day", sql`${t.dueDay} BETWEEN 1 AND 31`),
    check("recurring_start_month_fmt", sql`${t.startMonth} GLOB '${sql.raw(MONTH_GLOB)}'`),
    check(
      "recurring_end_month",
      sql`${t.endMonth} IS NULL OR (${t.endMonth} GLOB '${sql.raw(MONTH_GLOB)}' AND ${t.endMonth} >= ${t.startMonth})`,
    ),
  ],
);

/**
 * Gastos avulsos pagos no débito / Pix / dinheiro (saem integralmente na data).
 * Também é o destino de uma simulação de débito quando ela é efetivada.
 */
export const oneTimeExpenses = sqliteTable(
  "one_time_expenses",
  {
    id: id(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    categoryId: integer("category_id").references(() => categories.id, { onDelete: "set null" }),
    amountCents: integer("amount_cents").notNull(),
    date: text("date").notNull(),
    simulationId: integer("simulation_id")
      .unique()
      .references(() => simulations.id, { onDelete: "set null" }),
    notes: text("notes"),
    ...timestamps(),
  },
  (t) => [
    index("one_time_expenses_user_date_idx").on(t.userId, t.date),
    check("one_time_amount_positive", sql`${t.amountCents} > 0`),
    check("one_time_date_fmt", sql`${t.date} GLOB '${sql.raw(DATE_GLOB)}'`),
  ],
);
