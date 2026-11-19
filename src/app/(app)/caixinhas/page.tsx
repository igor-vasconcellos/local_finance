import type { Metadata } from "next";
import { PiggyBank, Sparkles, Target, TrendingUp } from "lucide-react";
import { PageHeader, StatCard } from "@/components/ui/page";
import { todayISO } from "@/lib/dates";
import { formatBRL } from "@/lib/money";
import { annualToMonthlyPct, bpToPct, formatPct } from "@/lib/rates";
import { goalsForMonth, listBoxes, listBoxInstitutionNames } from "@/server/finance/boxes";
import { cdiRateOn } from "@/server/finance/settings";
import { BoxesView } from "./boxes-view";

export const metadata: Metadata = { title: "Caixinhas" };

export default async function BoxesPage() {
  const today = todayISO();
  const boxes = listBoxes(today);
  const cdi = cdiRateOn(today);
  const goals = goalsForMonth(today.slice(0, 7), today);

  const total = boxes.reduce((a, b) => a + b.balanceCents, 0);
  const yieldTotal = boxes.reduce((a, b) => a + b.yieldCents, 0);
  const monthYield = boxes.reduce((a, b) => a + b.monthYieldCents, 0);

  return (
    <>
      <PageHeader
        title="Caixinhas"
        description={
          cdi
            ? `Rendimento calculado sobre o CDI de ${formatPct(annualToMonthlyPct(bpToPct(cdi.annualRateBp)))} ao mês (${formatPct(bpToPct(cdi.annualRateBp))} ao ano), em dias úteis. Valores brutos, sem IR.`
            : "Cadastre a taxa CDI em Configurações para calcular o rendimento."
        }
      />

      {boxes.length > 0 && (
        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total guardado" value={formatBRL(total)} icon={<PiggyBank />} tone="primary" />
          <StatCard label="Rendimento acumulado" value={formatBRL(yieldTotal)} icon={<TrendingUp />} tone="success" />
          <StatCard label="Rendimento previsto no mês" value={formatBRL(monthYield)} hint="Sobre o saldo atual" icon={<Sparkles />} />
          <StatCard
            label="Guardar este mês (metas)"
            value={formatBRL(goals.planned)}
            hint={goals.saved > 0 ? `${formatBRL(goals.saved)} já guardados este mês` : goals.saved < 0 ? `${formatBRL(-goals.saved)} resgatados este mês` : "Para seguir o plano das metas"}
            icon={<Target />}
          />
        </div>
      )}

      <BoxesView boxes={boxes} institutions={listBoxInstitutionNames()} />
    </>
  );
}
