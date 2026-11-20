import { FeatureLocked } from "@/components/access/feature-locked";
import { requireAccess } from "@/server/access/guard";

/** Função travada pelo admin: mostra o aviso no lugar das páginas (o admin nunca é afetado). */
export default async function Layout({ children }: { children: React.ReactNode }) {
  const { access } = await requireAccess();
  const lock = access.locked.simulator;
  if (lock) return <FeatureLocked title="Simulador" message={lock.message} />;
  return children;
}
