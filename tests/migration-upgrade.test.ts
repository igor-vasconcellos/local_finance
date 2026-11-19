import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { describe, expect, it } from "vitest";
import { runMigrations } from "@/db/migrate";
import * as schema from "@/db/schema";

/**
 * Atualização de um banco da versão de conta única (migrações 0000–0003) para a de
 * várias contas (0004): nada pode se perder e tudo passa a pertencer à conta existente.
 */
function migrationsUpTo(tag: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lf-mig-"));
  fs.mkdirSync(path.join(dir, "meta"));
  const journal = JSON.parse(fs.readFileSync("drizzle/meta/_journal.json", "utf8"));
  const idx = journal.entries.findIndex((e: { tag: string }) => e.tag === tag);
  journal.entries = journal.entries.slice(0, idx + 1);
  fs.writeFileSync(path.join(dir, "meta/_journal.json"), JSON.stringify(journal));
  for (const e of journal.entries) fs.copyFileSync(`drizzle/${e.tag}.sql`, path.join(dir, `${e.tag}.sql`));
  return dir;
}

describe("migração para várias contas", () => {
  it("preserva os dados da conta existente e marca o e-mail como confirmado", () => {
    const sqlite = new Database(":memory:");
    sqlite.pragma("foreign_keys = ON");
    const db = drizzle(sqlite, { schema });
    runMigrations(sqlite, db, migrationsUpTo("0003_invoice_import"));

    const run = (q: string) => sqlite.prepare(q).run();
    run(`INSERT INTO users (id, name, email, password_hash) VALUES (1, 'Igor', 'igor@example.com', 'x')`);
    run(`INSERT INTO settings (id, green_threshold_bp, account_balance_cents) VALUES (1, 2500, 12345)`);
    run(`INSERT INTO cdi_rates (annual_rate_bp, effective_from) VALUES (1365, '2026-11-05')`);
    run(`INSERT INTO categories (id, name, kind) VALUES (1, 'Moradia', 'expense')`);
    run(`INSERT INTO institutions (id, name) VALUES (1, 'Nubank')`);
    run(`INSERT INTO credit_cards (id, name, institution_id, limit_cents, closing_day, due_day) VALUES (1, 'Nubank', 1, 100000, 3, 10)`);
    run(`INSERT INTO invoices (id, card_id, reference_month, closing_date, due_date) VALUES (1, 1, '2026-12', '2026-12-03', '2026-12-10')`);
    run(`INSERT INTO card_purchases (id, card_id, description, category_id, total_cents, installments_count, purchase_date) VALUES (1, 1, 'TV', 1, 5000, 1, '2026-11-20')`);
    run(`INSERT INTO installments (purchase_id, invoice_id, number, amount_cents) VALUES (1, 1, 1, 5000)`);
    run(`INSERT INTO recurring_expenses (name, category_id, amount_cents, due_day, start_month) VALUES ('Aluguel', 1, 100000, 10, '2026-11')`);
    run(`INSERT INTO savings_boxes (id, institution_id, name, cdi_percent_bp) VALUES (1, 1, 'Reserva', 11500)`);
    run(`INSERT INTO box_transactions (box_id, type, amount_cents, date) VALUES (1, 'deposit', 1000, '2026-11-10')`);
    run(`INSERT INTO auth_challenges (id, user_id, code_hash, expires_at) VALUES ('c1', 1, 'h', '2026-01-01')`);

    runMigrations(sqlite, db, "./drizzle");

    const one = (q: string) => sqlite.prepare(q).get() as Record<string, unknown>;
    expect(one("SELECT email_verified_at IS NOT NULL AS v FROM users WHERE id = 1").v).toBe(1);
    expect(one("SELECT user_id, green_threshold_bp, account_balance_cents FROM settings")).toEqual({
      user_id: 1,
      green_threshold_bp: 2500,
      account_balance_cents: 12345,
    });
    for (const t of ["cdi_rates", "categories", "institutions", "credit_cards", "recurring_expenses", "savings_boxes"]) {
      expect(one(`SELECT count(*) AS n, min(user_id) AS u FROM ${t}`)).toEqual({ n: 1, u: 1 });
    }
    expect(one("SELECT count(*) AS n FROM installments").n).toBe(1);
    expect(one("SELECT count(*) AS n FROM box_transactions").n).toBe(1);
    expect(one("SELECT purpose FROM auth_challenges").purpose).toBe("login");
    expect(sqlite.pragma("foreign_key_check")).toEqual([]);
    expect(sqlite.pragma("foreign_keys", { simple: true })).toBe(1);
  });

  it("banco novo sem contas: descarta os dados padrão antigos (cada conta recebe os seus no cadastro)", () => {
    const sqlite = new Database(":memory:");
    const db = drizzle(sqlite, { schema });
    runMigrations(sqlite, db, migrationsUpTo("0003_invoice_import"));
    sqlite.prepare(`INSERT INTO settings (id) VALUES (1)`).run();
    sqlite.prepare(`INSERT INTO categories (name, kind) VALUES ('Moradia', 'expense')`).run();
    runMigrations(sqlite, db, "./drizzle");
    expect((sqlite.prepare("SELECT count(*) AS n FROM categories").get() as { n: number }).n).toBe(0);
    expect((sqlite.prepare("SELECT count(*) AS n FROM settings").get() as { n: number }).n).toBe(0);
  });
});
