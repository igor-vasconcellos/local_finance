import "server-only";
import { lt, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@/db/client";
import { rateLimits } from "@/db/schema";

/**
 * Limite de tentativas por chave numa janela fixa (ex.: 10 logins por IP a cada 15 min).
 * Guardado no Postgres: vale para todas as instâncias da Vercel ao mesmo tempo.
 */
export async function hitRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
  now: Date = new Date(),
): Promise<{ ok: boolean; retryAfterSeconds: number }> {
  const nowIso = now.toISOString();
  const expired = new Date(now.getTime() - windowSeconds * 1000).toISOString();
  const [row] = await db
    .insert(rateLimits)
    .values({ key, count: 1, windowStart: nowIso })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`case when ${rateLimits.windowStart} < ${expired} then 1 else ${rateLimits.count} + 1 end`,
        windowStart: sql`case when ${rateLimits.windowStart} < ${expired} then ${nowIso} else ${rateLimits.windowStart} end`,
      },
    })
    .returning({ count: rateLimits.count, windowStart: rateLimits.windowStart });
  const ends = new Date(row.windowStart).getTime() + windowSeconds * 1000;
  return { ok: row.count <= limit, retryAfterSeconds: Math.max(1, Math.ceil((ends - now.getTime()) / 1000)) };
}

/** Faxina das janelas antigas (roda na tarefa diária). */
export async function purgeRateLimits(now: Date = new Date()) {
  await db.delete(rateLimits).where(lt(rateLimits.windowStart, new Date(now.getTime() - 86_400_000).toISOString()));
}

/** IP de quem fez a requisição (na Vercel, o primeiro de x-forwarded-for é o do cliente). */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "desconhecido";
}

/** Regras por ação: [tentativas, janela em segundos]. */
export const LIMITS = {
  login: [20, 15 * 60],
  signup: [5, 60 * 60],
  forgot: [5, 15 * 60],
  code: [30, 15 * 60], // verificar código / reenviar
} as const satisfies Record<string, readonly [number, number]>;

/** Aplica o limite da ação para o IP atual. Devolve a mensagem de erro, ou null se pode seguir. */
export async function limitByIp(action: keyof typeof LIMITS): Promise<string | null> {
  const [limit, window] = LIMITS[action];
  const r = await hitRateLimit(`${action}:ip:${await clientIp()}`, limit, window);
  if (r.ok) return null;
  const minutes = Math.ceil(r.retryAfterSeconds / 60);
  return `Muitas tentativas seguidas. Tente de novo em ${minutes} minuto${minutes === 1 ? "" : "s"}.`;
}
