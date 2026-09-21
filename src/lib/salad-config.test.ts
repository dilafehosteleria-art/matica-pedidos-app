import assert from "node:assert/strict";
import test from "node:test";

const saladModulePath = "./salad-config.ts";
const {
  MEDIUM_SALAD_SIZE_LABEL,
  LARGE_SALAD_SIZE_LABEL,
  SMALL_SALAD_SIZE_LABEL,
  SALAD_BASE_OPTIONS,
  SALAD_DRESSING_OPTIONS,
  SALAD_PROTEIN_OPTIONS,
  SALAD_TOPPING_OPTIONS,
  expectedSaladUnitPrice,
  isValidSaladBaseSelection,
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
  assert.equal(SALAD_BASE_OPTIONS.length, 8);
  assert.equal(SALAD_PROTEIN_OPTIONS.length, 5);
  assert.equal(SALAD_TOPPING_OPTIONS.length, 12);
  assert.equal(SALAD_DRESSING_OPTIONS.length, 5);
  assert.equal(expectedSaladUnitPrice(10, validHalfMenuSalad, MEDIUM_SALAD_SIZE_LABEL), 10);
});

const singleBases = ["Mezclum de lechugas", "Espinaca", "Pasta"];
const mixedBases = ["Quinoa", "Arroz blanco", "Arroz integral", "Garbanzos", "Lentejas"];
const allBases = [...singleBases, ...mixedBases];

for (const size of [SMALL_SALAD_SIZE_LABEL, MEDIUM_SALAD_SIZE_LABEL, LARGE_SALAD_SIZE_LABEL]) {
  test(`${size}: aplica la regla a cada base y admite cualquier pareja distinta`, () => {
    for (const base of allBases) {
      const allowedAlone = size === SMALL_SALAD_SIZE_LABEL || singleBases.includes(base);
      const metadata = { ...validHalfMenuSalad, salad_size: size, salad_base: base };
      const expectedPrice = size === LARGE_SALAD_SIZE_LABEL ? 12 : 10;
      const requiredSize = size === SMALL_SALAD_SIZE_LABEL ? size : undefined;
      assert.equal(isValidSaladBaseSelection([base], size), allowedAlone, base);
      assert.equal(expectedSaladUnitPrice(10, metadata, requiredSize), allowedAlone ? expectedPrice : null, base);
      for (const second of allBases) {
        const bases = [base, second];
        assert.equal(isValidSaladBaseSelection(bases, size), base !== second, bases.join(", "));
        assert.equal(expectedSaladUnitPrice(10, { ...metadata, salad_base: bases.join(", ") }, requiredSize), base !== second ? expectedPrice : null);
      }
    }
  });
}

test("rechaza bases vacías, desconocidas o más de dos y no permite falsear el tamaño pequeño", () => {
  for (const size of [SMALL_SALAD_SIZE_LABEL, MEDIUM_SALAD_SIZE_LABEL, LARGE_SALAD_SIZE_LABEL]) {
    for (const bases of [[], ["Base inventada"], ["Quinoa", "Base inventada"], ["Mézclum", "Pasta", "Lentejas"], ["Mézclum", "Mezclum de lechugas"], ["Mezclum", "Mezclum de lechugas"]]) {
      assert.equal(isValidSaladBaseSelection(bases, size), false);
    }
  }
  assert.equal(isValidSaladBaseSelection(["Mézclum"], undefined), false);
  assert.equal(isValidSaladBaseSelection(["Quinoa"], "750"), false);
  const small = { ...validHalfMenuSalad, salad_size: SMALL_SALAD_SIZE_LABEL, salad_base: "Quinoa" };
  assert.equal(expectedSaladUnitPrice(10, small, MEDIUM_SALAD_SIZE_LABEL), null);
  assert.equal(expectedSaladUnitPrice(10, small), null);
});

test("garbanzos sigue disponible como topping aunque se elija también como base", () => {
  assert.ok(SALAD_TOPPING_OPTIONS.some((option: { label: string }) => option.label === "Garbanzos"));
  assert.equal(expectedSaladUnitPrice(10, {
    ...validHalfMenuSalad, salad_base: "Garbanzos, Lentejas", toppings: "Garbanzos, Tomate, Pepino"
  }), 10);
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
