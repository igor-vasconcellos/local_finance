import type { Metadata } from "next";
import Link from "next/link";
import { KeyRound } from "lucide-react";
import { AuthCard } from "@/components/auth/auth-card";
import { ForgotForm } from "./forgot-form";

export const metadata: Metadata = { title: "Esqueci minha senha" };

export default function ForgotPage() {
  return (
    <AuthCard
      icon={<KeyRound />}
      title="Esqueceu a senha?"
      description="Informe o e-mail da sua conta. Vamos enviar um código para você criar uma senha nova."
    >
      <ForgotForm />
      <p className="mt-6 text-center text-sm text-muted-foreground">
        <Link href="/login" className="hover:text-foreground">
          ← Voltar para o login
        </Link>
      </p>
    </AuthCard>
  );
}
