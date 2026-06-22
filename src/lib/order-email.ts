import { buildOrderPlainText, orderReference } from "@/lib/order-ticket";
import { formatCurrency } from "@/lib/format";
import { operationalPaymentLabel, paymentMethodLabel } from "@/lib/payment-display";
import {
  formatOrderDateTime,
  orderCompanyInvoiceTotal,
  orderEmployeeTotal,
  orderItemOptionLines
} from "@/lib/order-ticket";
import type { AdminOrder } from "@/lib/types";

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const MATICA_TO = "pedidomatica@gmail.com";

function escapeHtml(value: string | number | null | undefined) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function companyName(order: AdminOrder) {
  return order.companies?.name ?? "Cliente principal";
}

function branchName(order: AdminOrder) {
  return order.company_branches?.name ?? "Sin empresa interna";
}

function companyAddress(order: AdminOrder) {
  return order.companies?.delivery_address?.trim() ?? "";
}

function buildItemHtml(order: AdminOrder) {
  return order.order_items
    .map((item) => {
      const optionLines = orderItemOptionLines(item.metadata)
        .map((entry) => `
          <div style="margin-top:4px;color:#506057;font-size:13px;line-height:1.45;">
            &gt; <strong>${escapeHtml(entry.label)}:</strong> ${escapeHtml(entry.value)}
          </div>
        `)
        .join("");

      return `
        <tr>
          <td style="padding:14px 0;border-top:1px solid #e5eee8;vertical-align:top;">
            <div style="font-weight:800;color:#132018;">${escapeHtml(item.quantity)} x ${escapeHtml(item.name)}</div>
            ${optionLines}
          </td>
          <td style="padding:14px 0;border-top:1px solid #e5eee8;text-align:right;vertical-align:top;white-space:nowrap;">
            <div style="font-weight:800;color:#132018;">${formatCurrency(Number(item.total_price))}</div>
            <div style="margin-top:4px;color:#66736b;font-size:12px;">${formatCurrency(Number(item.unit_price))}/ud.</div>
          </td>
        </tr>
      `;
    })
    .join("");
}

