import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { DUMMY_HASH, hashPassword, verifyPassword } from "./password";

export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_MINUTES = 15;
export const MASTER_USER_ID = 1;

export type PublicUser = { id: number; name: string; email: string };

export function hasMasterUser(): boolean {
  const row = db.select({ n: sql<number>`count(*)` }).from(users).get();
  return (row?.n ?? 0) > 0;
}

export function getUserById(id: number): PublicUser | undefined {
  return db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, id))
    .get();
}

export type CreateMasterResult = { ok: true; user: PublicUser } | { ok: false; reason: "already_exists" };

/** Cria o usuário master. Só funciona uma vez (o banco também garante via CHECK id = 1). */
export async function createMasterUser(input: {
  name: string;
  email: string;
  password: string;
}): Promise<CreateMasterResult> {
  if (hasMasterUser()) return { ok: false, reason: "already_exists" };

  const passwordHash = await hashPassword(input.password);
  try {
    const user = db
      .insert(users)
      .values({
        id: MASTER_USER_ID,
        name: input.name.trim(),
        email: input.email.trim().toLowerCase(),
        passwordHash,
      })
      .returning({ id: users.id, name: users.name, email: users.email })
      .get();
    return { ok: true, user };
  } catch (error) {
    // Duas abas enviando o cadastro ao mesmo tempo: a segunda bate na PK.
    if (error instanceof Error && /UNIQUE|PRIMARY KEY|CHECK/.test(error.message)) {
      return { ok: false, reason: "already_exists" };
    }
    throw error;
  }
}

export type AuthenticateResult =
  | { ok: true; user: PublicUser }
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

  return { ok: true, user: { id: user.id, name: user.name, email: user.email } };
}

export function updateUserName(id: number, name: string): boolean {
  return db.update(users).set({ name: name.trim() }).where(eq(users.id, id)).run().changes > 0;
}
