"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { requireAccess } from "@/server/access/guard";
import { hitRateLimit } from "@/server/auth/rate-limit";
import { BillingError, cancelSubscription, startCheckout } from "@/server/billing/service";
import { MercadoPagoError } from "@/server/billing/mercadopago";
import { logSecurityEvent } from "@/server/security/events";

/**
 * Assinar continua liberado com o teste vencido (é justamente para isso que serve).
 * O usuário é mandado para o checkout do Mercado Pago: o app nunca vê dados de cartão.
 */
export async function subscribeAction(): Promise<{ error?: string }> {
  const { session, access } = await requireAccess();
  const uid = session.user.id;
  const limit = await hitRateLimit(`checkout:${uid}`, 10, 3600);
  if (!limit.ok) return { error: "Muitas tentativas. Tente de novo em alguns minutos." };

  let url: string;
  try {
    url = await startCheckout(uid, access);
  } catch (error) {
    if (error instanceof BillingError) return { error: error.message };
    console.error("[billing] checkout:", error instanceof Error ? error.message : error);
    if (error instanceof MercadoPagoError) return { error: "O Mercado Pago não respondeu agora. Tente de novo em instantes." };
    return { error: "Não foi possível abrir o pagamento. Tente de novo." };
  }
  await logSecurityEvent({ event: "billing_checkout", userId: uid });
  redirect(url);
}

export async function cancelSubscriptionAction(): Promise<{ error?: string }> {
  const { session } = await requireAccess();
  try {
    await cancelSubscription(session.user.id);
  } catch (error) {
    if (error instanceof BillingError) return { error: error.message };
    console.error("[billing] cancelar:", error instanceof Error ? error.message : error);
    return { error: "Não foi possível cancelar agora. Tente de novo em instantes." };
  }
  await logSecurityEvent({ event: "billing_cancelled", userId: session.user.id });
  refresh();
  return {};
}
