import { LogOut } from "lucide-react";
import { Brand } from "@/components/layout/brand";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Button } from "@/components/ui/button";
import { logoutAction } from "@/server/actions/auth";
import { requireSession } from "@/server/auth/current";

/**
 * Área autenticada. Layout provisório — a sidebar completa chega na Etapa 3.
 * requireSession() valida a sessão no banco antes de renderizar qualquer página.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { user } = await requireSession();
  const initials = user.name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");

  return (
    <div className="flex min-h-svh flex-col">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-6">
          <Brand />
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <div className="hidden items-center gap-2 sm:flex">
              <span className="inline-flex size-8 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
                {initials}
              </span>
              <span className="text-sm font-medium">{user.name.split(" ")[0]}</span>
            </div>
            <form action={logoutAction}>
              <Button type="submit" variant="ghost" size="sm" aria-label="Sair">
                <LogOut aria-hidden />
                <span className="hidden sm:inline">Sair</span>
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">{children}</main>
    </div>
  );
}
