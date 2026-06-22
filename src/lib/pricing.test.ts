import assert from "node:assert/strict";
import test from "node:test";
import type { CartItem, Company } from "./types";

const pricingModulePath = "./pricing.ts";
const { calculateCartTotals } = await import(pricingModulePath);

const menu: CartItem = {
  key: "menu",
  product_id: "menu",
  name: "Menú del día",
  quantity: 1,
  base_price: 13,
  customer_price: 13,
  product_type: "daily_menu"
};

test("Bureau Veritas aplica su subvención configurada", () => {
  const company: Company = {
    id: "bv",
    name: "Bureau Veritas",
    slug: "bureau-veritas",
    active: true,
    billing_type: "subsidized",
    subsidy_rules: [{ product_type: "daily_menu", subsidy_amount: 4, active: true }]
  };

  assert.deepEqual(calculateCartTotals([menu], company), {
    subtotal: 13,
    subsidyTotal: 4,
    total: 9,
    employeeTotal: 9,
    companyInvoiceTotal: 4,
    subsidyApplied: true,
    fullPriceBecauseSubsidyUsed: false
  });
});

test("ICF factura el pedido completo a empresa y deja a cero el empleado", () => {
  const company: Company = {
    id: "icf",
    name: "ICF",
    slug: "icf",
    active: true,
    billing_type: "company",
    subsidy_rules: []
  };

  const totals = calculateCartTotals([menu], company);

  assert.equal(totals.subsidyTotal, 0);
  assert.equal(totals.employeeTotal, 0);
  assert.equal(totals.companyInvoiceTotal, 13);
});

test("una empresa estándar no aplica subvención ni factura a empresa", () => {
  const company: Company = {
    id: "standard",
    name: "Empresa estándar",
    slug: "empresa-estandar",
    active: true,
    billing_type: "employee",
    subsidy_rules: []
  };

  const totals = calculateCartTotals([menu], company);

  assert.equal(totals.subsidyTotal, 0);
  assert.equal(totals.employeeTotal, 13);
  assert.equal(totals.companyInvoiceTotal, 0);
});
