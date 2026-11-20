import type { FeatureKey } from "@/db/schema/admin";

/**
 * Regra central de acesso (pura, sem banco — fácil de testar).
 * Ordem: admin > bloqueado > cortesia > (Etapa 11: assinatura/teste) > liberado.
 */

export type AccessUser = {
  email: string;
  emailVerifiedAt: string | null;
  blockedAt: string | null;
  blockedReason: string | null;
  courtesyAt: string | null;
  courtesyUntil: string | null;
};

export type FeatureLock = { message: string | null };
export type FeatureLocks = Partial<Record<FeatureKey, FeatureLock>>;

export type Access = {
  isAdmin: boolean;
  /** Conta bloqueada pelo admin: só consulta. */
  blocked: { reason: string | null; since: string } | null;
  /** Cortesia ativa (uso liberado sem pagar). until nulo = permanente. */
  courtesy: { until: string | null } | null;
  /** Nenhuma escrita permitida. */
  readOnly: boolean;
  /** Funções travadas para esta conta (sempre vazio para o admin). */
  locked: FeatureLocks;
};

export function isAdminUser(user: Pick<AccessUser, "email" | "emailVerifiedAt">, adminEmails: readonly string[]): boolean {
  return user.emailVerifiedAt != null && adminEmails.includes(user.email.trim().toLowerCase());
}

/** Cortesia vale até o fim do dia informado (inclusive). */
export function courtesyActive(user: Pick<AccessUser, "courtesyAt" | "courtesyUntil">, now: Date): boolean {
  if (!user.courtesyAt) return false;
  if (!user.courtesyUntil) return true;
  return user.courtesyUntil >= now.toISOString().slice(0, 10);
}

export function resolveAccess(user: AccessUser, locks: FeatureLocks, adminEmails: readonly string[], now: Date = new Date()): Access {
  if (isAdminUser(user, adminEmails)) {
    return { isAdmin: true, blocked: null, courtesy: null, readOnly: false, locked: {} };
  }
  const blocked = user.blockedAt ? { reason: user.blockedReason, since: user.blockedAt } : null;
  const courtesy = courtesyActive(user, now) ? { until: user.courtesyUntil } : null;
  return { isAdmin: false, blocked, courtesy, readOnly: blocked != null, locked: locks };
}
