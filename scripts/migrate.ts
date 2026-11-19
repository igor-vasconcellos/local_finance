import "./_load-env";
import { runMigrations } from "@/db/migrate";

async function main() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!url) throw new Error("Defina DIRECT_URL (ou DATABASE_URL) no .env.");
  await runMigrations(url);
  console.log("✅ Migrações aplicadas.");
}

main().catch((error) => {
  console.error("❌", error instanceof Error ? error.message : error);
  process.exit(1);
});
