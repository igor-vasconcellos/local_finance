import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createdAt, timestamps } from "./_helpers";

/** MÓDULO 1 — Usuário master único (CHECK id = 1 garante isso no próprio banco). */
export const users = sqliteTable(
  "users",
  {
    id: integer("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    failedLogins: integer("failed_logins").notNull().default(0),
    lockedUntil: text("locked_until"),
    avatarColor: text("avatar_color"), // cor de fundo do avatar (perfil)
    ...timestamps(),
  },
  (t) => [
    check("users_single_user", sql`${t.id} = 1`),
    check("users_email_lowercase", sql`${t.email} = lower(${t.email})`),
    check("users_failed_logins_nonneg", sql`${t.failedLogins} >= 0`),
  ],
);

/** Desafio 2FA: código de 6 dígitos (armazenado apenas como HMAC), válido por poucos minutos. */
export const authChallenges = sqliteTable(
  "auth_challenges",
  {
    id: text("id").primaryKey(), // UUID referenciado pelo cookie "pré-autenticação"
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull(),
    expiresAt: text("expires_at").notNull(),
    attempts: integer("attempts").notNull().default(0),
    consumedAt: text("consumed_at"),
    createdAt: createdAt(),
  },
  (t) => [
    index("auth_challenges_user_idx").on(t.userId),
    check("auth_challenges_attempts_nonneg", sql`${t.attempts} >= 0`),
  ],
);

/** Sessões ativas. O cookie (JWT) carrega apenas o id; revogar = preencher revoked_at. */
export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(), // hash SHA-256 do token aleatório
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    userAgent: text("user_agent"),
    ip: text("ip"),
    createdAt: createdAt(),
    lastSeenAt: text("last_seen_at").notNull(),
    expiresAt: text("expires_at").notNull(),
    revokedAt: text("revoked_at"),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);
