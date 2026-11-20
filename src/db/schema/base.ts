import { sql } from "drizzle-orm";
import { boolean, check, index, integer, pgTable, text, unique } from "drizzle-orm/pg-core";
import { createdAt, DATE_GLOB, id, MONTH_GLOB, timestamps } from "./_helpers";
import { users } from "./auth";
import { simulations } from "./simulations";

/** Categorias para rendas e despesas (ícone = nome de ícone Lucide). */
export const categories = pgTable(
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
export const institutions = pgTable(
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
export const incomeSources = pgTable(
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
    active: boolean("active").notNull().default(true),
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
       OR (${t.recurrence} = 'once' AND ${t.payDate} IS NOT NULL AND ${t.payDate} ~ '${sql.raw(DATE_GLOB)}')`,
    ),
    check("income_start_month_fmt", sql`${t.startMonth} ~ '${sql.raw(MONTH_GLOB)}'`),
    check(
      "income_end_month",
      sql`${t.endMonth} IS NULL OR (${t.endMonth} ~ '${sql.raw(MONTH_GLOB)}' AND ${t.endMonth} >= ${t.startMonth})`,
    ),
  ],
);

/** MÓDULO 2 — Despesas fixas mensais (aluguel, luz, internet, assinaturas…). */
export const recurringExpenses = pgTable(
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
    active: boolean("active").notNull().default(true),
    notes: text("notes"),
    ...timestamps(),
  },
  (t) => [
    index("recurring_expenses_category_idx").on(t.categoryId),
    index("recurring_expenses_user_idx").on(t.userId),
    check("recurring_amount_positive", sql`${t.amountCents} > 0`),
    check("recurring_due_day", sql`${t.dueDay} BETWEEN 1 AND 31`),
    check("recurring_start_month_fmt", sql`${t.startMonth} ~ '${sql.raw(MONTH_GLOB)}'`),
    check(
      "recurring_end_month",
      sql`${t.endMonth} IS NULL OR (${t.endMonth} ~ '${sql.raw(MONTH_GLOB)}' AND ${t.endMonth} >= ${t.startMonth})`,
    ),
  ],
);

/**
 * Despesas avulsas (não se repetem): cadastradas pela pessoa ou criadas ao efetivar
 * uma simulação de débito/Pix. Contam como pagas (e saem do saldo) só depois de
 * marcadas com "Pagar" (paid_at preenchido), igual às despesas fixas.
 */
export const oneTimeExpenses = pgTable(
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
    /** Quando foi marcada como paga (nulo = pendente). */
    paidAt: text("paid_at"),
    ...timestamps(),
  },
  (t) => [
    index("one_time_expenses_user_date_idx").on(t.userId, t.date),
    check("one_time_amount_positive", sql`${t.amountCents} > 0`),
    check("one_time_date_fmt", sql`${t.date} ~ '${sql.raw(DATE_GLOB)}'`),
  ],
);
