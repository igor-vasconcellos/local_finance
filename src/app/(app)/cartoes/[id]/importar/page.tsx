import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { listCategories } from "@/server/finance/categories";
import { getCard } from "@/server/finance/cards";
import { ImportWizard } from "./import-wizard";
import { requireUserId } from "@/server/auth/current";

export const metadata: Metadata = { title: "Importar fatura" };

export default async function ImportPage({ params }: PageProps<"/cartoes/[id]/importar">) {
  const uid = await requireUserId();
  const id = Number((await params).id);
  const row = Number.isInteger(id) ? getCard(uid, id) : undefined;
  if (!row) notFound();
  const { card } = row;

  return (
    <ImportWizard
      card={{ id: card.id, name: card.name, closingDay: card.closingDay, dueDay: card.dueDay }}
      categories={listCategories(uid, "expense")}
    />
  );
}
