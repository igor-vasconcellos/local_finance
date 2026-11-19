import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "./schema";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

/**
 * Aplica as migrações com as chaves estrangeiras DESLIGADAS: algumas migrações recriam
 * tabelas (CREATE nova → copia → DROP antiga) e, com elas ligadas, o DROP apagaria em
 * cascata os dados das tabelas filhas. No fim, confere a integridade e religa.
 */
export function runMigrations(sqlite: Database.Database, db: BetterSQLite3Database<typeof schema>, migrationsFolder: string) {
  sqlite.pragma("foreign_keys = OFF");
  try {
    migrate(db, { migrationsFolder });
    const problems = sqlite.pragma("foreign_key_check") as unknown[];
    if (problems.length) {
      throw new Error(`Migração deixou ${problems.length} referência(s) quebrada(s): ${JSON.stringify(problems.slice(0, 5))}`);
    }
  } finally {
    sqlite.pragma("foreign_keys = ON");
  }
}