function buildOrderHtml(order: AdminOrder) {
  const reference = orderReference(order.id);
  const paymentLabel = operationalPaymentLabel(order);
  const paymentMethod = paymentMethodLabel(order.payment_method);
  const notes = order.notes?.trim();

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Pedido Matica #${escapeHtml(reference)}</title>
  </head>
  <body style="margin:0;background:#f4f8f5;color:#132018;font-family:Arial,Helvetica,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;">Confirmación de pedido Matica #${escapeHtml(reference)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f8f5;margin:0;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;background:#ffffff;border:1px solid #dfeae3;border-radius:14px;overflow:hidden;">
            <tr>
              <td style="background:#174d32;color:#ffffff;padding:22px 24px;">
                <div style="font-size:24px;font-weight:900;letter-spacing:.02em;">MATICA FRESH FOOD</div>
                <div style="margin-top:4px;font-size:13px;font-weight:700;text-transform:uppercase;opacity:.9;">Servicio de entrega para empresas</div>
              </td>
            </tr>
            <tr>
              <td style="padding:24px;">
                <h1 style="margin:0 0 8px;font-size:24px;line-height:1.2;color:#132018;">Pedido confirmado #${escapeHtml(reference)}</h1>
                <p style="margin:0;color:#506057;font-size:15px;line-height:1.5;">Hemos recibido tu pedido correctamente.</p>

                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:22px;border-collapse:collapse;">
                  <tr>
                    <td style="padding:10px 0;border-top:1px solid #e5eee8;color:#66736b;font-size:13px;">Fecha y hora</td>
                    <td style="padding:10px 0;border-top:1px solid #e5eee8;text-align:right;font-weight:800;">${escapeHtml(formatOrderDateTime(order.created_at))}</td>
                  </tr>
                  <tr>
                    <td style="padding:10px 0;border-top:1px solid #e5eee8;color:#66736b;font-size:13px;">Cliente principal</td>
                    <td style="padding:10px 0;border-top:1px solid #e5eee8;text-align:right;font-weight:800;">${escapeHtml(companyName(order))}</td>
                  </tr>
                  <tr>
                    <td style="padding:10px 0;border-top:1px solid #e5eee8;color:#66736b;font-size:13px;">Empresa</td>
                    <td style="padding:10px 0;border-top:1px solid #e5eee8;text-align:right;font-weight:800;">${escapeHtml(branchName(order))}</td>
                  </tr>
                  ${companyAddress(order) ? `
                  <tr>
                    <td style="padding:10px 0;border-top:1px solid #e5eee8;color:#66736b;font-size:13px;">Dirección de entrega</td>
                    <td style="padding:10px 0;border-top:1px solid #e5eee8;text-align:right;font-weight:800;">${escapeHtml(companyAddress(order))}</td>
                  </tr>
                  ` : ""}
                  <tr>
                    <td style="padding:10px 0;border-top:1px solid #e5eee8;color:#66736b;font-size:13px;">Cliente</td>
                    <td style="padding:10px 0;border-top:1px solid #e5eee8;text-align:right;font-weight:800;">${escapeHtml(order.customer_name)}</td>
                  </tr>
                  <tr>
                    <td style="padding:10px 0;border-top:1px solid #e5eee8;color:#66736b;font-size:13px;">Teléfono</td>
                    <td style="padding:10px 0;border-top:1px solid #e5eee8;text-align:right;font-weight:800;">${escapeHtml(order.customer_phone)}</td>
                  </tr>
                  <tr>
                    <td style="padding:10px 0;border-top:1px solid #e5eee8;color:#66736b;font-size:13px;">Email</td>
                    <td style="padding:10px 0;border-top:1px solid #e5eee8;text-align:right;font-weight:800;">${escapeHtml(order.customer_email)}</td>
                  </tr>
                  <tr>
                    <td style="padding:10px 0;border-top:1px solid #e5eee8;color:#66736b;font-size:13px;">Método de pago</td>
                    <td style="padding:10px 0;border-top:1px solid #e5eee8;text-align:right;font-weight:800;">${escapeHtml(paymentMethod)} · ${escapeHtml(paymentLabel)}</td>
                  </tr>
                  <tr>
                    <td style="padding:10px 0;border-top:1px solid #e5eee8;color:#66736b;font-size:13px;">Entrega</td>
                    <td style="padding:10px 0;border-top:1px solid #e5eee8;text-align:right;font-weight:800;">${escapeHtml(order.delivery_window)}</td>
                  </tr>
                </table>

                <h2 style="margin:28px 0 10px;font-size:18px;color:#132018;">Detalle del pedido</h2>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
                  ${buildItemHtml(order)}
                </table>

                ${notes ? `
                  <div style="margin-top:22px;padding:14px;border-radius:10px;background:#f4f8f5;border:1px solid #dfeae3;">
                    <div style="font-size:12px;font-weight:900;text-transform:uppercase;color:#174d32;">Observaciones</div>
                    <div style="margin-top:6px;color:#132018;font-size:14px;line-height:1.5;">${escapeHtml(notes).replaceAll("\n", "<br />")}</div>
                  </div>
                ` : ""}

                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:24px;border-collapse:collapse;">
                  <tr>
                    <td style="padding:9px 0;border-top:1px solid #e5eee8;color:#66736b;">Subtotal</td>
                    <td style="padding:9px 0;border-top:1px solid #e5eee8;text-align:right;font-weight:800;">${formatCurrency(Number(order.subtotal))}</td>
                  </tr>
                  <tr>
                    <td style="padding:9px 0;border-top:1px solid #e5eee8;color:#66736b;">Subvención</td>
                    <td style="padding:9px 0;border-top:1px solid #e5eee8;text-align:right;font-weight:800;">-${formatCurrency(Number(order.subsidy_total))}</td>
                  </tr>
                  <tr>
                    <td style="padding:9px 0;border-top:1px solid #e5eee8;color:#66736b;">Factura empresa</td>
                    <td style="padding:9px 0;border-top:1px solid #e5eee8;text-align:right;font-weight:800;">${formatCurrency(orderCompanyInvoiceTotal(order))}</td>
                  </tr>
                  <tr>
                    <td style="padding:12px 0;border-top:2px solid #174d32;font-size:18px;font-weight:900;color:#132018;">Total empleado</td>
                    <td style="padding:12px 0;border-top:2px solid #174d32;text-align:right;font-size:20px;font-weight:900;color:#174d32;">${formatCurrency(orderEmployeeTotal(order))}</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="background:#f4f8f5;padding:18px 24px;color:#506057;font-size:13px;line-height:1.5;">
                Gracias por confiar en Matica. Si necesitas modificar algo, contacta con nosotros cuanto antes en pedidomatica@gmail.com.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

type ResendEmailPayload = {
  html: string;
  idempotencyKey: string;
  subject: string;
  text: string;
  to: string;
};

async function sendResendEmail({
  html,
  idempotencyKey,
  subject,
  text,
  to
}: ResendEmailPayload) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ORDER_NOTIFICATION_FROM;

  if (!apiKey || !from) {
    console.warn("[order-email] Email no enviado: configura RESEND_API_KEY y ORDER_NOTIFICATION_FROM.");
    return { sent: false, reason: "missing_config" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        text,
        html
      })
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.warn(`[order-email] Email no enviado a ${to} (${response.status}): ${body}`);
      return { sent: false, reason: "request_failed" };
    }

    return { sent: true };
  } catch (error) {
    console.warn(`[order-email] Email no enviado a ${to} por error de red.`, error);
    return { sent: false, reason: "network_error" };
  } finally {
    clearTimeout(timeout);
  }
}

export async function sendOrderNotificationEmail(order: AdminOrder) {
  const companyName = order.companies?.name ?? "Cliente principal";
  const internalCompanyName = branchName(order);
  const reference = orderReference(order.id);
  const plainText = buildOrderPlainText(order);
  const html = buildOrderHtml(order);
  const customerEnabled = process.env.CUSTOMER_ORDER_CONFIRMATION_ENABLED === "true";
  const messages: ResendEmailPayload[] = [
    {
      html,
      idempotencyKey: `matica-order-${order.id}-matica`,
      subject: `NUEVO PEDIDO #${reference} - ${order.customer_name} - ${internalCompanyName}`,
      text: plainText,
      to: MATICA_TO
    }
  ];

  if (customerEnabled) {
    messages.push({
      html,
      idempotencyKey: `matica-order-${order.id}-customer`,
      subject: `Confirmación de pedido Matica #${reference}`,
      text: plainText,
      to: order.customer_email
    });
  } else {
    console.warn("[order-email] Confirmación al cliente desactivada: configura CUSTOMER_ORDER_CONFIRMATION_ENABLED=true.");
  }

  const results = await Promise.allSettled(messages.map((message) => sendResendEmail(message)));
  const sent = results.some((result) => result.status === "fulfilled" && result.value.sent);

  for (const result of results) {
    if (result.status === "rejected") {
      console.warn("[order-email] Email no enviado por error inesperado.", result.reason);
    }
  }

  return {
    sent,
    recipients: messages.map((message) => message.to),
    matica_subject: messages[0].subject,
    customer_subject: customerEnabled ? `Confirmación de pedido Matica #${reference}` : null,
    company: companyName
  };
}
