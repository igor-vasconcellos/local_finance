import { ChevronLeft, ChevronRight, FlaskConical } from "lucide-react";
import Link from "next/link";
import { addMonths, formatMonthLong, formatMonthShort, type Month } from "@/lib/dates";
import { cn } from "@/lib/utils";

export type DashboardView = "mensal" | "semestral" | "anual";
export const PERIOD_LENGTH: Record<DashboardView, number> = { mensal: 1, semestral: 6, anual: 12 };

export type DashboardState = { view: DashboardView; start: Month; current: Month; sim: boolean };

/** Monta a URL do painel preservando o estado (visão, mês inicial, simulações). */
export function dashboardHref(s: DashboardState, patch: Partial<Omit<DashboardState, "current">> = {}) {
  const next = { ...s, ...patch };
  const q = new URLSearchParams();
  if (next.view !== "mensal") q.set("visao", next.view);
  if (next.start !== s.current) q.set("mes", next.start);
  if (next.sim) q.set("sim", "1");
  const qs = q.toString();
  return `/dashboard${qs ? `?${qs}` : ""}`;
}

const VIEWS: { value: DashboardView; label: string }[] = [
  { value: "mensal", label: "Mensal" },
  { value: "semestral", label: "Semestral" },
  { value: "anual", label: "Anual" },
];

export function ViewTabs({ state }: { state: DashboardState }) {
  return (
    <nav aria-label="Visão do painel" className="inline-flex gap-1 rounded-xl bg-muted p-1">
      {VIEWS.map((v) => {
        const active = state.view === v.value;
        return (
          <Link
            key={v.value}
            href={dashboardHref(state, { view: v.value })}
            scroll={false}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-lg px-3.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
              active && "bg-card text-foreground shadow-xs",
            )}
          >
            {v.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Interruptor "Mostrar simulações" (link que alterna ?sim=1). */
export function SimulationToggle({ state, count }: { state: DashboardState; count: number }) {
  return (
    <Link
      href={dashboardHref(state, { sim: !state.sim })}
      scroll={false}
      role="switch"
      aria-checked={state.sim}
      className={cn(
        "inline-flex items-center gap-2.5 rounded-xl border px-3 py-1.5 text-sm font-medium transition-colors",
        state.sim ? "border-primary/40 bg-accent text-accent-foreground" : "bg-card text-muted-foreground hover:text-foreground",
      )}
      title={count ? `${count} simulação(ões) marcada(s) no Simulador` : "Nenhuma simulação marcada no Simulador"}
    >
      <FlaskConical className="size-4" aria-hidden />
      Mostrar simulações
      <span
        aria-hidden
        className={cn("relative h-5 w-9 rounded-full transition-colors", state.sim ? "bg-primary" : "bg-muted-foreground/30")}
      >
        <span className={cn("absolute top-0.5 size-4 rounded-full bg-white shadow transition-[left]", state.sim ? "left-[18px]" : "left-0.5")} />
      </span>
      {count > 0 && <span className="rounded-full bg-primary/15 px-1.5 text-xs tabular-nums">{count}</span>}
    </Link>
  );
}

/** ← período → ; anda de 1, 6 ou 12 meses conforme a visão. */
export function PeriodNav({ state }: { state: DashboardState }) {
  const n = PERIOD_LENGTH[state.view];
  const end = addMonths(state.start, n - 1);
  const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
  const label = n === 1 ? formatMonthLong(state.start) : `${cap(formatMonthShort(state.start))} – ${cap(formatMonthShort(end))}`;
  const arrow =
    "inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring";
  const isCurrent = state.start === state.current;
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1 rounded-xl border bg-card p-1 shadow-xs">
        <Link href={dashboardHref(state, { start: addMonths(state.start, -n) })} className={arrow} aria-label="Período anterior" scroll={false}>
          <ChevronLeft className="size-4" aria-hidden />
        </Link>
        <span className="min-w-40 text-center text-sm font-semibold" aria-live="polite">
          {label}
        </span>
        <Link href={dashboardHref(state, { start: addMonths(state.start, n) })} className={arrow} aria-label="Próximo período" scroll={false}>
          <ChevronRight className="size-4" aria-hidden />
        </Link>
      </div>
      <Link
        href={dashboardHref(state, { start: state.current })}
        scroll={false}
        className={cn("rounded-lg px-3 py-2 text-sm font-medium text-primary hover:bg-accent", isCurrent && "pointer-events-none invisible")}
        aria-hidden={isCurrent}
        tabIndex={isCurrent ? -1 : undefined}
      >
        Hoje
      </Link>
    </div>
  );
}
