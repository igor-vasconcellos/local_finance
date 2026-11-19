import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { addMonths, formatMonthLong, type Month } from "@/lib/dates";
import { cn } from "@/lib/utils";

/** Navegação ← Mês → por searchParam (?mes=YYYY-MM). */
export function MonthNav({ month, current, basePath }: { month: Month; current: Month; basePath: string }) {
  const link = (m: Month) => (m === current ? basePath : `${basePath}?mes=${m}`);
  const arrow =
    "inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring";
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1 rounded-xl border bg-card p-1 shadow-xs">
        <Link href={link(addMonths(month, -1))} className={arrow} aria-label="Mês anterior" scroll={false}>
          <ChevronLeft className="size-4" aria-hidden />
        </Link>
        <span className="min-w-40 text-center text-sm font-semibold" aria-live="polite">
          {formatMonthLong(month)}
        </span>
        <Link href={link(addMonths(month, 1))} className={arrow} aria-label="Próximo mês" scroll={false}>
          <ChevronRight className="size-4" aria-hidden />
        </Link>
      </div>
      <Link
        href={basePath}
        scroll={false}
        className={cn(
          "rounded-lg px-3 py-2 text-sm font-medium text-primary hover:bg-accent",
          month === current && "pointer-events-none invisible",
        )}
        aria-hidden={month === current}
        tabIndex={month === current ? -1 : undefined}
      >
        Hoje
      </Link>
    </div>
  );
}
