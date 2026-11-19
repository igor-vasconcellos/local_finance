import "server-only";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { seedUserDefaults } from "@/db/defaults";
import { sessions, users } from "@/db/schema";
import { DUMMY_HASH, hashPassword, verifyPassword } from "./password";

export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_MINUTES = 15;

export type PublicUser = { id: number; name: string; email: string; avatarColor: string | null };

const publicCols = { id: users.id, name: users.name, email: users.email, avatarColor: users.avatarColor };

export function getUserById(id: number): PublicUser | undefined {
  return db.select(publicCols).from(users).where(eq(users.id, id)).get();
}

/** Conta com e-mail já confirmado (as não confirmadas não podem trocar senha nem entrar). */
export function findVerifiedUserByEmail(email: string): PublicUser | undefined {
  return db
    .select(publicCols)
    .from(users)
    .where(and(eq(users.email, email.trim().toLowerCase()), isNotNull(users.emailVerifiedAt)))
    .get();
}

export type RegisterResult = { ok: true; user: PublicUser } | { ok: false; reason: "already_exists" };

/**
 * Cria a conta (ainda NÃO confirmada). Se já existe uma conta não confirmada com o
 * mesmo e-mail (cadastro abandonado), ela é reaproveitada com o novo nome e senha.
 */
export async function registerUser(input: { name: string; email: string; password: string }): Promise<RegisterResult> {
  const email = input.email.trim().toLowerCase();
  const passwordHash = await hashPassword(input.password);
  const existing = db.select().from(users).where(eq(users.email, email)).get();
  if (existing?.emailVerifiedAt) return { ok: false, reason: "already_exists" };

  try {
    const user = existing
      ? db
          .update(users)
          .set({ name: input.name.trim(), passwordHash, failedLogins: 0, lockedUntil: null })
          .where(and(eq(users.id, existing.id), isNull(users.emailVerifiedAt)))
          .returning(publicCols)
          .get()
      : db.insert(users).values({ name: input.name.trim(), email, passwordHash }).returning(publicCols).get();
    return user ? { ok: true, user } : { ok: false, reason: "already_exists" };
  } catch (error) {
    // Dois cadastros simultâneos com o mesmo e-mail: o segundo bate no UNIQUE.
    if (error instanceof Error && /UNIQUE/.test(error.message)) return { ok: false, reason: "already_exists" };
    throw error;
  }
}

/** Confirma o e-mail e cria os dados iniciais da conta (categorias, CDI, configurações). */
export function confirmEmail(userId: number, now: Date = new Date()) {
  db.transaction((tx) => {
    tx.update(users)
      .set({ emailVerifiedAt: now.toISOString() })
      .where(and(eq(users.id, userId), isNull(users.emailVerifiedAt)))
      .run();
    seedUserDefaults(tx, userId);
  });
}

/** Troca a senha, desbloqueia o login e encerra todas as sessões abertas. */
export async function changePassword(userId: number, password: string, now: Date = new Date()) {
  const passwordHash = await hashPassword(password);
  db.transaction((tx) => {
    tx.update(users).set({ passwordHash, failedLogins: 0, lockedUntil: null }).where(eq(users.id, userId)).run();
    tx.update(sessions)
      .set({ revokedAt: now.toISOString() })
      .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)))
      .run();
  });
}

export type AuthenticateResult =
  | { ok: true; user: PublicUser; verified: boolean }
  | { ok: false; reason: "invalid_credentials" }
  | { ok: false; reason: "locked"; until: string };

/**
 * Etapa 1 do login (e-mail + senha), com bloqueio temporário após
 * MAX_FAILED_LOGINS erros seguidos. Mensagens de erro nunca revelam
 * se foi o e-mail ou a senha que errou.
 */
export async function authenticate(
  email: string,
  password: string,
  now: Date = new Date(),
): Promise<AuthenticateResult> {
  const user = db
    .select()
    .from(users)
    .where(eq(users.email, email.trim().toLowerCase()))
    .get();

  if (!user) {
    await verifyPassword(password, DUMMY_HASH);
    return { ok: false, reason: "invalid_credentials" };
  }

  if (user.lockedUntil && user.lockedUntil > now.toISOString()) {
    return { ok: false, reason: "locked", until: user.lockedUntil };
  }

  const valid = await verifyPassword(password, user.passwordHash);

  if (!valid) {
    const failed = user.failedLogins + 1;
    if (failed >= MAX_FAILED_LOGINS) {
      const until = new Date(now.getTime() + LOCKOUT_MINUTES * 60_000).toISOString();
      db.update(users).set({ failedLogins: 0, lockedUntil: until }).where(eq(users.id, user.id)).run();
      return { ok: false, reason: "locked", until };
    }
    db.update(users).set({ failedLogins: failed }).where(eq(users.id, user.id)).run();
    return { ok: false, reason: "invalid_credentials" };
  }

  if (user.failedLogins > 0 || user.lockedUntil) {
    db.update(users).set({ failedLogins: 0, lockedUntil: null }).where(eq(users.id, user.id)).run();
  }

  return {
    ok: true,
    user: { id: user.id, name: user.name, email: user.email, avatarColor: user.avatarColor },
    verified: Boolean(user.emailVerifiedAt),
  };
}

export function updateUserName(id: number, name: string): boolean {
  return db.update(users).set({ name: name.trim() }).where(eq(users.id, id)).run().changes > 0;
}

export function updateAvatarColor(id: number, color: string): boolean {
  return db.update(users).set({ avatarColor: color }).where(eq(users.id, id)).run().changes > 0;
}
