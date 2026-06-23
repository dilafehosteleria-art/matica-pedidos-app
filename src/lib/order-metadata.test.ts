import assert from "node:assert/strict";
import test from "node:test";

const metadataModulePath = "./order-metadata.ts";
const { buildOrderItemOptionLines, formatOrderMetadataForReport } = await import(metadataModulePath);

const configuredHalfMenuSalad = {
  display_name: "Medio menú",
  categoria: "Menús",
  plate: "Ensalada a tu manera",
  salad_size: "Tamaño Mediano 1000ML",
  salad_base: "Arroz integral, Mézclum",
  protein: "Pollo",
  toppings: "Tomate, Pepino, Maíz",
  dressing: "Vinagreta balsámica",
  drink_or_dessert: "Agua mineral",
  bread: "No",
  _configured_unit_price: "10.00",
  _supplement_total: "0.00"
};

test("admin, ticket y email reciben todo el detalle visible de la ensalada del Medio Menú", () => {
  assert.deepEqual(
    buildOrderItemOptionLines(configuredHalfMenuSalad).map(
      (entry: { label: string; value: string }) => `${entry.label}: ${entry.value}`
    ),
    [
      "Plato único: Ensalada a tu manera",
      "Tamaño: Tamaño Mediano 1000ML",
      "Bases: Arroz integral, Mézclum",
      "Toppings: Tomate, Pepino, Maíz",
      "Proteína: Pollo",
      "Aliño: Vinagreta balsámica",
      "Bebida o postre: Agua mineral",
      "Pan: No"
    ]
  );
});

test("el informe incluye toda la configuración y oculta campos técnicos", () => {
  const reportValue = formatOrderMetadataForReport(configuredHalfMenuSalad);

  for (const expected of [
    "plate: Ensalada a tu manera",
    "salad_size: Tamaño Mediano 1000ML",
    "salad_base: Arroz integral, Mézclum",
    "protein: Pollo",
    "toppings: Tomate, Pepino, Maíz",
    "dressing: Vinagreta balsámica"
  ]) {
    assert.ok(reportValue.includes(expected));
  }

  assert.doesNotMatch(reportValue, /display_name|_configured_unit_price|_supplement_total/);
});
