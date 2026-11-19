import { connection } from "next/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MailCheck, ShieldCheck } from "lucide-react";
import { AuthCard } from "@/components/auth/auth-card";
import { Alert } from "@/components/ui/alert";
import { mailTransport } from "@/env";
import { maskEmail } from "@/lib/mask";
import { getPendingChallengeId } from "@/server/auth/current";
import { getResendTarget } from "@/server/auth/two-factor";
import { getUserById } from "@/server/auth/users";
import { VerifyForm } from "./verify-form";

export const metadata: Metadata = { title: "Verificação" };

export default async function VerifyPage({ searchParams }: PageProps<"/verify">) {
  await connection();
  const target = await getResendTarget(await getPendingChallengeId());
  const user = target ? await getUserById(target.userId) : undefined;
  if (!user || target!.purpose === "reset") redirect("/login");

  const { via } = await searchParams;
  const signup = target!.purpose === "signup";
  const viaConsole = mailTransport === "console" || via === "not_configured" || via === "smtp_failed";

  return (
    <AuthCard
      icon={signup ? <MailCheck /> : <ShieldCheck />}
      title={signup ? "Confirme seu e-mail" : "Verificação em duas etapas"}
      description={
        viaConsole ? (
          <>
            Digite o código de 6 dígitos gerado para <strong className="text-foreground">{maskEmail(user.email)}</strong>.
          </>
        ) : (
          <>
            Enviamos um código de 6 dígitos para <strong className="text-foreground">{maskEmail(user.email)}</strong>
            {signup ? " para ativar sua conta." : "."}
          </>
        )
      }
    >
      {via === "smtp_failed" ? (
        <Alert tone="warning" title="Não foi possível enviar o e-mail." className="mb-5">
          O código foi impresso no registro do servidor. Confira as configurações SMTP.
        </Alert>
      ) : viaConsole ? (
        <Alert tone="info" title="Modo desenvolvimento" className="mb-5">
          O SMTP ainda não está configurado: o código aparece no registro (terminal) do servidor.
        </Alert>
      ) : null}

      <VerifyForm initialWait={target!.waitSeconds} />
    </AuthCard>
  );
}
