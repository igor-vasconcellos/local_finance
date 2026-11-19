"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  addMonths,
  daysInMonth,
  formatDate,
  MONTH_NAMES,
  monthOf,
  parseMonth,
  toMonth,
  WEEKDAYS_SHORT,
  type ISODate,
  type Month,
} from "@/lib/dates";
import { cn } from "@/lib/utils";

const pad = (n: number) => String(n).padStart(2, "0");

function addDays(iso: ISODate, n: number): ISODate {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

const navBtn =
  "inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-40";

/**
 * Calendário mensal em português. Clique no título para escolher mês/ano rapidamente.
 * Teclado: setas movem o dia, PageUp/PageDown trocam o mês, Enter escolhe.
 */
export function Calendar({
  value,
  today,
  min,
  max,
  onSelect,
}: {
  value: ISODate | null;
  today: ISODate;
  min?: ISODate;
  max?: ISODate;
  onSelect: (iso: ISODate) => void;
}) {
  const [view, setView] = useState<Month>(monthOf(value ?? today));
  const [mode, setMode] = useState<"days" | "months">("days");
  const [focused, setFocused] = useState<ISODate>(value ?? today);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (mode === "days") gridRef.current?.querySelector<HTMLButtonElement>(`[data-date="${focused}"]`)?.focus();
  }, [focused, mode, view]);

  const disabled = (d: ISODate) => Boolean((min && d < min) || (max && d > max));
  const { year, month } = parseMonth(view);
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const total = daysInMonth(view);
  const cells: (ISODate | null)[] = [
    ...Array<null>(firstWeekday).fill(null),
    ...Array.from({ length: total }, (_, i) => `${view}-${pad(i + 1)}`),
  ];

  const moveFocus = (next: ISODate) => {
    setFocused(next);
    if (monthOf(next) !== view) setView(monthOf(next));
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const map: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (e.key in map) {
      e.preventDefault();
      moveFocus(addDays(focused, map[e.key]));
    } else if (e.key === "PageUp" || e.key === "PageDown") {
      e.preventDefault();
      const m = addMonths(monthOf(focused), e.key === "PageUp" ? -1 : 1);
      moveFocus(`${m}-${pad(Math.min(Number(focused.slice(8)), daysInMonth(m)))}`);
    }
  };

  if (mode === "months") {
    return (
      <div className="w-72">
        <div className="mb-2 flex items-center justify-between">
          <button type="button" className={navBtn} onClick={() => setView(toMonth(year - 1, month))} aria-label="Ano anterior">
            <ChevronLeft className="size-4" aria-hidden />
          </button>
          <button type="button" className="rounded-lg px-2 py-1 text-sm font-semibold hover:bg-muted" onClick={() => setMode("days")}>
            {year}
          </button>
          <button type="button" className={navBtn} onClick={() => setView(toMonth(year + 1, month))} aria-label="Próximo ano">
            <ChevronRight className="size-4" aria-hidden />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {MONTH_NAMES.map((name, i) => {
            const m = toMonth(year, i + 1);
            const selected = value ? monthOf(value) === m : false;
            return (
              <button
                key={name}
                type="button"
                onClick={() => {
                  setView(m);
                  setFocused(`${m}-01`);
                  setMode("days");
                }}
                className={cn(
                  "rounded-lg py-2.5 text-sm hover:bg-muted",
                  selected && "bg-primary text-primary-foreground hover:bg-primary/90",
                  !selected && m === monthOf(today) && "font-semibold text-primary",
                )}
              >
                {name.slice(0, 3)}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="w-72">
      <div className="mb-2 flex items-center justify-between">
        <button type="button" className={navBtn} onClick={() => setView(addMonths(view, -1))} aria-label="Mês anterior">
          <ChevronLeft className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          className="rounded-lg px-2 py-1 text-sm font-semibold hover:bg-muted"
          onClick={() => setMode("months")}
          aria-label={`${MONTH_NAMES[month - 1]} de ${year}. Escolher outro mês`}
          aria-live="polite"
        >
          {MONTH_NAMES[month - 1]} de {year}
        </button>
        <button type="button" className={navBtn} onClick={() => setView(addMonths(view, 1))} aria-label="Próximo mês">
          <ChevronRight className="size-4" aria-hidden />
        </button>
      </div>

      <div className="grid grid-cols-7 text-center text-[11px] font-medium text-muted-foreground" aria-hidden>
        {WEEKDAYS_SHORT.map((w, i) => (
          <span key={i} className="py-1">
            {w}
          </span>
        ))}
      </div>
      <div ref={gridRef} role="grid" aria-label={`${MONTH_NAMES[month - 1]} de ${year}`} className="grid grid-cols-7 gap-0.5" onKeyDown={onKey}>
        {cells.map((d, i) =>
          d === null ? (
            <span key={`e${i}`} />
          ) : (
            <button
              key={d}
              type="button"
              data-date={d}
              tabIndex={d === focused ? 0 : -1}
              disabled={disabled(d)}
              onClick={() => onSelect(d)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), !disabled(d) && onSelect(d))}
              aria-label={formatDate(d)}
              aria-pressed={d === value}
              className={cn(
                "relative flex aspect-square items-center justify-center rounded-lg text-sm tabular-nums transition-colors",
                "hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-30",
                d === today && d !== value && "font-semibold text-primary after:absolute after:bottom-1 after:size-1 after:rounded-full after:bg-primary",
                d === value && "bg-primary font-semibold text-primary-foreground hover:bg-primary/90",
              )}
            >
              {Number(d.slice(8))}
            </button>
          ),
        )}
      </div>
    </div>
  );
}

/** Grade de meses (para campos mm/aaaa). */
export function MonthGrid({
  value,
  current,
  onSelect,
}: {
  value: Month | null;
  current: Month;
  onSelect: (m: Month) => void;
}) {
  const [year, setYear] = useState(parseMonth(value ?? current).year);
  return (
    <div className="w-64">
      <div className="mb-2 flex items-center justify-between">
        <button type="button" className={navBtn} onClick={() => setYear(year - 1)} aria-label="Ano anterior">
          <ChevronLeft className="size-4" aria-hidden />
        </button>
        <span className="text-sm font-semibold" aria-live="polite">
          {year}
        </span>
        <button type="button" className={navBtn} onClick={() => setYear(year + 1)} aria-label="Próximo ano">
          <ChevronRight className="size-4" aria-hidden />
        </button>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {MONTH_NAMES.map((name, i) => {
          const m = toMonth(year, i + 1);
          return (
            <button
              key={name}
              type="button"
              onClick={() => onSelect(m)}
              aria-label={`${name} de ${year}`}
              aria-pressed={m === value}
              className={cn(
                "rounded-lg py-2.5 text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring",
                m === value && "bg-primary font-semibold text-primary-foreground hover:bg-primary/90",
                m !== value && m === current && "font-semibold text-primary",
              )}
            >
              {name.slice(0, 3)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
