import assert from "node:assert/strict";
import test from "node:test";
import { PRODUCTS } from "./constants.ts";
import { priceOrderItem, type OrderPricingProduct } from "./order-pricing.ts";

function product(name: string, basePrice?: number): OrderPricingProduct {
  const configured = PRODUCTS.find((candidate) => candidate.name === name);

  assert.ok(configured, `Falta el producto de prueba ${name}`);

  return {
    id: configured.id,
    base_price: basePrice ?? configured.base_price,
    product_type: configured.product_type
  };
}

test("un producto caro no puede usar el perfil ni el precio de Cubiertos", () => {
  const result = priceOrderItem(product("Caesar Crunch Chicken Bowl"), {
    display_name: "Cubiertos",
    _configured_unit_price: "0.20"
  });

  assert.equal(result.valid, false);
  assert.equal(result.unitPrice, null);
});

test("calcula el precio en servidor aunque falte el precio interno del navegador", () => {
  const result = priceOrderItem(product("Caesar Crunch Chicken Bowl"), {
    display_name: "Caesar Crunch Chicken Bowl",
    _supplement_total: "20"
  });

  assert.equal(result.valid, true);
  assert.equal(result.unitPrice, 9.9);
  assert.equal(result.displayName, "Caesar Crunch Chicken Bowl");
});

test("la bebida agrupada acepta Coca Cola y usa su precio validado", () => {
  const result = priceOrderItem(product("Agua mineral"), {
    display_name: "Escoge tu bebida",
    drink: "Coca Cola",
    _configured_unit_price: "2.00",
    _supplement_total: "0"
  });

  assert.equal(result.valid, true);
  assert.equal(result.unitPrice, 2);
});

test("un postre no puede adoptar el perfil de bebidas", () => {
  const result = priceOrderItem(product("Yogur de frutas"), {
    display_name: "Escoge tu bebida",
    drink: "Agua mineral",
    _configured_unit_price: "1.50"
  });

  assert.equal(result.valid, false);
});

test("valida suplementos de ensalada y wrap sin confiar en supplement_total", () => {
  const salad = priceOrderItem(product("Diseña tu ensalada"), {
    display_name: "Diseña tu ensalada",
    salad_size: "Tamaño Mediano 1000ML",
    salad_base: "Arroz integral, Mézclum",
    protein: "Pollo",
    toppings: "Tomate, Pepino, Maíz",
    dressing: "Vinagreta balsámica",
    _configured_unit_price: "7.50",
    _supplement_total: "-1"
  });
  const wrap = priceOrderItem(product("Diseña tu wrap"), {
    display_name: "Diseña tu wrap",
    wrap_base: "Quinoa",
    wrap_protein: "Salmón ahumado",
    wrap_toppings: "Tomate, Pepino",
    wrap_sauces: "Salsa de yogur",
    _configured_unit_price: "9.50",
    _supplement_total: "20"
  });

  assert.equal(salad.valid, true);
  assert.equal(salad.unitPrice, 7.5);
  assert.equal(wrap.valid, true);
  assert.equal(wrap.unitPrice, 9.5);
});

test("rechaza configuraciones incompatibles que podrían aparecer en cocina sin pagarse", () => {
  const fakeDailySalad = priceOrderItem(product("Menú del día", 13.5), {
    display_name: "Menú del día",
    first_course: "Crema de verduras",
    salad_size: "Tamaño Pequeño 750ML",
    salad_base: "Quinoa",
    protein: "Salmón ahumado",
    toppings: "Tomate, Pepino, Maíz",
    dressing: "Vinagreta balsámica"
  });
  const fakeFixedWrap = priceOrderItem(product("Caesar Crunch Chicken Bowl"), {
    display_name: "Caesar Crunch Chicken Bowl",
    wrap_base: "Quinoa",
    wrap_protein: "Salmón ahumado",
    wrap_toppings: "Tomate",
    wrap_sauces: "Salsa de yogur"
  });
  const inventedExtra = priceOrderItem(product("Caesar Crunch Chicken Bowl"), {
    display_name: "Caesar Crunch Chicken Bowl",
    premium_extra: "Salmón extra"
  });

  assert.equal(fakeDailySalad.valid, false);
  assert.equal(fakeFixedWrap.valid, false);
  assert.equal(inventedExtra.valid, false);
});

test("acepta bocadillos legítimos y rechaza opciones inventadas", () => {
  const valid = priceOrderItem(product("Escoge tu bocadillo"), {
    display_name: "Escoge tu bocadillo",
    sandwich: "Bocadillo de tortilla",
    _configured_unit_price: "6.00"
  });
  const invalid = priceOrderItem(product("Escoge tu bocadillo"), {
    display_name: "Escoge tu bocadillo",
    sandwich: "Bocadillo premium con salmón",
    _configured_unit_price: "6.00"
  });

  assert.equal(valid.valid, true);
  assert.equal(valid.unitPrice, 6);
  assert.equal(invalid.valid, false);
});

test("el menú diario usa el precio vigente de base de datos y conserva la ensalada configurable", () => {
  const dailyProduct = product("Menú del día", 13.5);
  const normal = priceOrderItem(dailyProduct, {
    display_name: "Menú del día",
    first_course: "Crema de verduras"
  });
  const salad = priceOrderItem(dailyProduct, {
    display_name: "Menú del día",
    first_course: "Ensalada a tu manera",
    salad_size: "Tamaño Pequeño 750ML",
    salad_base: "Quinoa",
    protein: "Salmón ahumado",
    toppings: "Tomate, Pepino, Maíz",
    dressing: "Vinagreta balsámica",
    cutlery: "Si (+0,20 €)",
    _configured_unit_price: "16.20"
  });

  assert.equal(normal.valid, true);
  assert.equal(normal.unitPrice, 13.5);
  assert.equal(salad.valid, true);
  assert.equal(salad.unitPrice, 16.2);
});

test("rechaza productos que no pertenecen al catálogo autorizado", () => {
  const result = priceOrderItem(
    {
      id: "00000000-0000-4000-8000-000000000999",
      base_price: 0.2,
      product_type: "standard"
    },
    {
      display_name: "Producto desconocido",
      _configured_unit_price: "0.20"
    }
  );

  assert.equal(result.valid, false);
});
