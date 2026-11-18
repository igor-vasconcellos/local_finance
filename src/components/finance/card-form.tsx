"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, fieldControlProps } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { formatAmount } from "@/lib/money";
import { cn } from "@/lib/utils";
import { CARD_COLORS } from "@/lib/validation/finance";
import { saveCardAction } from "@/server/actions/cards";
import { CreditCardVisual } from "./credit-card-visual";
import { useCloseOnSuccess } from "./use-close-on-success";
import { useFormAction } from "./use-form-action";

export type CardFormValues = {
  id: number;
  name: string;
  institutionName: string | null;
  limitCents: number;
  closingDay: number;
  dueDay: number;
  color: string | null;
  hasPurchases: boolean;
};

export function CardForm({
  card,
  institutions,
  onDone,
}: {
  card?: CardFormValues;
  institutions: string[];
  onDone: () => void;
}) {
  const { state, onSubmit, pending } = useFormAction(saveCardAction);
  useCloseOnSuccess(state, onDone);
  const f = state.fields ?? {};

  // Pré-visualização ao vivo.
  const [name, setName] = useState(card?.name ?? "");
  const [institution, setInstitution] = useState(card?.institutionName ?? "");
  const [color, setColor] = useState(card?.color ?? CARD_COLORS[0]);
  const [closingDay, setClosingDay] = useState(card?.closingDay ?? 3);
  const [dueDay, setDueDay] = useState(card?.dueDay ?? 10);

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      {card && <input type="hidden" name="id" value={card.id} />}
      {state.error && <Alert tone="danger">{state.error}</Alert>}

      <div className="mx-auto w-full max-w-72">
        <CreditCardVisual
          name={name || "Meu cartão"}
          institution={institution || null}
          color={color}
          closingDay={closingDay || 0}
          dueDay={dueDay || 0}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="name" label="Nome do cartão" error={f.name}>
          <Input
            {...fieldControlProps("name", f.name)}
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: Nubank Ultravioleta"
            autoFocus
          />
        </Field>
        <Field id="institution" label="Banco (opcional)" error={f.institution}>
          <Input
            {...fieldControlProps("institution", f.institution)}
            name="institution"
            list="institutions"
            value={institution}
            onChange={(e) => setInstitution(e.target.value)}
            placeholder="Ex.: Nubank"
          />
          <datalist id="institutions">
            {institutions.map((i) => (
              <option key={i} value={i} />
            ))}
          </datalist>
        </Field>
      </div>

      <Field id="limit" label="Limite total" error={f.limit}>
        <MoneyInput {...fieldControlProps("limit", f.limit)} name="limit" defaultValue={card ? formatAmount(card.limitCents) : ""} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="closingDay" label="Dia do fechamento" error={f.closingDay}>
          <Input
            {...fieldControlProps("closingDay", f.closingDay)}
            name="closingDay"
            type="number"
            min={1}
            max={31}
            value={closingDay || ""}
            onChange={(e) => setClosingDay(Number(e.target.value))}
          />
        </Field>
        <Field id="dueDay" label="Dia do vencimento" error={f.dueDay}>
          <Input
            {...fieldControlProps("dueDay", f.dueDay)}
            name="dueDay"
            type="number"
            min={1}
            max={31}
            value={dueDay || ""}
            onChange={(e) => setDueDay(Number(e.target.value))}
          />
        </Field>
      </div>
      {card?.hasPurchases && (
        <p className="-mt-2 text-xs text-muted-foreground">
          Alterar fechamento ou vencimento vale para compras novas; faturas já geradas mantêm suas datas.
        </p>
      )}

      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium">Cor</legend>
        <div className="flex flex-wrap gap-2">
          {CARD_COLORS.map((c) => (
            <label key={c} className="relative cursor-pointer">
              <input
                type="radio"
                name="color"
                value={c}
                checked={color === c}
                onChange={() => setColor(c)}
                className="peer sr-only"
              />
              <span
                className={cn(
                  "flex size-8 items-center justify-center rounded-full ring-offset-2 ring-offset-card transition-shadow",
                  "peer-focus-visible:ring-2 peer-focus-visible:ring-ring",
                  color === c && "ring-2 ring-foreground/60",
                )}
                style={{ background: c }}
              >
                {color === c && <Check className="size-4 text-white" aria-hidden />}
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
          {card ? "Salvar alterações" : "Adicionar cartão"}
        </Button>
      </div>
    </form>
  );
}
