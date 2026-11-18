import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** Botão só com ícone — `label` é obrigatório (vira aria-label e tooltip). */
export function IconButton({
  label,
  className,
  tone,
  ...props
}: ComponentProps<"button"> & { label: string; tone?: "danger" }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors [&_svg]:size-4",
        "hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50",
        tone === "danger" && "hover:bg-danger-soft hover:text-danger",
        className,
      )}
      {...props}
    />
  );
}
