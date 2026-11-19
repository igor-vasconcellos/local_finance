import { cookies } from "next/headers";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { SIDEBAR_COOKIE } from "@/components/layout/sidebar-config";
import { maskEmail } from "@/lib/mask";
import { requireSession } from "@/server/auth/current";

/**
 * Área autenticada: sidebar (desktop, recolhível) / gaveta (celular) + conteúdo.
 * requireSession() valida a sessão no banco antes de renderizar qualquer página.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { user } = await requireSession();
  const collapsed = (await cookies()).get(SIDEBAR_COOKIE)?.value === "collapsed";

  return (
    <div className="flex min-h-svh flex-col lg:flex-row">
      <AppSidebar
        user={{ name: user.name, email: maskEmail(user.email), avatarColor: user.avatarColor }}
        defaultCollapsed={collapsed}
      />
      <main className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-10 lg:py-10">{children}</div>
      </main>
    </div>
  );
}
