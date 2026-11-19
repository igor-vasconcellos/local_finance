import type { Metadata } from "next";
import { CreditCard, Landmark, Wallet } from "lucide-react";
import { PageHeader, StatCard } from "@/components/ui/page";
import { formatBRL } from "@/lib/money";
import { listCards, listInstitutionNames } from "@/server/finance/cards";
import { CardsView } from "./cards-view";
import { requireUserId } from "@/server/auth/current";

export const metadata: Metadata = { title: "Cartões" };

export default async function CardsPage() {
  const uid = await requireUserId();
  const cards = listCards(uid);
  const active = cards.filter((c) => c.active);

  const totalLimit = active.reduce((a, c) => a + c.limitCents, 0);
  const totalUsed = active.reduce((a, c) => a + c.usedCents, 0);
  const currentInvoices = active
    .filter((c) => c.currentInvoice.status !== "paid")
    .reduce((a, c) => a + c.currentInvoice.totalCents, 0);

  return (
    <>
      <PageHeader title="Cartões" description="Seus cartões de crédito, faturas e compras parceladas." />

      {cards.length > 0 && (
        <div className="mb-8 grid gap-4 sm:grid-cols-3">
          <StatCard label="Faturas atuais a pagar" value={formatBRL(currentInvoices)} hint="Fatura corrente de cada cartão, exceto as já pagas" icon={<CreditCard />} tone="danger" />
          <StatCard
            label="Limite comprometido"
            value={formatBRL(totalUsed)}
            hint={totalLimit ? `${Math.round((totalUsed / totalLimit) * 100)}% de ${formatBRL(totalLimit)}` : undefined}
            icon={<Landmark />}
          />
          <StatCard label="Limite disponível" value={formatBRL(Math.max(0, totalLimit - totalUsed))} icon={<Wallet />} tone="success" />
        </div>
      )}

      <CardsView cards={cards} institutions={listInstitutionNames(uid)} />
    </>
  );
}
