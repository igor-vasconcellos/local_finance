import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { createdAt, DATE_GLOB, id, timestamps } from "./_helpers";
import { users } from "./auth";

/** Situação da assinatura no Mercado Pago (preapproval). */
export const SUBSCRIPTION_STATUSES = ["pending", "authorized", "paused", "cancelled"] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const PAYMENT_STATUSES = ["approved", "pending", "rejected", "refunded", "cancelled"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/**
 * Uma assinatura por conta. Nunca guarda dados de cartão: o pagamento acontece
 * na página do Mercado Pago. Só o webhook verificado (ou a consulta direta à API
 * do Mercado Pago) altera status e "pago até".
 */
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: id(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** id da preapproval no Mercado Pago. */
    providerId: text("provider_id"),
    status: text("status", { enum: SUBSCRIPTION_STATUSES }).notNull().default("pending"),
    /** Link do checkout do Mercado Pago (para continuar um pagamento iniciado). */
    checkoutUrl: text("checkout_url"),
    priceCents: integer("price_cents").notNull(),
    /** Acesso pago até este dia (exclusivo): data do pagamento aprovado + 1 mês. */
    paidUntil: text("paid_until"),
    nextPaymentDate: text("next_payment_date"),
    /** Última cobrança recusada/em nova tentativa (para o aviso por e-mail). */
    lastFailureAt: text("last_failure_at"),
    cancelledAt: text("cancelled_at"),
    lastSyncedAt: text("last_synced_at"),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("subscriptions_user_uq").on(t.userId),
    uniqueIndex("subscriptions_provider_uq").on(t.providerId),
    check("subscriptions_status", sql.raw(`"status" IN (${SUBSCRIPTION_STATUSES.map((s) => `'${s}'`).join(", ")})`)),
    check("subscriptions_paid_until", sql.raw(`"paid_until" IS NULL OR "paid_until" ~ '${DATE_GLOB}'`)),
    check("subscriptions_price", sql`${t.priceCents} > 0`),
  ],
);

/** Cobranças mensais (authorized payments) vistas no Mercado Pago. */
export const payments = pgTable(
  "payments",
  {
    id: id(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** id do authorized_payment no Mercado Pago. */
    providerId: text("provider_id").notNull(),
    subscriptionProviderId: text("subscription_provider_id").notNull(),
    amountCents: integer("amount_cents").notNull(),
    status: text("status", { enum: PAYMENT_STATUSES }).notNull(),
    statusDetail: text("status_detail"),
    /** Dia (YYYY-MM-DD, Brasília) da cobrança. */
    chargedOn: text("charged_on").notNull(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("payments_provider_uq").on(t.providerId),
    index("payments_user_idx").on(t.userId, t.chargedOn),
    index("payments_charged_idx").on(t.chargedOn),
    check("payments_status", sql.raw(`"status" IN (${PAYMENT_STATUSES.map((s) => `'${s}'`).join(", ")})`)),
    check("payments_charged_on", sql.raw(`"charged_on" ~ '${DATE_GLOB}'`)),
    check("payments_amount", sql`${t.amountCents} >= 0`),
  ],
);

/**
 * Notificações recebidas do Mercado Pago (idempotência e trilha). A mesma
 * notificação repetida não é processada duas vezes.
 */
export const paymentEvents = pgTable(
  "payment_events",
  {
    id: id(),
    /** "<tipo>:<id do recurso>:<id da notificação>" */
    eventKey: text("event_key").notNull(),
    topic: text("topic").notNull(),
    resourceId: text("resource_id").notNull(),
    /** processed | ignored | failed */
    outcome: text("outcome").notNull().default("processed"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("payment_events_key_uq").on(t.eventKey), index("payment_events_created_idx").on(t.createdAt)],
);
