"use client";

import { Pause, Pencil, Play, Plus, Receipt, Trash2 } from "lucide-react";
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
import { Select } from "@/components/ui/select";
import { formatMonthShort, type Month } from "@/lib/dates";
import { formatAmount, formatBRL } from "@/lib/money";
import { cn } from "@/lib/utils";
import { deleteExpenseAction, saveExpenseAction, toggleExpenseAction } from "@/server/actions/expenses";
import type { CategoryOption } from "@/server/finance/categories";
import type { ExpenseRow } from "@/server/finance/expenses";

type Props = { expenses: ExpenseRow[]; categories: CategoryOption[]; defaultMonth: Month };

export function ExpensesView({ expenses, categories, defaultMonth }: Props) {
  const [editing, setEditing] = useState<ExpenseRow | "new" | null>(null);
  const close = useCallback(() => setEditing(null), []);

  const newButton = (
    <Button onClick={() => setEditing("new")}>
      <Plus aria-hidden /> Novo gasto
    </Button>
  );

  return (
    <div className="min-w-0">
      {expenses.length === 0 ? (
        <EmptyState
          icon={<Receipt />}
          title="Nenhum gasto fixo cadastrado"
          description="Cadastre aluguel, contas de consumo e assinaturas para enxergar seu custo de vida mensal."
          action={newButton}
        />
      ) : (
        <Card>
          <div className="flex items-center justify-between gap-4 border-b px-5 py-4">
            <h2 className="font-semibold">Seus gastos fixos</h2>
            {newButton}
          </div>
          <ul className="divide-y">
            {expenses.map((e) => {
              const ended = Boolean(e.endMonth && e.endMonth < defaultMonth);
              const notStarted = e.startMonth > defaultMonth;
              return (
                <li key={e.id} className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4", (!e.active || ended) && "opacity-60")}>
                  <div className="flex size-10 shrink-0 flex-col items-center justify-center rounded-xl bg-muted leading-none">
                    <span className="text-[10px] text-muted-foreground uppercase">dia</span>
                    <span className="text-sm font-semibold tabular-nums">{e.dueDay}</span>
                  </div>
                  <div className="min-w-0 flex-1 basis-[calc(100%-4rem)] sm:basis-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-medium">{e.name}</p>
                      {!e.active && <Badge>Pausado</Badge>}
                      {e.active && ended && <Badge>Encerrado</Badge>}
                      {e.active && notStarted && <Badge tone="primary">Começa em {formatMonthShort(e.startMonth)}</Badge>}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <CategoryLabel name={e.categoryName} color={e.categoryColor} />
                      <span>
                        desde {formatMonthShort(e.startMonth)}
                        {e.endMonth ? ` até ${formatMonthShort(e.endMonth)}` : ""}
                      </span>
                    </div>
                  </div>
                  <p className="ml-auto font-semibold tabular-nums sm:ml-0">{formatBRL(e.amountCents)}</p>
                  <div className="flex items-center gap-0.5">
                    <IconButton label="Editar" onClick={() => setEditing(e)}>
                      <Pencil />
                    </IconButton>
                    <form action={toggleExpenseAction}>
                      <input type="hidden" name="id" value={e.id} />
                      <input type="hidden" name="active" value={String(!e.active)} />
                      <IconButton type="submit" label={e.active ? "Pausar" : "Reativar"}>
                        {e.active ? <Pause /> : <Play />}
                      </IconButton>
                    </form>
                    <ConfirmAction
                      action={deleteExpenseAction}
                      fields={{ id: e.id }}
                      title="Excluir gasto fixo?"
                      description={`“${e.name}” será removido de todos os meses. Se o gasto só acabou, prefira definir o mês de término.`}
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

      <Dialog open={editing !== null} onClose={close} title={editing === "new" ? "Novo gasto fixo" : "Editar gasto fixo"}>
        {editing !== null && (
          <ExpenseForm expense={editing === "new" ? undefined : editing} categories={categories} defaultMonth={defaultMonth} onDone={close} />
        )}
      </Dialog>
    </div>
  );
}

function ExpenseForm({
  expense,
  categories,
  defaultMonth,
  onDone,
}: {
  expense?: ExpenseRow;
  categories: CategoryOption[];
  defaultMonth: Month;
  onDone: () => void;
}) {
  const { state, onSubmit, pending } = useFormAction(saveExpenseAction);
  useCloseOnSuccess(state, onDone);
  const f = state.fields ?? {};

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      {expense && <input type="hidden" name="id" value={expense.id} />}
      {state.error && <Alert tone="danger">{state.error}</Alert>}

      <Field id="name" label="Descrição" error={f.name}>
        <Input {...fieldControlProps("name", f.name)} name="name" defaultValue={expense?.name} placeholder="Ex.: Aluguel" autoFocus />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="categoryId" label="Categoria" error={f.categoryId}>
          <Select {...fieldControlProps("categoryId", f.categoryId)} name="categoryId" defaultValue={expense?.categoryId ?? ""}>
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
        <Field id="amount" label="Valor mensal" error={f.amount}>
          <MoneyInput {...fieldControlProps("amount", f.amount)} name="amount" defaultValue={expense ? formatAmount(expense.amountCents) : ""} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field id="dueDay" label="Dia do vencimento" error={f.dueDay}>
          <Input {...fieldControlProps("dueDay", f.dueDay)} name="dueDay" type="number" min={1} max={31} defaultValue={expense?.dueDay ?? 10} />
        </Field>
        <Field id="startMonth" label="A partir de" error={f.startMonth}>
          <Input {...fieldControlProps("startMonth", f.startMonth)} name="startMonth" type="month" defaultValue={expense?.startMonth ?? defaultMonth} />
        </Field>
        <Field id="endMonth" label="Até (opcional)" error={f.endMonth}>
          <Input {...fieldControlProps("endMonth", f.endMonth)} name="endMonth" type="month" defaultValue={expense?.endMonth ?? ""} />
        </Field>
      </div>

      <Field id="notes" label="Observações (opcional)" error={f.notes}>
        <Input {...fieldControlProps("notes", f.notes)} name="notes" defaultValue={expense?.notes ?? ""} maxLength={500} />
      </Field>

      <div className="mt-2 flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" loading={pending}>
          {expense ? "Salvar alterações" : "Adicionar gasto"}
        </Button>
      </div>
    </form>
  );
}
