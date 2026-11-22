import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/page";
import { formatDate } from "@/lib/dates";
import { requireAccess } from "@/server/access/guard";
import { getAccessForUser } from "@/server/access/service";
import { syncUserSubscription } from "@/server/billing/service";

export const metadata: Metadata = { title: "Assinatura" };

/**
 * Volta do checkout do Mercado Pago. Os parâmetros da URL NÃO são usados como
 * prova de pagamento: o servidor consulta o próprio Mercado Pago antes de mostrar.
 */
export default async function SubscriptionReturnPage() {
  const { session } = await requireAccess();
  let synced = true;
  try {
    await syncUserSubscription(session.user.id);
  } catch (error) {
    synced = false;
    console.error("[billing] retorno:", error instanceof Error ? error.message : error);
  }
  const access = await getAccessForUser(session.user.id);
  const billing = access?.billing;
  const renewing = billing?.subscriptionStatus === "authorized";
  const paid = billing?.state === "active" || renewing;

  return (
    <>
      <PageHeader title="Assinatura" />
      <Card className="mx-auto grid max-w-lg gap-4 p-8 text-center">
        {paid ? (
          <>
            <CheckCircle2 className="mx-auto size-10 text-success" aria-hidden />
            <h2 className="text-lg font-semibold">Assinatura confirmada!</h2>
            <p className="text-sm text-muted-foreground">
              {billing?.state === "trial"
                ? `Aproveite o restante do teste: a primeira cobrança acontece depois de ${formatDate(billing.trialLastDay)}.`
                : "Tudo liberado. Obrigado por assinar o BeaconFinance."}
            </p>
          </>
        ) : billing?.subscriptionStatus === "pending" || !synced ? (
          <>
            <Clock className="mx-auto size-10 text-warning" aria-hidden />
            <h2 className="text-lg font-semibold">Aguardando a confirmação do pagamento</h2>
            <p className="text-sm text-muted-foreground">
              Pix e cartão costumam confirmar em instantes. Assim que o pagamento for confirmado, seu acesso é
              liberado automaticamente.
            </p>
          </>
        ) : (
          <>
            <XCircle className="mx-auto size-10 text-danger" aria-hidden />
            <h2 className="text-lg font-semibold">Pagamento não concluído</h2>
            <p className="text-sm text-muted-foreground">Nenhuma cobrança foi feita. Você pode tentar de novo em Configurações → Assinatura.</p>
          </>
        )}
        <div className="flex justify-center gap-2">
          <Link href="/configuracoes#assinatura" className={buttonVariants({ variant: "secondary" })}>
            Ver assinatura
          </Link>
          <Link href="/dashboard" className={buttonVariants()}>
            Ir para o início
          </Link>
        </div>
      </Card>
    </>
  );
}
