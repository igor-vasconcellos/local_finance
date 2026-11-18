import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { env } from "@/env";
import * as schema from "./schema";

export type DB = BetterSQLite3Database<typeof schema>;

/** Abre o arquivo SQLite com os pragmas recomendados para uso local. */
export function openSqlite(filePath: string = env.DATABASE_PATH): Database.Database {
  const inMemory = filePath === ":memory:"; // usado pelos testes
  // Caminho vem do .env em tempo de execução; o bundler não deve tentar rastreá-lo.
  const resolved = inMemory
    ? filePath
    : path.resolve(/*turbopackIgnore: true*/ process.cwd(), filePath);
  if (!inMemory) fs.mkdirSync(path.dirname(resolved), { recursive: true });

  const sqlite = new Database(resolved);
  if (!inMemory) sqlite.pragma("journal_mode = WAL"); // leituras e escritas concorrentes sem travar
  sqlite.pragma("synchronous = NORMAL"); // seguro com WAL e bem mais rápido
  sqlite.pragma("foreign_keys = ON"); // SQLite vem com FKs desligadas por padrão!
  sqlite.pragma("busy_timeout = 5000");
  return sqlite;
}

// Em dev o Next recarrega módulos a cada alteração; reaproveitamos a mesma conexão.
const globalForDb = globalThis as unknown as { __sqlite?: Database.Database };

export const sqlite = globalForDb.__sqlite ?? openSqlite();
if (env.NODE_ENV !== "production") globalForDb.__sqlite = sqlite;

export const db: DB = drizzle(sqlite, { schema });
