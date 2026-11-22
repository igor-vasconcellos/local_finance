import type { FeatureKey } from "@/db/schema/admin";

/**
 * Regra central de acesso (pura, sem banco — fácil de testar).
 * Ordem: admin > bloqueado > cortesia > assinatura/teste grátis > liberado.
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
  /** Situação da cobrança (null = isento: admin, cortesia ou cobrança desligada). */
  billing: BillingAccess | null;
  /** Nenhuma escrita permitida. */
  readOnly: boolean;
  /** Funções travadas para esta conta (sempre vazio para o admin). */
  locked: FeatureLocks;
};

export type BillingConfig = {
  enabled: boolean;
  /** Dia em que a cobrança foi ligada (contas antigas ganham o teste a partir dele). */
  startDate: string | null;
  trialDays: number;
  graceDays: number;
};

export type BillingSubscription = {
  status: "pending" | "authorized" | "paused" | "cancelled";
  paidUntil: string | null;
  /** Houve cobrança recusada (para diferenciar "recusado" de "confirmando o pagamento"). */
  failing?: boolean;
};

export type BillingInput = {
  config: BillingConfig;
  /** Criação da conta (ISO). */
  userCreatedAt: string;
  subscription: BillingSubscription | null;
};

export type BillingState = "trial" | "active" | "grace" | "expired";

export type BillingAccess = {
  state: BillingState;
  /** Último dia do teste grátis (inclusive). */
  trialLastDay: string;
  /** Pago até (exclusivo) — null se nunca pagou. */
  paidUntil: string | null;
  /** Até quando (inclusive) o acesso segue liberado sem novo pagamento. */
  accessLastDay: string | null;
  subscriptionStatus: BillingSubscription["status"] | null;
  /** Na tolerância por cobrança recusada (e não só aguardando a confirmação). */
  failing: boolean;
};

const DAY_MS = 86_400_000;

/** Soma dias a uma data "YYYY-MM-DD" (calendário, sem fuso). */
export function addDaysISO(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Mesmo dia no mês seguinte (31/jan → 28 ou 29/fev). */
export function addOneMonthISO(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${ny}-${String(nm).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

/**
 * Teste grátis: N dias a partir do cadastro (ou do dia em que a cobrança foi
 * ligada, para contas antigas). Depois, acesso enquanto houver pagamento
 * aprovado ("pago até"), mais a tolerância se a assinatura segue ativa
 * (cobrança recusada esperando nova tentativa). Sem isso → só consulta.
 * `today` é a data de Brasília (YYYY-MM-DD).
 */
export function resolveBilling(input: BillingInput, today: string): BillingAccess {
  const { config, subscription } = input;
  const created = input.userCreatedAt.slice(0, 10);
  const trialStart = config.startDate && config.startDate > created ? config.startDate : created;
  const trialLastDay = addDaysISO(trialStart, config.trialDays - 1);
  const paidUntil = subscription?.paidUntil ?? null;
  const renewing = subscription?.status === "authorized";

  // Fim da cobertura (exclusivo): o que foi pago ou, com assinatura ativa, o fim do teste.
  let coveredUntil: string | null = paidUntil;
  if (renewing) {
    const afterTrial = addDaysISO(trialLastDay, 1);
    if (!coveredUntil || afterTrial > coveredUntil) coveredUntil = afterTrial;
  }
  const paidLastDay = coveredUntil ? addDaysISO(coveredUntil, -1) : null;
  const graceLastDay = coveredUntil && renewing ? addDaysISO(coveredUntil, config.graceDays - 1) : paidLastDay;
  const accessLastDay = [trialLastDay, graceLastDay].filter((d): d is string => d != null).sort().at(-1) ?? trialLastDay;

  let state: BillingState;
  if (paidUntil && today < paidUntil) state = "active";
  else if (today <= trialLastDay) state = "trial";
  else if (paidLastDay && today <= paidLastDay) state = "active";
  else if (graceLastDay && today <= graceLastDay) state = "grace";
  else state = "expired";

  return {
    state,
    trialLastDay,
    paidUntil,
    accessLastDay,
    subscriptionStatus: subscription?.status ?? null,
    failing: subscription?.failing ?? false,
  };
}

export function isAdminUser(user: Pick<AccessUser, "email" | "emailVerifiedAt">, adminEmails: readonly string[]): boolean {
  return user.emailVerifiedAt != null && adminEmails.includes(user.email.trim().toLowerCase());
}

/** Cortesia vale até o fim do dia informado (inclusive). */
export function courtesyActive(user: Pick<AccessUser, "courtesyAt" | "courtesyUntil">, now: Date): boolean {
  if (!user.courtesyAt) return false;
  if (!user.courtesyUntil) return true;
  return user.courtesyUntil >= now.toISOString().slice(0, 10);
}

export function resolveAccess(
  user: AccessUser,
  locks: FeatureLocks,
  adminEmails: readonly string[],
  now: Date = new Date(),
  billingInput?: BillingInput,
  today: string = now.toISOString().slice(0, 10),
): Access {
  if (isAdminUser(user, adminEmails)) {
    return { isAdmin: true, blocked: null, courtesy: null, billing: null, readOnly: false, locked: {} };
  }
  const blocked = user.blockedAt ? { reason: user.blockedReason, since: user.blockedAt } : null;
  const courtesy = courtesyActive(user, now) ? { until: user.courtesyUntil } : null;
  const billing = !courtesy && billingInput?.config.enabled ? resolveBilling(billingInput, today) : null;
  const unpaid = billing?.state === "expired";
  return { isAdmin: false, blocked, courtesy, billing, readOnly: blocked != null || unpaid, locked: locks };
}
