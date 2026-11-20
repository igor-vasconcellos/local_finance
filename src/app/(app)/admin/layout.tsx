import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page";
import { requireAdmin } from "@/server/access/guard";
import { AdminTabs } from "./admin-tabs";

export const metadata: Metadata = { title: "Painel admin" };

/** Só a conta admin chega aqui; qualquer outra recebe "Página não encontrada". */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <>
      <PageHeader
        title="Painel admin"
        description="Gerencie contas e funções do sistema. Os dados financeiros dos usuários não aparecem aqui."
      />
      <AdminTabs />
      {children}
    </>
  );
}
