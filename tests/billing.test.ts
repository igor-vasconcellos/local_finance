import { createHmac } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db/client";
import { paymentEvents, payments, subscriptions, users } from "@/db/schema";
import { env } from "@/env";
import { todayISO } from "@/lib/dates";
import {
  addOneMonthISO,
  resolveAccess,
  resolveBilling,
  type AccessUser,
  type BillingConfig,
} from "@/server/access/policy";
import { getAccessForUser } from "@/server/access/service";
import { verifyWebhookSignature } from "@/server/billing/mercadopago";
import {
  BillingError,
  cancelSubscription,
  handleWebhook,
  isTrustedCheckoutUrl,
  reconcileSubscriptions,
  startCheckout,
  syncSubscription,
} from "@/server/billing/service";
import { freshUser } from "./helpers/user";

const CONFIG: BillingConfig = { enabled: true, startDate: null, trialDays: 7, graceDays: 3 };

describe("regra de cobrança (pura)", () => {
  const created = "2026-11-01T15:00:00.000Z";

  it("7 dias grátis contando o dia do cadastro; depois só consulta", () => {
    const input = { config: CONFIG, userCreatedAt: created, subscription: null };
    expect(resolveBilling(input, "2026-11-01").state).toBe("trial");
    expect(resolveBilling(input, "2026-11-07")).toMatchObject({ state: "trial", trialLastDay: "2026-11-07" });
    expect(resolveBilling(input, "2026-11-08").state).toBe("expired");
  });

  it("contas antigas ganham o teste a partir do dia em que a cobrança foi ligada", () => {
    const input = { config: { ...CONFIG, startDate: "2026-12-10" }, userCreatedAt: "2026-01-05T10:00:00Z", subscription: null };
    expect(resolveBilling(input, "2026-12-16").state).toBe("trial");
    expect(resolveBilling(input, "2026-12-17").state).toBe("expired");
  });

  it("assinatura ativa sem cobrança ainda: 3 dias de tolerância após o teste", () => {
    const sub = { status: "authorized" as const, paidUntil: null };
    const input = { config: CONFIG, userCreatedAt: created, subscription: sub };
    expect(resolveBilling(input, "2026-11-07").state).toBe("trial");
    expect(resolveBilling(input, "2026-11-08").state).toBe("grace");
    expect(resolveBilling(input, "2026-11-10")).toMatchObject({ state: "grace", accessLastDay: "2026-11-10" });
    expect(resolveBilling(input, "2026-11-11").state).toBe("expired");
  });

  it("pago até (exclusivo), tolerância só com renovação ligada", () => {
    const paid = { config: CONFIG, userCreatedAt: created, subscription: { status: "authorized" as const, paidUntil: "2026-12-08" } };
    expect(resolveBilling(paid, "2026-12-07").state).toBe("active");
    expect(resolveBilling(paid, "2026-12-08").state).toBe("grace");
    expect(resolveBilling(paid, "2026-12-11").state).toBe("expired");

    const cancelled = { ...paid, subscription: { status: "cancelled" as const, paidUntil: "2026-12-08" } };
    expect(resolveBilling(cancelled, "2026-12-07")).toMatchObject({ state: "active", accessLastDay: "2026-12-07" });
    expect(resolveBilling(cancelled, "2026-12-08").state).toBe("expired");
  });

  it("mês seguinte respeita o fim do mês", () => {
    expect(addOneMonthISO("2026-01-31")).toBe("2026-02-28");
    expect(addOneMonthISO("2028-01-31")).toBe("2028-02-29");
    expect(addOneMonthISO("2026-12-15")).toBe("2027-01-15");
  });

  const user: AccessUser = {
    email: "ana@example.com",
    emailVerifiedAt: "2026-11-01T00:00:00Z",
    blockedAt: null,
    blockedReason: null,
    courtesyAt: null,
    courtesyUntil: null,
  };
  const expiredInput = { config: CONFIG, userCreatedAt: "2026-01-01T00:00:00Z", subscription: null };
  const now = new Date("2026-11-20T12:00:00Z");

  it("teste vencido = só consulta; admin, cortesia e cobrança desligada ficam isentos", () => {
    expect(resolveAccess(user, {}, [], now, expiredInput, "2026-11-20")).toMatchObject({ readOnly: true, billing: { state: "expired" } });
    expect(resolveAccess({ ...user, email: "admin@example.com" }, {}, ["admin@example.com"], now, expiredInput, "2026-11-20")).toMatchObject({
      readOnly: false,
      billing: null,
    });
    expect(resolveAccess({ ...user, courtesyAt: "x" }, {}, [], now, expiredInput, "2026-11-20")).toMatchObject({ readOnly: false, billing: null });
    const off = { ...expiredInput, config: { ...CONFIG, enabled: false } };
    expect(resolveAccess(user, {}, [], now, off, "2026-11-20")).toMatchObject({ readOnly: false, billing: null });
  });
});

