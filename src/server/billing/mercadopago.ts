import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/env";

/**
 * Cliente mínimo da API do Mercado Pago (assinaturas / preapproval).
 * - Nunca recebe nem guarda dados de cartão: o pagamento acontece no checkout do MP.
 * - O token só sai do servidor no cabeçalho Authorization; nunca vai para logs.
 */

export class MercadoPagoError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "MercadoPagoError";
  }
}

export type MpPreapproval = {
  id: string;
  status: "pending" | "authorized" | "paused" | "cancelled";
  init_point?: string;
  external_reference?: string;
  payer_email?: string;
  next_payment_date?: string | null;
  auto_recurring?: { transaction_amount?: number; currency_id?: string };
};

export type MpAuthorizedPayment = {
  id: number | string;
  preapproval_id: string;
  status: string; // scheduled | processed | recycling | cancelled
  transaction_amount?: number;
  currency_id?: string;
  date_created?: string;
  debit_date?: string | null;
  last_modified?: string;
  external_reference?: string;
  payment?: { id?: number | string; status?: string; status_detail?: string } | null;
};

async function call<T>(method: "GET" | "POST" | "PUT", path: string, body?: unknown, idempotencyKey?: string): Promise<T> {
  if (!env.MP_ACCESS_TOKEN) throw new MercadoPagoError("Mercado Pago não configurado.", 0);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${env.MP_ACCESS_TOKEN}`,
    Accept: "application/json",
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (idempotencyKey) headers["X-Idempotency-Key"] = idempotencyKey;

  let res: Response;
  try {
    res = await fetch(`${env.MP_API_BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
  } catch (error) {
    throw new MercadoPagoError(`Mercado Pago indisponível (${error instanceof Error ? error.name : "erro"}).`, 0);
  }
  if (!res.ok) {
    // Só o código e a mensagem curta do MP — nunca o token nem dados do pagador.
    let detail = "";
    try {
      const j = (await res.json()) as { message?: string };
      detail = typeof j.message === "string" ? j.message.slice(0, 200) : "";
    } catch {}
    throw new MercadoPagoError(`Mercado Pago respondeu ${res.status}${detail ? `: ${detail}` : ""}`, res.status);
  }
  return (await res.json()) as T;
}

/** Cria a assinatura mensal (status pending: o usuário escolhe o meio de pagamento no checkout). */
export function createPreapproval(params: {
  userId: number;
  payerEmail: string;
  priceCents: number;
  /** Primeira cobrança neste dia (fim do teste grátis). Vazio = já. */
  startDate?: string | null;
  backUrl: string;
  idempotencyKey: string;
}): Promise<MpPreapproval> {
  return call<MpPreapproval>(
    "POST",
    "/preapproval",
    {
      reason: "BeaconFinance — assinatura mensal",
      external_reference: `user:${params.userId}`,
      payer_email: params.payerEmail,
      back_url: params.backUrl,
      status: "pending",
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        transaction_amount: params.priceCents / 100,
        currency_id: "BRL",
        ...(params.startDate ? { start_date: `${params.startDate}T12:00:00.000-03:00` } : {}),
      },
    },
    params.idempotencyKey,
  );
}

export function getPreapproval(id: string): Promise<MpPreapproval> {
  return call<MpPreapproval>("GET", `/preapproval/${encodeURIComponent(id)}`);
}

export function cancelPreapproval(id: string): Promise<MpPreapproval> {
  return call<MpPreapproval>("PUT", `/preapproval/${encodeURIComponent(id)}`, { status: "cancelled" });
}

export function getAuthorizedPayment(id: string): Promise<MpAuthorizedPayment> {
  return call<MpAuthorizedPayment>("GET", `/authorized_payments/${encodeURIComponent(id)}`);
}

/** Todas as cobranças da assinatura, página por página (tamanho padrão do MP; "limit" alto é recusado). */
export async function searchAuthorizedPayments(preapprovalId: string): Promise<MpAuthorizedPayment[]> {
  const all: MpAuthorizedPayment[] = [];
  for (let page = 0; page < 20; page++) {
    const r = await call<{ results?: MpAuthorizedPayment[]; paging?: { total?: number } }>(
      "GET",
      `/authorized_payments/search?preapproval_id=${encodeURIComponent(preapprovalId)}&offset=${all.length}`,
    );
    const results = Array.isArray(r.results) ? r.results : [];
    all.push(...results);
    const total = r.paging?.total ?? all.length;
    if (results.length === 0 || all.length >= total) break;
  }
  return all;
}

export type MpPayment = { id: number | string; status?: string; external_reference?: string | null };

export function getPayment(id: string): Promise<MpPayment> {
  return call<MpPayment>("GET", `/v1/payments/${encodeURIComponent(id)}`);
}

// ---------------------------------------------------------------- webhook --

/**
 * Confere o cabeçalho x-signature ("ts=…,v1=…") do Mercado Pago:
 * HMAC-SHA256(secret, "id:<data.id>;request-id:<x-request-id>;ts:<ts>;") em hex.
 * Rejeita assinaturas fora da janela de tempo (repetição de notificações antigas).
 */
export function verifyWebhookSignature(params: {
  signature: string | null;
  requestId: string | null;
  dataId: string | null;
  secret: string;
  now?: Date;
  toleranceSeconds?: number;
}): boolean {
  const { signature, requestId, dataId, secret } = params;
  if (!signature || !dataId || !secret) return false;
  const parts = Object.fromEntries(
    signature.split(",").map((p) => {
      const i = p.indexOf("=");
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    }),
  );
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1 || !/^\d+$/.test(ts) || !/^[0-9a-f]{64}$/i.test(v1)) return false;

  // ts vem em milissegundos (às vezes segundos): normaliza.
  const tsMs = ts.length > 11 ? Number(ts) : Number(ts) * 1000;
  const tolerance = (params.toleranceSeconds ?? 15 * 60) * 1000;
  const now = (params.now ?? new Date()).getTime();
  if (Math.abs(now - tsMs) > tolerance) return false;

  let manifest = `id:${dataId.toLowerCase()};`;
  if (requestId) manifest += `request-id:${requestId};`;
  manifest += `ts:${ts};`;
  const expected = createHmac("sha256", secret).update(manifest).digest();
  const given = Buffer.from(v1, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}
