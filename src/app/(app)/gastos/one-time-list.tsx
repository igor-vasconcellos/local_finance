"use client";

import { Landmark, Trash2 } from "lucide-react";
import { CategoryLabel } from "@/components/finance/category-dot";
import { Badge } from "@/components/ui/badge";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { IconButton } from "@/components/ui/icon-button";
import { Card } from "@/components/ui/page";
import { formatDate } from "@/lib/dates";
import { formatBRL } from "@/lib/money";
import { deleteOneTimeAction } from "@/server/actions/expenses";

type Item = {
  id: number;
  description: string;
  amountCents: number;
  date: string;
  fromSimulation: number | null;
  categoryName: string | null;
  categoryColor: string | null;
};

/** Gastos avulsos (débito/Pix) — por enquanto criados ao efetivar simulações de débito. */
export function OneTimeList({ items }: { items: Item[] }) {
  if (!items.length) return null;
  return (
    <Card className="mt-6">
      <div className="flex items-center justify-between gap-4 border-b px-5 py-4">
        <h2 className="flex items-center gap-2 font-semibold">
          <Landmark className="size-4 text-muted-foreground" aria-hidden /> Gastos avulsos (débito / Pix)
        </h2>
        <span className="text-sm text-muted-foreground">{items.length}</span>
      </div>
      <ul className="divide-y">
        {items.map((i) => (
          <li key={i.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3">
            <span className="w-20 text-xs text-muted-foreground tabular-nums">{formatDate(i.date)}</span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-sm font-medium">{i.description}</p>
                {i.fromSimulation && <Badge tone="primary">Do simulador</Badge>}
              </div>
              <CategoryLabel name={i.categoryName} color={i.categoryColor} />
            </div>
            <p className="text-sm font-semibold tabular-nums">{formatBRL(i.amountCents)}</p>
            <ConfirmAction
              action={deleteOneTimeAction}
              fields={{ id: i.id }}
              title="Excluir gasto avulso?"
              description={`“${i.description}” de ${formatBRL(i.amountCents)} será removido do mês e dos relatórios.`}
              trigger={(open) => (
                <IconButton label="Excluir gasto avulso" tone="danger" onClick={open}>
                  <Trash2 />
                </IconButton>
              )}
            />
          </li>
        ))}
      </ul>
    </Card>
  );
}
