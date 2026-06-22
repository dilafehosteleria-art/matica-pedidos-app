import type { PaymentMethod, PaymentStatus } from "@/lib/types";

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  pay_on_delivery: "Pago a la entrega",
  stripe_card: "Pago online Stripe",
  stripe_bizum: "Bizum"
};

const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: "Pendiente",
  paid: "Pagado online",
  failed: "Fallido",
  cancelled: "Cancelado"
};

export function paymentMethodLabel(method?: PaymentMethod | null) {
  return method ? PAYMENT_LABELS[method] ?? "Pago" : PAYMENT_LABELS.pay_on_delivery;
}

export function paymentStatusLabel(status?: PaymentStatus | null) {
  return status ? PAYMENT_STATUS_LABELS[status] ?? status : "Pendiente";
}

export function operationalPaymentLabel(order: {
  payment_method?: PaymentMethod | null;
  payment_status?: PaymentStatus | null;
  employee_total?: number | null;
  company_invoice_total?: number | null;
}) {
  if (!order.payment_method || order.payment_method === "pay_on_delivery") {
    if (Number(order.employee_total ?? 0) === 0 && Number(order.company_invoice_total ?? 0) > 0) {
      return "Pendiente de facturación a empresa";
    }

    return "Pago a la entrega";
  }

  if (order.payment_status === "paid") {
    return "Pagado online";
  }

  if (order.payment_status === "failed" || order.payment_status === "cancelled") {
    return "Pago fallido";
  }

  return "Pendiente de pago";
}
