import assert from "node:assert/strict";
import test from "node:test";
import type { AdminOrder } from "./types.ts";

const modulePath = "./admin-order-board.ts";
const { partitionDailyOrders } = await import(modulePath);

function order(id: string, overrides: Partial<AdminOrder> = {}): AdminOrder {
  return {
    id,
    created_at: "2026-11-21T10:00:00.000Z",
    status_updated_at: null,
    customer_id: null,
    company_id: "bureau-veritas",
    company_branch_id: null,
    customer_name: `Cliente ${id}`,
    customer_email: `${id}@example.com`,
    customer_phone: "600000000",
    status: "nuevo",
    subtotal: 10,
    subsidy_total: 4,
    employee_total: 6,
    company_invoice_total: 4,
    total: 6,
    notes: null,
    delivery_window: "13:00 a 13:30",
    order_items: [],
    ...overrides
  };
}

test("separa comer y recoger de la operativa de delivery", () => {
  const delivery = order("delivery", { fulfillment_type: "delivery" });
  const legacyDelivery = order("legacy-delivery");
  const dineIn = order("dine-in", { fulfillment_type: "dine_in", requested_time: "14:00" });
  const pickup = order("pickup", { fulfillment_type: "pickup", requested_time: "13:45" });

  const result = partitionDailyOrders([delivery, dineIn, pickup, legacyDelivery]);

  assert.deepEqual(result.deliveryOrders.map((item: AdminOrder) => item.id), ["delivery", "legacy-delivery"]);
  assert.deepEqual(result.localOrders.map((item: AdminOrder) => item.id), ["pickup", "dine-in"]);
});

test("ordena los pedidos locales por hora prevista y deja al final los que no tienen hora", () => {
  const result = partitionDailyOrders([
    order("without-time", { fulfillment_type: "dine_in", created_at: "2026-11-21T09:00:00.000Z" }),
    order("later", { fulfillment_type: "dine_in", requested_time: "15:00" }),
    order("earlier", { fulfillment_type: "dine_in", requested_time: "13:30" })
  ]);

  assert.deepEqual(result.localOrders.map((item: AdminOrder) => item.id), ["earlier", "later", "without-time"]);
});
