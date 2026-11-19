import { initials } from "@/lib/profile";
import { cn } from "@/lib/utils";

/** Avatar com as iniciais do nome; usa a cor escolhida no perfil (ou o roxo do app). */
export function Avatar({ name, color, className }: { name: string; color: string | null; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
        color ? "text-white" : "bg-accent text-accent-foreground",
        className,
      )}
      style={color ? { background: color } : undefined}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}
