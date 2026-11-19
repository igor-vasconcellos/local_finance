import { sql } from "drizzle-orm";
import { integer, text } from "drizzle-orm/pg-core";

/**
 * Convenções do banco:
 * - Dinheiro: INTEGER em centavos (nunca float).
 * - Percentuais/taxas: INTEGER em basis points (10000 = 100%).
 * - Datas: TEXT ISO "YYYY-MM-DD"; meses de competência: TEXT "YYYY-MM";
 *   instantes: TEXT ISO-8601 UTC.
 */

/** Agora em ISO-8601 UTC (mesmo formato de new Date().toISOString()). */
export const nowIso = sql`(to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))`;

export const id = () => integer("id").primaryKey().generatedByDefaultAsIdentity();

export const createdAt = () => text("created_at").notNull().default(nowIso);
export const updatedAt = () =>
  text("updated_at")
    .notNull()
    .default(nowIso)
    .$onUpdate(() => new Date().toISOString());

export const timestamps = () => ({
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Expressões regulares usadas em CHECKs para validar o formato das datas no próprio banco. */
export const DATE_GLOB = "^[0-9]{4}-[0-1][0-9]-[0-3][0-9]$";
export const MONTH_GLOB = "^[0-9]{4}-[0-1][0-9]$";
