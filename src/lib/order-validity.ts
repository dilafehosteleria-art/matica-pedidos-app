import type { OrderStatus, PaymentMethod, PaymentStatus } from "@/lib/types";

type OrderValidityInput = {
  status: OrderStatus | string;
  payment_method?: PaymentMethod | string | null;
  payment_status?: PaymentStatus | string | null;
};

const OPERATIONAL_STATUSES = new Set<OrderStatus>(["nuevo", "preparando", "listo", "entregado"]);

export function isOperationalOrderStatus(status: OrderValidityInput["status"]) {
  return OPERATIONAL_STATUSES.has(status as OrderStatus);
}

export function isConfirmedPayment(order: OrderValidityInput) {
  if (order.payment_status === "paid") {
    return true;
  }

  return order.payment_method === "pay_on_delivery" && !["failed", "cancelled"].includes(order.payment_status ?? "");
}

export function isOperationalConfirmedOrder(order: OrderValidityInput) {
  return isOperationalOrderStatus(order.status) && isConfirmedPayment(order);
}

export function isSubsidyConsumingOrder(order: OrderValidityInput) {
  return isOperationalConfirmedOrder(order);
}

export function isVisibleAdminOrder(order: OrderValidityInput) {
  if (order.status === "pendiente_pago") {
    return false;
  }

  return isConfirmedPayment(order);
}

export function isBillableOrder(order: OrderValidityInput) {
  return isOperationalConfirmedOrder(order);
}
