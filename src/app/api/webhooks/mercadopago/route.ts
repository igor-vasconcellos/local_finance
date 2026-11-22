import { env } from "@/env";
import { hitRateLimit } from "@/server/auth/rate-limit";
import { handleWebhook, normalizeTopic } from "@/server/billing/service";
import { verifyWebhookSignature } from "@/server/billing/mercadopago";
import { logSecurityEvent } from "@/server/security/events";

/**
 * Notificações do Mercado Pago (assinaturas e cobranças).
 * 1) confere a assinatura HMAC (x-signature) com o segredo do painel do MP;
 * 2) registra a notificação (idempotência);
 * 3) busca o estado real na API do MP — nada do corpo é usado como verdade.
 * Respostas: 200 processado/ignorado · 401 assinatura inválida · 500 falha (o MP tenta de novo).
 */
export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "?";
  const limit = await hitRateLimit(`mp-webhook:${ip}`, 120, 60);
  if (!limit.ok) return new Response("Muitas requisições", { status: 429 });

  if (!env.MP_WEBHOOK_SECRET || !env.MP_ACCESS_TOKEN) return new Response("Não configurado", { status: 503 });

  const url = new URL(request.url);
  let body: { id?: unknown; type?: unknown; topic?: unknown; data?: { id?: unknown } } = {};
  try {
    const raw = await request.text();
    if (raw.length > 20_000) return new Response("Corpo grande demais", { status: 413 });
    body = raw ? JSON.parse(raw) : {};
  } catch {
    body = {};
  }

  const dataId = url.searchParams.get("data.id") ?? url.searchParams.get("id") ?? (body.data?.id != null ? String(body.data.id) : null);
  const topic = normalizeTopic(url.searchParams.get("type") ?? url.searchParams.get("topic") ?? (typeof body.type === "string" ? body.type : null));

  const valid = verifyWebhookSignature({
    signature: request.headers.get("x-signature"),
    requestId: request.headers.get("x-request-id"),
    dataId,
    secret: env.MP_WEBHOOK_SECRET,
  });
  if (!valid) {
    await logSecurityEvent({ event: "webhook_rejected", details: { topic: topic ?? "?", reason: "assinatura" } });
    return new Response("Assinatura inválida", { status: 401 });
  }
  if (!topic || !dataId || !/^[\w-]{1,64}$/.test(dataId)) return Response.json({ ok: true, ignored: true });

  const notificationId = body.id != null ? String(body.id).slice(0, 64) : request.headers.get("x-request-id")?.slice(0, 64) ?? "-";
  const result = await handleWebhook({ topic, resourceId: dataId, notificationId });
  if (result.outcome === "failed") return new Response("Falha temporária", { status: 500 });
  return Response.json({ ok: true, ...result });
}
