/** Esqueleto exibido enquanto uma página da área logada carrega. */
export default function Loading() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="Carregando">
      <div className="mb-8 grid gap-2">
        <div className="h-7 w-56 rounded-lg bg-muted" />
        <div className="h-4 w-80 max-w-full rounded-lg bg-muted/70" />
      </div>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="h-28 rounded-2xl border bg-card" />
        ))}
      </div>
      <div className="h-72 rounded-2xl border bg-card" />
    </div>
  );
}
