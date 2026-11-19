import { Lock } from "lucide-react";
import { Brand } from "@/components/layout/brand";
import { ThemeToggle } from "@/components/layout/theme-toggle";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="relative flex min-h-svh flex-col">
      {/* brilho sutil de fundo */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(60%_100%_at_50%_0%,var(--accent),transparent)] opacity-70"
      />
      <header className="relative flex items-center justify-between px-6 py-5">
        <Brand />
        <ThemeToggle />
      </header>

      <main className="relative flex flex-1 items-start justify-center px-4 pt-6 pb-16 sm:items-center sm:pt-0">
        <div className="w-full max-w-sm">{children}</div>
      </main>

      <footer className="relative flex items-center justify-center gap-1.5 pb-6 text-xs text-muted-foreground">
        <Lock className="size-3" aria-hidden />
        Seus dados ficam protegidos e só você tem acesso a eles.
      </footer>
    </div>
  );
}
