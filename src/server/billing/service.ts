import "server-only";
import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { first } from "@/db/query";
import { paymentEvents, payments, subscriptions, users, type PaymentStatus, type SubscriptionStatus } from "@/db/schema";
import { env } from "@/env";
import { todayISO } from "@/lib/dates";
import { sendUserNotice } from "@/lib/mail/mailer";
import { addDaysISO, addOneMonthISO, type Access } from "@/server/access/policy";
import { hitRateLimit } from "@/server/auth/rate-limit";
import {
  cancelPreapproval,
  createPreapproval,
  getAuthorizedPayment,
  getPayment,
  getPreapproval,
  searchAuthorizedPayments,
  type MpAuthorizedPayment,
  type MpPreapproval,
} from "./mercadopago";

export class BillingError extends Error {}

export type SubscriptionRow = typeof subscriptions.$inferSelect;

export async function getSubscription(uid: number): Promise<SubscriptionRow | undefined> {
  return db.select().from(subscriptions).where(eq(subscriptions.userId, uid)).then(first);
}

export async function listPayments(uid: number, limit = 24) {
  return db
    .select({
      id: payments.id,
      amountCents: payments.amountCents,
      status: payments.status,
      chargedOn: payments.chargedOn,
    })
    .from(payments)
    .where(eq(payments.userId, uid))
    .orderBy(desc(payments.chargedOn), desc(payments.id))
    .limit(limit);
}

const SUB_STATUS: Record<string, SubscriptionStatus> = {
  pending: "pending",
  authorized: "authorized",
  paused: "paused",
  cancelled: "cancelled",
};

function userIdFromReference(ref: string | null | undefined): number | null {
  const m = /^user:(\d+)$/.exec(ref ?? "");
  return m ? Number(m[1]) : null;
}

