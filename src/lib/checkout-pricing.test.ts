import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import type { NextRequest } from "next/server";

const require = createRequire(import.meta.url);
const { NextRequest: RequestClass } = require("next/server") as typeof import("next/server");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
type Row = Record<string, unknown>;
type Product = { id: string; name: string; product_type: string; base_price: number | string };
type Result = { data: unknown; error: { message: string } | null };

// Load the real route and its pricing/payment dependencies with TypeScript's
// existing compiler. Only external effects are replaced; no server or keys needed.
function loadCheckout(mocks: Record<string, unknown>, routePath = "src/app/api/orders/route.ts") {
  const cache = new Map<string, { exports: Row }>();
  function load(filename: string): Row {
    const cached = cache.get(filename);
    if (cached) return cached.exports;
    const module = { exports: {} as Row };
    cache.set(filename, module);
    const compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true }
    });
    const localRequire = (specifier: string): unknown => {
      if (specifier in mocks) return mocks[specifier];
      if (specifier.startsWith("@/") || specifier.startsWith(".")) {
        const path = specifier.startsWith("@/")
          ? resolve(root, "src", specifier.slice(2))
          : resolve(dirname(filename), specifier);
        return load(path.endsWith(".ts") ? path : `${path}.ts`);
      }
      return require(specifier);
    };
    new Function("require", "module", "exports", compiled.outputText)(localRequire, module, module.exports);
    return module.exports;
  }
  return load(resolve(root, routePath)) as {
    POST: (request: NextRequest) => Promise<Response>;
    PATCH: (request: NextRequest) => Promise<Response>;
    GET: (request: NextRequest) => Promise<Response>;
  };
}

const dailyMenu: Product = { id: "menu", name: "Menú del día", product_type: "daily_menu", base_price: "13.50" };
const halfMenu: Product = { id: "half", name: "Medio menú", product_type: "half_menu", base_price: "10.00" };

function checkoutHarness(t: TestContext, product = dailyMenu, companySlug = "bureau-veritas", available = true, catalog = [product]) {
  const companyPays = companySlug === "icf";
  const writes: { table: string; action: string; value: unknown }[] = [];
  const stripeRequests: URLSearchParams[] = [];
  let emailCalls = 0;
  let savedOrder: Row | undefined;
  const supabase = {
    from(table: string) {
      let action = "select";
      let value: unknown;
      let single = false;
      const query = {
        select() { return query; },
        eq() { return query; },
        in() { return query; },
        gte() { return query; },
        maybeSingle() { single = true; return query; },
        single() { single = true; return query; },
        insert(payload: unknown) { action = "insert"; value = payload; return query; },
        upsert(payload: unknown) { action = "upsert"; value = payload; return query; },
        update(payload: unknown) { action = "update"; value = payload; return query; },
        then(onFulfilled: (result: Result) => unknown) {
          if (action !== "select") writes.push({ table, action, value });
          if (table === "orders" && action === "insert") savedOrder = value as Row;
          const rows: Record<string, unknown> = {
            companies: {
              id: companySlug, name: companySlug, billing_type: companyPays ? "company" : "subsidized",
              allow_card_payment: !companyPays, allow_pay_on_delivery: companyPays
            },
            company_branches: { id: "branch" },
            products: available ? catalog : [],
            subsidy_rules: companyPays ? [] : [
              { product_type: "daily_menu", subsidy_amount: "4.00" },
              { product_type: "half_menu", subsidy_amount: "3.50" }
            ],
            orders: action === "insert" ? { id: "test-order" } : single ? { id: "test-order", ...savedOrder } : [],
            customers: null,
            order_items: null
          };
          assert.ok(table in rows, `Unexpected database table: ${table}`);
          return Promise.resolve({ data: rows[table], error: null }).then(onFulfilled);
        }
      };
      return query;
    }
  };
  const originalKey = process.env.STRIPE_SECRET_KEY;
  process.env.STRIPE_SECRET_KEY = "sk_test_local_placeholder";
  t.after(() => {
    if (originalKey === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = originalKey;
  });
  // Every fetch is intercepted. The real Stripe form encoder still runs.
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    assert.equal(url, "https://api.stripe.com/v1/checkout/sessions");
    assert.equal(init.method, "POST");
    stripeRequests.push(new URLSearchParams(String(init.body)));
    return Response.json({ id: "cs_test_local", url: "https://checkout.stripe.test/session" });
  });
  const route = loadCheckout({
    "@/lib/supabase/server": { getSupabaseServerClient: () => supabase },
    "@/lib/global-settings": { getGlobalSchedule: async () => ({}) },
    "@/lib/schedule": {
      isOrderWindowOpen: () => true,
      deliveryWindowLabel: () => "13:00 a 13:30",
      orderWindowMessage: () => "Cerrado"
    },
    "@/lib/order-email": { sendOrderNotificationEmail: async () => { emailCalls += 1; } }
  });
  return {
    writes, stripeRequests,
    emailCalls: () => emailCalls,
    async submit(price: string | undefined, extraMetadata: Record<string, string> = {}) {
      const metadata: Record<string, string> = { display_name: product.name, ...extraMetadata };
      if (price !== undefined) metadata._configured_unit_price = price;
      return route.POST(new RequestClass("https://matica.test/api/orders", {
        method: "POST",
        body: JSON.stringify({
          company_slug: companySlug,
          customer: { name: "Prueba local", email: "checkout-test@bureauveritas.com", phone: "000000000", company_branch_id: "branch" },
          items: [{ product_id: product.id, quantity: 1, metadata }],
          payment_method: companyPays ? "pay_on_delivery" : "stripe_card"
        })
      }));
    }
  };
}