// ----------------------------------------------------------- webhook --

function sign(dataId: string, requestId: string, ts: string, secret = "segredo-webhook-teste") {
  const v1 = createHmac("sha256", secret).update(`id:${dataId};request-id:${requestId};ts:${ts};`).digest("hex");
  return `ts=${ts},v1=${v1}`;
}

describe("assinatura do webhook", () => {
  const now = new Date("2026-11-20T12:00:00Z");
  const ts = String(now.getTime());
  const base = { requestId: "req-1", dataId: "abc123", secret: "segredo-webhook-teste", now };

  it("aceita a assinatura correta", () => {
    expect(verifyWebhookSignature({ ...base, signature: sign("abc123", "req-1", ts) })).toBe(true);
  });
  it("id em maiúsculas no manifesto vira minúsculas", () => {
    expect(verifyWebhookSignature({ ...base, dataId: "ABC123", signature: sign("abc123", "req-1", ts) })).toBe(true);
  });
  it("recusa segredo errado, outro recurso, outro request-id, cabeçalho malformado ou ausente", () => {
    expect(verifyWebhookSignature({ ...base, signature: sign("abc123", "req-1", ts, "outro") })).toBe(false);
    expect(verifyWebhookSignature({ ...base, dataId: "zzz", signature: sign("abc123", "req-1", ts) })).toBe(false);
    expect(verifyWebhookSignature({ ...base, requestId: "req-2", signature: sign("abc123", "req-1", ts) })).toBe(false);
    expect(verifyWebhookSignature({ ...base, signature: "ts=1,v1=nao-hex" })).toBe(false);
    expect(verifyWebhookSignature({ ...base, signature: null })).toBe(false);
  });
  it("recusa notificação antiga (repetição)", () => {
    const old = String(now.getTime() - 60 * 60 * 1000);
    expect(verifyWebhookSignature({ ...base, signature: sign("abc123", "req-1", old) })).toBe(false);
  });
});

// ------------------------------------------- serviço com MP simulado --

type FakeAp = Record<string, unknown>;
const mp = {
  preapprovals: new Map<string, Record<string, unknown>>(),
  authorized: new Map<string, FakeAp>(),
  created: [] as Record<string, unknown>[],
  seq: 0,
};

function fakeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = new URL(String(input));
  const method = init?.method ?? "GET";
  const json = (b: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(b), { status }));
  if (url.host !== "mp.test") return json({ message: "host" }, 500);
  if ((init?.headers as Record<string, string>)?.Authorization !== "Bearer TEST-token-falso") return json({}, 401);

  if (method === "POST" && url.pathname === "/preapproval") {
    const body = JSON.parse(String(init!.body));
    const id = `pre_${++mp.seq}`;
    const p = { id, status: "pending", init_point: `https://www.mercadopago.com.br/subscriptions/checkout?preapproval_id=${id}`, ...body };
    mp.created.push(body);
    mp.preapprovals.set(id, p);
    return json(p, 201);
  }
  const pre = /^\/preapproval\/(.+)$/.exec(url.pathname);
  if (pre) {
    const p = mp.preapprovals.get(pre[1]);
    if (!p) return json({ message: "not found" }, 404);
    if (method === "PUT") Object.assign(p, JSON.parse(String(init!.body)));
    return json(p);
  }
  if (url.pathname === "/authorized_payments/search") {
    // Como o MP real: "limit" acima do permitido é recusado.
    if (Number(url.searchParams.get("limit") ?? 0) > 50) return json({ message: "Invalid value for limit" }, 400);
    const pid = url.searchParams.get("preapproval_id");
    return json({ results: [...mp.authorized.values()].filter((a) => a.preapproval_id === pid) });
  }
  const ap = /^\/authorized_payments\/(.+)$/.exec(url.pathname);
  if (ap) return mp.authorized.has(ap[1]) ? json(mp.authorized.get(ap[1])) : json({}, 404);
  return json({ message: "rota" }, 404);
}

