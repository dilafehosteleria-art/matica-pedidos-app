import assert from "node:assert/strict";
import test from "node:test";
import type { AdminOrder } from "@/lib/types";

const ticketModulePath = "./order-ticket.ts";
const { buildOrderPlainText, buildThermalOrderPlainText, formatCompanyDisplayName, thermalTicketText } =
  await import(ticketModulePath);

function baseOrder(overrides: Partial<AdminOrder> = {}): AdminOrder {
  return {
    id: "12345678-1234-4000-8000-123456789abc",
    created_at: "2026-06-25T10:30:00.000Z",
    status_updated_at: null,
    customer_id: null,
    company_id: "company-id",
    company_branch_id: "branch-id",
    customer_name: "Cliente Test",
    customer_email: "cliente@example.com",
    customer_phone: "600000000",
    status: "nuevo",
    payment_method: "pay_on_delivery",
    payment_status: "paid",
    subtotal: 7.5,
    subsidy_total: 1,
    employee_total: 6.5,
    company_invoice_total: 1,
    total: 6.5,
    notes: null,
    delivery_window: "13:00 - 14:00",
    companies: { name: "Bureau Veritas", delivery_address: "Calle Test 1" },
    company_branches: { name: "BUREAU VERITAS IBERIA" },
    order_items: [
      {
        id: "item-id",
        order_id: "12345678-1234-4000-8000-123456789abc",
        product_id: "product-id",
        name: "Diseña tu wrap",
        quantity: 1,
        unit_price: 7.5,
        base_price: 7.5,
        subsidy_amount: 1,
        total_price: 7.5,
        metadata: {
          wrap_base: "Tortilla trigo",
          wrap_protein: "Pollo",
          wrap_toppings: "Tomate, Queso fresco, Zanahoria",
          wrap_sauces: "Yogur"
        }
      }
    ],
    ...overrides
  };
}

test("formatea nombres de empresa largos sin forzar mayúsculas compactas", () => {
  assert.equal(formatCompanyDisplayName("BUREAU VERITAS IBERIA"), "Bureau Veritas Iberia");
  assert.equal(formatCompanyDisplayName("ICF"), "ICF");
});

test("el texto plano de email usa bloques de ticket y una línea por selección", () => {
  const plainText = buildOrderPlainText(baseOrder());

  assert.match(plainText, /EMPRESA\nBureau Veritas Iberia/);
  assert.match(plainText, /BASE\n> Tortilla trigo/);
  assert.match(plainText, /PROTEÍNA\n> Pollo/);
  assert.match(plainText, /INGREDIENTES\n> Tomate\n> Queso fresco\n> Zanahoria/);
  assert.doesNotMatch(plainText, /> Ingredientes: Tomate, Queso fresco, Zanahoria/);
  assert.doesNotMatch(plainText, /Guarnición:/);
});

test("el ticket termico usa EUR y texto compatible con impresoras termicas", () => {
  const ticket = buildThermalOrderPlainText(baseOrder());

  assert.match(ticket, /7,50 EUR/);
  assert.match(ticket, /EMPRESA\n> Bureau Veritas Iberia/);
  assert.match(ticket, /DIRECCION\n> Calle Test 1/);
  assert.doesNotMatch(ticket, /\u20ac/);
  assert.doesNotMatch(ticket, /[^\x20-\x7E\r\n]/);
  assert.equal(thermalTicketText("Menú del día · 10,00 €"), "Menu del dia  10,00 EUR");
});

test("el ticket termico imprime pago online para Stripe pagado", () => {
  const ticket = buildThermalOrderPlainText(
    baseOrder({
      payment_method: "stripe_card",
      payment_status: "paid"
    })
  );

  assert.match(ticket, /PAGO ONLINE/);
  assert.doesNotMatch(ticket, /PAGADO ONLINE/);
});

test("el ticket termico conserva pago a la entrega cuando aplica", () => {
  const ticket = buildThermalOrderPlainText(
    baseOrder({
      payment_method: "pay_on_delivery",
      payment_status: "paid"
    })
  );

  assert.match(ticket, /PAGO A LA ENTREGA/);
});

