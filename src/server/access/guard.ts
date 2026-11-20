import "server-only";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { FeatureKey } from "@/db/schema/admin";
import { requireSession } from "@/server/auth/current";
import type { ValidSession } from "@/server/auth/sessions";
import type { Access } from "./policy";
import { getAccessCached } from "./service";

/** Página de cada função travável (para onde o usuário volta se ela estiver travada). */
export const FEATURE_PATH: Record<FeatureKey, string> = {
  boxes: "/caixinhas",
  simulator: "/simulador",
  invoice_import: "/cartoes",
};

export const FEATURE_LABEL: Record<FeatureKey, string> = {
  boxes: "Caixinhas",
  simulator: "Simulador",
  invoice_import: "Importação de faturas",
};

export async function requireAccess(): Promise<{ session: ValidSession; access: Access }> {
  const session = await requireSession();
  const access = await getAccessCached(session.user.id);
  if (!access) redirect("/login");
  return { session, access };
}

/** Caminho (só o path, nunca outro site) da página de onde a ação foi disparada. */
async function originPath(): Promise<string> {
  const referer = (await headers()).get("referer");
  try {
    const path = referer ? new URL(referer).pathname : "/dashboard";
    return path.startsWith("/") && !path.startsWith("//") ? path : "/dashboard";
  } catch {
    return "/dashboard";
  }
}

/**
 * Toda Server Action que ALTERA dados passa por aqui. Conta bloqueada: volta para a
 * página com o modal de bloqueio aberto. Função travada: vai para a página da função,
 * que mostra o aviso. Nada é gravado em nenhum dos casos.
 */
export async function requireWriteUserId(feature?: FeatureKey): Promise<number> {
  const { session, access } = await requireAccess();
  if (access.readOnly) redirect(`${await originPath()}?bloqueado=${Date.now()}`);
  if (feature && access.locked[feature]) redirect(FEATURE_PATH[feature]);
  return session.user.id;
}

/** Páginas e ações do painel: qualquer outra conta recebe "Página não encontrada". */
export async function requireAdmin(): Promise<ValidSession> {
  const { session, access } = await requireAccess();
  if (!access.isAdmin) notFound();
  return session;
}
