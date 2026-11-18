export function CategoryLabel({ name, color }: { name: string | null; color: string | null }) {
  if (!name) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className="size-2 rounded-full" style={{ background: color ?? "var(--muted-foreground)" }} aria-hidden />
      {name}
    </span>
  );
}
