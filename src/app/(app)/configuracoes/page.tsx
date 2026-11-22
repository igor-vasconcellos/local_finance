import type { Metadata } from "next";
import { todayISO } from "@/lib/dates";
import { maskEmail } from "@/lib/mask";
import { env, mailTransport } from "@/env";
import { requireAccess } from "@/server/access/guard";
import { getSubscription, listPayments } from "@/server/billing/service";
import type { SubscriptionInfo } from "./subscription-section";
import { listActiveSessions } from "@/server/auth/sessions";
import { listMyActivity } from "@/server/admin/audit";
import { describeDevice, maskIp } from "@/lib/user-agent";
import { SECURITY_DANGER, SECURITY_LABEL, formatDateTime } from "../admin/format";
import { cdiRateOn, getSettings, listCdiRates } from "@/server/finance/settings";
import { PageHeader } from "@/components/ui/page";
import { SettingsView } from "./settings-view";

export const metadata: Metadata = { title: "Configurações" };

export default async function SettingsPage() {
  const { session, access } = await requireAccess();
  const { user, expiresAt, sessionId } = session;
  const uid = user.id;
  const subscription = env.BILLING_ENABLED ? await subscriptionInfo(uid, access) : null;
  const today = todayISO();
  const [settings, sessions, events] = await Promise.all([getSettings(uid), listActiveSessions(uid), listMyActivity(uid, 20)]);
  const devices = sessions.map((s) => ({
    id: s.id,
    device: describeDevice(s.userAgent),
    mobile: /iPhone|iPad|Android/.test(s.userAgent ?? ""),
    ip: maskIp(s.ip),
    lastSeen: formatDateTime(s.lastSeenAt),
    since: formatDateTime(s.createdAt),
    current: s.id === sessionId,
  }));
  const activity = events.map((e) => ({
    id: e.id,
    label: SECURITY_LABEL[e.event] ?? e.event,
    danger: SECURITY_DANGER.has(e.event),
    device: describeDevice(e.userAgent),
    ip: maskIp(e.ip),
    when: formatDateTime(e.createdAt),
  }));

  return (
    <>
      <PageHeader title="Configurações" description="Sua conta, parâmetros financeiros e segurança." />
      <SettingsView
        user={{ name: user.name, maskedEmail: maskEmail(user.email), avatarColor: user.avatarColor }}
        sessionExpiresAt={expiresAt}
        devices={devices}
        activity={activity}
        mailViaSmtp={mailTransport === "smtp"}
        settings={settings}
        cdiRates={await listCdiRates(uid)}
        currentCdi={(await cdiRateOn(uid, today)) ?? null}
        today={today}
        subscription={subscription}
      />
    </>
  );
}

async function subscriptionInfo(uid: number, access: Awaited<ReturnType<typeof requireAccess>>["access"]): Promise<SubscriptionInfo> {
  if (access.isAdmin) return { exempt: "admin" };
  if (access.courtesy) return { exempt: "courtesy", courtesyUntil: access.courtesy.until };
  const b = access.billing!;
  const [sub, payments] = await Promise.all([getSubscription(uid), listPayments(uid)]);
  return {
    exempt: null,
    state: b.state,
    priceCents: sub?.priceCents ?? env.BILLING_PRICE_CENTS,
    trialLastDay: b.trialLastDay,
    accessLastDay: b.accessLastDay,
    paidUntil: b.paidUntil,
    subscriptionStatus: b.subscriptionStatus,
    failing: b.failing,
    nextPaymentDate: sub?.nextPaymentDate ?? null,
    payments,
  };
}
