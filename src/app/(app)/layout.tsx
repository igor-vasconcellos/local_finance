import { cookies } from "next/headers";
import { Suspense } from "react";
import { BlockedNotice } from "@/components/access/blocked-modal";
import { BillingBanner } from "@/components/billing/billing-banner";
import { PaywallNotice } from "@/components/billing/paywall-modal";
import { env } from "@/env";
import { todayISO } from "@/lib/dates";
import { formatBRL } from "@/lib/money";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { SIDEBAR_COOKIE } from "@/components/layout/sidebar-config";
import { maskEmail } from "@/lib/mask";
import { FEATURE_PATH, requireAccess } from "@/server/access/guard";
import type { FeatureKey } from "@/db/schema/admin";

/**
 * Área autenticada: sidebar (desktop, recolhível) / gaveta (celular) + conteúdo.
 * requireAccess() valida a sessão no banco e calcula o acesso (admin, bloqueio, travas)
 * antes de renderizar qualquer página.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { session, access } = await requireAccess();
  const { user } = session;
  const collapsed = (await cookies()).get(SIDEBAR_COOKIE)?.value === "collapsed";
  const lockedHrefs = (Object.keys(access.locked) as FeatureKey[])
    .filter((k) => k !== "invoice_import")
    .map((k) => FEATURE_PATH[k]);

  return (
    <div className="flex min-h-svh flex-col lg:flex-row">
      <AppSidebar
        user={{ name: user.name, email: maskEmail(user.email), avatarColor: user.avatarColor }}
        defaultCollapsed={collapsed}
        access={{ isAdmin: access.isAdmin, lockedHrefs }}
      />
      <main className="min-w-0 flex-1">
        {access.blocked ? (
          <Suspense>
            <BlockedNotice reason={access.blocked.reason} />
          </Suspense>
        ) : access.billing?.state === "expired" ? (
          <Suspense>
            <PaywallNotice priceLabel={formatBRL(env.BILLING_PRICE_CENTS)} neverPaid={!access.billing.paidUntil} />
          </Suspense>
        ) : access.billing ? (
          <BillingBanner billing={access.billing} daysLeft={daysUntil(todayISO(), access.billing.trialLastDay) + 1} />
        ) : null}
        <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-10 lg:py-10">{children}</div>
      </main>
    </div>
  );
}

function daysUntil(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}
