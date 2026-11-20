"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, fieldControlProps } from "@/components/ui/field";
import { MoneyInput } from "@/components/ui/money-input";
import { formatAmount, formatBRL } from "@/lib/money";
import { confirmSettlementAction } from "@/server/actions/confirm";
import { useCloseOnSuccess } from "./use-close-on-success";
import { useFormAction } from "./use-form-action";

type Target = { kind: "income" | "expense"; id: number; month: string };

const COPY = {
  income: { title: "Confirmar recebimento", amount: "Valor recebido", submit: "Confirmar recebimento", effect: "entra no" },
  expense: { title: "Confirmar pagamento", amount: "Valor pago", submit: "Confirmar pagamento", effect: "sai do" },
} as const;

function ConfirmDialog({ target, name, amountCents, onClose }: { target: Target; name: string; amountCents: number; onClose: () => void }) {
  const { state, onSubmit, pending } = useFormAction(confirmSettlementAction);
  useCloseOnSuccess(state, onClose);
  const f = state.fields ?? {};
  const copy = COPY[target.kind];
  const [cents, setCents] = useState<number | null>(amountCents);
  const differs = cents !== null && cents !== amountCents;

  return (
    <Dialog open onClose={onClose} title={copy.title} description={name}>
      <form onSubmit={onSubmit} className="grid gap-4" noValidate>
        <input type="hidden" name="month" value={target.month} />
        <input type="hidden" name="kind" value={target.kind} />
        <input type="hidden" name="id" value={target.id} />
        {state.error && <Alert tone="danger">{state.error}</Alert>}
        <Field id="amount" label={copy.amount} error={f.amount} hint={`Previsto: ${formatBRL(amountCents)}`}>
          <MoneyInput
            {...fieldControlProps("amount", f.amount, true)}
            name="amount"
            defaultValue={formatAmount(amountCents)}
            onValueChange={setCents}
            autoFocus
          />
        </Field>
        <p className="text-sm text-muted-foreground">
          {cents ? formatBRL(cents) : "O valor"} {copy.effect} saldo em conta.
          {differs && " Diferente do previsto — vale o valor informado."}
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" loading={pending}>
            {copy.submit}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/** Botão "Recebi" / "Pagar" que confirma o valor real antes de marcar. */
export function ConfirmMovementButton({
  target,
  name,
  amountCents,
  label,
}: {
  target: Target;
  name: string;
  amountCents: number;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={label}
        title={label}
        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border bg-card px-2.5 text-xs font-medium transition-colors hover:border-success/40 hover:bg-success-soft hover:text-success"
      >
        <Check className="size-3.5" aria-hidden />
        <span className="hidden sm:inline">{label}</span>
      </button>
      {open && <ConfirmDialog target={target} name={name} amountCents={amountCents} onClose={() => setOpen(false)} />}
    </>
  );
}
