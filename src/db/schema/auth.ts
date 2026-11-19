import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text } from "drizzle-orm/pg-core";
import { createdAt, timestamps } from "./_helpers";

/** MÓDULO 1 — Contas. Cada pessoa vê apenas os próprios dados (todas as tabelas têm user_id). */
export const users = pgTable(
  "users",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    failedLogins: integer("failed_logins").notNull().default(0),
    lockedUntil: text("locked_until"),
    avatarColor: text("avatar_color"), // cor de fundo do avatar (perfil)
    /** Preenchido quando a pessoa confirma o e-mail com o código do cadastro. */
    emailVerifiedAt: text("email_verified_at"),
    ...timestamps(),
  },
  (t) => [
    check("users_email_lowercase", sql`${t.email} = lower(${t.email})`),
    check("users_failed_logins_nonneg", sql`${t.failedLogins} >= 0`),
  ],
);

/** Desafio 2FA: código de 6 dígitos (armazenado apenas como HMAC), válido por poucos minutos. */
export const authChallenges = pgTable(
  "auth_challenges",
  {
    id: text("id").primaryKey(), // UUID referenciado pelo cookie "pré-autenticação"
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** login = 2FA do login; signup = confirmar e-mail do cadastro; reset = trocar a senha. */
    purpose: text("purpose", { enum: ["login", "signup", "reset"] })
      .notNull()
      .default("login"),
    codeHash: text("code_hash").notNull(),
    expiresAt: text("expires_at").notNull(),
    attempts: integer("attempts").notNull().default(0),
    consumedAt: text("consumed_at"),
    createdAt: createdAt(),
  },
  (t) => [
    index("auth_challenges_user_idx").on(t.userId),
    check("auth_challenges_attempts_nonneg", sql`${t.attempts} >= 0`),
    check("auth_challenges_purpose", sql`${t.purpose} IN ('login', 'signup', 'reset')`),
  ],
);

/** Sessões ativas. O cookie (JWT) carrega apenas o id; revogar = preencher revoked_at. */
export const sessions = pgTable(
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

/** Contador de tentativas por chave (ex.: "login:ip:1.2.3.4") numa janela de tempo. */
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  windowStart: text("window_start").notNull(),
});
