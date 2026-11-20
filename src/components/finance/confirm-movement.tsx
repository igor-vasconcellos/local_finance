"use client";

import { Check, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Dialog } from "@/components/ui/dialog";
import { Field, fieldControlProps } from "@/components/ui/field";
import { MoneyInput } from "@/components/ui/money-input";
import { todayISO } from "@/lib/dates";
import { formatAmount, formatBRL } from "@/lib/money";
import { confirmSettlementAction, payInvoiceAction } from "@/server/actions/ledger";
import { useCloseOnSuccess } from "./use-close-on-success";
import { useFormAction } from "./use-form-action";

type Target =
  | { kind: "income" | "expense"; id: number; month: string }
  | { kind: "invoice"; cardId: number; month: string };

const COPY = {
  income: { title: "Confirmar recebimento", amount: "Valor recebido", date: "Recebido em", submit: "Confirmar recebimento", effect: "entra no" },
  expense: { title: "Confirmar pagamento", amount: "Valor pago", date: "Pago em", submit: "Confirmar pagamento", effect: "sai do" },
  invoice: { title: "Pagar fatura", amount: "Valor pago", date: "Pago em", submit: "Confirmar pagamento", effect: "sai do" },
} as const;

function ConfirmDialog({ target, name, amountCents, onClose }: { target: Target; name: string; amountCents: number; onClose: () => void }) {
  const { state, onSubmit, pending } = useFormAction(target.kind === "invoice" ? payInvoiceAction : confirmSettlementAction);
  useCloseOnSuccess(state, onClose);
  const f = state.fields ?? {};
  const copy = COPY[target.kind];
  const today = todayISO();
  const [cents, setCents] = useState<number | null>(amountCents);
  const differs = cents !== null && cents !== amountCents;

  return (
    <Dialog open onClose={onClose} title={copy.title} description={name}>
      <form onSubmit={onSubmit} className="grid gap-4" noValidate>
        <input type="hidden" name="month" value={target.month} />
        {target.kind === "invoice" ? (
          <input type="hidden" name="cardId" value={target.cardId} />
        ) : (
          <>
            <input type="hidden" name="kind" value={target.kind} />
            <input type="hidden" name="id" value={target.id} />
          </>
        )}
        {state.error && <Alert tone="danger">{state.error}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="amount" label={copy.amount} error={f.amount} hint={`Previsto: ${formatBRL(amountCents)}`}>
            <MoneyInput
              {...fieldControlProps("amount", f.amount, true)}
              name="amount"
              defaultValue={formatAmount(amountCents)}
              onValueChange={setCents}
              autoFocus
            />
          </Field>
          <Field id="date" label={copy.date} error={f.date}>
            <DateInput {...fieldControlProps("date", f.date)} name="date" defaultValue={today} max={today} />
          </Field>
        </div>
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

/** Botão "Recebi" / "Pagar" que pede o valor real e a data antes de confirmar. */
export function ConfirmMovementButton({
  target,
  name,
  amountCents,
  label,
  appearance = "chip",
}: {
  target: Target;
  name: string;
  amountCents: number;
  label: string;
  appearance?: "chip" | "button";
}) {
  const [open, setOpen] = useState(false);
  const dialog = open && <ConfirmDialog target={target} name={name} amountCents={amountCents} onClose={() => setOpen(false)} />;
  if (appearance === "button") {
    return (
      <>
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
          <CheckCircle2 aria-hidden /> {label}
        </Button>
        {dialog}
      </>
    );
  }
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
      {dialog}
    </>
  );
}