/** Só aceita mandar o usuário para o checkout do próprio Mercado Pago (ou o servidor falso dos testes). */
export function isTrustedCheckoutUrl(url: string | undefined): url is string {
  if (!url) return false;
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    // Servidor falso dos testes locais (MP_API_BASE trocado; proibido na produção pelo env.ts).
    const fake = env.MP_API_BASE !== "https://api.mercadopago.com" ? new URL(env.MP_API_BASE) : null;
    if (fake && u.host === fake.host && u.protocol === fake.protocol) return true;
    if (u.protocol !== "https:") return false;
    const mpHosts = ["mercadopago.com.br", "mercadopago.com", "mercadolivre.com.br", "mercadolibre.com"];
    return mpHosts.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

/**
 * Inicia (ou retoma) a assinatura e devolve o link do checkout do Mercado Pago.
 * A primeira cobrança fica para o dia seguinte ao fim do teste grátis (ou ao fim
 * do período já pago), então assinar durante o teste não encurta os dias grátis.
 */
export async function startCheckout(uid: number, access: Access, now: Date = new Date()): Promise<string> {
  if (!env.BILLING_ENABLED) throw new BillingError("A assinatura ainda não está disponível.");
  if (!access.billing) throw new BillingError("Sua conta não precisa de assinatura.");
  if (access.blocked) throw new BillingError("Conta bloqueada: fale com o suporte.");

  const user = await db.select({ email: users.email }).from(users).where(eq(users.id, uid)).then(first);
  if (!user) throw new BillingError("Conta não encontrada.");
  const current = await getSubscription(uid);

  if (current?.status === "authorized") throw new BillingError("Sua assinatura já está ativa.");

  // Checkout já iniciado e ainda pendente no MP: reaproveita o mesmo link.
  if (current?.providerId && current.status === "pending" && isTrustedCheckoutUrl(current.checkoutUrl ?? undefined)) {
    try {
      const remote = await getPreapproval(current.providerId);
      if (remote.status === "pending" && isTrustedCheckoutUrl(remote.init_point)) return remote.init_point;
    } catch {
      // Se o MP não responder, cria uma nova logo abaixo.
    }
  }

  const today = todayISO(now);
  const candidates = [addDaysISO(access.billing.trialLastDay, 1), current?.paidUntil ?? null].filter(
    (d): d is string => d != null && d > today,
  );
  const startDate = candidates.sort().at(-1) ?? null;

  const remote = await createPreapproval({
    userId: uid,
    // Homologação: o MP de teste exige um comprador de teste como pagador.
    payerEmail: env.MP_TEST_PAYER_EMAIL ?? user.email,
    priceCents: env.BILLING_PRICE_CENTS,
    startDate,
    backUrl: `${env.APP_URL}/assinatura/retorno`,
    idempotencyKey: randomUUID(),
  });
  if (!remote.id || !isTrustedCheckoutUrl(remote.init_point)) {
    throw new BillingError("O Mercado Pago não devolveu um link de pagamento válido.");
  }

  await db
    .insert(subscriptions)
    .values({
      userId: uid,
      providerId: remote.id,
      status: SUB_STATUS[remote.status] ?? "pending",
      checkoutUrl: remote.init_point,
      priceCents: env.BILLING_PRICE_CENTS,
      nextPaymentDate: startDate,
    })
    .onConflictDoUpdate({
      target: subscriptions.userId,
      set: {
        providerId: remote.id,
        status: SUB_STATUS[remote.status] ?? "pending",
        checkoutUrl: remote.init_point,
        priceCents: env.BILLING_PRICE_CENTS,
        nextPaymentDate: startDate,
        cancelledAt: null,
      },
    });
  return remote.init_point;
}

/** Cancela a renovação. O acesso já pago continua até o fim do período. */
export async function cancelSubscription(uid: number): Promise<void> {
  const sub = await getSubscription(uid);
  if (!sub?.providerId || sub.status === "cancelled") throw new BillingError("Não há assinatura ativa para cancelar.");
  const remote = await cancelPreapproval(sub.providerId);
  await db
    .update(subscriptions)
    .set({ status: SUB_STATUS[remote.status] ?? "cancelled", cancelledAt: new Date().toISOString(), nextPaymentDate: null })
    .where(eq(subscriptions.id, sub.id));
}

// ------------------------------------------------------ sincronização --

function mapPaymentStatus(ap: MpAuthorizedPayment): PaymentStatus {
  const p = ap.payment?.status;
  if (p === "approved" || p === "authorized") return "approved";
  if (p === "rejected") return "rejected";
  if (p === "refunded" || p === "charged_back") return "refunded";
  if (p === "cancelled") return "cancelled";
  if (ap.status === "cancelled") return "cancelled";
  return "pending";
}

/** "Pago até" = (dia da última cobrança aprovada) + 1 mês. Derivado: reprocessar não muda nada. */
async function recomputePaidUntil(subId: number, uid: number): Promise<string | null> {
  const last = await db
    .select({ day: sql<string | null>`max(${payments.chargedOn})` })
    .from(payments)
    .where(and(eq(payments.userId, uid), eq(payments.status, "approved")))
    .then(first);
  const paidUntil = last?.day ? addOneMonthISO(last.day) : null;
  await db.update(subscriptions).set({ paidUntil }).where(eq(subscriptions.id, subId));
  return paidUntil;
}

async function notifyFailure(uid: number, email: string) {
  // No máximo um aviso por dia por conta (o MP tenta de novo algumas vezes).
  const { ok } = await hitRateLimit(`billing-fail:${uid}`, 1, 86_400);
  if (!ok) return;
  await sendUserNotice({
    to: email,
    subject: "não conseguimos cobrar sua assinatura",
    text: [
      "Olá!",
      "",
      "A cobrança mensal da sua assinatura do BeaconFinance não foi aprovada.",
      `O Mercado Pago vai tentar de novo nos próximos dias. Seu acesso continua liberado por ${env.BILLING_GRACE_DAYS} dias.`,
      `Para trocar a forma de pagamento, acesse ${env.APP_URL}/configuracoes#assinatura.`,
      "",
      "Se você já resolveu, pode ignorar este e-mail.",
    ].join("\n"),
  });
}

/** Grava uma cobrança mensal vinda do MP (sempre consultada na API, nunca do corpo do webhook). */
export async function applyAuthorizedPayment(ap: MpAuthorizedPayment): Promise<"ok" | "unknown_subscription"> {
  const sub = await db
    .select({ id: subscriptions.id, userId: subscriptions.userId, email: users.email })
    .from(subscriptions)
    .innerJoin(users, eq(users.id, subscriptions.userId))
    .where(eq(subscriptions.providerId, String(ap.preapproval_id)))
    .then(first);
  if (!sub) return "unknown_subscription";
  const refUser = userIdFromReference(ap.external_reference);
  if (refUser != null && refUser !== sub.userId) return "unknown_subscription";

  const status = mapPaymentStatus(ap);
  const when = ap.debit_date ?? ap.date_created ?? new Date().toISOString();
  const chargedOn = todayISO(new Date(when));
  const amountCents = Math.round((ap.transaction_amount ?? 0) * 100);

  const before = await db
    .select({ status: payments.status, detail: payments.statusDetail })
    .from(payments)
    .where(eq(payments.providerId, String(ap.id)))
    .then(first);
  const detail = ap.payment?.status_detail ?? ap.status ?? null;

  await db
    .insert(payments)
    .values({
      userId: sub.userId,
      providerId: String(ap.id),
      subscriptionProviderId: String(ap.preapproval_id),
      amountCents,
      status,
      statusDetail: detail,
      chargedOn,
    })
    .onConflictDoUpdate({
      target: payments.providerId,
      set: { status, statusDetail: detail, amountCents, chargedOn },
    });

  await recomputePaidUntil(sub.id, sub.userId);

  // Avisa só na mudança para "falhou" (reprocessar a mesma cobrança não manda outro e-mail).
  const failed = status === "rejected" || ap.status === "recycling";
  const changed = !before || before.status !== status || before.detail !== detail;
  if (failed && changed) {
    await db.update(subscriptions).set({ lastFailureAt: new Date().toISOString() }).where(eq(subscriptions.id, sub.id));
    await notifyFailure(sub.userId, sub.email);
  }
  return "ok";
}

/** Atualiza status da assinatura e todas as cobranças a partir da API do MP. */
export async function syncSubscription(providerId: string): Promise<"ok" | "unknown_subscription"> {
  const remote: MpPreapproval = await getPreapproval(providerId);
  const sub = await db.select().from(subscriptions).where(eq(subscriptions.providerId, providerId)).then(first);
  if (!sub) return "unknown_subscription";
  const refUser = userIdFromReference(remote.external_reference);
  if (refUser != null && refUser !== sub.userId) return "unknown_subscription";

  const status = SUB_STATUS[remote.status] ?? sub.status;
  await db
    .update(subscriptions)
    .set({
      status,
      nextPaymentDate: remote.next_payment_date ? todayISO(new Date(remote.next_payment_date)) : null,
      cancelledAt: status === "cancelled" ? (sub.cancelledAt ?? new Date().toISOString()) : sub.cancelledAt,
      lastSyncedAt: new Date().toISOString(),
    })
    .where(eq(subscriptions.id, sub.id));

  if (status !== "pending") {
    const list = await searchAuthorizedPayments(providerId);
    for (const ap of list) await applyAuthorizedPayment({ ...ap, preapproval_id: providerId });
  }
  await recomputePaidUntil(sub.id, sub.userId);
  return "ok";
}

/** Sincroniza a assinatura da conta (página de retorno do checkout). */
export async function syncUserSubscription(uid: number): Promise<void> {
  const sub = await getSubscription(uid);
  if (sub?.providerId) await syncSubscription(sub.providerId);
}

/** Conferência diária: tudo o que não está cancelado há muito tempo é sincronizado com o MP. */
export async function reconcileSubscriptions(limit = 500): Promise<{ checked: number; failed: number }> {
  if (!env.MP_ACCESS_TOKEN) return { checked: 0, failed: 0 };
  const rows = await db
    .select({ providerId: subscriptions.providerId, status: subscriptions.status, cancelledAt: subscriptions.cancelledAt })
    .from(subscriptions)
    .where(and(isNotNull(subscriptions.providerId), inArray(subscriptions.status, ["pending", "authorized", "paused", "cancelled"])))
    .limit(limit);
  const monthAgo = new Date(Date.now() - 31 * 86_400_000).toISOString();
  let checked = 0;
  let failed = 0;
  for (const r of rows) {
    if (r.status === "cancelled" && r.cancelledAt && r.cancelledAt < monthAgo) continue;
    try {
      await syncSubscription(r.providerId!);
      checked++;
    } catch (error) {
      failed++;
      console.error("[billing] falha ao conferir assinatura:", error instanceof Error ? error.message : error);
    }
  }
  return { checked, failed };
}

// ------------------------------------------------------------- webhook --

export type WebhookTopic = "subscription_preapproval" | "subscription_authorized_payment" | "payment";

export function normalizeTopic(type: string | null | undefined): WebhookTopic | null {
  if (type === "subscription_preapproval" || type === "preapproval") return "subscription_preapproval";
  if (type === "subscription_authorized_payment" || type === "authorized_payment") return "subscription_authorized_payment";
  if (type === "payment") return "payment";
  return null;
}

/**
 * Processa uma notificação JÁ com assinatura verificada. Idempotente: a mesma
 * notificação processada com sucesso não é refeita. O estado é sempre buscado na
 * API do MP (o corpo da notificação não é confiável para valores ou status).
 */
export async function handleWebhook(params: { topic: WebhookTopic; resourceId: string; notificationId: string }) {
  const { topic, resourceId, notificationId } = params;
  const eventKey = `${topic}:${resourceId}:${notificationId}`;
  const seen = await db
    .select({ outcome: paymentEvents.outcome })
    .from(paymentEvents)
    .where(eq(paymentEvents.eventKey, eventKey))
    .then(first);
  if (seen && seen.outcome !== "failed") return { duplicate: true, outcome: seen.outcome };

  let outcome: "processed" | "ignored" | "failed" = "processed";
  try {
    if (topic === "subscription_preapproval") {
      outcome = (await syncSubscription(resourceId)) === "ok" ? "processed" : "ignored";
    } else if (topic === "subscription_authorized_payment") {
      const ap = await getAuthorizedPayment(resourceId);
      outcome = (await applyAuthorizedPayment(ap)) === "ok" ? "processed" : "ignored";
    } else {
      // Pagamento avulso: só serve para disparar a conferência da assinatura da conta.
      const p = await getPayment(resourceId);
      const uid = userIdFromReference(p.external_reference);
      const sub = uid ? await getSubscription(uid) : undefined;
      if (sub?.providerId) await syncSubscription(sub.providerId);
      else outcome = "ignored";
    }
  } catch (error) {
    outcome = "failed";
    console.error("[billing] falha ao processar webhook:", topic, error instanceof Error ? error.message : error);
  }

  await db
    .insert(paymentEvents)
    .values({ eventKey, topic, resourceId, outcome })
    .onConflictDoUpdate({ target: paymentEvents.eventKey, set: { outcome } });
  return { duplicate: false, outcome };
}
