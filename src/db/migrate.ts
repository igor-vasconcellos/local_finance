import { migrate as migratePg } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

/**
 * Aplica as migrações pendentes (pasta ./drizzle), de preferência pela conexão de
 * sessão (DIRECT_URL, porta 5432); o pooler em modo transação também funciona.
 * Roda no build da Vercel (`npm run vercel-build`) e pelo `npm run db:migrate`.
 */
export async function runMigrations(url: string, migrationsFolder = "./drizzle") {
  const clean = new URL(url);
  for (const key of [...clean.searchParams.keys()]) if (key !== "sslmode") clean.searchParams.delete(key);
  const client = postgres(clean.toString(), { max: 1, prepare: false, onnotice: () => {} });
  try {
    await migratePg(drizzle(client), { migrationsFolder });
  } finally {
    await client.end();
  }
}
