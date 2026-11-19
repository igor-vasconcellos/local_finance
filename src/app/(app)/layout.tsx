import { AppSidebar } from "@/components/layout/app-sidebar";
import { maskEmail } from "@/lib/mask";
import { requireSession } from "@/server/auth/current";

/**
 * Área autenticada: sidebar (desktop) / gaveta (celular) + conteúdo.
 * requireSession() valida a sessão no banco antes de renderizar qualquer página.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { user } = await requireSession();

  return (
    <div className="flex min-h-svh flex-col lg:flex-row">
      <AppSidebar user={{ name: user.name, email: maskEmail(user.email) }} />
      <main className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-10 lg:py-10">{children}</div>
      </main>
    </div>
  );
}