describe("assinatura com o Mercado Pago (simulado)", () => {
  let uid: number;
  const original = { enabled: env.BILLING_ENABLED, start: env.BILLING_START_DATE };

  beforeEach(async () => {
    uid = await freshUser("ana@example.com");
    mp.preapprovals.clear();
    mp.authorized.clear();
    mp.created = [];
    env.BILLING_ENABLED = true;
    env.BILLING_START_DATE = undefined;
    vi.stubGlobal("fetch", vi.fn(fakeFetch));
  });
  afterEach(() => {
    env.BILLING_ENABLED = original.enabled;
    env.BILLING_START_DATE = original.start;
    vi.unstubAllGlobals();
  });

  async function access(now = new Date()) {
    return (await getAccessForUser(uid, now))!;
  }

  it("checkout no teste: primeira cobrança só depois dos dias grátis; link é do MP", async () => {
    const url = await startCheckout(uid, await access());
    expect(isTrustedCheckoutUrl(url)).toBe(true);
    const body = mp.created[0] as { external_reference: string; auto_recurring: { start_date?: string; transaction_amount: number } };
    expect(body.external_reference).toBe(`user:${uid}`);
    expect(body.auto_recurring.transaction_amount).toBe(39);
    const trialEnd = (await access()).billing!.trialLastDay;
    expect(body.auto_recurring.start_date?.slice(0, 10)).toBe(
      new Date(Date.parse(`${trialEnd}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10),
    );
    const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, uid));
    expect(sub.status).toBe("pending");

    // Segundo clique reaproveita a mesma assinatura pendente.
    expect(await startCheckout(uid, await access())).toBe(url);
    expect(mp.created).toHaveLength(1);
  });

  it("recusa links que não são do Mercado Pago", () => {
    expect(isTrustedCheckoutUrl("https://evil.example/mercadopago.com.br")).toBe(false);
    expect(isTrustedCheckoutUrl("https://mercadopago.com.br.evil.example/x")).toBe(false);
    expect(isTrustedCheckoutUrl("javascript:alert(1)")).toBe(false);
    expect(isTrustedCheckoutUrl("https://www.mercadopago.com.br/subscriptions/checkout")).toBe(true);
  });

  it("cobrança desligada ou conta isenta não abre checkout", async () => {
    env.BILLING_ENABLED = false;
    await expect(startCheckout(uid, await access())).rejects.toBeInstanceOf(BillingError);
  });

  async function subscribedAndAuthorized() {
    // Conta antiga: teste já acabou.
    await db.update(users).set({ createdAt: "2026-01-01T12:00:00.000Z" }).where(eq(users.id, uid));
    const now = new Date();
    expect((await access(now)).readOnly).toBe(true);
    await startCheckout(uid, await access(now));
    const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, uid));
    mp.preapprovals.get(sub.providerId!)!.status = "authorized";
    mp.preapprovals.get(sub.providerId!)!.external_reference = `user:${uid}`;
    return sub.providerId!;
  }

  it("webhook de cobrança aprovada libera o acesso por 1 mês; repetição não duplica", async () => {
    const pid = await subscribedAndAuthorized();
    const today = new Date().toISOString();
    mp.authorized.set("9001", {
      id: 9001,
      preapproval_id: pid,
      status: "processed",
      transaction_amount: 39,
      debit_date: today,
      external_reference: `user:${uid}`,
      payment: { id: 1, status: "approved", status_detail: "accredited" },
    });
    const r1 = await handleWebhook({ topic: "subscription_authorized_payment", resourceId: "9001", notificationId: "n1" });
    expect(r1).toMatchObject({ duplicate: false, outcome: "processed" });
    const r2 = await handleWebhook({ topic: "subscription_authorized_payment", resourceId: "9001", notificationId: "n1" });
    expect(r2.duplicate).toBe(true);

    expect(await db.select().from(payments)).toHaveLength(1);
    const a = await access();
    expect(a.readOnly).toBe(false);
    expect(a.billing!.state).toBe("active");
    expect(a.billing!.paidUntil).toBe(addOneMonthISO(todayISO(new Date(today))));
    expect(await db.select().from(paymentEvents)).toHaveLength(1);
  });

  it("cobrança de outra conta (external_reference diferente) é ignorada", async () => {
    const pid = await subscribedAndAuthorized();
    mp.authorized.set("9002", {
      id: 9002,
      preapproval_id: pid,
      status: "processed",
      transaction_amount: 39,
      debit_date: new Date().toISOString(),
      external_reference: "user:999",
      payment: { status: "approved" },
    });
    const r = await handleWebhook({ topic: "subscription_authorized_payment", resourceId: "9002", notificationId: "n2" });
    expect(r.outcome).toBe("ignored");
    expect((await access()).readOnly).toBe(true);
  });

  it("cobrança recusada: avisa o usuário uma vez e entra em tolerância se a renovação segue", async () => {
    const pid = await subscribedAndAuthorized();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    mp.authorized.set("9003", {
      id: 9003,
      preapproval_id: pid,
      status: "recycling",
      transaction_amount: 39,
      debit_date: new Date().toISOString(),
      payment: { status: "rejected", status_detail: "cc_rejected_insufficient_amount" },
    });
    await handleWebhook({ topic: "subscription_authorized_payment", resourceId: "9003", notificationId: "n3" });
    await syncSubscription(pid); // reprocessar não manda outro aviso
    const notices = log.mock.calls.filter((c) => String(c[0]).includes("não conseguimos cobrar"));
    expect(notices).toHaveLength(1);
    log.mockRestore();
    const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, uid));
    expect(sub.lastFailureAt).not.toBeNull();
    expect(sub.paidUntil).toBeNull();
  });

  it("conferência diária pega cobranças cujo webhook se perdeu", async () => {
    const pid = await subscribedAndAuthorized();
    mp.authorized.set("9004", {
      id: 9004,
      preapproval_id: pid,
      status: "processed",
      transaction_amount: 39,
      debit_date: new Date().toISOString(),
      payment: { status: "approved" },
    });
    expect(await reconcileSubscriptions()).toEqual({ checked: 1, failed: 0 });
    expect((await access()).billing!.state).toBe("active");
  });

  it("cancelar mantém o período pago e desliga a renovação", async () => {
    const pid = await subscribedAndAuthorized();
    mp.authorized.set("9005", {
      id: 9005,
      preapproval_id: pid,
      status: "processed",
      transaction_amount: 39,
      debit_date: new Date().toISOString(),
      payment: { status: "approved" },
    });
    await syncSubscription(pid);
    await cancelSubscription(uid);
    expect(mp.preapprovals.get(pid)!.status).toBe("cancelled");
    const a = await access();
    expect(a.billing).toMatchObject({ state: "active", subscriptionStatus: "cancelled" });
    await expect(cancelSubscription(uid)).rejects.toBeInstanceOf(BillingError);
  });

  it("falha na API do MP marca o evento como falho para o MP tentar de novo", async () => {
    const r = await handleWebhook({ topic: "subscription_authorized_payment", resourceId: "nao-existe", notificationId: "n9" });
    expect(r.outcome).toBe("failed");
    const again = await handleWebhook({ topic: "subscription_authorized_payment", resourceId: "nao-existe", notificationId: "n9" });
    expect(again.duplicate).toBe(false);
  });
});
