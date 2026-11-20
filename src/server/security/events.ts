import "server-only";
import { and, count, eq, gte, ne, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@/db/client";
import { first } from "@/db/query";
import { securityEvents, users } from "@/db/schema";
import type { SecurityEvent } from "@/db/schema/security";
import { env } from "@/env";
import { sendAdminAlert } from "@/lib/mail/mailer";
import { maskEmail } from "@/lib/mask";
import { hitRateLimit } from "@/server/auth/rate-limit";
import { isAdminUser } from "@/server/access/policy";

/** Limites dos alertas automáticos. */
export const ALERT_FAILED_LOGINS = 10;
export const ALERT_WINDOW_MINUTES = 15;

type Origin = { ip: string | null; userAgent: string | null };

async function requestOrigin(): Promise<Origin> {
  try {
    const h = await headers();
    return {
      ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null,
      userAgent: h.get("user-agent")?.slice(0, 300) ?? null,
    };
  } catch {
    return { ip: null, userAgent: null }; // fora de uma requisição (testes, scripts)
  }
}

export type LogInput = {
  event: SecurityEvent;
  userId?: number | null;
  email?: string | null;
  details?: Record<string, unknown>;
  origin?: Origin;
  now?: Date;
};

/**
 * Registra um evento de segurança e dispara alertas quando for o caso. Nunca lança
 * erro: falhar ao registrar não pode impedir um login ou uma exportação.
 */
export async function logSecurityEvent(input: LogInput): Promise<void> {
  try {
    const origin = input.origin ?? (await requestOrigin());
    const email = input.email?.trim().toLowerCase().slice(0, 254) || null;
    let userId = input.userId ?? null;
    if (userId == null && email) {
      userId = (await db.select({ id: users.id }).from(users).where(eq(users.email, email)).then(first))?.id ?? null;
    }
    const now = input.now ?? new Date();
    const [row] = await db
      .insert(securityEvents)
      .values({
        userId,
        email,
        event: input.event,
        ip: origin.ip?.slice(0, 64) ?? null,
        userAgent: origin.userAgent,
        details: input.details ? JSON.stringify(input.details).slice(0, 1000) : null,
        createdAt: now.toISOString(),
      })
      .returning({ id: securityEvents.id });
    await maybeAlert({ ...input, userId, email }, origin, now, row.id);
  } catch (error) {
    console.error("[segurança] Falha ao registrar evento:", error instanceof Error ? error.message : error);
  }
}

/** Dispara no máximo 1 alerta de cada tipo, por conta, por hora. */
async function throttled(key: string) {
  return (await hitRateLimit(`alert:${key}`, 1, 60 * 60)).ok;
}

async function maybeAlert(
  input: LogInput & { email: string | null; userId: number | null },
  origin: Origin,
  now: Date,
  eventId: number,
) {
  const admins = env.ADMIN_EMAILS;
  if (admins.length === 0) return;
  const who = input.email ? maskEmail(input.email) : `conta #${input.userId}`;
  const where = `IP ${origin.ip ?? "desconhecido"} · ${origin.userAgent ?? "aparelho desconhecido"}`;
  const when = now.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

  if (input.event === "login_failed" && input.email) {
    const since = new Date(now.getTime() - ALERT_WINDOW_MINUTES * 60_000).toISOString();
    const [row] = await db
      .select({ n: count() })
      .from(securityEvents)
      .where(
        and(
          eq(securityEvents.event, "login_failed"),
          eq(securityEvents.email, input.email),
          gte(securityEvents.createdAt, since),
        ),
      );
    if (row.n >= ALERT_FAILED_LOGINS && (await throttled(`fails:${input.email}`))) {
      await sendAdminAlert({
        to: admins,
        subject: "Muitas tentativas de login com senha errada",
        text: `${row.n} tentativas com senha errada para ${who} nos últimos ${ALERT_WINDOW_MINUTES} minutos.\nÚltima: ${when} — ${where}.\n\nVeja em Painel admin → Auditoria → Segurança.`,
      });
    }
  }

  if (input.event === "login_locked" && input.email && (await throttled(`locked:${input.email}`))) {
    await sendAdminAlert({
      to: admins,
      subject: "Conta bloqueada temporariamente por excesso de tentativas",
      text: `O login de ${who} foi bloqueado por 15 minutos após várias senhas erradas.\n${when} — ${where}.`,
    });
  }

  if (input.event === "login_success" && input.userId != null && origin.ip) {
    const user = await db
      .select({ email: users.email, emailVerifiedAt: users.emailVerifiedAt })
      .from(users)
      .where(eq(users.id, input.userId))
      .then(first);
    if (user && isAdminUser(user, admins)) {
      const [seen] = await db
        .select({ n: count() })
        .from(securityEvents)
        .where(
          and(
            eq(securityEvents.userId, input.userId),
            eq(securityEvents.event, "login_success"),
            eq(securityEvents.ip, origin.ip),
            ne(securityEvents.id, eventId),
          ),
        );
      const [any] = await db
        .select({ n: count() })
        .from(securityEvents)
        .where(and(eq(securityEvents.userId, input.userId), eq(securityEvents.event, "login_success")));
      // Primeiro login registrado não alerta (não há "IP conhecido" ainda).
      if (seen.n === 0 && any.n > 1 && (await throttled(`adminip:${input.userId}:${origin.ip}`))) {
        await sendAdminAlert({
          to: admins,
          subject: "Login de administrador a partir de um IP novo",
          text: `A conta de administrador ${who} entrou a partir de um IP que nunca tinha sido usado.\n${when} — ${where}.\n\nSe não foi você, troque a senha e encerre as sessões em Configurações → Segurança.`,
        });
      }
    }
  }
}

/** Retenção (LGPD): apaga eventos e auditoria com mais de 12 meses. */
export async function purgeOldSecurityData(now: Date = new Date()) {
  const cutoff = new Date(now.getTime() - 365 * 86_400_000).toISOString();
  await db.execute(sql`delete from security_events where created_at < ${cutoff}`);
  await db.execute(sql`delete from admin_audit_log where created_at < ${cutoff}`);
}
