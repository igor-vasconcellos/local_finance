import { db, sqlite } from "@/db/client";
import { users } from "@/db/schema";

/** Zera o banco de teste e cria uma conta já confirmada. Devolve o id. */
export function freshUser(email = "igor@example.com", name = "Igor"): number {
  const tables = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%'")
    .all() as { name: string }[];
  sqlite.pragma("foreign_keys = OFF");
  for (const { name: t } of tables) sqlite.prepare(`DELETE FROM "${t}"`).run();
  sqlite.pragma("foreign_keys = ON");
  return addUser(email, name);
}

/** Conta adicional (para testar isolamento entre contas). */
export function addUser(email: string, name = "Outra Pessoa"): number {
  return db
    .insert(users)
    .values({ name, email, passwordHash: "x", emailVerifiedAt: new Date().toISOString() })
    .returning({ id: users.id })
    .get().id;
}
