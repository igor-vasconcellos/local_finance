import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { firstInvoiceFor, todayISO } from "@/lib/dates";
import { listCategories } from "@/server/finance/categories";
import {
  getCard,
  getInvoiceDetail,
  listCards,
  listInstitutionNames,
  listInvoiceMonths,
  listPurchases,
} from "@/server/finance/cards";
import { CardDetailView } from "./card-detail-view";

export async function generateMetadata({ params }: PageProps<"/cartoes/[id]">): Promise<Metadata> {
  const row = getCard(Number((await params).id));
  return { title: row ? row.card.name : "Cartão" };
}

export default async function CardDetailPage({ params, searchParams }: PageProps<"/cartoes/[id]">) {
  const id = Number((await params).id);
  const row = Number.isInteger(id) ? getCard(id) : undefined;
  if (!row) notFound();
  const { card, institutionName } = row;

  const today = todayISO();
  const currentRef = firstInvoiceFor(today, card.closingDay, card.dueDay).referenceMonth;
  const requested = (await searchParams).fatura;
  const selected = typeof requested === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(requested) ? requested : currentRef;

  const months = listInvoiceMonths(card.id, today);
  const monthSet = new Set([...months.map((m) => m.referenceMonth), currentRef, selected]);
  const tabs = [...monthSet].sort().map((ref) => ({
    referenceMonth: ref,
    totalCents: months.find((m) => m.referenceMonth === ref)?.totalCents ?? 0,
    isCurrent: ref === currentRef,
  }));

  const invoice = getInvoiceDetail(card.id, selected, today)!;
  const purchases = listPurchases(card.id);
  const allCards = listCards(today);
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
      categories={listCategories("expense")}
      institutions={listInstitutionNames()}
      today={today}
    />
  );
}
