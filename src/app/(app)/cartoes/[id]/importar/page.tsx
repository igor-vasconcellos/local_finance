import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { listCategories } from "@/server/finance/categories";
import { getCard } from "@/server/finance/cards";
import { ImportWizard } from "./import-wizard";

export const metadata: Metadata = { title: "Importar fatura" };

export default async function ImportPage({ params }: PageProps<"/cartoes/[id]/importar">) {
  const id = Number((await params).id);
  const row = Number.isInteger(id) ? getCard(id) : undefined;
  if (!row) notFound();
  const { card } = row;

  return (
    <ImportWizard
      card={{ id: card.id, name: card.name, closingDay: card.closingDay, dueDay: card.dueDay }}
      categories={listCategories("expense")}
    />
  );
}
