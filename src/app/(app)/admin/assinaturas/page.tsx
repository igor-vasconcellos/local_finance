import type { Metadata } from "next";
import { AlertTriangle, CircleDollarSign, Repeat, UserCheck } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Card, StatCard } from "@/components/ui/page";
import { env } from "@/env";
import { formatDate } from "@/lib/dates";
import { maskEmail } from "@/lib/mask";
import { formatBRL } from "@/lib/money";
import { requireAdmin } from "@/server/access/guard";
import { getBillingOverview, listRecentPayments, listSubscriptions } from "@/server/admin/billing";

export const metadata: Metadata = { title: "Assinaturas · Admin" };

const SUB: Record<string, { label: string; tone: BadgeTone }> = {
  pending: { label: "Checkout iniciado", tone: "neutral" },
  authorized: { label: "Renovando", tone: "success" },
  paused: { label: "Pausada", tone: "warning" },
  cancelled: { label: "Cancelada", tone: "danger" },
};
const PAY: Record<string, { label: string; tone: BadgeTone }> = {
  approved: { label: "Aprovado", tone: "success" },
  pending: { label: "Processando", tone: "warning" },
  rejected: { label: "Recusado", tone: "danger" },
  refunded: { label: "Estornado", tone: "neutral" },
  cancelled: { label: "Cancelado", tone: "neutral" },
};

export default async function AdminSubscriptionsPage() {
  await requireAdmin();
  const [overview, subs, pays] = await Promise.all([getBillingOverview(), listSubscriptions(), listRecentPayments()]);
  return (
    <div className="grid gap-6">
      {!env.BILLING_ENABLED && (
        <p className="rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm">
          A cobrança está <strong>desligada</strong> neste ambiente (BILLING_ENABLED). Ninguém vê o paywall.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Com acesso pago" value={overview.payingNow} hint="pagamento em dia" icon={<UserCheck />} tone="success" />
        <StatCard label="Renovação ligada" value={overview.renewing} hint="cobrança automática" icon={<Repeat />} tone="primary" />
        <StatCard label="Recebido no mês" value={formatBRL(overview.revenueMonthCents)} hint="cobranças aprovadas" icon={<CircleDollarSign />} />
        <StatCard label="Recusadas (30 dias)" value={overview.failedLast30} hint="nova tentativa automática" icon={<AlertTriangle />} tone="danger" />
      </div>

      <Card>
        <h2 className="border-b px-5 py-4 font-semibold">Assinaturas</h2>
        {subs.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted-foreground">Nenhuma assinatura ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="px-5 py-2 font-medium">Conta</th>
                  <th className="px-5 py-2 font-medium">Situação</th>
                  <th className="px-5 py-2 font-medium">Pago até</th>
                  <th className="px-5 py-2 font-medium">Próxima cobrança</th>
                  <th className="px-5 py-2 font-medium">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {subs.map((s) => (
                  <tr key={s.id}>
                    <td className="px-5 py-2.5">{maskEmail(s.email)}</td>
                    <td className="px-5 py-2.5">
                      <Badge tone={SUB[s.status]?.tone ?? "neutral"} dot>
                        {SUB[s.status]?.label ?? s.status}
                      </Badge>
                      {s.lastFailureAt && s.status === "authorized" && (
                        <Badge tone="warning" className="ml-1.5">
                          Falha recente
                        </Badge>
                      )}
                    </td>
                    <td className="px-5 py-2.5 tabular-nums">{s.paidUntil ? formatDate(s.paidUntil) : "—"}</td>
                    <td className="px-5 py-2.5 tabular-nums">{s.nextPaymentDate ? formatDate(s.nextPaymentDate) : "—"}</td>
                    <td className="px-5 py-2.5 tabular-nums">{formatBRL(s.priceCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <h2 className="border-b px-5 py-4 font-semibold">Últimas cobranças</h2>
        {pays.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted-foreground">Nenhuma cobrança ainda.</p>
        ) : (
          <ul className="divide-y text-sm">
            {pays.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-2.5">
                <span className="min-w-40">{maskEmail(p.email)}</span>
                <span className="tabular-nums text-muted-foreground">{formatDate(p.chargedOn)}</span>
                <span className="tabular-nums">{formatBRL(p.amountCents)}</span>
                <Badge tone={PAY[p.status]?.tone ?? "neutral"}>{PAY[p.status]?.label ?? p.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
