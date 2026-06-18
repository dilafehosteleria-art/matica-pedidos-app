import assert from "node:assert/strict";
import test from "node:test";

const wrapModulePath = "./wrap-config.ts";
const {
  WRAP_BASE_OPTIONS,
  WRAP_PROTEIN_OPTIONS,
  WRAP_SAUCE_OPTIONS,
  WRAP_TOPPING_OPTIONS,
  expectedCustomWrapUnitPrice
} = await import(wrapModulePath);

test("el configurador del wrap contiene exactamente los grupos de Dood", () => {
  assert.deepEqual(WRAP_BASE_OPTIONS.map((option: { label: string }) => option.label), [
    "Arroz blanco",
    "Arroz integral",
    "Mézclum",
    "Espinaca",
    "Quinoa"
  ]);
  assert.deepEqual(WRAP_PROTEIN_OPTIONS.map((option: { label: string }) => option.label), [
    "Atún",
    "Falafel vegetal de garbanzos y quinoa",
    "Lomo asado",
    "Pollo",
    "Salmón ahumado"
  ]);
  assert.equal(WRAP_TOPPING_OPTIONS.length, 12);
  assert.equal(WRAP_SAUCE_OPTIONS.length, 5);
});

test("el salmon ahumado suma dos euros al wrap", () => {
  const price = expectedCustomWrapUnitPrice(7.5, {
    wrap_base: "Arroz blanco, Mézclum",
    wrap_protein: "Salmón ahumado",
    wrap_toppings: "Tomate",
    wrap_sauces: "Salsa de yogur"
  });

  assert.equal(price, 9.5);
});

test("valida limites y permite salsas opcionales", () => {
  assert.equal(expectedCustomWrapUnitPrice(7.5, {
    wrap_base: "Quinoa",
    wrap_protein: "Pollo",
    wrap_toppings: "Tomate, Zanahoria",
    wrap_sauces: ""
  }), 7.5);

  assert.equal(expectedCustomWrapUnitPrice(7.5, {
    wrap_base: "Quinoa",
    wrap_protein: "Pollo",
    wrap_toppings: "",
    wrap_sauces: ""
  }), null);
});
