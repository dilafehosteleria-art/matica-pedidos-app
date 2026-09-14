import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import type { DailyMenu, Product } from "./types";
import type { ConfigFlowGroup } from "./config-flow";

const require = createRequire(import.meta.url);
const { NextRequest } = require("next/server") as typeof import("next/server");
const { createElement } = require("react") as typeof import("react");
const { renderToStaticMarkup } = require("react-dom/server") as typeof import("react-dom/server");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

// Exercise the real TSX config factory and real routes, without a database,
// credentials, browser, or network. Expose private helpers only in this test loader.
function loadModule(entry: string, mocks: Record<string, unknown> = {}, expose = "") {
  const cache = new Map<string, { exports: Record<string, any> }>();
  const entryPath = resolve(root, entry);
  function load(filename: string): Record<string, any> {
    const cached = cache.get(filename);
    if (cached) return cached.exports;
    const module = { exports: {} };
    cache.set(filename, module);
    const source = readFileSync(filename, "utf8") + (filename === entryPath ? expose : "");
    const compiled = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true }
    });
    const localRequire = (specifier: string): unknown => {
      if (specifier in mocks) return mocks[specifier];
      if (specifier.startsWith("@/") || specifier.startsWith(".")) {
        const path = specifier.startsWith("@/") ? resolve(root, "src", specifier.slice(2)) : resolve(dirname(filename), specifier);
        return load(/\.tsx?$/.test(path) ? path : existsSync(`${path}.ts`) ? `${path}.ts` : `${path}.tsx`);
      }
      return require(specifier);
    };
    new Function("require", "module", "exports", compiled.outputText)(localRequire, module, module.exports);
    return module.exports;
  }
  return load(entryPath);
}

const menu: DailyMenu = {
  id: "local-menu", date: "2026-09-14", active: true,
  first_courses: ["ENSALDA A TUU MANERA", "TALLARINES A LA BOLOÑESA", "GAZPACHO ANDALUZ", "ARROZ A LA CUBANA"],
  second_courses: ["Pollo a la brasa", "Secreto", "Rape"], drinks: [], desserts: []
};
const { getConfigSpec } = loadModule("src/components/public/BureauVeritasOrderApp.tsx", {}, "\nexport { getConfigSpec };\n");
const flowPath = "./config-flow.ts";
const { activeConfigFlowGroups, nextConfigFlowStepIndex } = await import(flowPath);
type Group = ConfigFlowGroup & { options: { label: string }[] };
const section = { kind: "menus", title: "Menús" };
const expectedSaladLabel = "ENSALADA A TU MANERA (diseña tu ensalada con tus ingredientes favoritos)";

for (const productType of ["daily_menu", "half_menu"] as const) {
  test(`${productType}: la configuración real abre los cuatro pasos con el menú del 14/09`, () => {
    const product = { product_type: productType, base_price: productType === "daily_menu" ? 13.5 : 10 } as Product;
    const spec = getConfigSpec(product, section, menu) as { groups: Group[] };
    const key = productType === "daily_menu" ? "first_course" : "plate";
    const course = spec.groups.find((group) => group.key === key)!;
    assert.equal(course.options[0].label, expectedSaladLabel);
    const selected = { [key]: course.options[0].label };
    const active = activeConfigFlowGroups(spec.groups, selected) as Group[];
    assert.deepEqual(active.slice(1, 5).map((group) => group.key), ["salad_base", "protein", "toppings", "dressing"]);
    assert.ok(active.slice(1, 5).every((group) => group.options.length > 0));
    assert.equal(active[nextConfigFlowStepIndex(spec.groups, key, selected)].key, "salad_base");
    assert.equal(activeConfigFlowGroups(spec.groups, { [key]: "GAZPACHO ANDALUZ" }).some((group: Group) => group.key === "salad_base"), false);
    const fixedSaladMenu = { ...menu, first_courses: ["ENSALADA MIXTA ( ATUN Y HUEVO )", ...menu.first_courses.slice(1)] };
    const fixedSpec = getConfigSpec(product, section, fixedSaladMenu);
    assert.equal(activeConfigFlowGroups(fixedSpec.groups, { [key]: fixedSaladMenu.first_courses[0] }).some((group: Group) => group.key === "salad_base"), false);
  });
}

test("ensalada pequeña + bocadillo y ensalada independiente conservan sus configuradores", () => {
  for (const [name, keys] of [
    ["Menú ensalada pequeña + bocadillo", ["salad_base", "protein", "toppings", "dressing", "sandwich", "cutlery"]],
    ["Diseña tu ensalada", ["salad_size", "salad_base", "protein", "toppings", "dressing"]]
  ] as const) {
    const spec = getConfigSpec({ name, product_type: "standard", base_price: 10 }, section, menu);
    assert.deepEqual(activeConfigFlowGroups(spec.groups, {}).map((group: Group) => group.key), [...keys]);
  }
});

