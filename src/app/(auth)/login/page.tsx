import { connection } from "next/server";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LogIn } from "lucide-react";
import { AuthCard } from "@/components/auth/auth-card";
import { Alert } from "@/components/ui/alert";
import { getCurrentSession } from "@/server/auth/current";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  await connection(); // depende do banco a cada acesso — nunca gerar estático na build
  if (await getCurrentSession()) redirect("/dashboard");

  const params = await searchParams;

  return (
    <AuthCard
      icon={<LogIn />}
      title="Entrar"
      description="Informe seu e-mail e senha. Em seguida, enviaremos um código de verificação."
    >
      {params.senha === "1" && (
        <Alert tone="success" title="Senha alterada!" className="mb-5">
          Entre com a nova senha. Por segurança, as outras sessões abertas foram encerradas.
        </Alert>
      )}
      {params.expired === "1" && (
        <Alert tone="warning" title="Sua verificação expirou." className="mb-5">
          Entre novamente para receber um novo código.
        </Alert>
      )}
      <LoginForm />
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Ainda não tem conta?{" "}
        <Link href="/cadastro" className="font-medium text-primary hover:underline">
          Criar conta
        </Link>
      </p>
    </AuthCard>
  );
}
