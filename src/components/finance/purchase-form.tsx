"use client";

import { DateInput } from "@/components/ui/date-input";
import { CalendarRange } from "lucide-react";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, fieldControlProps } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Select } from "@/components/ui/select";
import { formatDate, formatMonthShort, installmentSchedule, type ISODate } from "@/lib/dates";
import { formatAmount, formatBRL, splitInstallments } from "@/lib/money";
import { savePurchaseAction } from "@/server/actions/cards";
import type { CategoryOption } from "@/server/finance/categories";
import { useCloseOnSuccess } from "./use-close-on-success";
import { useFormAction } from "./use-form-action";

export type PurchaseFormValues = {
  id: number;
  description: string;
  categoryId: number | null;
  totalCents: number;
  installmentsCount: number;
  purchaseDate: ISODate;
  notes: string | null;
};

type CardOption = { id: number; name: string; closingDay: number; dueDay: number };

export function PurchaseForm({
  purchase,
  cards,
  defaultCardId,
  categories,
  today,
  onDone,
}: {
  purchase?: PurchaseFormValues & { cardId: number };
  cards: CardOption[];
  defaultCardId: number;
  categories: CategoryOption[];
  today: ISODate;
  onDone: () => void;
}) {
  const { state, onSubmit, pending } = useFormAction(savePurchaseAction);
  useCloseOnSuccess(state, onDone);
  const f = state.fields ?? {};

  const [cardId, setCardId] = useState(purchase?.cardId ?? defaultCardId);
  const [total, setTotal] = useState<number | null>(purchase?.totalCents ?? null);
  const [count, setCount] = useState(purchase?.installmentsCount ?? 1);
  const [date, setDate] = useState(purchase?.purchaseDate ?? today);

  const card = cards.find((c) => c.id === cardId);
  const preview =
    card && total && total > 0 && count >= 1 && count <= 48 && /^\d{4}-\d{2}-\d{2}$/.test(date)
      ? (() => {
          const schedule = installmentSchedule(date, count, card.closingDay, card.dueDay);
          const amounts = splitInstallments(total, count);
          return { first: schedule[0], last: schedule[schedule.length - 1], amounts };
        })()
      : null;

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      {purchase && <input type="hidden" name="id" value={purchase.id} />}
      {state.error && <Alert tone="danger">{state.error}</Alert>}

      <Field id="description" label="Descrição" error={f.description}>
        <Input
          {...fieldControlProps("description", f.description)}
          name="description"
          defaultValue={purchase?.description}
          placeholder="Ex.: Notebook, mercado, passagem…"
          autoFocus
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="total" label="Valor total" error={f.total}>
          <MoneyInput
            {...fieldControlProps("total", f.total)}
            name="total"
            defaultValue={purchase ? formatAmount(purchase.totalCents) : ""}
            onValueChange={setTotal}
          />
        </Field>
        <Field id="installmentsCount" label="Parcelas" error={f.installmentsCount}>
          <Select
            {...fieldControlProps("installmentsCount", f.installmentsCount)}
            name="installmentsCount"
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
          >
            {Array.from({ length: 48 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n === 1 ? "À vista (1x)" : `${n}x`}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="purchaseDate" label="Data da compra" error={f.purchaseDate}>
<DateInput {...fieldControlProps("purchaseDate", f.purchaseDate)} name="purchaseDate" value={date || null} onValueChange={(d) => setDate(d ?? "")} />
        </Field>
        <Field id="cardId" label="Cartão" error={f.cardId}>
          <Select {...fieldControlProps("cardId", f.cardId)} name="cardId" value={cardId} onChange={(e) => setCardId(Number(e.target.value))}>
            {cards.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {preview && (
        <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-accent/60 p-3 text-sm" aria-live="polite">
          <CalendarRange className="mt-0.5 size-4 shrink-0 text-accent-foreground" aria-hidden />
          <div className="grid gap-0.5">
            <p className="font-medium">
              {count === 1
                ? `À vista: ${formatBRL(preview.amounts[0])}`
                : preview.amounts[0] === preview.amounts[count - 1]
                  ? `${count}x de ${formatBRL(preview.amounts[0])}`
                  : `${count}x de ${formatBRL(preview.amounts[count - 1])} (1ª de ${formatBRL(preview.amounts[0])})`}
            </p>
            <p className="text-muted-foreground">
              1ª parcela na fatura de {formatMonthShort(preview.first.referenceMonth)} (vence {formatDate(preview.first.dueDate)})
              {count > 1 && <>; última em {formatMonthShort(preview.last.referenceMonth)}</>}.
            </p>
          </div>
        </div>
      )}

      <Field id="categoryId" label="Categoria (opcional)" error={f.categoryId}>
        <Select {...fieldControlProps("categoryId", f.categoryId)} name="categoryId" defaultValue={purchase?.categoryId ?? ""}>
          <option value="">Sem categoria</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field id="notes" label="Observações (opcional)" error={f.notes}>
        <Input {...fieldControlProps("notes", f.notes)} name="notes" defaultValue={purchase?.notes ?? ""} maxLength={500} />
      </Field>

      <div className="mt-2 flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" loading={pending}>
          {purchase ? "Salvar alterações" : "Lançar compra"}
        </Button>
      </div>
    </form>
  );
}

