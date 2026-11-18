import { connection } from "next/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { UserRoundPlus } from "lucide-react";
import { AuthCard } from "@/components/auth/auth-card";
import { hasMasterUser } from "@/server/auth/users";
import { SetupForm } from "./setup-form";

export const metadata: Metadata = { title: "Primeiro acesso" };

export default async function SetupPage() {
  await connection(); // depende do banco a cada acesso — nunca gerar estático na build
  // O cadastro só existe enquanto não houver usuário master.
  if (hasMasterUser()) redirect("/login");

  return (
    <AuthCard
      icon={<UserRoundPlus />}
      title="Bem-vindo! Vamos criar seu acesso"
      description="Este é o único usuário do app. O e-mail será usado para receber o código de verificação a cada login."
    >
      <SetupForm />
    </AuthCard>
  );
}