const scenarios = [
  { label: "BV menú 13,50", product: dailyMenu, price: "13.50", subsidy: 4, employee: 9.5, cutlery: false },
  { label: "BV menú 13,50 + cubiertos", product: dailyMenu, price: "13.70", subsidy: 4, employee: 9.7, cutlery: true },
  { label: "BV medio menú 10,00", product: halfMenu, price: "10.00", subsidy: 3.5, employee: 6.5, cutlery: false },
  { label: "BV medio menú 10,00 + cubiertos", product: halfMenu, price: "10.20", subsidy: 3.5, employee: 6.7, cutlery: true }
];

for (const scenario of scenarios) {
  test(`${scenario.label}: devuelve checkout y envía el importe exacto a Stripe simulado`, async (t) => {
    const h = checkoutHarness(t, scenario.product);
    const response = await h.submit(scenario.price, scenario.cutlery ? { cutlery: "Si (+0,20 €)" } : {});
    assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
    const { order, payment } = await response.json();
    assert.equal(order.subtotal, Number(scenario.price));
    assert.equal(order.subsidy_total, scenario.subsidy);
    assert.equal(order.company_invoice_total, scenario.subsidy);
    assert.equal(order.employee_total, scenario.employee);
    assert.equal(order.total, scenario.employee);
    assert.equal(payment.redirect_url, "https://checkout.stripe.test/session");
    assert.equal(h.stripeRequests.length, 1);
    assert.equal(h.stripeRequests[0].get("line_items[0][price_data][unit_amount]"), String(Math.round(scenario.employee * 100)));
    const lines = h.writes.find((write) => write.table === "order_items")?.value as Row[];
    assert.equal(lines[0].unit_price, Number(scenario.price));
    assert.equal(lines[0].base_price, Number(scenario.product.base_price));
    assert.equal(h.emailCalls(), 0);
  });
}

for (const price of ["13.00", "13.20", "13.49", "13.51", "0", "-1", "NaN", ""]) {
  test(`rechaza precio alterado/antiguo '${price}' antes de escribir o pedir Stripe`, async (t) => {
    const h = checkoutHarness(t);
    const response = await h.submit(price);
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /precio del carrito no es válido/);
    assert.equal(h.writes.length, 0);
    assert.equal(h.stripeRequests.length, 0);
    assert.equal(h.emailCalls(), 0);
  });
}

