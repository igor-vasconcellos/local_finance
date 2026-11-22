import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text } from "drizzle-orm/pg-core";
import { createdAt, id } from "./_helpers";
import { users } from "./auth";

export const SECURITY_EVENTS = [
  "login_success",
  "login_failed",
  "login_locked",
  "code_failed",
  "signup_confirmed",
  "password_reset_requested",
  "password_changed",
  "logout",
  "data_export",
  "blocked_write",
  "feature_locked",
  "session_revoked",
  "billing_checkout",
  "billing_cancelled",
  "webhook_rejected",
] as const;
export type SecurityEvent = (typeof SECURITY_EVENTS)[number];

/**
 * Eventos de segurança das contas (logins, falhas, senhas, exportações, tentativas
 * barradas). Nunca guarda senhas, códigos nem tokens. Apagados após 12 meses.
 */
export const securityEvents = pgTable(
  "security_events",
  {
    id: id(),
    /** Conta envolvida (nula quando o e-mail digitado não existe). */
    userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
    /** E-mail digitado/da conta, em minúsculas (para achar ataques a contas inexistentes). */
    email: text("email"),
    event: text("event", { enum: SECURITY_EVENTS }).notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    details: text("details"),
    createdAt: createdAt(),
  },
  (t) => [
    index("security_events_created_idx").on(t.createdAt),
    index("security_events_user_idx").on(t.userId, t.createdAt),
    index("security_events_email_idx").on(t.email, t.createdAt),
    check("security_events_event", sql.raw(`"event" IN (${SECURITY_EVENTS.map((e) => `'${e}'`).join(", ")})`)),
  ],
);
