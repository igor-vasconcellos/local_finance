import { migrate as migratePg } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

/**
 * Aplica as migrações pendentes (pasta ./drizzle). Usa a conexão DIRETA/sessão
 * (DIRECT_URL, porta 5432): o pooler em modo transação não serve para DDL longo.
 * Roda no build da Vercel (`npm run vercel-build`) e pelo `npm run db:migrate`.
 */
export async function runMigrations(url: string, migrationsFolder = "./drizzle") {
  const client = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
  try {
    await migratePg(drizzle(client), { migrationsFolder });
  } finally {
    await client.end();
  }
}
