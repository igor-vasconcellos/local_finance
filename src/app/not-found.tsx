import { Compass } from "lucide-react";
import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center px-6 text-center">
      <span className="mb-4 inline-flex size-12 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
        <Compass className="size-6" aria-hidden />
      </span>
      <h1 className="text-xl font-semibold">Página não encontrada</h1>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">O endereço não existe ou o item foi excluído.</p>
      <Link href="/dashboard" className="mt-6 inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
        Voltar para a Visão geral
      </Link>
    </main>
  );
}
