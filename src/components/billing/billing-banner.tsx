import Link from "next/link";
import { AlertTriangle, Gift } from "lucide-react";
import { formatDate } from "@/lib/dates";
import type { BillingAccess } from "@/server/access/policy";

/** Faixa discreta no topo: dias de teste restantes ou cobrança recusada (tolerância). */
export function BillingBanner({ billing, daysLeft }: { billing: BillingAccess; daysLeft: number }) {
  if (billing.state === "grace") {
    return (
      <div role="status" className="border-b border-warning/30 bg-warning-soft px-4 py-2 text-center text-sm">
        <AlertTriangle className="mr-1.5 inline size-3.5 -translate-y-px text-warning" aria-hidden />
        Não conseguimos cobrar sua assinatura. O acesso segue liberado até {formatDate(billing.accessLastDay!)}.{" "}
        <Link href="/configuracoes#assinatura" className="font-medium text-warning underline-offset-4 hover:underline">
          Resolver
        </Link>
      </div>
    );
  }
  if (billing.state === "trial" && billing.subscriptionStatus !== "authorized") {
    return (
      <div role="status" className="border-b bg-accent/50 px-4 py-2 text-center text-sm">
        <Gift className="mr-1.5 inline size-3.5 -translate-y-px text-primary" aria-hidden />
        Teste grátis: {daysLeft <= 1 ? "último dia" : `faltam ${daysLeft} dias`} (até {formatDate(billing.trialLastDay)}).{" "}
        <Link href="/configuracoes#assinatura" className="font-medium text-primary underline-offset-4 hover:underline">
          Assinar agora
        </Link>
      </div>
    );
  }
  return null;
}
