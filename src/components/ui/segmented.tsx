"use client";

import { cn } from "@/lib/utils";

/** Grupo de opções exclusivas no estilo "pílula" (radio buttons acessíveis). */
export function Segmented<T extends string>({
  name,
  value,
  onChange,
  options,
  ariaLabel,
}: {
  name: string;
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  ariaLabel: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="grid auto-cols-fr grid-flow-col gap-1 rounded-lg bg-muted p-1">
      {options.map((o) => (
        <label
          key={o.value}
          className={cn(
            "flex cursor-pointer items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors",
            "has-focus-visible:ring-2 has-focus-visible:ring-ring/40",
            value === o.value && "bg-card text-foreground shadow-xs",
          )}
        >
          <input
            type="radio"
            name={name}
            value={o.value}
            checked={value === o.value}
            onChange={() => onChange(o.value)}
            className="sr-only"
          />
          {o.label}
        </label>
      ))}
    </div>
  );
}
