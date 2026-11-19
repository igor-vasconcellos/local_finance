import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page";
import { currentMonth, todayISO } from "@/lib/dates";
import { listCards } from "@/server/finance/cards";
import { listCategories } from "@/server/finance/categories";
import { projectMonths } from "@/server/finance/projection";
import { listSimulations } from "@/server/finance/simulations";
import { SimulatorView } from "./simulator-view";
import { requireUserId } from "@/server/auth/current";

export const metadata: Metadata = { title: "Simulador" };

export default async function SimulatorPage() {
  const uid = await requireUserId();
  const today = todayISO();
  const { months, thresholds } = projectMonths(uid, currentMonth(), 12, today);
  const cards = listCards(uid, today)
    .filter((c) => c.active)
    .map((c) => ({
      id: c.id,
      name: c.name,
      closingDay: c.closingDay,
      dueDay: c.dueDay,
      availableCents: Math.max(0, c.limitCents - c.usedCents),
    }));

  return (
    <>
      <PageHeader
        title="Simulador de compras"
        description="Veja o impacto de uma compra nos próximos 12 meses antes de fazer. Nada aqui altera seus dados reais até você efetivar."
      />
      <SimulatorView
        months={months}
        thresholds={thresholds}
        cards={cards}
        categories={listCategories(uid, "expense")}
        simulations={listSimulations(uid)}
        today={today}
      />
    </>
  );
}
