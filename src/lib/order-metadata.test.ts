import assert from "node:assert/strict";
import test from "node:test";

const metadataModulePath = "./order-metadata.ts";
const { buildOrderItemOptionLines, formatOrderMetadataForReport } = await import(metadataModulePath);

function renderedBlocks(metadata: Record<string, string>) {
  return buildOrderItemOptionLines(metadata).map((entry: { label: string; values: string[] }) => ({
    label: entry.label,
    values: entry.values
  }));
}

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

test("admin, ticket y email reciben la ensalada del Medio Menú por bloques y sin listas con comas", () => {
  assert.deepEqual(renderedBlocks(configuredHalfMenuSalad), [
    { label: "Plato", values: ["Ensalada a tu manera"] },
    { label: "Tamaño", values: ["Tamaño Mediano 1000ML"] },
    { label: "Bases", values: ["Arroz integral", "Mézclum"] },
    { label: "Proteína", values: ["Pollo"] },
    { label: "Toppings", values: ["Tomate", "Pepino", "Maíz"] },
    { label: "Salsa", values: ["Vinagreta balsámica"] },
    { label: "Bebida", values: ["Agua mineral"] },
    { label: "Pan", values: ["No"] }
  ]);
});

test("Cubiertos aparece como bloque propio y no se duplica en suplementos", () => {
  const blocks = renderedBlocks({
    display_name: "MenÃº del dÃ­a",
    first_course: "Gazpacho andaluz",
    second_course: "Pollo al horno",
    side: "Ensalada",
    drink_or_dessert: "Agua mineral",
    bread: "No",
    cutlery: "Si (+0,20 €)",
    _configured_unit_price: "13.20",
    _supplement_total: "0.20"
  });

  assert.deepEqual(blocks.at(-2), { label: "Pan", values: ["No"] });
  assert.deepEqual(blocks.at(-1), { label: "Cubiertos", values: ["Si (+0,20 €)"] });
  assert.equal(blocks.some((block: { label: string }) => block.label === "Suplementos"), false);
});

test("Cubiertos no aparece si no se pide", () => {
  const blocks = renderedBlocks({
    display_name: "Medio menÃº",
    plate: "Pollo Matica Krispy",
    drink_or_dessert: "Agua mineral",
    bread: "No"
  });

  assert.equal(blocks.some((block: { label: string }) => block.label === "Cubiertos"), false);
});

test("Menú del día separa segundo, guarnición, bebida y pan", () => {
  assert.deepEqual(
    renderedBlocks({
      display_name: "Menú del día",
      first_course: "Gazpacho andaluz",
      second_course: "Pollo al horno",
      side: "Ensalada",
      drink_or_dessert: "Agua mineral",
      bread: "No"
    }),
    [
      { label: "Primero", values: ["Gazpacho andaluz"] },
      { label: "Segundo", values: ["Pollo al horno"] },
      { label: "Guarnición", values: ["Ensalada"] },
      { label: "Bebida", values: ["Agua mineral"] },
      { label: "Pan", values: ["No"] }
    ]
  );
});

test("Menú del día muestra la ensalada configurada justo debajo del primero", () => {
  assert.deepEqual(
    renderedBlocks({
      display_name: "Menú del día",
      first_course: "Ensalada a tu manera",
      salad_size: "Tamaño Pequeño 750ML",
      salad_base: "Quinoa",
      protein: "Atún",
      toppings: "Huevo, Maíz, Tomate",
      dressing: "Sal y Vinagre",
      second_course: "Pollo al teriyaki",
      side: "Verduritas asadas",
      drink_or_dessert: "Lipton Limón",
      bread: "No"
    }),
    [
      { label: "Primero", values: ["Ensalada a tu manera"] },
      { label: "Tamaño", values: ["Tamaño Pequeño 750ML"] },
      { label: "Bases", values: ["Quinoa"] },
      { label: "Proteína", values: ["Atún"] },
      { label: "Toppings", values: ["Huevo", "Maíz", "Tomate"] },
      { label: "Salsa", values: ["Sal y Vinagre"] },
      { label: "Segundo", values: ["Pollo al teriyaki"] },
      { label: "Guarnición", values: ["Verduritas asadas"] },
      { label: "Bebida", values: ["Lipton Limón"] },
      { label: "Pan", values: ["No"] }
    ]
  );
});

