import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { projectSeries } from "@/lib/cdi";
import { monthOf, todayISO } from "@/lib/dates";
import { getBoxDetail, listBoxInstitutionNames } from "@/server/finance/boxes";
import { BoxDetailView } from "./box-detail-view";
import { requireUserId } from "@/server/auth/current";

export async function generateMetadata({ params }: PageProps<"/caixinhas/[id]">): Promise<Metadata> {
  const uid = await requireUserId();
  const box = getBoxDetail(uid, Number((await params).id));
  return { title: box ? box.name : "Caixinha" };
}

export default async function BoxDetailPage({ params }: PageProps<"/caixinhas/[id]">) {
  const uid = await requireUserId();
  const id = Number((await params).id);
  const today = todayISO();
  const box = Number.isInteger(id) ? getBoxDetail(uid, id, today) : null;
  if (!box) notFound();

  // Projeção de 12 meses com a taxa atual (+ aporte mensal sugerido pela meta, se houver).
  const monthlyDeposit = box.goal && !box.goal.reached ? (box.goal.monthlyDepositCents ?? 0) : 0;
  const projection = box.balanceCents > 0 || monthlyDeposit
    ? projectSeries(box.balanceCents, box.currentAnnualRateBp, box.cdiPercentBp, monthOf(today), 12, monthlyDeposit)
    : [];

  return (
    <BoxDetailView
      box={box}
      projection={projection}
      projectionWithDeposit={monthlyDeposit > 0}
      institutions={listBoxInstitutionNames(uid)}
      today={today}
    />
  );
}
