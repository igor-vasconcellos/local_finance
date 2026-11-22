"use client";

import { Download, LogOut, Sparkles } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { logoutAction } from "@/server/actions/auth";
import { SubscribeButton } from "./subscribe-button";

/**
 * Teste grátis/assinatura vencidos: só consulta. O modal abre em cada página e
 * a cada alteração recusada, com o botão para pagar. Não abre sozinho nas
 * páginas da assinatura (lá a própria página explica o que fazer).
 */
export function PaywallNotice({ priceLabel, neverPaid }: { priceLabel: string; neverPaid: boolean }) {
  const pathname = usePathname();
  const attempt = useSearchParams().get("bloqueado");
  const quiet = pathname.startsWith("/assinatura") || pathname.startsWith("/configuracoes");
  const [open, setOpen] = useState(!quiet);

  const key = `${pathname}|${attempt ?? ""}`;
  const [lastKey, setLastKey] = useState(key);
  if (key !== lastKey) {
    setLastKey(key);
    setOpen(!quiet || attempt != null);
  }

  const title = neverPaid ? "Seu teste grátis terminou" : "Sua assinatura venceu";
  return (
    <>
      <div role="status" className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 border-b border-warning/30 bg-warning-soft px-4 py-2 text-center text-sm">
        <span>{title}: somente consulta.</span>
        <button type="button" onClick={() => setOpen(true)} className="font-medium text-warning underline-offset-4 hover:underline">
          Assinar por {priceLabel}/mês
        </button>
      </div>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        description="Seus dados continuam guardados e você pode consultá-los. Para voltar a criar e editar, assine o BeaconFinance."
      >
        <div className="grid gap-5">
          <div className="flex items-start gap-3 rounded-xl border bg-accent/40 p-4 text-sm">
            <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            <div className="grid gap-0.5">
              <p className="font-medium">
                {priceLabel} por mês · renovação automática
              </p>
              <p className="text-muted-foreground">
                Pague com Pix, cartão ou boleto no Mercado Pago. Cancele quando quiser em Configurações → Assinatura.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <form action={logoutAction}>
              <Button type="submit" variant="ghost">
                <LogOut aria-hidden /> Sair
              </Button>
            </form>
            <a href="/api/exportar" className={buttonVariants({ variant: "secondary" })} download>
              <Download aria-hidden /> Exportar meus dados
            </a>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Só consultar
            </Button>
            <SubscribeButton />
          </div>
        </div>
      </Dialog>
    </>
  );
}
