import assert from "node:assert/strict";
import test from "node:test";

const saladModulePath = "./salad-config.ts";
const {
  MEDIUM_SALAD_SIZE_LABEL,
  SALAD_BASE_OPTIONS,
  SALAD_DRESSING_OPTIONS,
  SALAD_PROTEIN_OPTIONS,
  SALAD_TOPPING_OPTIONS,
  expectedSaladUnitPrice,
  isCustomSaladChoice,
  normalizeMenuSaladChoice
} = await import(saladModulePath);

const validHalfMenuSalad = {
  salad_size: MEDIUM_SALAD_SIZE_LABEL,
  salad_base: "Arroz integral, Mézclum",
  protein: "Pollo",
  toppings: "Tomate, Pepino, Maíz",
  dressing: "Vinagreta balsámica"
};

test("reconoce los nombres configurables usados por el menú", () => {
  assert.equal(isCustomSaladChoice("Ensalada a tu manera"), true);
  assert.equal(isCustomSaladChoice("ENSALDA A TU MANERA"), true);
  assert.equal(isCustomSaladChoice("Diseña tu ensalada"), true);
  assert.equal(isCustomSaladChoice("Ensalada arroz con queso fresco"), false);
});

test("normaliza el texto que rompió el menú del 14/09 y variantes de escritura", () => {
  for (const label of [
    "ENSALDA A TUU MANERA",
    "  Ensalada   a  tu manera  ",
    "ENSALADA\u00a0A TU MANERA (diseña tu ensalada con tus ingredientes favoritos en nuestro buffet)",
    "Ensaladda a tu manerra",
    "Diseña tuu ensalada"
  ]) {
    assert.equal(isCustomSaladChoice(label), true, label);
    assert.equal(normalizeMenuSaladChoice(label), "ENSALADA A TU MANERA (diseña tu ensalada con tus ingredientes favoritos)", label);
  }
  for (const label of ["ENSALADA MIXTA ( ATUN Y HUEVO )", "Ensalada arroz con queso fresco", "ENSALDA MIXTA", "Gazpacho"] ) {
    assert.equal(isCustomSaladChoice(label), false, label);
    assert.equal(normalizeMenuSaladChoice(label), label);
  }
});

test("el Medio Menú reutiliza las opciones y límites de la ensalada del catálogo", () => {
  assert.equal(SALAD_BASE_OPTIONS.length, 6);
  assert.equal(SALAD_PROTEIN_OPTIONS.length, 5);
  assert.equal(SALAD_TOPPING_OPTIONS.length, 12);
  assert.equal(SALAD_DRESSING_OPTIONS.length, 5);
  assert.equal(expectedSaladUnitPrice(10, validHalfMenuSalad, MEDIUM_SALAD_SIZE_LABEL), 10);
});

test("aplica suplementos y exige tamaño mediano, bases, proteína, toppings y salsa válidos", () => {
  assert.equal(
    expectedSaladUnitPrice(
      10,
      { ...validHalfMenuSalad, protein: "Salmón ahumado" },
      MEDIUM_SALAD_SIZE_LABEL
    ),
    12.5
  );

  assert.equal(
    expectedSaladUnitPrice(
      10,
      { ...validHalfMenuSalad, salad_size: "Tamaño Grande 1500ML" },
      MEDIUM_SALAD_SIZE_LABEL
    ),
    null
  );

  assert.equal(
    expectedSaladUnitPrice(
      10,
      { ...validHalfMenuSalad, toppings: "Tomate, Pepino, Maíz, Huevo" },
      MEDIUM_SALAD_SIZE_LABEL
    ),
    null
  );

  assert.equal(
    expectedSaladUnitPrice(
      10,
      { ...validHalfMenuSalad, dressing: "" },
      MEDIUM_SALAD_SIZE_LABEL
    ),
    null
  );
});
