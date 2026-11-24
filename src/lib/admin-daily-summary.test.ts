import assert from "node:assert/strict";
import test from "node:test";
import type { AdminOrder } from "./types.ts";

const modulePath = "./admin-daily-summary.ts";
const { buildDailyOrderSummary } = await import(modulePath) as typeof import("./admin-daily-summary.ts");

type SummaryOrder = Pick<
  AdminOrder,
  "id" | "company_id" | "companies" | "status" | "payment_method" | "payment_status" | "fulfillment_type"
>;

function order(id: string, overrides: Partial<SummaryOrder> = {}): SummaryOrder {
  return {
    id,
    company_id: "acciona",
    companies: { name: "Acciona" },
    status: "nuevo",
    payment_method: "stripe_card",
    payment_status: "paid",
    fulfillment_type: "delivery",
    ...overrides
  };
}

test("cuenta reparto, restaurante, recogida y cancelaciones una sola vez por pedido", () => {
  const summary = buildDailyOrderSummary([
    order("new"),
    order("preparing", { status: "preparando" }),
    order("ready", { status: "listo" }),
    order("delivered", { status: "entregado" }),
    order("dine-in", { fulfillment_type: "dine_in" }),
    order("pickup", { fulfillment_type: "pickup", status: "preparando" }),
    order("local-ready", { fulfillment_type: "dine_in", status: "listo" }),
    order("local-delivered", { fulfillment_type: "pickup", status: "entregado" }),
    order("cancelled-delivery", { status: "cancelado" }),
    order("cancelled-local", { status: "cancelado", fulfillment_type: "dine_in" })
  ], "2026-11-24");

  assert.equal(summary.date, "2026-11-24");
  assert.deepEqual(summary.totals, {
    newOrders: 1, preparing: 1, local: 4, cancelled: 2, ready: 1, delivered: 1, total: 8
  });
  assert.deepEqual(summary.companies, [{
    companyId: "acciona", companyName: "Acciona", ...summary.totals
  }]);
});

test("incluye pagos confirmados y cobro diferido, excluyendo intentos pendientes o fallidos", () => {
  const summary = buildDailyOrderSummary([
    order("stripe-paid"),
    order("sumup-paid", { payment_method: "sumup_card" }),
    order("pay-on-delivery", { payment_method: "pay_on_delivery", payment_status: null }),
    order("company-invoice", { payment_method: "pay_on_delivery", payment_status: "pending" }),
    order("legacy-payment", { payment_method: "pay_on_delivery", payment_status: undefined, fulfillment_type: null }),
    order("pending", { status: "pendiente_pago", payment_status: "pending" }),
    order("paid-but-not-confirmed", { status: "pendiente_pago" }),
    order("failed", { payment_status: "failed" }),
    order("cancelled-payment", { status: "cancelado", payment_status: "cancelled" }),
    order("failed-pay-on-delivery", { payment_method: "pay_on_delivery", payment_status: "failed" }),
    order("cancelled-pay-on-delivery", { payment_method: "pay_on_delivery", payment_status: "cancelled" })
  ], "2026-11-24");

  assert.equal(summary.totals.total, 5);
  assert.equal(summary.totals.newOrders, 5);
  assert.equal(summary.totals.cancelled, 0);
});

test("mantiene el acumulado al preparar, avisar de salida y completar; cancelar lo resta", () => {
  for (const status of ["nuevo", "preparando", "listo", "entregado"] as const) {
    const summary = buildDailyOrderSummary([order("same-order", { status })], "2026-11-24");
    assert.equal(summary.totals.total, 1);
  }
  const cancelled = buildDailyOrderSummary([order("same-order", { status: "cancelado" })], "2026-11-24");
  assert.equal(cancelled.totals.total, 0);
  assert.equal(cancelled.totals.cancelled, 1);
});

test("agrupa por id de empresa y ordena alfabeticamente con nombres repetidos y faltantes", () => {
  const input = [
    order("z", { company_id: "z", companies: { name: "Zeta" } }),
    order("a2", { company_id: "a2", companies: { name: "Álamo" } }),
    order("missing", { company_id: "missing", companies: null }),
    order("a1", { company_id: "a1", companies: { name: "  Álamo  " } }),
    order("a1-again", { company_id: "a1", companies: { name: "Álamo" }, status: "preparando" })
  ];
  const summary = buildDailyOrderSummary(input, "2026-11-24");

  assert.deepEqual(summary.companies.map((company) => [company.companyId, company.companyName, company.total]), [
    ["a1", "Álamo", 2], ["a2", "Álamo", 1], ["missing", "Empresa sin nombre", 1], ["z", "Zeta", 1]
  ]);
  assert.deepEqual(input.map((item) => item.id), ["z", "a2", "missing", "a1", "a1-again"]);
  assert.equal(summary.companies.reduce((sum, company) => sum + company.total, 0), summary.totals.total);
});

test("evita duplicados y utiliza la ultima version de un mismo pedido", () => {
  const summary = buildDailyOrderSummary([
    order("same-id"), order("same-id", { status: "cancelado" }), order("other"), order("other")
  ], "2026-11-24");

  assert.equal(summary.totals.total, 1);
  assert.equal(summary.totals.cancelled, 1);
  assert.equal(summary.totals.newOrders, 1);
});

test("un dia sin pedidos devuelve ceros y ninguna empresa", () => {
  assert.deepEqual(buildDailyOrderSummary([], "2026-11-24"), {
    date: "2026-11-24",
    totals: { newOrders: 0, preparing: 0, local: 0, cancelled: 0, ready: 0, delivered: 0, total: 0 },
    companies: []
  });
});
