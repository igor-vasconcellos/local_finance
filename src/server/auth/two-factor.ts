import "server-only";
import crypto from "node:crypto";
import { and, eq, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { authChallenges } from "@/db/schema";
import { env } from "@/env";

/** Intervalo mínimo entre reenvios de código. */
export const RESEND_COOLDOWN_SECONDS = 30;

function hashCode(challengeId: string, code: string): string {
  return crypto
    .createHmac("sha256", env.SESSION_SECRET)
    .update(`2fa:${challengeId}:${code}`)
    .digest("hex");
}

function generateCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export type NewChallenge = { challengeId: string; code: string; expiresAt: string };

/**
 * Cria um novo desafio 2FA para o usuário e invalida os anteriores ainda pendentes.
 * O código em claro só existe na memória (para ser enviado); no banco vai o HMAC.
 */
export function createChallenge(userId: number, now: Date = new Date()): NewChallenge {
  const challengeId = crypto.randomUUID();
  const code = generateCode();
  const expiresAt = new Date(now.getTime() + env.TWO_FACTOR_TTL_MINUTES * 60_000).toISOString();

  db.transaction((tx) => {
    tx.update(authChallenges)
      .set({ consumedAt: now.toISOString() })
      .where(and(eq(authChallenges.userId, userId), isNull(authChallenges.consumedAt)))
      .run();

    tx.insert(authChallenges)
      .values({
        id: challengeId,
        userId,
        codeHash: hashCode(challengeId, code),
        expiresAt,
        createdAt: now.toISOString(), // mesma fonte de tempo das demais regras
      })
      .run();

    // Faxina: remove desafios com mais de 1 dia.
    const dayAgo = new Date(now.getTime() - 86_400_000).toISOString();
    tx.delete(authChallenges).where(lt(authChallenges.createdAt, dayAgo)).run();
  });

  return { challengeId, code, expiresAt };
}

export type PendingChallenge = {
  id: string;
  userId: number;
  expiresAt: string;
  createdAt: string;
  attemptsLeft: number;
};

/** Retorna o desafio se ele ainda puder ser usado (não consumido, não expirado, com tentativas). */
export function getPendingChallenge(
  challengeId: string | undefined,
  now: Date = new Date(),
): PendingChallenge | null {
  if (!challengeId) return null;
  const row = db.select().from(authChallenges).where(eq(authChallenges.id, challengeId)).get();
  if (!row || row.consumedAt || row.expiresAt <= now.toISOString()) return null;
  const attemptsLeft = env.TWO_FACTOR_MAX_ATTEMPTS - row.attempts;
  if (attemptsLeft <= 0) return null;
  return {
    id: row.id,
    userId: row.userId,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    attemptsLeft,
  };
}

export function secondsUntilResend(challenge: { createdAt: string }, now: Date = new Date()): number {
  const elapsed = (now.getTime() - new Date(challenge.createdAt).getTime()) / 1000;
  return Math.max(0, Math.ceil(RESEND_COOLDOWN_SECONDS - elapsed));
}

/** Janela em que um desafio (mesmo expirado ou esgotado) ainda permite pedir reenvio. */
const RESEND_WINDOW_MS = 60 * 60_000;

/**
 * Para o botão "Reenviar código": identifica o dono do desafio do cookie e quanto
 * falta para liberar um novo envio. Funciona com desafios expirados/esgotados
 * criados há menos de 1 hora; nunca com desafio já usado no login.
 */
export function getResendTarget(
  challengeId: string | undefined,
  now: Date = new Date(),
): { userId: number; waitSeconds: number } | null {
  if (!challengeId) return null;
  const row = db.select().from(authChallenges).where(eq(authChallenges.id, challengeId)).get();
  if (!row || now.getTime() - new Date(row.createdAt).getTime() > RESEND_WINDOW_MS) return null;
  return { userId: row.userId, waitSeconds: secondsUntilResend(row, now) };
}

export type VerifyResult =
  | { ok: true; userId: number }
  | { ok: false; reason: "invalid"; attemptsLeft: number }
  | { ok: false; reason: "expired" | "too_many_attempts" | "not_found" };

/**
 * Confere o código. A tentativa é contada ANTES da comparação, numa única
 * instrução UPDATE condicional — tentativas em paralelo não furam o limite.
 */
export function verifyChallenge(
  challengeId: string | undefined,
  code: string,
  now: Date = new Date(),
): VerifyResult {
  if (!challengeId) return { ok: false, reason: "not_found" };
  const nowIso = now.toISOString();

  const row = db
    .update(authChallenges)
    .set({ attempts: sql`${authChallenges.attempts} + 1` })
    .where(
      and(
        eq(authChallenges.id, challengeId),
        isNull(authChallenges.consumedAt),
        lt(authChallenges.attempts, env.TWO_FACTOR_MAX_ATTEMPTS),
      ),
    )
    .returning()
    .get();

  if (!row) {
    const existing = db.select().from(authChallenges).where(eq(authChallenges.id, challengeId)).get();
    if (!existing || existing.consumedAt) return { ok: false, reason: "not_found" };
    return { ok: false, reason: "too_many_attempts" };
  }

  if (row.expiresAt <= nowIso) return { ok: false, reason: "expired" };

  const expected = Buffer.from(row.codeHash, "hex");
  const received = Buffer.from(hashCode(challengeId, code), "hex");
  const match = expected.length === received.length && crypto.timingSafeEqual(expected, received);

  if (!match) {
    const attemptsLeft = env.TWO_FACTOR_MAX_ATTEMPTS - row.attempts;
    return attemptsLeft > 0
      ? { ok: false, reason: "invalid", attemptsLeft }
      : { ok: false, reason: "too_many_attempts" };
  }

  // Uso único: só um request consegue marcar como consumido.
  const consumed = db
    .update(authChallenges)
    .set({ consumedAt: nowIso })
    .where(and(eq(authChallenges.id, challengeId), isNull(authChallenges.consumedAt)))
    .returning({ userId: authChallenges.userId })
    .get();

  return consumed ? { ok: true, userId: consumed.userId } : { ok: false, reason: "not_found" };
}
