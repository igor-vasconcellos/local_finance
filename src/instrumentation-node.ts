import path from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db } from "@/db/client";
import { settings } from "@/db/schema";

/** Aplica migrações pendentes e garante a linha de configurações. */
migrate(db, { migrationsFolder: path.join(/*turbopackIgnore: true*/ process.cwd(), "drizzle") });
db.insert(settings).values({ id: 1 }).onConflictDoNothing().run();
