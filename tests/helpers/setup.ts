// Executado antes de cada arquivo de teste: ambiente isolado com banco em memória.

process.env.SESSION_SECRET = "test-secret-test-secret-test-secret-123456";
process.env.DATABASE_PATH = ":memory:";
process.env.MAIL_MODE = "console";
process.env.EMAIL_MX_CHECK = "false";
process.env.TWO_FACTOR_TTL_MINUTES = "5";
process.env.TWO_FACTOR_MAX_ATTEMPTS = "5";
process.env.SESSION_TTL_HOURS = "12";

const { db, sqlite } = await import("@/db/client");
const { runMigrations } = await import("@/db/migrate");
runMigrations(sqlite, db, "./drizzle");
export {};
