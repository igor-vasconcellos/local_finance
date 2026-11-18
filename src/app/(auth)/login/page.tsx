import { connection } from "next/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LogIn } from "lucide-react";
import { AuthCard } from "@/components/auth/auth-card";
import { Alert } from "@/components/ui/alert";
import { getCurrentSession } from "@/server/auth/current";
import { hasMasterUser } from "@/server/auth/users";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  await connection(); // depende do banco a cada acesso — nunca gerar estático na build
  if (!hasMasterUser()) redirect("/setup");
  if (await getCurrentSession()) redirect("/dashboard");

  const params = await searchParams;

  return (
    <AuthCard
      icon={<LogIn />}
      title="Entrar"
      description="Informe seu e-mail e senha. Em seguida, enviaremos um código de verificação."
    >
      {params.created === "1" && (
        <Alert tone="success" title="Acesso criado com sucesso!" className="mb-5">
          Agora é só entrar com seu e-mail e senha.
        </Alert>
      )}
      {params.expired === "1" && (
        <Alert tone="warning" title="Sua verificação expirou." className="mb-5">
          Entre novamente para receber um novo código.
        </Alert>
      )}
      <LoginForm />
    </AuthCard>
  );
}
