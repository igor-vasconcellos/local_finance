import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "flex h-10 w-full rounded-lg border border-input bg-card px-3 text-sm shadow-xs transition-[border-color,box-shadow] outline-none",
        "placeholder:text-muted-foreground/70",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25",
        "aria-invalid:border-danger aria-invalid:ring-danger/20",
        "disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      {...props}
    />
  );
}
