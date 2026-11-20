import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { listCategories } from "@/server/finance/categories";
import { getCard } from "@/server/finance/cards";
import { ImportWizard } from "./import-wizard";
import { FeatureLocked } from "@/components/access/feature-locked";
import { requireAccess } from "@/server/access/guard";

export const metadata: Metadata = { title: "Importar fatura" };

export default async function ImportPage({ params }: PageProps<"/cartoes/[id]/importar">) {
  const { session, access } = await requireAccess();
  const lock = access.locked.invoice_import;
  if (lock) return <FeatureLocked title="Importar fatura" message={lock.message} />;
  const uid = session.user.id;
  const id = Number((await params).id);
  const row = Number.isInteger(id) ? await getCard(uid, id) : undefined;
  if (!row) notFound();
  const { card } = row;

  return (
    <ImportWizard
      card={{ id: card.id, name: card.name, closingDay: card.closingDay, dueDay: card.dueDay }}
      categories={await listCategories(uid, "expense")}
    />
  );
}