test("administración muestra la ensalada como opción fija sin campo de nombre editable", () => {
  const { FirstCourseField } = loadModule("src/components/admin/AdminMenuClient.tsx", {}, "\nexport { FirstCourseField };\n");
  const html = renderToStaticMarkup(createElement(FirstCourseField, { label: "Primer plato 1", value: menu.first_courses[0], onChange: () => {} }));
  assert.match(html, /value="custom_salad" selected=""/);
  assert.match(html, /ENSALADA A TU MANERA/);
  assert.doesNotMatch(html, /<input/);
  const regular = renderToStaticMarkup(createElement(FirstCourseField, { label: "Primer plato 2", value: "Gazpacho", allowCustomSalad: false, onChange: () => {} }));
  assert.match(regular, /<input/);
  assert.doesNotMatch(regular, /<select/);
  assert.match(regular, /value="Gazpacho"/);
});

test("cada fecha nueva ofrece la ensalada primera y respeta una sustitución guardada", async () => {
  const replacement = { ...menu, first_courses: ["CREMA DE CALABAZA", ...menu.first_courses.slice(1)] };
  const stored = new Map([[menu.date, replacement]]);
  let requestedDate = "";
  const query = {
    select() { return query; },
    eq(column: string, value: string) { assert.equal(column, "date"); requestedDate = value; return query; },
    async maybeSingle() { return { data: stored.get(requestedDate) ?? null, error: null }; }
  };
  const { GET } = loadModule("src/app/api/admin/menu/route.ts", {
    "@/lib/admin": { assertAdmin: () => null },
    "@/lib/supabase/server": { getSupabaseServerClient: () => ({ from: (table: string) => { assert.equal(table, "daily_menus"); return query; } }) }
  });
  for (const date of ["2026-09-15", menu.date, "2026-09-16"]) {
    const response = await GET(new NextRequest(`http://matica.test/api/admin/menu?date=${date}`));
    assert.equal(response.status, 200);
    const result = (await response.json()).menu;
    assert.equal(result.date, date);
    if (date === menu.date) {
      assert.deepEqual(result, replacement);
    } else {
      assert.equal(result.id, null);
      assert.deepEqual(result.first_courses, [expectedSaladLabel, "", "", ""]);
      assert.deepEqual(result.second_courses, []);
    }
  }
  assert.equal(stored.size, 1); // Opening another date does not create a menu.
});

test("el guardado real normaliza clientes antiguos y conserva los demás platos y opciones", async () => {
  let saved: Record<string, unknown> | undefined;
  const query = {
    upsert(value: Record<string, unknown>) { saved = value; return query; },
    select() { return query; },
    async single() { return { data: { id: "local-menu", ...saved }, error: null }; }
  };
  const { PUT } = loadModule("src/app/api/admin/menu/route.ts", {
    "@/lib/admin": { assertAdmin: () => null },
    "@/lib/supabase/server": { getSupabaseServerClient: () => ({ from: (table: string) => { assert.equal(table, "daily_menus"); return query; } }) }
  });
  for (const firstCourse of [menu.first_courses[0], "Ensalada a tu manera", "ENSALADA MIXTA ( ATUN Y HUEVO )"]) {
    const body = { ...menu, first_courses: [firstCourse, ...menu.first_courses.slice(1)], drinks: ["Agua"], desserts: ["Flan"] };
    const response = await PUT(new NextRequest("http://matica.test/api/admin/menu", { method: "PUT", body: JSON.stringify(body) }));
    assert.equal(response.status, 200);
    assert.deepEqual(saved, {
      date: body.date, active: true,
      first_courses: [firstCourse.includes("MIXTA") ? firstCourse : expectedSaladLabel, ...menu.first_courses.slice(1)],
      second_courses: menu.second_courses, drinks: ["Agua"], desserts: ["Flan"]
    });
  }
});

test("la lectura pública corrige el menú antiguo sin modificar el objeto ni la base de datos", () => {
  const { normalizeMenu } = loadModule("src/lib/public-data.ts", {}, "\nexport { normalizeMenu };\n");
  const normalized = normalizeMenu(menu);
  assert.deepEqual(normalized.first_courses, [expectedSaladLabel, ...menu.first_courses.slice(1)]);
  assert.deepEqual(normalized.second_courses, menu.second_courses);
  assert.equal(menu.first_courses[0], "ENSALDA A TUU MANERA");
});
