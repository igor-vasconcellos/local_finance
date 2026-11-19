/**
 * Substitui "@/db/client" nos testes: Postgres de verdade (PGlite, compilado para
 * WebAssembly) rodando em memória, com as migrações reais aplicadas.
 * Cada arquivo de teste ganha o seu próprio banco.
 */
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "../../src/db/schema";

export type DB = PgDatabase<PgQueryResultHKT, typeof schema>;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

export const pglite = new PGlite();
export const db = drizzle(pglite, { schema }) as unknown as DB;

await migrate(drizzle(pglite), { migrationsFolder: "./drizzle" });

/** Banco novo e vazio (com migrações) para testes de schema. */
export async function createTestDb() {
  const client = new PGlite();
  const testDb = drizzle(client, { schema });
  await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  return { client, db: testDb };
}
