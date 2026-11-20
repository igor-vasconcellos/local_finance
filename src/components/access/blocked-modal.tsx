"use client";

import { Download, Lock, LogOut } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { logoutAction } from "@/server/actions/auth";

/**
 * Conta bloqueada pelo admin: o modal abre em toda página e reabre sempre que a
 * pessoa tenta alterar algo (o servidor recusa e devolve "?bloqueado=…").
 * Fechar o modal permite apenas consultar os dados.
 */
export function BlockedNotice({ reason }: { reason: string | null }) {
  const pathname = usePathname();
  const attempt = useSearchParams().get("bloqueado");
  const [open, setOpen] = useState(true);

  // Reabre a cada navegação e a cada tentativa de alteração recusada.
  const key = `${pathname}|${attempt ?? ""}`;
  const [lastKey, setLastKey] = useState(key);
  if (key !== lastKey) {
    setLastKey(key);
    setOpen(true);
  }

  return (
    <>
      {/* Faixa fixa: lembra que a conta está só para consulta e reabre os detalhes. */}
      <div role="status" className="border-b border-danger/30 bg-danger-soft px-4 py-2 text-center text-sm">
        <Lock className="mr-1.5 inline size-3.5 -translate-y-px text-danger" aria-hidden />
        Conta bloqueada: somente consulta.{" "}
        <button type="button" onClick={() => setOpen(true)} className="font-medium text-danger underline-offset-4 hover:underline">
          Ver detalhes
        </button>
      </div>
      <Dialog
      open={open}
      onClose={() => setOpen(false)}
      title="Sua conta está bloqueada"
      description="Você ainda pode consultar seus dados, mas não pode criar, editar ou importar nada."
    >
      <div className="grid gap-5">
        <div className="flex items-start gap-3 rounded-xl border border-danger/30 bg-danger-soft p-4 text-sm">
          <Lock className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
          <div className="grid gap-0.5">
            <p className="font-medium">Motivo</p>
            <p className="text-muted-foreground">{reason || "Não informado."}</p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Para regularizar o acesso, entre em contato com o administrador do BeaconFinance.
        </p>
        <div className="flex flex-wrap justify-end gap-2">
          <form action={logoutAction}>
            <Button type="submit" variant="ghost">
              <LogOut aria-hidden /> Sair
            </Button>
          </form>
          <a href="/api/exportar" className={buttonVariants({ variant: "secondary" })} download>
            <Download aria-hidden /> Exportar meus dados
          </a>
          <Button onClick={() => setOpen(false)}>Continuar consultando</Button>
        </div>
      </div>
      </Dialog>
    </>
  );
}
