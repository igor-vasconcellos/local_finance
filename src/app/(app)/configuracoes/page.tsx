import type { Metadata } from "next";
import { mailTransport } from "@/env";
import { todayISO } from "@/lib/dates";
import { maskEmail } from "@/lib/mask";
import { requireSession } from "@/server/auth/current";
import { cdiRateOn, getSettings, listCdiRates } from "@/server/finance/settings";
import { PageHeader } from "@/components/ui/page";
import { SettingsView } from "./settings-view";

export const metadata: Metadata = { title: "Configurações" };

export default async function SettingsPage() {
  const { user, expiresAt } = await requireSession();
  const uid = user.id;
  const today = todayISO();
  const settings = await getSettings(uid);

  return (
    <>
      <PageHeader title="Configurações" description="Sua conta, parâmetros financeiros e segurança." />
      <SettingsView
        user={{ name: user.name, maskedEmail: maskEmail(user.email), avatarColor: user.avatarColor }}
        sessionExpiresAt={expiresAt}
        mailViaSmtp={mailTransport === "smtp"}
        settings={settings}
        cdiRates={await listCdiRates(uid)}
        currentCdi={(await cdiRateOn(uid, today)) ?? null}
        today={today}
      />
    </>
  );
}
