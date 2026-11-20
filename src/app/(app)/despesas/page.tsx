import type { Metadata } from "next";
import { CalendarDays, Receipt, Repeat, Tags } from "lucide-react";
import Link from "next/link";
import { MonthNav } from "@/components/finance/month-nav";
import { buttonVariants } from "@/components/ui/button";
import { Card, PageHeader, StatCard } from "@/components/ui/page";
import { addMonths, currentMonth, formatMonthLong, formatMonthShort, todayISO } from "@/lib/dates";
import { formatBRL } from "@/lib/money";
import { cn } from "@/lib/utils";
import { requireUserId } from "@/server/auth/current";
import { listCategories } from "@/server/finance/categories";
import { expenseAppliesTo, listExpenses } from "@/server/finance/expenses";
import { listOneTimeInMonth } from "@/server/finance/one-time";
import { ExpensesView } from "./expenses-view";
import { OneTimeView } from "./one-time-view";

export const metadata: Metadata = { title: "Despesas" };

export default async function ExpensesPage({ searchParams }: PageProps<"/despesas">) {
  const uid = await requireUserId();
  const sp = await searchParams;
  const tab = sp.aba === "avulsas" ? "avulsas" : "fixas";
  const current = currentMonth();
  const [expenses, categories] = await Promise.all([listExpenses(uid), listCategories(uid, "expense")]);

  const tabs = (
    <nav aria-label="Tipo de despesa" className="mb-6 flex gap-2">
      {(
        [
          ["fixas", "Fixas", "/despesas", Repeat],
          ["avulsas", "Avulsas", "/despesas?aba=avulsas", Receipt],
        ] as const
      ).map(([key, label, href, Icon]) => (
        <Link
          key={key}
          href={href}
          aria-current={tab === key ? "page" : undefined}
          className={cn(buttonVariants({ variant: tab === key ? "primary" : "secondary", size: "sm" }))}
        >
          <Icon aria-hidden /> {label}
        </Link>
      ))}
    </nav>
  );

  if (tab === "avulsas") {
    const month = typeof sp.mes === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.mes) ? sp.mes : current;
    const items = await listOneTimeInMonth(uid, month);
    const total = items.reduce((a, i) => a + i.amountCents, 0);
    const pending = items.filter((i) => !i.paidAt);
    return (
      <>
        <PageHeader
          title="Despesas"
          description="Despesas avulsas: acontecem uma vez só (um conserto, um presente, uma compra no Pix…)."
          actions={<MonthNav month={month} current={current} basePath="/despesas?aba=avulsas" />}
        />
        {tabs}
        <div className="mb-8 grid gap-4 sm:grid-cols-3">
          <StatCard
            label={`Avulsas em ${formatMonthLong(month).toLowerCase()}`}
            value={formatBRL(total)}
            hint={`${items.length} ${items.length === 1 ? "despesa" : "despesas"}`}
            icon={<Receipt />}
            tone="danger"
          />
          <StatCard
            label="A pagar"
            value={formatBRL(pending.reduce((a, i) => a + i.amountCents, 0))}
            hint={pending.length ? `${pending.length} pendente${pending.length === 1 ? "" : "s"}` : "Tudo pago"}
            icon={<CalendarDays />}
          />
          <StatCard
            label="Pagas"
            value={formatBRL(total - pending.reduce((a, i) => a + i.amountCents, 0))}
            hint="já saíram do saldo"
            icon={<Tags />}
            tone="primary"
          />
        </div>
        <OneTimeView items={items} categories={categories} month={month} today={todayISO()} />
      </>
    );
  }

  const month = current;
  const active = expenses.filter((e) => expenseAppliesTo(e, month));
  const total = active.reduce((a, e) => a + e.amountCents, 0);

  const byCategory = Object.values(
    active.reduce<Record<string, { name: string; color: string | null; cents: number }>>((acc, e) => {
      acc[e.categoryName] ??= { name: e.categoryName, color: e.categoryColor, cents: 0 };
      acc[e.categoryName].cents += e.amountCents;
      return acc;
    }, {}),
  ).sort((a, b) => b.cents - a.cents);

  const today = Number(todayISO().slice(8, 10));
  const byDay = [...active].sort((a, b) => a.dueDay - b.dueDay);
  const nextThisMonth = byDay.find((e) => e.dueDay >= today);
  const nextMonth = addMonths(month, 1);
  const next = nextThisMonth ?? byDay.find((e) => expenseAppliesTo(e, nextMonth));

  return (
    <>
      <PageHeader title="Despesas" description="Despesas fixas: se repetem todo mês (aluguel, contas, assinaturas…)." />
      {tabs}

      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <StatCard
          label={`Fixas em ${formatMonthLong(month).toLowerCase()}`}
          value={formatBRL(total)}
          hint={`${active.length} ${active.length === 1 ? "despesa ativa" : "despesas ativas"}`}
          icon={<Receipt />}
          tone="danger"
        />
        <StatCard
          label="Próximo vencimento"
          value={
            next ? (nextThisMonth ? `Dia ${next.dueDay}` : `${next.dueDay} de ${formatMonthShort(nextMonth).split("/")[0]}`) : "—"
          }
          hint={next ? `${next.name} · ${formatBRL(next.amountCents)}` : "Nenhuma despesa ativa"}
          icon={<CalendarDays />}
        />
        <StatCard
          label="Maior categoria"
          value={byCategory[0]?.name ?? "—"}
          hint={
            byCategory[0]
              ? `${formatBRL(byCategory[0].cents)} · ${Math.round((byCategory[0].cents / total) * 100)}% do total`
              : undefined
          }
          icon={<Tags />}
          tone="primary"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <ExpensesView expenses={expenses} categories={categories} defaultMonth={month} today={todayISO()} />

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
    </>
  );
}
