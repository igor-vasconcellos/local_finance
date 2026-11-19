import { formatDate } from "@/lib/dates";
import { formatBRL } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { BoxGoal } from "@/server/finance/boxes";

export function GoalProgress({
  goal,
  balanceCents,
  color,
  compact,
}: {
  goal: BoxGoal;
  balanceCents: number;
  color: string | null;
  compact?: boolean;
}) {
  const pct = Math.round(goal.progressPct);
  const remaining = Math.max(0, goal.goalCents - balanceCents);
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground">
          Meta {formatBRL(goal.goalCents)}
          {goal.goalDate && ` até ${formatDate(goal.goalDate)}`}
        </span>
        <span className="font-medium tabular-nums">{pct}%</span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Progresso da meta"
      >
        <div className="h-full rounded-full transition-[width]" style={{ width: `${pct}%`, background: color ?? "var(--primary)" }} />
      </div>
      <p className={cn("text-xs", goal.reached ? "font-medium text-success" : "text-muted-foreground")}>
        {goal.reached
          ? "Meta atingida! 🎉"
          : goal.monthlyDepositCents
            ? `Guarde ${formatBRL(goal.monthlyDepositCents)}/mês${compact ? "" : ` por ${goal.monthsLeft} ${goal.monthsLeft === 1 ? "mês" : "meses"}`} para chegar lá`
            : `Faltam ${formatBRL(remaining)}`}
      </p>
    </div>
  );
}
