import { drizzle } from "drizzle-orm/postgres-js";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import postgres from "postgres";
import { env } from "@/env";
import * as schema from "./schema";

/**
 * Postgres (Supabase). Na Vercel cada função abre poucas conexões de vida curta, por
 * isso usamos o pooler do Supabase em modo transação (porta 6543), que NÃO aceita
 * prepared statements: `prepare: false`.
 * Os testes trocam este módulo por um Postgres em memória (PGlite).
 */
export type DB = PgDatabase<PgQueryResultHKT, typeof schema>;
/** Transação aberta por db.transaction(async (tx) => …). */
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

const globalForDb = globalThis as unknown as {
  __pg?: ReturnType<typeof postgres>;
};

function connect() {
  return postgres(env.DATABASE_URL, {
    prepare: false,
    max: env.DATABASE_POOL_MAX,
    idle_timeout: 20,
    connect_timeout: 10,
  });
}

// Em dev o Next recarrega módulos a cada alteração; reaproveitamos a mesma conexão.
const client = globalForDb.__pg ?? connect();
if (env.NODE_ENV !== "production") globalForDb.__pg = client;

export const db: DB = drizzle(client, { schema });