test("el ticket termico mantiene guarnicion debajo del segundo plato", () => {
  const ticket = buildThermalOrderPlainText(
    baseOrder({
      order_items: [
        {
          id: "daily-menu-item",
          order_id: "12345678-1234-4000-8000-123456789abc",
          product_id: "daily-menu",
          name: "Menú del día",
          quantity: 1,
          unit_price: 13,
          base_price: 13,
          subsidy_amount: 4,
          total_price: 13,
          metadata: {
            display_name: "Menú del día",
            first_course: "Crema de verduras",
            second_course: "Pollo al horno",
            side: "Patatas panaderas",
            drink_or_dessert: "Agua mineral",
            bread: "Sí"
          }
        }
      ],
      subtotal: 13,
      subsidy_total: 4,
      employee_total: 9,
      company_invoice_total: 4,
      total: 9
    })
  );

  assert.ok(ticket.indexOf("SEGUNDO\n> Pollo al horno") < ticket.indexOf("GUARNICION\n> Patatas panaderas"));
  assert.ok(ticket.indexOf("GUARNICION\n> Patatas panaderas") < ticket.indexOf("BEBIDA\n> Agua mineral"));
});

test("el ticket termico de medio menu muestra ensalada 1000 ml por bloques", () => {
  const ticket = buildThermalOrderPlainText(
    baseOrder({
      order_items: [
        {
          id: "half-menu-item",
          order_id: "12345678-1234-4000-8000-123456789abc",
          product_id: "half-menu",
          name: "Medio menú",
          quantity: 1,
          unit_price: 10,
          base_price: 10,
          subsidy_amount: 3.5,
          total_price: 10,
          metadata: {
            display_name: "Medio menú",
            plate: "Ensalada a tu manera",
            salad_size: "Tamaño Mediano 1000ML",
            salad_base: "Arroz integral, Mézclum",
            protein: "Pollo",
            toppings: "Tomate, Pepino, Maíz",
            dressing: "Vinagreta balsámica",
            drink_or_dessert: "Agua mineral",
            bread: "No"
          }
        }
      ],
      subtotal: 10,
      subsidy_total: 3.5,
      employee_total: 6.5,
      company_invoice_total: 3.5,
      total: 6.5
    })
  );

  assert.match(ticket, /TAMANO\n> Tamano Mediano 1000ML/);
  assert.match(ticket, /BASES\n> Arroz integral\n> Mezclum/);
  assert.match(ticket, /TOPPINGS\n> Tomate\n> Pepino\n> Maiz/);
});

test("el ticket termico ICF muestra precio real y pago a cargo de empresa", () => {
  const ticket = buildThermalOrderPlainText(
    baseOrder({
      companies: { name: "ICF", delivery_address: "Calle ICF 1" },
      company_branches: { name: "ICF" },
      payment_method: "pay_on_delivery",
      payment_status: "paid",
      subtotal: 13,
      subsidy_total: 0,
      employee_total: 0,
      company_invoice_total: 13,
      total: 0,
      order_items: [
        {
          id: "icf-item",
          order_id: "12345678-1234-4000-8000-123456789abc",
          product_id: "daily-menu",
          name: "Menú del día",
          quantity: 1,
          unit_price: 13,
          base_price: 13,
          subsidy_amount: 0,
          total_price: 13,
          metadata: {
            display_name: "Menú del día",
            first_course: "Crema de verduras",
            second_course: "Pollo al horno",
            side: "Patatas panaderas",
            drink_or_dessert: "Agua mineral",
            bread: "Sí"
          }
        }
      ]
    })
  );

  assert.match(ticket, /1x Menu del dia - 13,00 EUR/);
  assert.match(ticket, /Factura empresa: 13,00 EUR/);
  assert.match(ticket, /Total empleado: 0,00 EUR/);
  assert.match(ticket, /PAGO A CARGO DE EMPRESA/);
});
