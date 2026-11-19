"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { value: "light", label: "Claro", Icon: Sun },
  { value: "dark", label: "Escuro", Icon: Moon },
  { value: "system", label: "Sistema", Icon: Monitor },
] as const;

const subscribe = () => () => {};

export function ThemeToggle({ vertical }: { vertical?: boolean }) {
  const { theme, setTheme } = useTheme();
  // Só sabemos o tema salvo depois de hidratar no navegador.
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);

  return (
    <div
      role="radiogroup"
      aria-label="Tema"
      aria-orientation={vertical ? "vertical" : "horizontal"}
      className={cn("inline-flex items-center gap-1 rounded-full border bg-card p-1", vertical && "flex-col")}
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = mounted && theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => setTheme(value)}
            className={cn(
              "inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors",
              "hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring",
              active && "bg-accent text-accent-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
