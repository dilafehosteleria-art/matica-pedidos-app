import assert from "node:assert/strict";
import test from "node:test";
const validityModulePath = "./order-validity.ts";
const {
  isBillableOrder,
  isSubsidyConsumingOrder,
  isVisibleAdminOrder
} = await import(validityModulePath);

const failedStripeAttempts = [
  { status: "pendiente_pago", payment_method: "stripe_card", payment_status: "pending" },
  { status: "pendiente_pago", payment_method: "stripe_card", payment_status: "failed" },
  { status: "cancelado", payment_method: "stripe_card", payment_status: "cancelled" },
  { status: "cancelado", payment_method: "stripe_card", payment_status: "failed" }
] as const;

test("un pedido Stripe pendiente, fallido o cancelado no entra en admin, informes ni consume subvencion", () => {
  for (const order of failedStripeAttempts) {
    assert.equal(isVisibleAdminOrder(order), false);
    assert.equal(isBillableOrder(order), false);
    assert.equal(isSubsidyConsumingOrder(order), false);
  }
});

test("el mismo email puede reintentar la subvencion mientras solo existan intentos Stripe no confirmados", () => {
  const subsidyAlreadyUsed = failedStripeAttempts.some(isSubsidyConsumingOrder);

  assert.equal(subsidyAlreadyUsed, false);
});

test("un pedido Stripe pagado y nuevo entra en admin e informes y consume la subvencion", () => {
  const paidOrder = {
    status: "nuevo",
    payment_method: "stripe_card",
    payment_status: "paid"
  } as const;

  assert.equal(isVisibleAdminOrder(paidOrder), true);
  assert.equal(isBillableOrder(paidOrder), true);
  assert.equal(isSubsidyConsumingOrder(paidOrder), true);
});

test("un pedido pagado bloquea una segunda subvencion el mismo dia", () => {
  const orders = [
    ...failedStripeAttempts,
    { status: "nuevo", payment_method: "stripe_card", payment_status: "paid" }
  ] as const;

  assert.equal(orders.some(isSubsidyConsumingOrder), true);
});
