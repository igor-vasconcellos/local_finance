"use client";

import { ChevronRight, PiggyBank, Plus } from "lucide-react";
import Link from "next/link";
import { useCallback, useState } from "react";
import { BoxForm } from "@/components/finance/box-form";
import { GoalProgress } from "@/components/finance/goal-progress";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/page";
import { formatBRL } from "@/lib/money";
import { formatPct } from "@/lib/rates";
import type { BoxSummary } from "@/server/finance/boxes";

export function BoxesView({ boxes, institutions }: { boxes: BoxSummary[]; institutions: string[] }) {
  const [creating, setCreating] = useState(false);
  const close = useCallback(() => setCreating(false), []);

  const newButton = (
    <Button onClick={() => setCreating(true)}>
      <Plus aria-hidden /> Nova caixinha
    </Button>
  );

  return (
    <>
      {boxes.length === 0 ? (
        <EmptyState
          icon={<PiggyBank />}
          title="Nenhuma caixinha ainda"
          description="Crie caixinhas para sua reserva e seus objetivos. Elas rendem pelo % do CDI que você informar, e podem ter meta com data."
          action={newButton}
        />
      ) : (
        <>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold">Suas caixinhas</h2>
            {newButton}
          </div>
          <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {boxes.map((b) => (
              <li key={b.id}>
                <Link
                  href={`/caixinhas/${b.id}`}
                  className="group flex h-full flex-col gap-4 rounded-2xl border bg-card p-5 shadow-xs transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <div className="flex items-start gap-3">
                    <span
                      className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl text-white"
                      style={{ background: b.color ?? "var(--primary)" }}
                    >
                      <PiggyBank className="size-5" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{b.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {b.institutionName} · {formatPct(b.cdiPercentBp / 100, b.cdiPercentBp % 100 ? 1 : 0)} do CDI
                      </p>
                    </div>
                  </div>

                  <div>
                    <p className="text-2xl font-semibold tracking-tight tabular-nums">{formatBRL(b.balanceCents)}</p>
                    <p className="text-xs text-success tabular-nums">
                      +{formatBRL(b.yieldCents)} de rendimento · ~{formatBRL(b.monthYieldCents)} este mês
                    </p>
                  </div>

                  {b.goal && <GoalProgress goal={b.goal} balanceCents={b.balanceCents} color={b.color} compact />}

                  <span className="mt-auto flex items-center justify-end gap-1 text-sm font-medium text-primary">
                    Ver detalhes
                    <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      <Dialog open={creating} onClose={close} title="Nova caixinha" description="Você pode registrar o saldo atual como primeiro aporte depois de criar.">
        {creating && <BoxForm institutions={institutions} onDone={close} />}
      </Dialog>
    </>
  );
}
