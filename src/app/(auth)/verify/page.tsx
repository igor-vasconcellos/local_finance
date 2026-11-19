import { connection } from "next/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
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
  const target = getResendTarget(await getPendingChallengeId());
  const user = target ? getUserById(target.userId) : undefined;
  if (!user) redirect("/login");

  const { via } = await searchParams;
  const viaConsole = mailTransport === "console" || via === "not_configured" || via === "smtp_failed";

  return (
    <AuthCard
      icon={<ShieldCheck />}
      title="Verificação em duas etapas"
      description={
        viaConsole ? (
          <>Digite o código de 6 dígitos gerado para <strong className="text-foreground">{maskEmail(user.email)}</strong>.</>
        ) : (
          <>Enviamos um código de 6 dígitos para <strong className="text-foreground">{maskEmail(user.email)}</strong>.</>
        )
      }
    >
      {via === "smtp_failed" ? (
        <Alert tone="warning" title="Não foi possível enviar o e-mail." className="mb-5">
          O código foi impresso no terminal onde o servidor está rodando. Confira as configurações SMTP no .env.
        </Alert>
      ) : viaConsole ? (
        <Alert tone="info" title="Modo desenvolvimento" className="mb-5">
          O SMTP ainda não está configurado: o código aparece no terminal onde você rodou{" "}
          <code className="font-mono">npm run dev</code>.
        </Alert>
      ) : null}

      <VerifyForm initialWait={target!.waitSeconds} />
    </AuthCard>
  );
}
