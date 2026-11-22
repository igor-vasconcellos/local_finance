"use client";

import { CreditCard } from "lucide-react";
import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { subscribeAction } from "@/server/actions/billing";

/** Leva para a página de pagamento do provedor (Pix ou cartão). */
export function SubscribeButton({
  label = "Pagar agora",
  size,
  variant,
  className,
}: {
  label?: string;
  size?: "sm" | "md" | "lg";
  variant?: "primary" | "secondary";
  className?: string;
}) {
  const [state, action, pending] = useActionState(async () => (await subscribeAction()) ?? {}, {} as { error?: string });
  return (
    <form action={action} className={className}>
      <Button type="submit" size={size} variant={variant} disabled={pending}>
        <CreditCard aria-hidden /> {pending ? "Abrindo o pagamento…" : label}
      </Button>
      {state.error && (
        <Alert tone="danger" className="mt-3">
          {state.error}
        </Alert>
      )}
    </form>
  );
}
