"use client";

import { CheckCircle2, XCircle } from "lucide-react";
import { SubscribeButton } from "@/components/billing/subscribe-button";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { formatDate } from "@/lib/dates";
import { formatBRL } from "@/lib/money";
import { cancelSubscriptionAction } from "@/server/actions/billing";

export type SubscriptionInfo =
  | { exempt: "admin" | "courtesy"; courtesyUntil?: string | null }
  | {
      exempt: null;
      state: "trial" | "active" | "grace" | "expired";
      priceCents: number;
      trialLastDay: string;
      accessLastDay: string | null;
      paidUntil: string | null;
      subscriptionStatus: "pending" | "authorized" | "paused" | "cancelled" | null;
      failing: boolean;
      nextPaymentDate: string | null;
      payments: { id: number; amountCents: number; status: string; chargedOn: string }[];
    };

const STATE: Record<string, { label: string; tone: BadgeTone }> = {
  trial: { label: "Teste grátis", tone: "primary" },
  active: { label: "Ativa", tone: "success" },
  grace: { label: "Pagamento pendente", tone: "warning" },
  expired: { label: "Vencida", tone: "danger" },
};

const PAYMENT: Record<string, { label: string; tone: BadgeTone }> = {
  approved: { label: "Aprovado", tone: "success" },
  pending: { label: "Processando", tone: "warning" },
  rejected: { label: "Recusado", tone: "danger" },
  refunded: { label: "Estornado", tone: "neutral" },
  cancelled: { label: "Cancelado", tone: "neutral" },
};

export function SubscriptionSection({ info }: { info: SubscriptionInfo }) {
  if (info.exempt) {
    return (
      <p className="flex items-center gap-2 text-sm">
        <CheckCircle2 className="size-4 text-success" aria-hidden />
        {info.exempt === "admin"
          ? "Conta administradora: não há cobrança."
          : info.courtesyUntil
            ? `Acesso cortesia até ${formatDate(info.courtesyUntil)}: nada a pagar até lá.`
            : "Acesso cortesia: nada a pagar."}
      </p>
    );
  }

  const renewing = info.subscriptionStatus === "authorized";
  const confirming = info.state === "grace" && !info.failing;
  const state = confirming ? { label: "Confirmando pagamento", tone: "primary" as BadgeTone } : STATE[info.state];
  const price = formatBRL(info.priceCents);

  let summary: string;
  if (renewing && info.state === "trial") summary = `Assinatura ativa. A primeira cobrança acontece depois do teste, em ${formatDate(nextDay(info.trialLastDay))}.`;
  else if (renewing && info.state === "active") summary = info.nextPaymentDate ? `Próxima cobrança em ${formatDate(info.nextPaymentDate)}.` : "Renovação automática ligada.";
  else if (confirming) summary = "Recebemos sua assinatura. A confirmação do pagamento costuma levar poucos minutos.";
  else if (info.state === "grace") summary = `A última cobrança não foi aprovada. Vamos tentar de novo nos próximos dias; seu acesso segue até ${formatDate(info.accessLastDay!)}.`;
  else if (info.state === "trial") summary = `Seu teste grátis vai até ${formatDate(info.trialLastDay)}. Assine agora e a primeira cobrança só acontece depois dele.`;
  else if (info.state === "active") summary = `Renovação cancelada. Seu acesso pago vai até ${formatDate(info.accessLastDay!)}.`;
  else summary = "Sem assinatura ativa: sua conta está só para consulta.";

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-xl border p-4">
        <div className="grid gap-1">
          <div className="flex items-center gap-2">
            <p className="font-medium">BeaconFinance · {price}/mês</p>
            <Badge tone={state.tone} dot>
              {state.label}
            </Badge>
          </div>
          <p className="max-w-prose text-sm text-muted-foreground">{summary}</p>
          {info.subscriptionStatus === "pending" && (
            <p className="text-sm text-muted-foreground">Você começou um pagamento que ainda não foi concluído.</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {renewing ? (
            <ConfirmAction
              action={cancelSubscriptionAction}
              fields={{}}
              title="Cancelar a renovação automática?"
              description={
                info.paidUntil
                  ? `Nada mais será cobrado. Você continua com acesso até ${formatDate(prevDay(info.paidUntil))}.`
                  : "Nada será cobrado. Ao fim do teste grátis a conta fica só para consulta."
              }
              confirmLabel="Cancelar assinatura"
              trigger={(open) => (
                <Button variant="secondary" onClick={open}>
                  <XCircle aria-hidden /> Cancelar assinatura
                </Button>
              )}
            />
          ) : (
            <SubscribeButton label={info.state === "expired" ? "Pagar agora" : `Assinar por ${price}/mês`} />
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Pagamento em ambiente seguro, com Pix ou cartão. O BeaconFinance não vê nem guarda os dados do seu cartão.
      </p>

      {info.payments.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-semibold">Histórico de cobranças</h3>
          <ul className="divide-y rounded-xl border text-sm">
            {info.payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span>{formatDate(p.chargedOn)}</span>
                <span className="tabular-nums">{formatBRL(p.amountCents)}</span>
                <Badge tone={PAYMENT[p.status]?.tone ?? "neutral"}>{PAYMENT[p.status]?.label ?? p.status}</Badge>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function nextDay(d: string) {
  return new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}
function prevDay(d: string) {
  return new Date(Date.parse(`${d}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
}
