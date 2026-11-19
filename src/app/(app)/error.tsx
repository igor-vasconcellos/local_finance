"use client";

import { RotateCcw, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

/** Erro inesperado numa página da área logada: mensagem amigável + tentar de novo. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-20 text-center">
      <span className="mb-4 inline-flex size-12 items-center justify-center rounded-2xl bg-danger-soft text-danger">
        <TriangleAlert className="size-6" aria-hidden />
      </span>
      <h1 className="text-xl font-semibold">Algo deu errado</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Não foi possível carregar esta página. Seus dados estão seguros — tente novamente. Se continuar, anote o código abaixo
        para investigarmos.
      </p>
      {error.digest && <p className="mt-2 font-mono text-xs text-muted-foreground">Código: {error.digest}</p>}
      <div className="mt-6 flex gap-2">
        <Button onClick={reset}>
          <RotateCcw aria-hidden /> Tentar de novo
        </Button>
        <Link
          href="/dashboard"
          className="inline-flex h-10 items-center rounded-lg px-4 text-sm font-medium text-muted-foreground hover:bg-muted"
        >
          Ir para a Visão geral
        </Link>
      </div>
    </div>
  );
}
