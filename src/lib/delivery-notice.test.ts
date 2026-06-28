import assert from "node:assert/strict";
import test from "node:test";
import type { AdminOrder } from "@/lib/types";

const deliveryNoticeModulePath = "./delivery-notice.ts";
const adminPinModulePath = "./admin-pin.ts";
const {
  parseDeliveryNoticeScope,
  summarizeDeliveryNoticeCandidates
} = await import(deliveryNoticeModulePath);
const { isAdminPinValid } = await import(adminPinModulePath);

function baseOrder(overrides: Partial<AdminOrder> = {}): AdminOrder {
  return {
    id: "12345678-1234-4000-8000-123456789abc",
    created_at: "2026-06-29T10:00:00.000Z",
    status_updated_at: null,
    customer_id: null,
    company_id: "company-a",
    company_branch_id: "branch-a",
    customer_name: "Cliente Test",
    customer_email: "cliente@example.com",
    customer_phone: "600000000",
    delivery_notice_sent_at: null,
    status: "preparando",
    payment_method: "pay_on_delivery",
    payment_status: "pending",
    subtotal: 10,
    subsidy_total: 0,
    employee_total: 10,
    company_invoice_total: 0,
    total: 10,
    notes: null,
    delivery_window: "13:00 - 14:00",
    order_items: [],
    ...overrides
  };
}

test("filtra avisos de salida solo para pedidos de hoy en preparacion, confirmados, con email y sin aviso previo", () => {
  const orders: AdminOrder[] = [
    baseOrder({ id: "eligible-order" }),
    baseOrder({ id: "new-order", status: "nuevo" }),
    baseOrder({ id: "ready-order", status: "listo" }),
    baseOrder({ id: "delivered-order", status: "entregado" }),
    baseOrder({ id: "cancelled-order", status: "cancelado" }),
    baseOrder({ id: "pending-payment-order", status: "pendiente_pago" }),
    baseOrder({ id: "already-notified", delivery_notice_sent_at: "2026-06-29T10:30:00.000Z" }),
    baseOrder({ id: "without-email", customer_email: "" }),
    baseOrder({
      id: "incomplete-payment",
      payment_method: "stripe_card",
      payment_status: "pending"
    }),
    baseOrder({ id: "old-order", created_at: "2026-06-28T10:00:00.000Z" })
  ];

  const { eligibleOrders, summary } = summarizeDeliveryNoticeCandidates(orders, "2026-06-29");

  assert.deepEqual(eligibleOrders.map((order: AdminOrder) => order.id), ["eligible-order"]);
  assert.equal(summary.eligible, 1);
  assert.equal(summary.omitted_not_preparing, 5);
  assert.equal(summary.omitted_already_notified, 1);
  assert.equal(summary.omitted_no_email, 1);
  assert.equal(summary.omitted_invalid_payment, 1);
  assert.equal(summary.omitted_not_today, 1);
});

test("parsea scope all y company para simular el payload del endpoint", () => {
  assert.deepEqual(parseDeliveryNoticeScope({ scope: "all" }), { scope: "all" });
  assert.deepEqual(parseDeliveryNoticeScope({ scope: "company", company_id: " company-a " }), {
    scope: "company",
    company_id: "company-a"
  });
  assert.equal(parseDeliveryNoticeScope({ scope: "company" }), null);
  assert.equal(parseDeliveryNoticeScope({ scope: "other" }), null);
});

test("la proteccion admin exige x-admin-pin correcto", () => {
  assert.equal(isAdminPinValid("1234", "1234"), true);
  assert.equal(isAdminPinValid("9999", "1234"), false);
  assert.equal(isAdminPinValid("1234", undefined), false);
});
