import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // Nos testes o banco é um Postgres em memória (PGlite), não o Supabase.
      "@/db/client": path.resolve(import.meta.dirname, "tests/helpers/pglite-client.ts"),
      "@": path.resolve(import.meta.dirname, "src"),
      "server-only": path.resolve(import.meta.dirname, "tests/helpers/empty.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/helpers/setup.ts"],
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
