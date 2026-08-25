import assert from "node:assert/strict";
import test from "node:test";

import {
  BUREAU_VERITAS_INVERSIONES,
  buildInvoiceRecipientGroups,
  type InvoiceCandidate
} from "./invoice-consolidation.ts";

const bureauVeritasLines: InvoiceCandidate[] = [
  {
    amount: 136.5,
    branch: { id: "iberia", name: "BUREAU VERITAS IBERIA" },
    companyName: "Bureau Veritas",
    quantity: 39,
    type: "1/2 MENU"
  },
  {
    amount: 28,
    branch: { id: "iberia", name: "BUREAU VERITAS IBERIA" },
    companyName: "Bureau Veritas",
    quantity: 7,
    type: "MENU DEL DIA"
  },
  {
    amount: 17.5,
    branch: { id: "inspection", name: "BUREAU VERITAS INSP Y TEST." },
    companyName: "Bureau Veritas",
    quantity: 5,
    type: "1/2 MENU"
  },
  {
    amount: 12,
    branch: { id: "inspection", name: "BUREAU VERITAS INSP Y TEST." },
    companyName: "Bureau Veritas",
    quantity: 3,
    type: "MENU DEL DIA"
  },
  {
    amount: 21,
    branch: { id: "investments", name: "BUREAU VERITAS INVERSIONES" },
    companyName: "Bureau Veritas",
    quantity: 6,
    type: "1/2 MENU"
  },
  {
    amount: 24,
    branch: { id: "investments", name: "BUREAU VERITAS INVERSIONES" },
    companyName: "Bureau Veritas",
    quantity: 6,
    type: "MENU DEL DIA"
  },
  {
    amount: 3.5,
    branch: { id: "solutions", name: "BUREAU VERITAS SOLUTIONS" },
    companyName: "Bureau Veritas",
    quantity: 1,
    type: "1/2 MENU"
  },
  {
    amount: 16,
    branch: { id: "solutions", name: "BUREAU VERITAS SOLUTIONS" },
    companyName: "Bureau Veritas",
    quantity: 4,
    type: "MENU DEL DIA"
  }
];

test("consolida todas las sociedades internas de Bureau Veritas en una sola factura", () => {
  const result = buildInvoiceRecipientGroups(bureauVeritasLines);

  assert.equal(result.length, 1);
  assert.equal(result[0].branch.id, "investments");
  assert.equal(result[0].branch.fiscal_name, BUREAU_VERITAS_INVERSIONES.fiscal_name);
  assert.equal(result[0].branch.tax_id, BUREAU_VERITAS_INVERSIONES.tax_id);
  assert.deepEqual(result[0].groups.get("1/2 MENU"), { amount: 178.5, quantity: 51, type: "1/2 MENU" });
  assert.deepEqual(result[0].groups.get("MENU DEL DIA"), { amount: 80, quantity: 20, type: "MENU DEL DIA" });
});

test("usa siempre los datos fiscales aprobados de Bureau Veritas Inversiones", () => {
  const result = buildInvoiceRecipientGroups(bureauVeritasLines, [{
    id: "real-investments-id",
    name: "Bureau Veritas Inversiones",
    fiscal_name: "Dato antiguo",
    tax_id: "Dato antiguo"
  }]);

  assert.equal(result[0].branch.id, "real-investments-id");
  assert.equal(result[0].branch.fiscal_name, "BUREAU VERITAS INVERSIONES, S.L.");
  assert.equal(result[0].branch.tax_id, "B63091557");
  assert.equal(result[0].branch.fiscal_city, "San Cugat del Valle");
});

test("no consolida clientes ajenos a Bureau Veritas", () => {
  const result = buildInvoiceRecipientGroups([
    ...bureauVeritasLines.slice(0, 1),
    {
      amount: 40,
      branch: { id: "other", name: "OTRO CLIENTE" },
      companyName: "Otro cliente",
      quantity: 10,
      type: "MENU DEL DIA"
    }
  ]);

  assert.equal(result.length, 2);
  assert.equal(result.find((entry) => entry.branch.id === "other")?.groups.get("MENU DEL DIA")?.amount, 40);
});