test("acepta otra actualización real del catálogo sin volver a cambiar el validador", async (t) => {
  const h = checkoutHarness(t, { ...dailyMenu, base_price: "14.00" });
  const response = await h.submit("14.00");
  assert.equal(response.status, 200);
  assert.equal((await response.json()).order.employee_total, 10);
  assert.equal(h.stripeRequests[0].get("line_items[0][price_data][unit_amount]"), "1000");
});

test("el catálogo manda: si sigue en 13,00 no acepta 13,50 enviado por el cliente", async (t) => {
  const h = checkoutHarness(t, { ...dailyMenu, base_price: "13.00" });
  assert.equal((await h.submit("13.50")).status, 400);
  assert.equal(h.writes.length, 0);
});

test("no permite disfrazar el menú como otro producto más barato", async (t) => {
  const h = checkoutHarness(t);
  assert.equal((await h.submit("10.00", { display_name: "Medio menú" })).status, 400);
  assert.equal(h.writes.length, 0);
});

test("sin precio del cliente recalcula cubiertos desde servidor e ignora _supplement_total", async (t) => {
  const h = checkoutHarness(t);
  const response = await h.submit(undefined, { cutlery: "Si (+0,20 €)", _supplement_total: "0" });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).order.subtotal, 13.7);
});

test("producto no disponible se rechaza antes de cualquier escritura", async (t) => {
  const h = checkoutHarness(t, dailyMenu, "bureau-veritas", false);
  assert.equal((await h.submit("13.50")).status, 400);
  assert.equal(h.writes.length, 0);
  assert.equal(h.stripeRequests.length, 0);
});

for (const product of [dailyMenu, halfMenu]) {
  for (const premium of [false, true]) {
    test(`${product.name} con ensalada${premium ? " premium y cubiertos" : ""}: conserva configuración y usa precio actual`, async (t) => {
      const h = checkoutHarness(t, product);
      const isDaily = product.product_type === "daily_menu";
      const price = (Number(product.base_price) + (premium ? 2.5 + 0.2 : 0)).toFixed(2);
      const response = await h.submit(price, {
        [isDaily ? "first_course" : "plate"]: "Ensalada a tu manera",
        salad_size: isDaily ? "Tamaño Pequeño 750ML" : "Tamaño Mediano 1000ML",
        salad_base: "Arroz blanco",
        protein: premium ? "Salmón ahumado" : "Pollo",
        toppings: "Maíz",
        dressing: "Mahonesa de soja",
        ...(premium ? { cutlery: "Si (+0,20 €)" } : {})
      });
      assert.equal(response.status, 200);
      const { order } = await response.json();
      assert.equal(order.subtotal, Number(price));
      assert.equal(order.subsidy_total, isDaily ? 4 : 3.5);
      assert.equal(h.stripeRequests.length, 1);
    });
  }
  test(`${product.name}: sigue rechazando ensalada sin configurar`, async (t) => {
    const h = checkoutHarness(t, product);
    const response = await h.submit(String(product.base_price), {
      [product.product_type === "daily_menu" ? "first_course" : "plate"]: "Ensalada a tu manera"
    });
    assert.equal(response.status, 400);
    assert.equal(h.writes.length, 0);
  });
}

for (const product of [dailyMenu, halfMenu]) {
  for (const cutlery of [false, true]) {
    test(`ICF ${product.name}${cutlery ? " con cubiertos" : ""}: empresa paga todo`, async (t) => {
      const h = checkoutHarness(t, product, "icf");
      const price = (Number(product.base_price) + (cutlery ? 0.2 : 0)).toFixed(2);
      const response = await h.submit(price, cutlery ? { cutlery: "Si (+0,20 €)" } : {});
      assert.equal(response.status, 200);
      const { order, payment } = await response.json();
      assert.equal(order.subtotal, Number(price));
      assert.equal(order.subsidy_total, 0);
      assert.equal(order.employee_total, 0);
      assert.equal(order.company_invoice_total, Number(price));
      assert.equal(payment.provider, "manual");
      assert.equal(h.stripeRequests.length, 0);
      assert.equal(h.emailCalls(), 1); // Intercepted locally; no email is sent.
    });
  }
}

