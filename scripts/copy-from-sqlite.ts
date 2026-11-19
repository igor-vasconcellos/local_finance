/**
 * Copia (uma única vez) os dados do banco SQLite antigo para o Postgres (Supabase).
 *
 * Uso:   npm run db:copy-from-sqlite -- caminho/para/financeiro.db
 *
 * - O destino é o DIRECT_URL (ou DATABASE_URL) do .env; as tabelas já precisam existir
 *   (rode `npm run db:migrate` antes).
 * - O SQLite precisa estar na versão da Etapa 8 (várias contas): abra a versão anterior
 *   do app pelo menos uma vez para ele se atualizar.
 * - Por segurança, só copia para um banco VAZIO (sem contas). Tudo numa transação:
 *   se algo falhar, nada é gravado.
 * - Sessões, códigos e contadores de tentativas não são copiados (são temporários).
 */
import "./_load-env";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import postgres from "postgres";

/** Ordem respeita as chaves estrangeiras. */
const TABLES = [
  "users",
  "settings",
  "cdi_rates",
  "categories",
  "institutions",
  "credit_cards",
  "invoices",
  "simulations",
  "invoice_imports",
  "card_purchases",
  "installments",
  "invoice_credits",
  "merchant_rules",
  "income_sources",
  "recurring_expenses",
  "one_time_expenses",
  "savings_boxes",
  "box_transactions",
  "simulation_installments",
  "monthly_settlements",
];

async function main() {
  const file = process.argv[2];
  if (!file || !fs.existsSync(file))
    throw new Error("Informe o caminho do arquivo .db: npm run db:copy-from-sqlite -- data/financeiro.db");
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!url) throw new Error("Defina DIRECT_URL (ou DATABASE_URL) no .env.");

  const lite = new DatabaseSync(file, { readOnly: true });
  const userCols = lite.prepare("PRAGMA table_info(users)").all() as { name: string }[];
  if (!userCols.some((c) => c.name === "email_verified_at")) {
    throw new Error("Este banco SQLite é de uma versão antiga. Abra a versão da Etapa 8 do app uma vez para atualizá-lo.");
  }

  const pg = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
  try {
    const [{ n }] = await pg<{ n: number }[]>`select count(*)::int as n from users`;
    if (n > 0) throw new Error("O banco de destino já tem contas. Por segurança, a cópia só roda num banco vazio.");

    await pg.begin(async (tx) => {
      for (const table of TABLES) {
        const exists = lite.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
        if (!exists) continue;
        const rows = lite.prepare(`SELECT * FROM "${table}"`).all() as Record<string, unknown>[];
        if (!rows.length) {
          console.log(`  ${table}: 0`);
          continue;
        }
        // Colunas e tipos do destino: só copia o que existe lá; 0/1 vira booleano.
        const cols = await tx<{ column_name: string; data_type: string }[]>`
          select column_name, data_type from information_schema.columns
          where table_schema = 'public' and table_name = ${table}`;
        const types = new Map(cols.map((c) => [c.column_name, c.data_type]));
        const data = rows.map((r) =>
          Object.fromEntries(
            Object.entries(r)
              .filter(([k]) => types.has(k))
              .map(([k, v]) => [k, types.get(k) === "boolean" && v !== null ? Boolean(v) : v]),
          ),
        );
        for (let i = 0; i < data.length; i += 500) {
          const chunk = data.slice(i, i + 500);
          await tx`insert into ${tx(table)} ${tx(chunk as Record<string, string>[])}`;
        }
        if (types.has("id") && table !== "settings") {
          await tx`select setval(pg_get_serial_sequence(${table}, 'id'), (select coalesce(max(id), 1) from ${tx(table)}))`;
        }
        console.log(`  ${table}: ${rows.length}`);
      }
    });
    console.log("✅ Cópia concluída.");
  } finally {
    await pg.end();
    lite.close();
  }
}

main().catch((error) => {
  console.error("❌", error instanceof Error ? error.message : error);
  process.exit(1);
});
