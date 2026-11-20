import { Lock } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/page";

/** Página mostrada no lugar de uma função travada pelo admin. */
export function FeatureLocked({ title, message }: { title: string; message: string | null }) {
  return (
    <>
      <PageHeader title={title} />
      <EmptyState
        icon={<Lock />}
        title="Função indisponível no momento"
        description={message || "Esta função foi temporariamente desativada. Tente novamente mais tarde."}
        action={
          <Link href="/dashboard" className={buttonVariants({ variant: "secondary" })}>
            Voltar para a Visão geral
          </Link>
        }
      />
    </>
  );
}
