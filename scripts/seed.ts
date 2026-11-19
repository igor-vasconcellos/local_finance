/**
 * Garante os dados iniciais (configurações, taxa CDI e categorias padrão) de todas as
 * contas. Idempotente. Contas novas já recebem esses dados ao confirmar o cadastro.
 */
import "./_load-env";
import { db, sqlite } from "@/db/client";
import { seedUserDefaults } from "@/db/defaults";
import { users } from "@/db/schema";

const ids = db.select({ id: users.id }).from(users).all();
db.transaction((tx) => {
  for (const { id } of ids) seedUserDefaults(tx, id);
});
console.log(`✅ Dados iniciais conferidos em ${ids.length} conta(s).`);
sqlite.close();
