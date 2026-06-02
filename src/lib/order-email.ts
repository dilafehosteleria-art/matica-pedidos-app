import { buildOrderPlainText, orderReference } from "@/lib/order-ticket";
import type { AdminOrder } from "@/lib/types";

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const DEFAULT_TO = "pedidomatica@gmail.com";

export async function sendOrderNotificationEmail(order: AdminOrder) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ORDER_NOTIFICATION_FROM;
  const to = process.env.ORDER_NOTIFICATION_TO || DEFAULT_TO;

  if (!apiKey || !from) {
    console.warn("[order-email] Email no enviado: configura RESEND_API_KEY y ORDER_NOTIFICATION_FROM.");
    return { sent: false, reason: "missing_config" };
  }

  const companyName = order.companies?.name ?? "Cliente principal";
  const subject = `Nuevo pedido B2B - ${companyName} - ${orderReference(order.id)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `matica-order-${order.id}`
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        text: buildOrderPlainText(order)
      })
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.warn(`[order-email] Email no enviado (${response.status}): ${body}`);
      return { sent: false, reason: "request_failed" };
    }

    return { sent: true };
  } catch (error) {
    console.warn("[order-email] Email no enviado por error de red.", error);
    return { sent: false, reason: "network_error" };
  } finally {
    clearTimeout(timeout);
  }
}
