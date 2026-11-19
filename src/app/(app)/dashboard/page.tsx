import type { Metadata } from "next";
import {
  PERIOD_LENGTH,
  PeriodNav,
  SimulationToggle,
  ViewTabs,
  type DashboardState,
  type DashboardView,
} from "@/components/finance/dashboard-controls";
import { PageHeader } from "@/components/ui/page";
import { currentMonth, formatMonthLong, todayISO } from "@/lib/dates";
import { requireSession } from "@/server/auth/current";
import { listSimulations } from "@/server/finance/simulations";
import { MonthlyView } from "./monthly-view";
import { PeriodView } from "./period-view";

export const metadata: Metadata = { title: "Visão geral" };

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const { user } = await requireSession();
  const uid = user.id;
  const params = await searchParams;
  const today = todayISO();
  const current = currentMonth();

  const view: DashboardView = params.visao === "semestral" || params.visao === "anual" ? params.visao : "mensal";
  const start = typeof params.mes === "string" && MONTH_RE.test(params.mes) ? params.mes : current;
  const state: DashboardState = { view, start, current, sim: params.sim === "1" };
  const simCount = (await listSimulations(uid)).filter((s) => s.status === "active" && s.isVisible).length;

  const description =
    view === "mensal"
      ? start === current
        ? "Este é o resumo do seu mês."
        : `Resumo de ${formatMonthLong(start).toLowerCase()}.`
      : `Fluxo de caixa previsto para ${PERIOD_LENGTH[view]} meses.`;

  return (
    <>
      <PageHeader title={`Olá, ${user.name.split(" ")[0]}!`} description={description} actions={<PeriodNav state={state} />} />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <ViewTabs state={state} />
        <SimulationToggle state={state} count={simCount} />
      </div>

      {view === "mensal" ? (
        <MonthlyView uid={uid} month={start} current={current} today={today} sim={state.sim} />
      ) : (
        <PeriodView uid={uid} state={state} length={PERIOD_LENGTH[view]} today={today} />
      )}
    </>
  );
}
