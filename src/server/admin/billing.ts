import "server-only";
import { and, count, desc, eq, gte, like, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { payments, subscriptions, users, type SubscriptionStatus } from "@/db/schema";
import { currentMonth, todayISO } from "@/lib/dates";

/**
 * Visão de cobrança para o admin: só status, datas e valores da ASSINATURA.
 * Nenhum dado financeiro pessoal do usuário (receitas, despesas, cartões) aparece aqui.
 */
export type BillingOverview = {
  payingNow: number;
  renewing: number;
  revenueMonthCents: number;
  failedLast30: number;
};

export async function getBillingOverview(now: Date = new Date()): Promise<BillingOverview> {
  const today = todayISO(now);
  const since = todayISO(new Date(now.getTime() - 30 * 86_400_000));
  const [subs] = await db
    .select({
      payingNow: sql<number>`count(*) filter (where ${subscriptions.paidUntil} > ${today})`.mapWith(Number),
      renewing: sql<number>`count(*) filter (where ${subscriptions.status} = 'authorized')`.mapWith(Number),
    })
    .from(subscriptions);
  const [rev] = await db
    .select({ cents: sql<number>`coalesce(sum(${payments.amountCents}), 0)`.mapWith(Number) })
    .from(payments)
    .where(and(eq(payments.status, "approved"), like(payments.chargedOn, `${currentMonth(now)}-%`)));
  const [failed] = await db
    .select({ n: count() })
    .from(payments)
    .where(and(eq(payments.status, "rejected"), gte(payments.chargedOn, since)));
  return { payingNow: subs.payingNow, renewing: subs.renewing, revenueMonthCents: rev.cents, failedLast30: failed.n };
}

export async function listSubscriptions(limit = 200) {
  return db
    .select({
      id: subscriptions.id,
      email: users.email,
      status: subscriptions.status,
      paidUntil: subscriptions.paidUntil,
      nextPaymentDate: subscriptions.nextPaymentDate,
      lastFailureAt: subscriptions.lastFailureAt,
      priceCents: subscriptions.priceCents,
      createdAt: subscriptions.createdAt,
    })
    .from(subscriptions)
    .innerJoin(users, eq(users.id, subscriptions.userId))
    .orderBy(desc(subscriptions.updatedAt))
    .limit(limit);
}

export async function listRecentPayments(limit = 50) {
  return db
    .select({
      id: payments.id,
      email: users.email,
      amountCents: payments.amountCents,
      status: payments.status,
      chargedOn: payments.chargedOn,
    })
    .from(payments)
    .innerJoin(users, eq(users.id, payments.userId))
    .orderBy(desc(payments.chargedOn), desc(payments.id))
    .limit(limit);
}

/** Situação de cobrança por conta (para o selo na lista de usuários). */
export async function subscriptionStatusByUser(): Promise<Map<number, { status: SubscriptionStatus; paidUntil: string | null }>> {
  const rows = await db
    .select({ userId: subscriptions.userId, status: subscriptions.status, paidUntil: subscriptions.paidUntil })
    .from(subscriptions);
  return new Map(rows.map((r) => [r.userId, { status: r.status, paidUntil: r.paidUntil }]));
}
