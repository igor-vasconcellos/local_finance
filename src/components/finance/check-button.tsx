"use client";

import { Check, Loader2, Undo2 } from "lucide-react";
import { useFormStatus } from "react-dom";
import { cn } from "@/lib/utils";

/** Botão de confirmar (✓) ou desfazer dentro de um <form action={serverAction}>. */
export function CheckButton({ done, label }: { done?: boolean; label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors disabled:opacity-60",
        done
          ? "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
          : "bg-card hover:border-success/40 hover:bg-success-soft hover:text-success",
      )}
    >
      {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : done ? <Undo2 className="size-3.5" aria-hidden /> : <Check className="size-3.5" aria-hidden />}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
