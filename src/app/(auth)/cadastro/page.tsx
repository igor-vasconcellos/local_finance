import { connection } from "next/server";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { UserRoundPlus } from "lucide-react";
import { AuthCard } from "@/components/auth/auth-card";
import { getCurrentSession } from "@/server/auth/current";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Criar conta" };

export default async function SignupPage() {
  await connection();
  if (await getCurrentSession()) redirect("/dashboard");

  return (
    <AuthCard
      icon={<UserRoundPlus />}
      title="Criar sua conta"
      description="Seus dados financeiros ficam separados e só você tem acesso. Vamos enviar um código para confirmar seu e-mail."
    >
      <SignupForm />
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Já tem conta?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Entrar
        </Link>
      </p>
    </AuthCard>
  );
}
