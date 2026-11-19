import path from "node:path";
import { db, sqlite } from "@/db/client";
import { runMigrations } from "@/db/migrate";

/** Aplica migrações pendentes ao iniciar. Os dados iniciais são criados por conta, no cadastro. */
runMigrations(sqlite, db, path.join(/*turbopackIgnore: true*/ process.cwd(), "drizzle"));
