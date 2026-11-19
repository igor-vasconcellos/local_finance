import { attachDatabasePool } from "@vercel/functions";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "@/env";
import * as schema from "./schema";

/**
 * Postgres (Supabase), acessado pelo pooler em modo transação (porta 6543).
 *
 * Usamos o driver `pg` (node-postgres) porque a Vercel (Fluid Compute) congela a
 * função entre requisições. Conexões ociosas morrem nesse intervalo e, sem cuidado,
 * a próxima consulta fica pendurada até o limite de 300 s. `attachDatabasePool`
 * mantém a função viva o suficiente para o pool fechar as conexões ociosas antes do
 * congelamento. Os timeouts abaixo garantem que nada fique pendurado: uma falha vira
 * erro em segundos, não em minutos.
 *
 * Os testes trocam este módulo por um Postgres em memória (PGlite).
 */
export type DB = PgDatabase<PgQueryResultHKT, typeof schema>;
/** Transação aberta por db.transaction(async (tx) => …). */
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

const globalForDb = globalThis as unknown as { __pgPool?: Pool };

/**
 * Remove da URL parâmetros que não são do Postgres (a integração da Vercel acrescenta
 * coisas como "supa=base-pooler.x"), e também `sslmode`: o SSL é configurado abaixo.
 */
export function cleanDatabaseUrl(raw: string): string {
  const url = new URL(raw);
  for (const key of [...url.searchParams.keys()]) url.searchParams.delete(key);
  return url.toString();
}

/** SSL exigido em qualquer host que não seja local (o Supabase sempre usa SSL). */
export function needsSsl(raw: string): boolean {
  const url = new URL(raw);
  if (url.searchParams.get("sslmode") === "disable") return false;
  return !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname);
}

function createPool(): Pool {
  const pool = new Pool({
    connectionString: cleanDatabaseUrl(env.DATABASE_URL),
    // O certificado do pooler do Supabase não está na cadeia padrão do Node.
    ssl: needsSsl(env.DATABASE_URL) ? { rejectUnauthorized: false } : undefined,
    max: env.DATABASE_POOL_MAX,
    idleTimeoutMillis: 5_000,
    connectionTimeoutMillis: 10_000,
    query_timeout: 20_000,
    keepAlive: true,
    allowExitOnIdle: true,
  });
  // Erro numa conexão ociosa (ex.: o pooler derrubou): só descarta, não derruba o processo.
  pool.on("error", (error) => console.error("[db] conexão descartada:", error.message));
  return pool;
}

// Em dev o Next recarrega módulos a cada alteração; reaproveitamos o mesmo pool.
const pool = globalForDb.__pgPool ?? createPool();
if (env.NODE_ENV !== "production") globalForDb.__pgPool = pool;
else attachDatabasePool(pool);

export const db: DB = drizzle(pool, { schema });