test("carrito anterior a una subida: actualiza precio, conserva selección y permite confirmar de nuevo", async (t) => {
  const h = checkoutHarness(t);
  const { applyCartPriceUpdate } = await import("./cart-price-update.ts");
  const response = await h.submit("13.20", { cutlery: "Si (+0,20 €)", bread: "No", first_course: "Pasta" });
  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.equal(payload.code, "PRICE_CHANGED");
  assert.equal(h.writes.length, 0);
  assert.equal(h.stripeRequests.length, 0);
  const cart = applyCartPriceUpdate([{
    key: "old-menu", product_id: "menu", name: "Menú del día", product_type: "daily_menu",
    quantity: 1, base_price: 13.2, customer_price: 13.2,
    metadata: { cutlery: "Si (+0,20 €)", bread: "No", first_course: "Pasta", _configured_unit_price: "13.20" }
  }], payload.prices)!;
  assert.equal(cart[0].base_price, 13.7);
  assert.equal(cart[0].metadata?.bread, "No");
  assert.equal(cart[0].metadata?.first_course, "Pasta");
  assert.equal(cart[0].metadata?.cutlery, "Si (+0,20 €)");
  const confirmed = await h.submit(cart[0].metadata?._configured_unit_price, cart[0].metadata);
  assert.equal(confirmed.status, 200);
  assert.equal((await confirmed.json()).order.employee_total, 9.7);
  assert.equal(h.stripeRequests.length, 1);
});

const changedProducts: { product: Product; metadata?: Record<string, string>; expected: number }[] = [
  { product: { id: "bowl", name: "Caesar Crunch Chicken Bowl", product_type: "standard", base_price: "10.50" }, expected: 10.5 },
  { product: { id: "wrap", name: "Wrap Caesar Crunch", product_type: "standard", base_price: "9.50" }, expected: 9.5 },
  { product: { id: "sandwich", name: "Escoge tu bocadillo", product_type: "standard", base_price: "6.50" }, expected: 6.5 },
  { product: { id: "grill", name: "Platos combinados Matica", product_type: "standard", base_price: "11.00" }, metadata: { main_protein: "Filete de ternera a la parrilla" }, expected: 12.5 },
  { product: { id: "salad", name: "Diseña tu ensalada", product_type: "standard", base_price: "8.00" }, metadata: { salad_size: "Tamaño Mediano 1000ML", salad_base: "Arroz blanco", protein: "Pollo", toppings: "Maíz", dressing: "Mahonesa de soja" }, expected: 8 }
];
for (const { product, metadata, expected } of changedProducts) {
  test(`${product.name}: acepta cambio de precio real sin otra modificación de código`, async (t) => {
    const h = checkoutHarness(t, product);
    const response = await h.submit(expected.toFixed(2), metadata);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).order.subtotal, expected);
    assert.equal(h.stripeRequests[0].get("line_items[0][price_data][unit_amount]"), String(Math.round(expected * 100)));
  });
}
for (const type of ["drink", "dessert"]) {
  test(`${type}: usa el precio actualizado del producto elegido, no el del selector`, async (t) => {
    const parent = { id: "selector", name: type === "drink" ? "Agua mineral" : "Yogur de frutas", product_type: type, base_price: 1.5 };
    const selected = { id: "selected", name: type === "drink" ? "Coca Cola" : "Cookie", product_type: type, base_price: 2.5 };
    const h = checkoutHarness(t, parent, "bureau-veritas", true, [parent, selected]);
    const response = await h.submit("2.50", { [type]: selected.name });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).order.total, 2.5);
    assert.equal(h.stripeRequests[0].get("line_items[0][price_data][unit_amount]"), "250");
  });
}

