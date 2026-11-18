/**
 * Backup consistente do banco (usa a API de backup do SQLite, segura mesmo
 * com o app rodando). Gera data/backups/financeiro-AAAA-MM-DD_HH-MM-SS.db
 */
import "./_load-env";
import fs from "node:fs";
import path from "node:path";
import { env } from "@/env";
import { openSqlite } from "@/db/client";

const source = path.resolve(env.DATABASE_PATH);
if (!fs.existsSync(source)) {
  console.error(`❌ Banco não encontrado em ${source}. Rode \`npm run db:setup\` primeiro.`);
  process.exit(1);
}

const dir = path.join(path.dirname(source), "backups");
fs.mkdirSync(dir, { recursive: true });

const stamp = new Date().toISOString().slice(0, 19).replace("T", "_").replaceAll(":", "-");
const target = path.join(dir, `financeiro-${stamp}.db`);

const db = openSqlite(source);
db.backup(target)
  .then(() => console.log(`✅ Backup salvo em ${target}`))
  .catch((err: unknown) => {
    console.error("❌ Falha no backup:", err);
    process.exitCode = 1;
  })
  .finally(() => db.close());
