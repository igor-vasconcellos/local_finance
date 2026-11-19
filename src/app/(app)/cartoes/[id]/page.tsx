import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { firstInvoiceFor, todayISO } from "@/lib/dates";
import { listCategories } from "@/server/finance/categories";
import { requireUserId } from "@/server/auth/current";
import {
  getCard,
  getInvoiceDetail,
  listCards,
  listInstitutionNames,
  listInvoiceMonths,
  listPurchases,
} from "@/server/finance/cards";
import { listImports } from "@/server/import/service";
import { CardDetailView } from "./card-detail-view";

export async function generateMetadata({ params }: PageProps<"/cartoes/[id]">): Promise<Metadata> {
  const uid = await requireUserId();
  const row = await getCard(uid, Number((await params).id));
  return { title: row ? row.card.name : "Cartão" };
}

export default async function CardDetailPage({ params, searchParams }: PageProps<"/cartoes/[id]">) {
  const uid = await requireUserId();
  const id = Number((await params).id);
  const row = Number.isInteger(id) ? await getCard(uid, id) : undefined;
  if (!row) notFound();
  const { card, institutionName } = row;

  const today = todayISO();
  const currentRef = firstInvoiceFor(today, card.closingDay, card.dueDay).referenceMonth;
  const requested = (await searchParams).fatura;
  const selected = typeof requested === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(requested) ? requested : currentRef;

  const months = await listInvoiceMonths(uid, card.id, today);
  const monthSet = new Set([...months.map((m) => m.referenceMonth), currentRef, selected]);
  const tabs = [...monthSet].sort().map((ref) => ({
    referenceMonth: ref,
    totalCents: months.find((m) => m.referenceMonth === ref)?.totalCents ?? 0,
    isCurrent: ref === currentRef,
  }));

  const invoice = (await getInvoiceDetail(uid, card.id, selected, today))!;
  const purchases = await listPurchases(uid, card.id);
  const allCards = await listCards(uid, today);
  const cardOptions = allCards
    .filter((c) => c.active || c.id === card.id)
    .map((c) => ({ id: c.id, name: c.name, closingDay: c.closingDay, dueDay: c.dueDay }));
  const summary = allCards.find((c) => c.id === card.id)!;

  return (
    <CardDetailView
      card={{ ...card, institutionName, usedCents: summary.usedCents }}
      tabs={tabs}
      invoice={invoice}
      purchases={purchases}
      cardOptions={cardOptions}
      categories={await listCategories(uid, "expense")}
      institutions={await listInstitutionNames(uid)}
      imports={await listImports(uid, card.id)}
      today={today}
    />
  );
}
