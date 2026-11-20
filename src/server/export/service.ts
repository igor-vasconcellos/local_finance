import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { strToU8, zipSync } from "fflate";
import { db } from "@/db/client";

/**
 * "Exportar meus dados": um .zip com um CSV por tabela, só com os dados da conta.
 * Separador ";" e BOM UTF-8 para abrir direto no Excel em português.
 */

const TABLES: { file: string; query: (uid: number) => SQL }[] = [
  { file: "categorias", query: (u) => sql`select * from categories where user_id = ${u} order by id` },
  { file: "instituicoes", query: (u) => sql`select * from institutions where user_id = ${u} order by id` },
  { file: "rendas", query: (u) => sql`select * from income_sources where user_id = ${u} order by id` },
  { file: "despesas_fixas", query: (u) => sql`select * from recurring_expenses where user_id = ${u} order by id` },
  { file: "despesas_avulsas", query: (u) => sql`select * from one_time_expenses where user_id = ${u} order by id` },
  { file: "cartoes", query: (u) => sql`select * from credit_cards where user_id = ${u} order by id` },
  {
    file: "faturas",
    query: (u) => sql`select i.* from invoices i join credit_cards c on c.id = i.card_id where c.user_id = ${u} order by i.id`,
  },
  {
    file: "compras_cartao",
    query: (u) => sql`select p.* from card_purchases p join credit_cards c on c.id = p.card_id where c.user_id = ${u} order by p.id`,
  },
  {
    file: "parcelas",
    query: (u) =>
      sql`select x.* from installments x join card_purchases p on p.id = x.purchase_id join credit_cards c on c.id = p.card_id where c.user_id = ${u} order by x.id`,
  },
  {
    file: "creditos_fatura",
    query: (u) =>
      sql`select x.* from invoice_credits x join invoices i on i.id = x.invoice_id join credit_cards c on c.id = i.card_id where c.user_id = ${u} order by x.id`,
  },
  {
    file: "importacoes_fatura",
    query: (u) => sql`select x.* from invoice_imports x join credit_cards c on c.id = x.card_id where c.user_id = ${u} order by x.id`,
  },
  { file: "regras_estabelecimento", query: (u) => sql`select * from merchant_rules where user_id = ${u} order by id` },
  { file: "caixinhas", query: (u) => sql`select * from savings_boxes where user_id = ${u} order by id` },
  {
    file: "caixinhas_movimentacoes",
    query: (u) => sql`select t.* from box_transactions t join savings_boxes b on b.id = t.box_id where b.user_id = ${u} order by t.id`,
  },
  { file: "simulacoes", query: (u) => sql`select * from simulations where user_id = ${u} order by id` },
  {
    file: "simulacoes_parcelas",
    query: (u) =>
      sql`select x.* from simulation_installments x join simulations s on s.id = x.simulation_id where s.user_id = ${u} order by x.id`,
  },
  { file: "fechamentos_mensais", query: (u) => sql`select * from monthly_settlements where user_id = ${u} order by id` },
  { file: "configuracoes", query: (u) => sql`select * from settings where user_id = ${u}` },
  { file: "taxas_cdi", query: (u) => sql`select * from cdi_rates where user_id = ${u} order by id` },
];

function cell(value: unknown): string {
  if (value == null) return "";
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  // Fórmulas começando com = + - @ viram texto no Excel (evita "CSV injection").
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[";\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "﻿";
  const cols = Object.keys(rows[0]);
  const lines = [cols.join(";"), ...rows.map((r) => cols.map((c) => cell(r[c])).join(";"))];
  return `﻿${lines.join("\r\n")}\r\n`;
}

const README = `BeaconFinance — exportação dos seus dados

Cada arquivo .csv é uma parte dos seus dados (abre no Excel ou Google Planilhas).
- Valores em dinheiro estão em CENTAVOS (ex.: 12345 = R$ 123,45).
- Percentuais estão em pontos-base (10000 = 100%).
- Datas no formato AAAA-MM-DD; meses no formato AAAA-MM.
`;

export async function exportUserData(uid: number): Promise<Uint8Array> {
  const files: Record<string, Uint8Array> = { "LEIA-ME.txt": strToU8(README) };
  for (const t of TABLES) {
    const res = (await db.execute(t.query(uid))) as unknown as { rows: Record<string, unknown>[] };
    files[`${t.file}.csv`] = strToU8(toCsv(res.rows));
  }
  return zipSync(files, { level: 6 });
}
