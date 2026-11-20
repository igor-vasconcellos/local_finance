import { sql } from "drizzle-orm";
import { boolean, check, index, integer, pgTable, text } from "drizzle-orm/pg-core";
import { createdAt, id, nowIso } from "./_helpers";
import { users } from "./auth";

/** Funções que o admin pode travar para todos os usuários (o admin nunca é afetado). */
export const FEATURE_KEYS = ["boxes", "simulator", "invoice_import"] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];

/** Travas globais de funcionalidades. Sem linha = função liberada. */
export const featureFlags = pgTable(
  "feature_flags",
  {
    key: text("key", { enum: FEATURE_KEYS }).primaryKey(),
    locked: boolean("locked").notNull().default(false),
    /** Mensagem exibida ao usuário enquanto a função estiver travada. */
    message: text("message"),
    updatedAt: text("updated_at").notNull().default(nowIso),
    updatedBy: integer("updated_by").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [check("feature_flags_key", sql`${t.key} IN ('boxes', 'simulator', 'invoice_import')`)],
);

/** Registro de toda ação administrativa (quem, o quê, em quem, quando, de onde). */
export const adminAuditLog = pgTable(
  "admin_audit_log",
  {
    id: id(),
    actorUserId: integer("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    targetUserId: integer("target_user_id").references(() => users.id, { onDelete: "set null" }),
    /** E-mail do alvo no momento da ação (continua legível se a conta for apagada). */
    targetEmail: text("target_email"),
    details: text("details"),
    ip: text("ip"),
    createdAt: createdAt(),
  },
  (t) => [index("admin_audit_log_created_idx").on(t.createdAt)],
);
