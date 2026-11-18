import "./_load-env";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { env } from "@/env";
import { db, sqlite } from "@/db/client";

migrate(db, { migrationsFolder: "./drizzle" });
console.log(`✅ Migrações aplicadas em ${env.DATABASE_PATH}`);
sqlite.close();