test("Medio menú muestra plato, bebida, acompañamiento y pan como bloques independientes", () => {
  assert.deepEqual(
    renderedBlocks({
      display_name: "Medio menú",
      plate: "Pollo Matica Krispy",
      side: "Ensalada",
      drink_or_dessert: "Agua mineral",
      bread: "Sí"
    }),
    [
      { label: "Plato", values: ["Pollo Matica Krispy"] },
      { label: "Acompañamiento", values: ["Ensalada"] },
      { label: "Bebida", values: ["Agua mineral"] },
      { label: "Pan", values: ["Sí"] }
    ]
  );
});

test("Menú ensalada pequeña + bocadillo separa bases, toppings y bocadillo", () => {
  assert.deepEqual(
    renderedBlocks({
      display_name: "Menú ensalada pequeña + bocadillo",
      salad_size: "Pequeña",
      salad_base: "Arroz integral, Mézclum",
      protein: "Atún",
      toppings: "Pepino, Garbanzos, Huevo",
      dressing: "Mahonesa de soja",
      sandwich: "Bocadillo de pavo"
    }),
    [
      { label: "Tamaño", values: ["Pequeña"] },
      { label: "Bases", values: ["Arroz integral", "Mézclum"] },
      { label: "Proteína", values: ["Atún"] },
      { label: "Toppings", values: ["Pepino", "Garbanzos", "Huevo"] },
      { label: "Salsa", values: ["Mahonesa de soja"] },
      { label: "Bocadillo", values: ["Bocadillo de pavo"] }
    ]
  );
});

test("Bowls signature y wraps signature no compactan guarniciones ni ingredientes", () => {
  assert.deepEqual(
    renderedBlocks({
      display_name: "Bowl signature",
      main_protein: "Salmón a la plancha",
      sides: "Arroz jazmín, Verduras a la plancha",
      sauce: "Yogur"
    }),
    [
      { label: "Proteína principal", values: ["Salmón a la plancha"] },
      { label: "Guarniciones", values: ["Arroz jazmín", "Verduras a la plancha"] },
      { label: "Salsa", values: ["Yogur"] }
    ]
  );

  assert.deepEqual(
    renderedBlocks({
      display_name: "Wrap signature",
      filling: "Tortilla trigo",
      protein: "Pollo",
      toppings: "Tomate, Queso fresco, Zanahoria",
      sauce: "Yogur"
    }),
    [
      { label: "Base", values: ["Tortilla trigo"] },
      { label: "Proteína", values: ["Pollo"] },
      { label: "Toppings", values: ["Tomate", "Queso fresco", "Zanahoria"] },
      { label: "Salsa", values: ["Yogur"] }
    ]
  );
});

test("Ensaladas y wraps configurables usan una línea por selección", () => {
  assert.deepEqual(
    renderedBlocks({
      display_name: "Diseña tu ensalada",
      salad_size: "Mediana (1000 ML)",
      salad_base: "Arroz integral, Mézclum",
      protein: "Atún",
      toppings: "Pepino, Garbanzos, Huevo",
      dressing: "Mahonesa de soja"
    }),
    [
      { label: "Tamaño", values: ["Mediana (1000 ML)"] },
      { label: "Bases", values: ["Arroz integral", "Mézclum"] },
      { label: "Proteína", values: ["Atún"] },
      { label: "Toppings", values: ["Pepino", "Garbanzos", "Huevo"] },
      { label: "Salsa", values: ["Mahonesa de soja"] }
    ]
  );

  assert.deepEqual(
    renderedBlocks({
      display_name: "Diseña tu wrap",
      wrap_base: "Tortilla trigo",
      wrap_protein: "Pollo",
      wrap_toppings: "Tomate, Queso fresco, Zanahoria",
      wrap_sauces: "Yogur"
    }),
    [
      { label: "Base", values: ["Tortilla trigo"] },
      { label: "Proteína", values: ["Pollo"] },
      { label: "Ingredientes", values: ["Tomate", "Queso fresco", "Zanahoria"] },
      { label: "Salsa", values: ["Yogur"] }
    ]
  );
});

test("el informe incluye toda la configuración y oculta campos técnicos", () => {
  const reportValue = formatOrderMetadataForReport(configuredHalfMenuSalad);

  for (const expected of [
    "plate: Ensalada a tu manera",
    "salad_size: Tamaño Mediano 1000ML",
    "salad_base: Arroz integral\nMézclum",
    "protein: Pollo",
    "toppings: Tomate\nPepino\nMaíz",
    "dressing: Vinagreta balsámica"
  ]) {
    assert.ok(reportValue.includes(expected));
  }

  assert.doesNotMatch(reportValue, /display_name|_configured_unit_price|_supplement_total/);
});
