/**
 * Garante os dados iniciais (configurações, taxa CDI e categorias padrão) de todas as
 * contas. Idempotente. Contas novas já recebem esses dados ao confirmar o cadastro.
 */
import "./_load-env";
import { db } from "@/db/client";
import { seedUserDefaults } from "@/db/defaults";
import { users } from "@/db/schema";

async function main() {
  const ids = await db.select({ id: users.id }).from(users);
  for (const { id } of ids) await db.transaction((tx) => seedUserDefaults(tx, id));
  console.log(`✅ Dados iniciais conferidos em ${ids.length} conta(s).`);
  process.exit(0);
}

main().catch((error) => {
  console.error("❌", error instanceof Error ? error.message : error);
  process.exit(1);
});
