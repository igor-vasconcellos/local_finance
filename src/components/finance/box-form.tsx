"use client";

import { Check, PiggyBank } from "lucide-react";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, fieldControlProps } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { formatAmount } from "@/lib/money";
import { cn } from "@/lib/utils";
import { BOX_COLORS } from "@/lib/validation/finance";
import { saveBoxAction } from "@/server/actions/boxes";
import { useCloseOnSuccess } from "./use-close-on-success";
import { useFormAction } from "./use-form-action";

export type BoxFormValues = {
  id: number;
  name: string;
  institutionName: string;
  cdiPercentBp: number;
  goalCents: number | null;
  goalDate: string | null;
  color: string | null;
};

export function BoxForm({ box, institutions, onDone }: { box?: BoxFormValues; institutions: string[]; onDone: () => void }) {
  const { state, onSubmit, pending } = useFormAction(saveBoxAction);
  useCloseOnSuccess(state, onDone);
  const f = state.fields ?? {};
  const [color, setColor] = useState(box?.color ?? BOX_COLORS[0]);

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      {box && <input type="hidden" name="id" value={box.id} />}
      {state.error && <Alert tone="danger">{state.error}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="name" label="Nome da caixinha" error={f.name}>
          <Input {...fieldControlProps("name", f.name)} name="name" defaultValue={box?.name} placeholder="Ex.: Reserva de emergência" autoFocus />
        </Field>
        <Field id="institution" label="Banco" error={f.institution}>
          <Input
            {...fieldControlProps("institution", f.institution)}
            name="institution"
            list="box-institutions"
            defaultValue={box?.institutionName}
            placeholder="Ex.: Nubank"
          />
          <datalist id="box-institutions">
            {institutions.map((i) => (
              <option key={i} value={i} />
            ))}
          </datalist>
        </Field>
      </div>

      <Field id="cdiPercent" label="Rendimento (% do CDI)" error={f.cdiPercent} hint="Como aparece no app do banco. Ex.: 100, 102,5, 115">
        <div className="relative">
          <Input
            {...fieldControlProps("cdiPercent", f.cdiPercent, true)}
            name="cdiPercent"
            inputMode="decimal"
            defaultValue={box ? String(box.cdiPercentBp / 100).replace(".", ",") : "100"}
            className="pr-20"
          />
          <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">% do CDI</span>
        </div>
      </Field>

      <fieldset className="grid gap-4 rounded-xl border p-4">
        <legend className="px-1 text-sm font-medium">Meta (opcional)</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="goal" label="Quanto quer juntar" error={f.goal}>
            <MoneyInput {...fieldControlProps("goal", f.goal)} name="goal" defaultValue={box?.goalCents ? formatAmount(box.goalCents) : ""} />
          </Field>
          <Field id="goalDate" label="Até quando" error={f.goalDate} hint="Com data, o app calcula quanto guardar por mês">
            <Input {...fieldControlProps("goalDate", f.goalDate, true)} name="goalDate" type="date" defaultValue={box?.goalDate ?? ""} />
          </Field>
        </div>
      </fieldset>

      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium">Cor</legend>
        <div className="flex flex-wrap gap-2">
          {BOX_COLORS.map((c) => (
            <label key={c} className="relative cursor-pointer">
              <input type="radio" name="color" value={c} checked={color === c} onChange={() => setColor(c)} className="peer sr-only" />
              <span
                className={cn(
                  "flex size-8 items-center justify-center rounded-full ring-offset-2 ring-offset-card peer-focus-visible:ring-2 peer-focus-visible:ring-ring",
                  color === c && "ring-2 ring-foreground/60",
                )}
                style={{ background: c }}
              >
                {color === c ? <Check className="size-4 text-white" aria-hidden /> : <PiggyBank className="size-3.5 text-white/70" aria-hidden />}
              </span>
              <span className="sr-only">Cor {c}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-2 flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" loading={pending}>
          {box ? "Salvar alterações" : "Criar caixinha"}
        </Button>
      </div>
    </form>
  );
}
