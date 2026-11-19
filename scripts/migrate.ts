import "./_load-env";
import { env } from "@/env";
import { db, sqlite } from "@/db/client";
import { runMigrations } from "@/db/migrate";

runMigrations(sqlite, db, "./drizzle");
console.log(`✅ Migrações aplicadas em ${env.DATABASE_PATH}`);
sqlite.close();
