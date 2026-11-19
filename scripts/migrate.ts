import "./_load-env";
import { runMigrations } from "@/db/migrate";

async function main() {
  // Pooler do Supabase: a porta 5432 do mesmo host é o modo sessão (melhor para migrações).
  const pooled = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  const session = pooled?.includes(".pooler.supabase.com:6543") ? pooled.replace(":6543", ":5432") : undefined;
  const url = process.env.DIRECT_URL || session || pooled;
  if (!url) throw new Error("Defina DIRECT_URL ou DATABASE_URL (ou POSTGRES_URL, da integração Vercel ↔ Supabase).");
  await runMigrations(url);
  console.log("✅ Migrações aplicadas.");
}

main().catch((error) => {
  console.error("❌", error instanceof Error ? error.message : error);
  process.exit(1);
});
