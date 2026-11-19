"use client";

import { DateInput } from "@/components/ui/date-input";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, fieldControlProps } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Segmented } from "@/components/ui/segmented";
import { formatAmount, formatBRL } from "@/lib/money";
import { addBoxTxAction } from "@/server/actions/boxes";
import { useCloseOnSuccess } from "./use-close-on-success";
import { useFormAction } from "./use-form-action";

export function BoxTxForm({
  boxId,
  initialType,
  balanceCents,
  suggestedDepositCents,
  today,
  onDone,
}: {
  boxId: number;
  initialType: "deposit" | "withdrawal";
  balanceCents: number;
  suggestedDepositCents?: number | null;
  today: string;
  onDone: () => void;
}) {
  const { state, onSubmit, pending } = useFormAction(addBoxTxAction);
  useCloseOnSuccess(state, onDone);
  const f = state.fields ?? {};
  const [type, setType] = useState(initialType);
  const [prefill, setPrefill] = useState<{ key: number; value: string }>({ key: 0, value: "" });

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <input type="hidden" name="boxId" value={boxId} />
      {state.error && <Alert tone="danger">{state.error}</Alert>}

      <Segmented
        name="type"
        ariaLabel="Tipo de movimentação"
        value={type}
        onChange={setType}
        options={[
          { value: "deposit", label: "Aportar" },
          { value: "withdrawal", label: "Resgatar" },
        ]}
      />

      <Field
        id="amount"
        label={type === "deposit" ? "Valor do aporte" : "Valor do resgate"}
        error={f.amount}
        hint={
          type === "withdrawal" ? (
            <>
              Disponível: {formatBRL(balanceCents)} ·{" "}
              <button type="button" className="font-medium text-primary hover:underline" onClick={() => setPrefill((p) => ({ key: p.key + 1, value: formatAmount(balanceCents) }))}>
                resgatar tudo
              </button>
            </>
          ) : suggestedDepositCents ? (
            <>
              Para seguir a meta: {formatBRL(suggestedDepositCents)} por mês ·{" "}
              <button type="button" className="font-medium text-primary hover:underline" onClick={() => setPrefill((p) => ({ key: p.key + 1, value: formatAmount(suggestedDepositCents) }))}>
                usar este valor
              </button>
            </>
          ) : undefined
        }
      >
        <MoneyInput key={prefill.key} {...fieldControlProps("amount", f.amount, true)} name="amount" defaultValue={prefill.value} autoFocus />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="date" label="Data" error={f.date}>
          <DateInput {...fieldControlProps("date", f.date)} name="date" defaultValue={today} max={today} />
        </Field>
        <Field id="notes" label="Observação (opcional)" error={f.notes}>
          <Input {...fieldControlProps("notes", f.notes)} name="notes" maxLength={500} />
        </Field>
      </div>

      <div className="mt-2 flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" loading={pending}>
          {type === "deposit" ? "Confirmar aporte" : "Confirmar resgate"}
        </Button>
      </div>
    </form>
  );
}
