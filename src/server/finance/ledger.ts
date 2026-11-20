import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { daysInMonth, dayOfMonth, type Month } from "@/lib/dates";

/**
 * Saldo em conta CALCULADO (ninguém digita nada): tudo o que foi marcado como
 * recebido − tudo o que foi marcado como pago, somando os meses até o mês
 * escolhido (a sobra de um mês passa para o seguinte).
 *
 * Entra: rendas confirmadas ("Recebi"). Sai: despesas fixas e avulsas marcadas
 * como pagas ("Pagar") e faturas pagas. Caixinhas não mexem no saldo.
 * Cada item conta no seu mês de competência — os mesmos números de "Total recebido"
 * e "Despesas pagas" da Visão geral.
 */
export async function getBalance(uid: number, month: Month): Promise<number> {
  const end = dayOfMonth(month, daysInMonth(month));
  const res = (await db.execute(sql`
    select
      coalesce((select sum(amount_cents) from monthly_settlements
                where user_id = ${uid} and income_id is not null and month <= ${month}), 0)
    - coalesce((select sum(amount_cents) from monthly_settlements
                where user_id = ${uid} and expense_id is not null and month <= ${month}), 0)
    - coalesce((select sum(
                  coalesce((select sum(x.amount_cents) from installments x where x.invoice_id = i.id), 0)
                - coalesce((select sum(c.amount_cents) from invoice_credits c where c.invoice_id = i.id), 0))
                from invoices i join credit_cards k on k.id = i.card_id
                where k.user_id = ${uid} and i.status = 'paid' and i.reference_month <= ${month}), 0)
    - coalesce((select sum(amount_cents) from one_time_expenses
                where user_id = ${uid} and paid_at is not null and date <= ${end}), 0)
    as balance
  `)) as unknown as { rows: { balance: string | number | null }[] };
  return Number(res.rows[0]?.balance ?? 0);
}
