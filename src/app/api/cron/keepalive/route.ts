import { lt, or, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { authChallenges, sessions } from "@/db/schema";
import { env } from "@/env";
import { purgeRateLimits } from "@/server/auth/rate-limit";
import { purgeOldSecurityData } from "@/server/security/events";

/**
 * Tarefa diária (Vercel Cron, ver vercel.json):
 * - mantém o projeto gratuito do Supabase ativo (ele pausa após 7 dias sem uso);
 * - faz a faxina de sessões vencidas, códigos antigos e contadores de tentativas;
 * - apaga eventos de segurança e auditoria com mais de 12 meses (LGPD).
 * Com CRON_SECRET definido, só aceita "Authorization: Bearer <CRON_SECRET>" (a Vercel envia sozinha).
 */
export async function GET(request: Request) {
  // Sem CRON_SECRET configurado a rota continua inofensiva (só um "select 1" e faxina),
  // mas com ele só a Vercel consegue chamá-la.
  if (env.CRON_SECRET && request.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) {
    return new Response("Não autorizado", { status: 401 });
  }
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 86_400_000).toISOString();
  await db.execute(sql`select 1`);
  await db.delete(sessions).where(or(lt(sessions.expiresAt, now.toISOString()), isNotNull(sessions.revokedAt)));
  await db.delete(authChallenges).where(lt(authChallenges.createdAt, dayAgo));
  await purgeRateLimits(now);
  await purgeOldSecurityData(now);
  return Response.json({ ok: true, at: now.toISOString() });
}
