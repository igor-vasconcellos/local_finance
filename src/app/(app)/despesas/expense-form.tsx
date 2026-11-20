"use client";

import { useState } from "react";
import { useCloseOnSuccess } from "@/components/finance/use-close-on-success";
import { useFormAction } from "@/components/finance/use-form-action";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DateInput, MonthInput } from "@/components/ui/date-input";
import { Field, fieldControlProps } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Select } from "@/components/ui/select";
import type { Month } from "@/lib/dates";
import { formatAmount } from "@/lib/money";
import { saveExpenseAction, saveOneTimeAction } from "@/server/actions/expenses";
import type { CategoryOption } from "@/server/finance/categories";
import type { ExpenseRow } from "@/server/finance/expenses";
import type { OneTimeRow } from "@/server/finance/one-time";

export type Repetition = "monthly" | "until" | "once";

const REPETITION_LABEL: Record<Repetition, string> = {
  monthly: "Todo mês, sem fim",
  until: "Todo mês até…",
  once: "Só uma vez (avulsa)",
};

/**
 * Formulário único de despesa. Ao cadastrar, a "Repetição" decide o tipo:
 * fixa sem fim, fixa até um mês, ou avulsa (só uma vez). Ao editar, o tipo não muda.
 */
export function ExpenseForm({
  expense,
  oneTime,
  categories,
  defaultMonth,
  today,
  initialRepetition = "monthly",
  onDone,
}: {
  expense?: ExpenseRow;
  oneTime?: OneTimeRow;
  categories: CategoryOption[];
  defaultMonth: Month;
  today: string;
  initialRepetition?: Repetition;
  onDone: () => void;
}) {
  const { state, onSubmit, pending } = useFormAction(oneTime ? saveOneTimeAction : saveExpenseAction);
  useCloseOnSuccess(state, onDone);
  const f = state.fields ?? {};
  const [repetition, setRepetition] = useState<Repetition>(
    oneTime ? "once" : expense ? (expense.endMonth ? "until" : "monthly") : initialRepetition,
  );
  const editing = Boolean(expense || oneTime);
  const once = repetition === "once";
  // Data padrão de uma avulsa nova: hoje, se o mês escolhido for o atual; senão o dia 1º.
  const defaultDate = today.startsWith(defaultMonth) ? today : `${defaultMonth}-01`;

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      {expense && <input type="hidden" name="id" value={expense.id} />}
      {oneTime && <input type="hidden" name="id" value={oneTime.id} />}
      {state.error && <Alert tone="danger">{state.error}</Alert>}

      <Field id="name" label="Descrição" error={f.name}>
        <Input
          {...fieldControlProps("name", f.name)}
          name="name"
          defaultValue={expense?.name ?? oneTime?.description}
          placeholder={once ? "Ex.: Conserto do carro" : "Ex.: Aluguel"}
          autoFocus
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="categoryId" label="Categoria" error={f.categoryId}>
          <Select
            {...fieldControlProps("categoryId", f.categoryId)}
            name="categoryId"
            defaultValue={expense?.categoryId ?? oneTime?.categoryId ?? ""}
          >
            <option value="" disabled>
              Escolha…
            </option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="amount" label={once ? "Valor" : "Valor mensal"} error={f.amount}>
          <MoneyInput
            {...fieldControlProps("amount", f.amount)}
            name="amount"
            defaultValue={expense ? formatAmount(expense.amountCents) : oneTime ? formatAmount(oneTime.amountCents) : ""}
          />
        </Field>
      </div>

      {oneTime ? (
        <input type="hidden" name="repetition" value="once" />
      ) : (
        <Field
          id="repetition"
          label="Repetição"
          hint={
            once
              ? "Não se repete: aparece só no mês da data."
              : repetition === "monthly"
                ? "Aparece todo mês até você mudar para “Todo mês até…”."
                : undefined
          }
        >
          <Select id="repetition" name="repetition" value={repetition} onChange={(e) => setRepetition(e.target.value as Repetition)}>
            {(Object.keys(REPETITION_LABEL) as Repetition[])
              .filter((r) => !(editing && r === "once"))
              .map((r) => (
                <option key={r} value={r}>
                  {REPETITION_LABEL[r]}
                </option>
              ))}
          </Select>
        </Field>
      )}

      {once ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="date" label="Data" error={f.date}>
            <DateInput {...fieldControlProps("date", f.date)} name="date" defaultValue={oneTime?.date ?? defaultDate} />
          </Field>
          <label className="flex items-center gap-2 self-end pb-2.5 text-sm">
            <input type="checkbox" name="paid" defaultChecked={oneTime ? oneTime.paidAt != null : false} className="size-4 accent-[var(--primary)]" />
            Já está paga
          </label>
        </div>
      ) : (
        <div className={repetition === "until" ? "grid gap-4 sm:grid-cols-3" : "grid gap-4 sm:grid-cols-2"}>
          <Field id="dueDay" label="Dia do vencimento" error={f.dueDay}>
            <Input {...fieldControlProps("dueDay", f.dueDay)} name="dueDay" type="number" min={1} max={31} defaultValue={expense?.dueDay ?? 10} />
          </Field>
          <Field id="startMonth" label="A partir de" error={f.startMonth}>
            <MonthInput {...fieldControlProps("startMonth", f.startMonth)} name="startMonth" defaultValue={expense?.startMonth ?? defaultMonth} />
          </Field>
          {repetition === "until" && (
            <Field id="endMonth" label="Até" error={f.endMonth}>
              <MonthInput {...fieldControlProps("endMonth", f.endMonth)} name="endMonth" defaultValue={expense?.endMonth ?? defaultMonth} />
            </Field>
          )}
        </div>
      )}

      <Field id="notes" label="Observações (opcional)" error={f.notes}>
        <Input {...fieldControlProps("notes", f.notes)} name="notes" defaultValue={expense?.notes ?? oneTime?.notes ?? ""} maxLength={500} />
      </Field>

      <div className="mt-2 flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" loading={pending}>
          {editing ? "Salvar alterações" : "Adicionar despesa"}
        </Button>
      </div>
    </form>
  );
}
