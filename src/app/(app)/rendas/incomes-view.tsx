"use client";

import { DateInput, MonthInput } from "@/components/ui/date-input";
import { Pause, Pencil, Play, Plus, Trash2, TrendingUp } from "lucide-react";
import { useCallback, useState } from "react";
import { CategoryLabel } from "@/components/finance/category-dot";
import { useCloseOnSuccess } from "@/components/finance/use-close-on-success";
import { useFormAction } from "@/components/finance/use-form-action";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Dialog } from "@/components/ui/dialog";
import { Field, fieldControlProps } from "@/components/ui/field";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Card, EmptyState } from "@/components/ui/page";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { formatDate, formatMonthShort, type ISODate, type Month } from "@/lib/dates";
import { formatAmount, formatBRL } from "@/lib/money";
import { cn } from "@/lib/utils";
import { INCOME_TYPES } from "@/lib/validation/finance";
import { deleteIncomeAction, saveIncomeAction, toggleIncomeAction } from "@/server/actions/incomes";
import type { CategoryOption } from "@/server/finance/categories";
import type { IncomeRow } from "@/server/finance/incomes";

type Props = { incomes: IncomeRow[]; categories: CategoryOption[]; defaultMonth: Month; today: ISODate };

export function IncomesView({ incomes, categories, defaultMonth, today }: Props) {
  const [editing, setEditing] = useState<IncomeRow | "new" | null>(null);
  const close = useCallback(() => setEditing(null), []);

  const newButton = (
    <Button onClick={() => setEditing("new")}>
      <Plus aria-hidden /> Nova renda
    </Button>
  );

  return (
    <>
      {incomes.length === 0 ? (
        <EmptyState
          icon={<TrendingUp />}
          title="Nenhuma renda cadastrada"
          description="Cadastre seu salário e outras entradas para o app calcular quanto sobra todo mês."
          action={newButton}
        />
      ) : (
        <Card>
          <div className="flex items-center justify-between gap-4 border-b px-5 py-4">
            <h2 className="font-semibold">Suas rendas</h2>
            {newButton}
          </div>
          <ul className="divide-y">
            {incomes.map((i) => {
              const ended = i.recurrence === "monthly" ? Boolean(i.endMonth && i.endMonth < defaultMonth) : Boolean(i.payDate && i.payDate < today);
              return (
                <li key={i.id} className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4", !i.active && "opacity-60")}>
                  <div className="min-w-0 flex-1 basis-full sm:basis-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-medium">{i.name}</p>
                      <Badge tone="primary">{INCOME_TYPES[i.type]}</Badge>
                      {!i.active && <Badge>Pausada</Badge>}
                      {i.active && ended && <Badge>{i.recurrence === "once" ? "Recebida" : "Encerrada"}</Badge>}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>
                        {i.recurrence === "monthly"
                          ? `Todo dia ${i.payDay} · desde ${formatMonthShort(i.startMonth)}${i.endMonth ? ` até ${formatMonthShort(i.endMonth)}` : ""}`
                          : `Única · ${formatDate(i.payDate!)}`}
                      </span>
                      <CategoryLabel name={i.categoryName} color={i.categoryColor} />
                    </div>
                  </div>
                  <p className="ml-auto font-semibold text-success tabular-nums sm:ml-0">{formatBRL(i.amountCents)}</p>
                  <div className="flex items-center gap-0.5">
                    <IconButton label="Editar" onClick={() => setEditing(i)}>
                      <Pencil />
                    </IconButton>
                    <form action={toggleIncomeAction}>
                      <input type="hidden" name="id" value={i.id} />
                      <input type="hidden" name="active" value={String(!i.active)} />
                      <IconButton type="submit" label={i.active ? "Pausar" : "Reativar"}>
                        {i.active ? <Pause /> : <Play />}
                      </IconButton>
                    </form>
                    <ConfirmAction
                      action={deleteIncomeAction}
                      fields={{ id: i.id }}
                      title="Excluir renda?"
                      description={`“${i.name}” será removida de todos os meses. Para só parar de contar, use “Pausar”.`}
                      trigger={(open) => (
                        <IconButton label="Excluir" tone="danger" onClick={open}>
                          <Trash2 />
                        </IconButton>
                      )}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Dialog
        open={editing !== null}
        onClose={close}
        title={editing === "new" ? "Nova renda" : "Editar renda"}
        description="Valores recorrentes entram todo mês dentro da vigência."
      >
        {editing !== null && (
          <IncomeForm
            income={editing === "new" ? undefined : editing}
            categories={categories}
            defaultMonth={defaultMonth}
            today={today}
            onDone={close}
          />
        )}
      </Dialog>
    </>
  );
}

function IncomeForm({
  income,
  categories,
  defaultMonth,
  today,
  onDone,
}: {
  income?: IncomeRow;
  categories: CategoryOption[];
  defaultMonth: Month;
  today: ISODate;
  onDone: () => void;
}) {
  const { state, onSubmit, pending } = useFormAction(saveIncomeAction);
  const [recurrence, setRecurrence] = useState<"monthly" | "once">(income?.recurrence ?? "monthly");
  useCloseOnSuccess(state, onDone);
  const f = state.fields ?? {};

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      {income && <input type="hidden" name="id" value={income.id} />}
      {state.error && <Alert tone="danger">{state.error}</Alert>}

      <Field id="name" label="Descrição" error={f.name}>
        <Input {...fieldControlProps("name", f.name)} name="name" defaultValue={income?.name} placeholder="Ex.: Salário empresa X" autoFocus />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="type" label="Tipo" error={f.type}>
          <Select {...fieldControlProps("type", f.type)} name="type" defaultValue={income?.type ?? "salary"}>
            {Object.entries(INCOME_TYPES).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="amount" label="Valor" error={f.amount}>
          <MoneyInput {...fieldControlProps("amount", f.amount)} name="amount" defaultValue={income ? formatAmount(income.amountCents) : ""} />
        </Field>
      </div>

      <div className="grid gap-2">
        <span className="text-sm font-medium">Recorrência</span>
        <Segmented
          name="recurrence"
          ariaLabel="Recorrência"
          value={recurrence}
          onChange={setRecurrence}
          options={[
            { value: "monthly", label: "Todo mês" },
            { value: "once", label: "Uma vez" },
          ]}
        />
      </div>

      {recurrence === "monthly" ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <Field id="payDay" label="Dia do recebimento" error={f.payDay}>
            <Input {...fieldControlProps("payDay", f.payDay)} name="payDay" type="number" min={1} max={31} defaultValue={income?.payDay ?? 5} />
          </Field>
          <Field id="startMonth" label="A partir de" error={f.startMonth}>
            <MonthInput {...fieldControlProps("startMonth", f.startMonth)} name="startMonth" defaultValue={income?.startMonth ?? defaultMonth} />
          </Field>
          <Field id="endMonth" label="Até (opcional)" error={f.endMonth}>
            <MonthInput {...fieldControlProps("endMonth", f.endMonth)} name="endMonth" defaultValue={income?.endMonth ?? null} optional />
          </Field>
        </div>
      ) : (
        <Field id="payDate" label="Data do recebimento" error={f.payDate}>
          <DateInput {...fieldControlProps("payDate", f.payDate)} name="payDate" defaultValue={income?.payDate ?? today} />
        </Field>
      )}

      <Field id="categoryId" label="Categoria (opcional)" error={f.categoryId}>
        <Select {...fieldControlProps("categoryId", f.categoryId)} name="categoryId" defaultValue={income?.categoryId ?? ""}>
          <option value="">Sem categoria</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field id="notes" label="Observações (opcional)" error={f.notes}>
        <Input {...fieldControlProps("notes", f.notes)} name="notes" defaultValue={income?.notes ?? ""} maxLength={500} />
      </Field>

      <div className="mt-2 flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" loading={pending}>
          {income ? "Salvar alterações" : "Adicionar renda"}
        </Button>
      </div>
    </form>
  );
}
