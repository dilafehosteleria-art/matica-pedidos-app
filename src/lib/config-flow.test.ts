import assert from "node:assert/strict";
import test from "node:test";

const configFlowModulePath = "./config-flow.ts";
const { activeConfigFlowGroups, nextConfigFlowStepIndex } = await import(configFlowModulePath);

const dailyMenuGroups = [
  { key: "first_course" },
  { key: "salad_base", dependsOn: { key: "first_course", values: ["Ensalada a tu manera"] } },
  { key: "protein", dependsOn: { key: "first_course", values: ["Ensalada a tu manera"] } },
  { key: "toppings", dependsOn: { key: "first_course", values: ["Ensalada a tu manera"] } },
  { key: "dressing", dependsOn: { key: "first_course", values: ["Ensalada a tu manera"] } },
  { key: "second_course" },
  { key: "side" },
  { key: "drink_or_dessert" },
  { key: "bread_cutlery" }
];

const halfMenuGroups = [
  { key: "plate" },
  { key: "salad_base", dependsOn: { key: "plate", values: ["Ensalada a tu manera"] } },
  { key: "protein", dependsOn: { key: "plate", values: ["Ensalada a tu manera"] } },
  { key: "toppings", dependsOn: { key: "plate", values: ["Ensalada a tu manera"] } },
  { key: "dressing", dependsOn: { key: "plate", values: ["Ensalada a tu manera"] } },
  { key: "side", dependsOn: { key: "plate", values: ["Pollo al horno"] } },
  { key: "drink_or_dessert" },
  { key: "bread_cutlery" }
];

test("Menú del día no salta el configurador al elegir Ensalada a tu manera como primero", () => {
  const selected = { first_course: "Ensalada a tu manera" };

  assert.equal(nextConfigFlowStepIndex(dailyMenuGroups, "first_course", selected), 1);
  assert.deepEqual(
    activeConfigFlowGroups(dailyMenuGroups, selected).map((group: { key: string }) => group.key),
    [
      "first_course",
      "salad_base",
      "protein",
      "toppings",
      "dressing",
      "second_course",
      "side",
      "drink_or_dessert",
      "bread_cutlery"
    ]
  );
});

test("Menú del día mantiene cinco pasos cuando el primero no es ensalada configurable", () => {
  const selected = { first_course: "Gazpacho andaluz" };

  assert.equal(nextConfigFlowStepIndex(dailyMenuGroups, "first_course", selected), 1);
  assert.deepEqual(
    activeConfigFlowGroups(dailyMenuGroups, selected).map((group: { key: string }) => group.key),
    ["first_course", "second_course", "side", "drink_or_dessert", "bread_cutlery"]
  );
});

test("Medio menú no salta el configurador al elegir Ensalada a tu manera como plato", () => {
  const selected = { plate: "Ensalada a tu manera" };

  assert.equal(nextConfigFlowStepIndex(halfMenuGroups, "plate", selected), 1);
  assert.deepEqual(
    activeConfigFlowGroups(halfMenuGroups, selected).map((group: { key: string }) => group.key),
    ["plate", "salad_base", "protein", "toppings", "dressing", "drink_or_dessert", "bread_cutlery"]
  );
});

test("Medio menú mantiene Pan y cubiertos como paso final", () => {
  const selected = { plate: "Pollo al horno" };
  const activeKeys = activeConfigFlowGroups(halfMenuGroups, selected).map((group: { key: string }) => group.key);

  assert.deepEqual(activeKeys, ["plate", "side", "drink_or_dessert", "bread_cutlery"]);
  assert.equal(activeKeys.at(-1), "bread_cutlery");
});
