import type { Metadata } from "next";
import { CalendarDays, Receipt, Tags } from "lucide-react";
import { Card, PageHeader, StatCard } from "@/components/ui/page";
import { addMonths, currentMonth, formatMonthLong, formatMonthShort } from "@/lib/dates";
import { formatBRL } from "@/lib/money";
import { listCategories } from "@/server/finance/categories";
import { expenseAppliesTo, listExpenses } from "@/server/finance/expenses";
import { listOneTimeExpenses } from "@/server/finance/one-time";
import { ExpensesView } from "./expenses-view";
import { OneTimeList } from "./one-time-list";
import { requireUserId } from "@/server/auth/current";

export const metadata: Metadata = { title: "Gastos fixos" };

export default async function ExpensesPage() {
  const uid = await requireUserId();
  const expenses = listExpenses(uid);
  const categories = listCategories(uid, "expense");
  const month = currentMonth();

  const active = expenses.filter((e) => expenseAppliesTo(e, month));
  const total = active.reduce((a, e) => a + e.amountCents, 0);

  const byCategory = Object.values(
    active.reduce<Record<string, { name: string; color: string | null; cents: number }>>((acc, e) => {
      acc[e.categoryName] ??= { name: e.categoryName, color: e.categoryColor, cents: 0 };
      acc[e.categoryName].cents += e.amountCents;
      return acc;
    }, {}),
  ).sort((a, b) => b.cents - a.cents);

  const today = new Date().getDate();
  const byDay = [...active].sort((a, b) => a.dueDay - b.dueDay);
  const nextThisMonth = byDay.find((e) => e.dueDay >= today);
  const nextMonth = addMonths(month, 1);
  const next = nextThisMonth ?? byDay.find((e) => expenseAppliesTo(e, nextMonth));

  return (
    <>
      <PageHeader title="Gastos fixos" description="Despesas que se repetem todo mês: aluguel, contas, assinaturas…" />

      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <StatCard
          label={`Total em ${formatMonthLong(month).toLowerCase()}`}
          value={formatBRL(total)}
          hint={`${active.length} ${active.length === 1 ? "gasto ativo" : "gastos ativos"}`}
          icon={<Receipt />}
          tone="danger"
        />
        <StatCard
          label="Próximo vencimento"
          value={next ? (nextThisMonth ? `Dia ${next.dueDay}` : `${next.dueDay} de ${formatMonthShort(nextMonth).split("/")[0]}`) : "—"}
          hint={next ? `${next.name} · ${formatBRL(next.amountCents)}` : "Nenhum gasto ativo"}
          icon={<CalendarDays />}
        />
        <StatCard
          label="Maior categoria"
          value={byCategory[0]?.name ?? "—"}
          hint={byCategory[0] ? `${formatBRL(byCategory[0].cents)} · ${Math.round((byCategory[0].cents / total) * 100)}% do total` : undefined}
          icon={<Tags />}
          tone="primary"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <ExpensesView expenses={expenses} categories={categories} defaultMonth={month} />

        {byCategory.length > 0 && (
          <Card className="h-fit p-5">
            <h2 className="mb-4 font-semibold">Por categoria</h2>
            <ul className="grid gap-3">
              {byCategory.map((c) => {
                const pct = Math.round((c.cents / total) * 100);
                return (
                  <li key={c.name} className="grid gap-1.5">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="flex items-center gap-2">
                        <span className="size-2 rounded-full" style={{ background: c.color ?? "var(--muted-foreground)" }} aria-hidden />
                        {c.name}
                      </span>
                      <span className="tabular-nums text-muted-foreground">{formatBRL(c.cents)}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="presentation">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: c.color ?? "var(--primary)" }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </div>

      <OneTimeList items={listOneTimeExpenses(uid)} />
    </>
  );
}
