import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";

/** Zera o banco de teste e cria uma conta já confirmada. Devolve o id. */
export async function freshUser(email = "igor@example.com", name = "Igor"): Promise<number> {
  const rows = await db.execute<{ tablename: string }>(sql`select tablename from pg_tables where schemaname = 'public'`);
  const names = (rows as unknown as { rows?: { tablename: string }[] }).rows ?? (rows as unknown as { tablename: string }[]);
  const list = names.map((r) => `"${r.tablename}"`).join(", ");
  if (list) await db.execute(sql.raw(`TRUNCATE ${list} RESTART IDENTITY CASCADE`));
  return addUser(email, name);
}

/** Conta adicional (para testar isolamento entre contas). */
export async function addUser(email: string, name = "Outra Pessoa"): Promise<number> {
  const [row] = await db
    .insert(users)
    .values({ name, email, passwordHash: "x", emailVerifiedAt: new Date().toISOString() })
    .returning({ id: users.id });
  return row.id;
}
