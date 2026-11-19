import type { Metadata } from "next";
import { CalendarClock, Repeat, TrendingUp } from "lucide-react";
import { PageHeader, StatCard } from "@/components/ui/page";
import { currentMonth, formatMonthLong, todayISO } from "@/lib/dates";
import { formatBRL } from "@/lib/money";
import { listCategories } from "@/server/finance/categories";
import { incomeAppliesTo, listIncomes } from "@/server/finance/incomes";
import { IncomesView } from "./incomes-view";
import { requireUserId } from "@/server/auth/current";

export const metadata: Metadata = { title: "Rendas" };

export default async function IncomesPage() {
  const uid = await requireUserId();
  const incomes = listIncomes(uid);
  const categories = listCategories(uid, "income");
  const month = currentMonth();
  const today = todayISO();

  const thisMonth = incomes.filter((i) => incomeAppliesTo(i, month)).reduce((a, i) => a + i.amountCents, 0);
  const recurring = incomes.filter((i) => i.active && i.recurrence === "monthly");
  const upcoming = incomes.filter((i) => i.active && i.recurrence === "once" && i.payDate && i.payDate >= today);

  return (
    <>
      <PageHeader
        title="Rendas"
        description="Salário, pró-labore e rendas extras que entram na sua conta."
      />

      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <StatCard
          label={`Previsto em ${formatMonthLong(month).toLowerCase()}`}
          value={formatBRL(thisMonth)}
          icon={<TrendingUp />}
          tone="success"
        />
        <StatCard
          label="Rendas mensais ativas"
          value={formatBRL(recurring.reduce((a, i) => a + i.amountCents, 0))}
          hint={`${recurring.length} ${recurring.length === 1 ? "fonte" : "fontes"} recorrente${recurring.length === 1 ? "" : "s"}`}
          icon={<Repeat />}
          tone="primary"
        />
        <StatCard
          label="Rendas únicas a receber"
          value={formatBRL(upcoming.reduce((a, i) => a + i.amountCents, 0))}
          hint={upcoming.length ? `${upcoming.length} lançamento${upcoming.length === 1 ? "" : "s"}` : "Nenhuma prevista"}
          icon={<CalendarClock />}
        />
      </div>

      <IncomesView incomes={incomes} categories={categories} defaultMonth={month} today={today} />
    </>
  );
}
