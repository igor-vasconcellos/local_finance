import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Label({ className, ...props }: ComponentProps<"label">) {
  return <label className={cn("text-sm font-medium leading-none", className)} {...props} />;
}

/** Agrupa label + controle + ajuda/erro, com ids ligados para leitores de tela. */
export function Field({
  id,
  label,
  hint,
  error,
  children,
  labelAside,
}: {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
  labelAside?: ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <Label htmlFor={id}>{label}</Label>
        {labelAside}
      </div>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Props de acessibilidade para o controle dentro de um Field. */
export function fieldControlProps(id: string, error?: string, hasHint?: boolean) {
  return {
    id,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? `${id}-error` : hasHint ? `${id}-hint` : undefined,
  } as const;
}