function adminPriceHarness(t: TestContext, productType = "daily_menu", subsidy = 4, subsidyError = false) {
  const writes: Row[] = [];
  const oldPin = process.env.ADMIN_PIN;
  process.env.ADMIN_PIN = "local-price-test";
  t.after(() => { if (oldPin === undefined) delete process.env.ADMIN_PIN; else process.env.ADMIN_PIN = oldPin; });
  const supabase = { from(table: string) {
    let update: Row | undefined;
    const query = {
      select() { return query; }, eq() { return query; }, single() { return query; }, maybeSingle() { return query; },
      update(payload: Row) { update = payload; return query; },
      then(onFulfilled: (result: Result) => unknown) {
        if (update) writes.push(update);
        const data = table === "companies"
          ? { subsidy_rules: [{ product_type: "daily_menu", subsidy_amount: subsidy, active: true }, { product_type: "half_menu", subsidy_amount: 3.5, active: true }] }
          : { id: "menu", product_type: productType, ...update };
        return Promise.resolve({ data, error: table === "companies" && subsidyError ? { message: "test read failure" } : null }).then(onFulfilled);
      }
    };
    return query;
  } };
  const route = loadCheckout({
    "@/lib/supabase/server": { getSupabaseServerClient: () => supabase, getSupabaseAdminClient: () => null }
  }, "src/app/api/admin/products/route.ts");
  return { writes, route, save: (basePrice: unknown, pin = "local-price-test") => route.PATCH(new RequestClass("https://matica.test/api/admin/products", {
    method: "PATCH", headers: { "x-admin-pin": pin },
    body: JSON.stringify({ id: "menu", base_price: basePrice, customer_price: 0.01, active: true, sold_out: false })
  })) };
}

test("admin: guardar 13,50 sincroniza el precio cliente a 9,50 aunque envíen otro valor", async (t) => {
  const h = adminPriceHarness(t);
  assert.equal((await h.save(13.5)).status, 200);
  assert.equal(h.writes.length, 1);
  assert.equal(h.writes[0].base_price, 13.5);
  assert.equal(h.writes[0].customer_price, 9.5);
});
test("admin: usa la subvención real configurada, no un descuento fijo en código", async (t) => {
  const h = adminPriceHarness(t, "daily_menu", 4.5);
  assert.equal((await h.save(14)).status, 200);
  assert.equal(h.writes[0].customer_price, 9.5);
});
test("admin: medio menú y productos no subvencionados se calculan correctamente", async (t) => {
  const half = adminPriceHarness(t, "half_menu");
  assert.equal((await half.save(10)).status, 200);
  assert.equal(half.writes[0].customer_price, 6.5);
  const standard = adminPriceHarness(t, "standard");
  assert.equal((await standard.save(11)).status, 200);
  assert.equal(standard.writes[0].customer_price, 11);
});
for (const value of [0, -1, null, "13.50", 13.555]) {
  test(`admin: rechaza precio no válido ${JSON.stringify(value)} sin guardar`, async (t) => {
    const h = adminPriceHarness(t);
    assert.equal((await h.save(value)).status, 400);
    assert.equal(h.writes.length, 0);
  });
}
test("admin: fallo al leer subvención no guarda precios descoordinados", async (t) => {
  const h = adminPriceHarness(t, "daily_menu", 4, true);
  assert.equal((await h.save(13.5)).status, 503);
  assert.equal(h.writes.length, 0);
});
test("admin: sin PIN no permite leer ni cambiar precios", async (t) => {
  const h = adminPriceHarness(t);
  assert.equal((await h.save(13.5, "")).status, 401);
  assert.equal((await h.route.GET(new RequestClass("https://matica.test/api/admin/products"))).status, 401);
  assert.equal(h.writes.length, 0);
});
