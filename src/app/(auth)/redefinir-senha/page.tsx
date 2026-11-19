import { connection } from "next/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { KeyRound } from "lucide-react";
import { AuthCard } from "@/components/auth/auth-card";
import { Alert } from "@/components/ui/alert";
import { mailTransport } from "@/env";
import { getPendingChallengeId } from "@/server/auth/current";
import { getResendTarget } from "@/server/auth/two-factor";
import { ResetForm } from "./reset-form";

export const metadata: Metadata = { title: "Redefinir senha" };

export default async function ResetPage() {
  await connection();
  const challengeId = await getPendingChallengeId();
  if (!challengeId) redirect("/esqueci-senha");
  const target = getResendTarget(challengeId);

  return (
    <AuthCard
      icon={<KeyRound />}
      title="Crie uma nova senha"
      description="Se houver uma conta com o e-mail informado, enviamos um código de 6 dígitos. Digite-o abaixo com a nova senha."
    >
      {mailTransport === "console" && (
        <Alert tone="info" title="Modo desenvolvimento" className="mb-5">
          O SMTP ainda não está configurado: o código aparece no terminal do servidor.
        </Alert>
      )}
      <ResetForm initialWait={target?.purpose === "reset" ? target.waitSeconds : 0} />
    </AuthCard>
  );
}
