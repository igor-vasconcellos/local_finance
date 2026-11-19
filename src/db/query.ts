import { sql } from "drizzle-orm";

/** Primeira linha de um resultado (ou undefined). Uso: `await db.select()...then(first)`. */
export const first = <T>(rows: T[]): T | undefined => rows[0];

/** Para UPDATE/DELETE: `.returning(touched)` e depois `.length > 0` diz se alguma linha mudou. */
export const touched = { ok: sql<number>`1` };
