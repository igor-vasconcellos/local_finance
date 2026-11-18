import { sql } from "drizzle-orm";
import { integer, text } from "drizzle-orm/sqlite-core";

/**
 * Convenções do banco:
 * - Dinheiro: INTEGER em centavos (nunca float).
 * - Percentuais/taxas: INTEGER em basis points (10000 = 100%).
 * - Datas: TEXT ISO "YYYY-MM-DD"; meses de competência: TEXT "YYYY-MM";
 *   instantes: TEXT ISO-8601 UTC.
 */

export const nowIso = sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;

export const id = () => integer("id").primaryKey({ autoIncrement: true });

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

/** Regex usada em CHECKs para validar formatos de data no próprio SQLite. */
export const DATE_GLOB = "[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]";
export const MONTH_GLOB = "[0-9][0-9][0-9][0-9]-[0-1][0-9]";
