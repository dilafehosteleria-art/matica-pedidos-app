import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import type { NextRequest } from "next/server";
import { PRODUCTS } from "./constants.ts";
import { normalizeDrinkChoice } from "./drink-options.ts";
import type { DailyMenu } from "./types";

const require = createRequire(import.meta.url);
const { NextRequest: RequestClass } = require("next/server") as typeof import("next/server");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
type Row = Record<string, unknown>;
type Product = { id: string; name: string; product_type: string; base_price: number | string };
type DatabaseError = { code?: string; message: string; details?: string; hint?: string };
type Result = { data: unknown; error: DatabaseError | null };
type CheckoutItem = { product_id: string; quantity: number; metadata: Record<string, string> };
type CheckoutSubmission = {
  fulfillment_type?: "delivery" | "dine_in" | "pickup" | string;
  requested_time?: unknown;
  availability_acknowledged?: boolean;
};
type CheckoutHarnessOptions = {
  menu?: DailyMenu | null;
  menuReadError?: boolean;
  deliveryOpen?: boolean;
  globalSchedule?: Record<string, unknown>;
  localOnlyDay?: boolean;
  localOrderingEnabled?: boolean;
  operatingCalendar?: {
    available?: boolean;
    closures?: Row[];
    exceptions?: Row[];
  };
  localState?: {
    open: boolean;
    afterGuaranteeCutoff: boolean;
    localDate: string;
    currentTime: string;
    openTime?: string;
    closeTime?: string;
    message: string;
  };
  orderInsertErrors?: (DatabaseError | null)[];
};

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
const bowl: Product = { id: "bowl", name: "Caesar Crunch Chicken Bowl", product_type: "standard", base_price: "10.50" };
const saladSandwichMenu: Product = {
  id: "salad-sandwich-menu",
  name: "Menú ensalada pequeña + bocadillo",
  product_type: "standard",
  base_price: "10.00"
};

function resolveCatalogIdentity(product: Product): Product {
  const expectedName = product.product_type === "drink"
    ? normalizeDrinkChoice(product.name)
    : product.name;
  const catalogProduct = PRODUCTS.find((candidate) =>
    candidate.product_type === product.product_type && candidate.name === expectedName
  );

  assert.ok(
    catalogProduct,
    `El producto de prueba ${product.name} (${product.product_type}) no existe en PRODUCTS.`
  );

  return { ...product, id: catalogProduct.id };
}

const publishedMenu: DailyMenu = {
  id: "menu-today",
  date: "2026-11-12",
  active: true,
  first_courses: ["Pasta", "Ensalada a tu manera", "ENSALADA MIXTA ( ATUN Y HUEVO )", "Gazpacho"],
  second_courses: [{ name: "Jamoncitos de pollo en pepitoria" }, "Merluza", "Secreto"],
  drinks: [],
  desserts: []
};

function checkoutHarness(
  t: TestContext,
  product = dailyMenu,
  companySlug = "bureau-veritas",
  available = true,
  catalog = [product],
  options: CheckoutHarnessOptions = {}
) {
  const {
    menu = publishedMenu,
    menuReadError = false,
    deliveryOpen = true,
    globalSchedule = {},
    localOnlyDay = false,
    localOrderingEnabled = true,
    operatingCalendar = {},
    localState = {
      open: true,
      afterGuaranteeCutoff: false,
      localDate: "2026-11-12",
      currentTime: "12:00",
      message: "Pedidos para el local disponibles."
    },
    orderInsertErrors = []
  } = options;
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-11T23:10:00Z") });
  const companyPays = companySlug === "icf";
  const writes: { table: string; action: string; value: unknown }[] = [];
  const stripeRequests: URLSearchParams[] = [];
  const menuReads: Row[] = [];
  let emailCalls = 0;
  let savedOrder: Row | undefined;
  let orderInsertAttempts = 0;
  const resolvedCatalog = catalog.map(resolveCatalogIdentity);
  const productIds = new Map(
    catalog.map((catalogProduct, index) => [catalogProduct.id, resolvedCatalog[index].id])
  );
  const supabase = {
    from(table: string) {
      let action = "select";
      let value: unknown;
      let single = false;
      const filters: Row = {};
      const query = {
        select() { return query; },
        eq(column: string, value: unknown) { filters[column] = value; return query; },
        in(column: string, values: unknown[]) { filters[column] = values; return query; },
        gte() { return query; },
        maybeSingle() { single = true; return query; },
        single() { single = true; return query; },
        insert(payload: unknown) { action = "insert"; value = payload; return query; },
        upsert(payload: unknown) { action = "upsert"; value = payload; return query; },
        update(payload: unknown) { action = "update"; value = payload; return query; },
        then(onFulfilled: (result: Result) => unknown) {
          if (action !== "select") writes.push({ table, action, value });
          if (table === "orders" && action === "insert") {
            const insertError = orderInsertErrors[orderInsertAttempts] ?? null;
            orderInsertAttempts += 1;
            if (insertError) {
              return Promise.resolve({ data: null, error: insertError }).then(onFulfilled);
            }
            savedOrder = value as Row;
          }
          if (table === "daily_menus") {
            menuReads.push(filters);
            const data = menu?.date === filters.date && menu?.active === filters.active ? menu : null;
            const error = menuReadError ? { message: "Error de lectura simulado" } : null;
            return Promise.resolve({ data, error }).then(onFulfilled);
          }
          const rows: Record<string, unknown> = {
            companies: {
              id: companySlug, name: companySlug, billing_type: companyPays ? "company" : "subsidized",
              allow_card_payment: !companyPays, allow_pay_on_delivery: companyPays,
              local_ordering_enabled: localOrderingEnabled,
              local_order_days: [1, 2, 3, 4, 5, 6, 7],
              local_ordering_open_time: "09:30:00",
              local_ordering_close_time: "15:00:00",
              local_ordering_guarantee_cutoff: "12:40:00",
              local_only_days: localOnlyDay ? [4] : []
            },
            company_branches: { id: "branch" },
            products: available
              ? resolvedCatalog.filter((product) => {
                  const requestedIds = filters.id;
                  return !Array.isArray(requestedIds) || requestedIds.includes(product.id);
                })
              : [],
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
    "@/lib/supabase/server": {
      getSupabaseServerClient: () => supabase,
      getSupabaseAdminClient: () => supabase
    },
    "@/lib/global-settings": {
      getGlobalSchedule: async () => ({
        id: "global",
        active: deliveryOpen,
        active_days: [1, 2, 3, 4, 5, 6, 7],
        order_open_time: "00:00",
        order_close_time: "23:59",
        delivery_start_time: "13:00",
        delivery_end_time: "13:30",
        ...globalSchedule
      })
    },
    "@/lib/operating-calendar-data": {
      readOperatingCalendar: async () => ({
        available: operatingCalendar.available ?? true,
        closures: operatingCalendar.closures ?? [],
        exceptions: operatingCalendar.exceptions ?? []
      })
    },
    "@/lib/local-ordering": {
      isLocalFulfillmentType: (value: unknown) => value === "dine_in" || value === "pickup",
      isLocalOnlyDay: () => localOnlyDay,
      hasLateLocalMenuConfiguration: (metadata: Record<string, string> | null | undefined) =>
        Object.keys(metadata ?? {}).some((key) => !key.startsWith("_")),
      getLocalOrderState: () => ({
        openTime: "09:30",
        closeTime: "15:00",
        ...localState
      })
    },
    "@/lib/order-email": { sendOrderNotificationEmail: async () => { emailCalls += 1; } }
  });
  function submitItems(items: CheckoutItem[], submission: CheckoutSubmission = {}) {
    const resolvedItems = items.map((item) => ({
      ...item,
      product_id: productIds.get(item.product_id) ?? item.product_id
    }));

    return route.POST(new RequestClass("https://matica.test/api/orders", {
      method: "POST",
      body: JSON.stringify({
        company_slug: companySlug,
        customer: { name: "Prueba local", email: "checkout-test@bureauveritas.com", phone: "000000000", company_branch_id: "branch" },
        items: resolvedItems,
        payment_method: companyPays ? "pay_on_delivery" : "stripe_card",
        ...submission
      })
    }));
  }
  return {
    writes, stripeRequests, menuReads, submitItems,
    productId: (testId: string) => productIds.get(testId) ?? testId,
    emailCalls: () => emailCalls,
    orderInsertAttempts: () => orderInsertAttempts,
    async submit(price: string | undefined, extraMetadata: Record<string, string> = {}) {
      const displayName = product.product_type === "drink"
        ? "Escoge tu bebida"
        : product.product_type === "dessert"
          ? "Escoge tu postre"
          : product.name;
      const metadata: Record<string, string> = { display_name: displayName };
      if (product.product_type === "daily_menu") {
        metadata.first_course = "Pasta";
        metadata.second_course = "Merluza";
      }
      if (product.product_type === "half_menu") metadata.plate = "Pasta";
      Object.assign(metadata, extraMetadata);
      if (price !== undefined) metadata._configured_unit_price = price;
      return submitItems([{ product_id: product.id, quantity: 1, metadata }]);
    }
  };
}

test("medio menú: rechaza el pollo de ayer antes de cobrar y acepta un primero o un segundo de hoy", async (t) => {
  const h = checkoutHarness(t, halfMenu);
  const rejected = await h.submit("10.00", { plate: "POLLO A LA BRASA CON MOJO PICON" });
  assert.equal(rejected.status, 409);
  const payload = await rejected.json();
  assert.equal(payload.code, "MENU_CHANGED");
  assert.equal(payload.menu.date, publishedMenu.date);
  assert.deepEqual(payload.invalidItems, [{ index: 0, fields: ["plate"] }]);
  assert.deepEqual(h.menuReads, [{ date: publishedMenu.date, active: true }]);
  assert.equal(h.writes.length, 0);
  assert.equal(h.stripeRequests.length, 0);
  assert.equal(h.emailCalls(), 0);

  for (const plate of ["Pasta", " Jamoncitos de pollo en pepitoria "]) {
    const response = await h.submit("10.00", { plate });
    assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
    assert.equal((await response.json()).order.employee_total, 6.5);
    assert.equal(h.stripeRequests.at(-1)?.get("line_items[0][price_data][unit_amount]"), "650");
  }
  assert.equal(h.menuReads.length, 3);
});

test("ICF: el Medio menú rechaza una ensalada configurable en una cesta anterior sin registrar ni cobrar el pedido", async (t) => {
  const h = checkoutHarness(t, halfMenu, "icf");
  const response = await h.submit("10.00", {
    plate: "ENSALDA A TUU MANERA",
    salad_size: "Tamaño Mediano 1000ML",
    salad_base: "Mezclum de lechugas",
    protein: "Pollo",
    toppings: "Maíz",
    dressing: "Mahonesa de soja"
  });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, "HALF_MENU_SALAD_UNAVAILABLE");
  assert.equal(h.writes.length, 0);
  assert.equal(h.stripeRequests.length, 0);
  assert.equal(h.emailCalls(), 0);
});

test("ICF: el Menú del día conserva la ensalada configurable", async (t) => {
  const h = checkoutHarness(t, dailyMenu, "icf");
  const response = await h.submit("13.50", {
    first_course: "Ensalada a tu manera",
    salad_size: "Tamaño Pequeño 750ML",
    salad_base: "Mezclum de lechugas",
    protein: "Pollo",
    toppings: "Maíz",
    dressing: "Mahonesa de soja"
  });
  assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
  assert.equal((await response.json()).order.company_invoice_total, 13.5);
});

test("carrito mixto: una sola lectura del menú identifica los platos retirados por línea", async (t) => {
  const h = checkoutHarness(t, dailyMenu, "bureau-veritas", true, [bowl, dailyMenu, halfMenu]);
  const response = await h.submitItems([
    { product_id: bowl.id, quantity: 1, metadata: {} },
    { product_id: dailyMenu.id, quantity: 1, metadata: { first_course: "Pasta", second_course: "Pollo de ayer" } },
    { product_id: halfMenu.id, quantity: 1, metadata: { plate: "Merluza" } },
    { product_id: dailyMenu.id, quantity: 1, metadata: { first_course: "Lentejas de ayer", second_course: "Secreto" } }
  ]);
  assert.equal(response.status, 409);
  const payload = await response.json();
  assert.equal(payload.code, "MENU_CHANGED");
  assert.deepEqual(payload.invalidItems, [
    { index: 1, fields: ["second_course"] },
    { index: 3, fields: ["first_course"] }
  ]);
  assert.deepEqual(h.menuReads, [{ date: publishedMenu.date, active: true }]);
  assert.equal(h.writes.length, 0);
  assert.equal(h.stripeRequests.length, 0);
  assert.equal(h.emailCalls(), 0);
});

for (const [label, menu] of [
  ["ausente", null],
  ["inactivo", { ...publishedMenu, active: false }],
  ["de ayer", { ...publishedMenu, date: "2026-11-11" }]
] as const) {
  test(`un menú ${label} bloquea el pedido antes de escribir o cobrar`, async (t) => {
    const h = checkoutHarness(t, dailyMenu, "bureau-veritas", true, [dailyMenu], { menu });
    const response = await h.submit("13.50");
    assert.equal(response.status, 409);
    const payload = await response.json();
    assert.equal(payload.code, "MENU_CHANGED");
    assert.equal(payload.menu, null);
    assert.deepEqual(payload.invalidItems, [{ index: 0, fields: ["first_course", "second_course"] }]);
    assert.deepEqual(h.menuReads, [{ date: publishedMenu.date, active: true }]);
    assert.equal(h.writes.length, 0);
    assert.equal(h.stripeRequests.length, 0);
    assert.equal(h.emailCalls(), 0);
  });
}

test("un fallo al leer el menú devuelve 503 antes de escribir o cobrar", async (t) => {
  const h = checkoutHarness(t, dailyMenu, "bureau-veritas", true, [dailyMenu], { menuReadError: true });
  assert.equal((await h.submit("13.50")).status, 503);
  assert.equal(h.menuReads.length, 1);
  assert.equal(h.writes.length, 0);
  assert.equal(h.stripeRequests.length, 0);
  assert.equal(h.emailCalls(), 0);
});

test("pedido para comer en Matica antes del corte: exige hora, revalida platos y guarda contexto local", async (t) => {
  const h = checkoutHarness(t, dailyMenu, "bureau-veritas", true, [dailyMenu], {
    deliveryOpen: false,
    localState: {
      open: true,
      afterGuaranteeCutoff: false,
      localDate: "2026-11-12",
      currentTime: "12:10",
      message: "Pedidos para el local disponibles."
    }
  });
  const response = await h.submitItems([{
    product_id: dailyMenu.id,
    quantity: 1,
    metadata: {
      display_name: "Menú del día",
      first_course: "Pasta",
      second_course: "Merluza",
      _configured_unit_price: "13.50"
    }
  }], { fulfillment_type: "dine_in", requested_time: "13:15" });

  assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
  const payload = await response.json();
  assert.equal(payload.order.fulfillment_type, "dine_in");
  assert.equal(payload.order.requested_time, "13:15");
  assert.equal(payload.order.menu_selection_mode, "confirmed");
  assert.deepEqual(h.menuReads, [{ date: publishedMenu.date, active: true }]);
  const saved = h.writes.find((write) => write.table === "orders" && write.action === "insert")?.value as Row;
  assert.equal(saved.fulfillment_type, "dine_in");
  assert.equal(saved.requested_time, "13:15");
  assert.equal(saved.menu_selection_mode, "confirmed");
  assert.equal(saved.delivery_window, "En Matica · 13:15");
});

test("una llegada posterior conserva la selección si el pedido se hizo antes de las 12:40", async (t) => {
  const h = checkoutHarness(t, dailyMenu, "bureau-veritas", true, [dailyMenu], {
    localState: {
      open: true,
      afterGuaranteeCutoff: false,
      localDate: "2026-11-12",
      currentTime: "12:10",
      message: "Pedidos para el local disponibles."
    }
  });
  const response = await h.submitItems([{
    product_id: dailyMenu.id,
    quantity: 1,
    metadata: {
      first_course: "Pasta",
      second_course: "Merluza",
      _configured_unit_price: "13.50"
    }
  }], {
    fulfillment_type: "dine_in",
    requested_time: "14:15"
  });

  assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
  const payload = await response.json();
  assert.equal(payload.order.menu_selection_mode, "confirmed");
  assert.deepEqual(h.menuReads, [{ date: publishedMenu.date, active: true }]);
});

test("el menú de ensalada pequeña con bocadillo no se admite en pedidos locales", async (t) => {
  const h = checkoutHarness(t, saladSandwichMenu, "bureau-veritas", true, [saladSandwichMenu], {
    localState: {
      open: true,
      afterGuaranteeCutoff: false,
      localDate: "2026-11-12",
      currentTime: "12:10",
      message: "Pedidos para el local disponibles."
    }
  });
  const response = await h.submitItems([{
    product_id: saladSandwichMenu.id,
    quantity: 1,
    metadata: { _configured_unit_price: "10.00" }
  }], { fulfillment_type: "dine_in", requested_time: "13:15" });

  assert.equal(response.status, 409);
  const payload = await response.json();
  assert.equal(payload.code, "LOCAL_PRODUCT_NOT_AVAILABLE");
  assert.equal(h.writes.length, 0);
  assert.equal(h.stripeRequests.length, 0);
  assert.equal(h.menuReads.length, 0);
});

test("antes del corte los pedidos locales solo admiten Menú del día o Medio menú", async (t) => {
  const h = checkoutHarness(t, bowl, "bureau-veritas", true, [bowl], {
    localState: {
      open: true,
      afterGuaranteeCutoff: false,
      localDate: "2026-11-12",
      currentTime: "12:10",
      message: "Pedidos para el local disponibles."
    }
  });
  const response = await h.submitItems([{
    product_id: bowl.id,
    quantity: 1,
    metadata: { _configured_unit_price: "10.50" }
  }], { fulfillment_type: "dine_in", requested_time: "13:15" });

  assert.equal(response.status, 409);
  const payload = await response.json();
  assert.equal(payload.code, "LOCAL_PRODUCT_NOT_AVAILABLE");
  assert.deepEqual(payload.allowed_product_types, ["daily_menu", "half_menu"]);
  assert.equal(h.writes.length, 0);
  assert.equal(h.stripeRequests.length, 0);
  assert.equal(h.menuReads.length, 0);
});

test("pedido local después del corte: acepta sólo menú sin platos y los deja para elegir al llegar", async (t) => {
  const h = checkoutHarness(t, halfMenu, "bureau-veritas", true, [halfMenu], {
    localState: {
      open: true,
      afterGuaranteeCutoff: true,
      localDate: "2026-11-12",
      currentTime: "12:40",
      message: "Pedidos para el local disponibles."
    }
  });
  const response = await h.submitItems([{
    product_id: halfMenu.id,
    quantity: 1,
    metadata: { _configured_unit_price: "10.00" }
  }], { fulfillment_type: "pickup", requested_time: "14:30", availability_acknowledged: true });

  assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
  const payload = await response.json();
  assert.equal(payload.order.menu_selection_mode, "on_arrival");
  assert.equal(payload.order.fulfillment_type, "pickup");
  assert.deepEqual(h.menuReads, []);
  const saved = h.writes.find((write) => write.table === "orders" && write.action === "insert")?.value as Row;
  assert.equal(saved.delivery_window, "En Matica · 14:30");
});

test("pedido local tardío exige aceptar expresamente que los platos se eligen según disponibilidad", async (t) => {
  const h = checkoutHarness(t, halfMenu, "bureau-veritas", true, [halfMenu], {
    localState: {
      open: true,
      afterGuaranteeCutoff: true,
      localDate: "2026-11-12",
      currentTime: "13:35",
      message: "Pedidos para el local disponibles."
    }
  });
  const response = await h.submitItems([{
    product_id: halfMenu.id,
    quantity: 1,
    metadata: { _configured_unit_price: "10.00" }
  }], { fulfillment_type: "pickup", requested_time: "14:30" });

  assert.equal(response.status, 409);
  const payload = await response.json();
  assert.equal(payload.code, "LOCAL_AVAILABILITY_ACK_REQUIRED");
  assert.equal(payload.menu_selection_mode, "on_arrival");
  assert.equal(h.writes.length, 0);
  assert.equal(h.stripeRequests.length, 0);
});

test("al cruzar el corte devuelve una transición explícita si el carrito aún lleva platos elegidos", async (t) => {
  const h = checkoutHarness(t, halfMenu, "bureau-veritas", true, [halfMenu], {
    localState: {
      open: true,
      afterGuaranteeCutoff: true,
      localDate: "2026-11-12",
      currentTime: "12:40",
      message: "Pedidos para el local disponibles."
    }
  });
  const response = await h.submitItems([{
    product_id: halfMenu.id,
    quantity: 1,
    metadata: { plate: "Pasta", _configured_unit_price: "10.00" }
  }], { fulfillment_type: "dine_in", requested_time: "14:00" });

  assert.equal(response.status, 409);
  const payload = await response.json();
  assert.equal(payload.code, "LOCAL_SELECTION_CHANGED");
  assert.equal(payload.menu_selection_mode, "on_arrival");
  assert.equal(h.writes.length, 0);
  assert.equal(h.stripeRequests.length, 0);
});

test("después del corte el servidor rechaza cualquier otra elección del menú", async (t) => {
  const h = checkoutHarness(t, dailyMenu, "bureau-veritas", true, [dailyMenu], {
    localState: {
      open: true,
      afterGuaranteeCutoff: true,
      localDate: "2026-11-12",
      currentTime: "12:40",
      message: "Pedidos para el local disponibles."
    }
  });
  const response = await h.submitItems([{
    product_id: dailyMenu.id,
    quantity: 1,
    metadata: { drink_or_dessert: "Agua", _configured_unit_price: "13.50" }
  }], {
    fulfillment_type: "dine_in",
    requested_time: "14:00",
    availability_acknowledged: true
  });

  assert.equal(response.status, 409);
  const payload = await response.json();
  assert.equal(payload.code, "LOCAL_SELECTION_CHANGED");
  assert.equal(h.writes.length, 0);
  assert.equal(h.stripeRequests.length, 0);
});

test("después del corte también rechaza productos de carta aunque el cliente los fuerce", async (t) => {
  const h = checkoutHarness(t, bowl, "bureau-veritas", true, [bowl], {
    localState: {
      open: true,
      afterGuaranteeCutoff: true,
      localDate: "2026-11-12",
      currentTime: "13:40",
      message: "Pedidos para el local disponibles."
    }
  });
  const response = await h.submitItems([
    { product_id: bowl.id, quantity: 1, metadata: { _configured_unit_price: "10.50" } }
  ], { fulfillment_type: "pickup", requested_time: "14:30" });

  assert.equal(response.status, 409);
  const payload = await response.json();
  assert.equal(payload.code, "LOCAL_PRODUCT_NOT_AVAILABLE");
  assert.deepEqual(payload.allowed_product_types, ["daily_menu", "half_menu"]);
  assert.equal(h.writes.length, 0);
});

test("pedido local exige una hora futura dentro de la ventana configurada", async (t) => {
  const h = checkoutHarness(t, halfMenu, "bureau-veritas", true, [halfMenu], {
    localState: {
      open: true,
      afterGuaranteeCutoff: false,
      localDate: "2026-11-12",
      currentTime: "12:10",
      message: "Pedidos para el local disponibles."
    }
  });
  const item = [{ product_id: halfMenu.id, quantity: 1, metadata: { plate: "Pasta" } }];

  const missing = await h.submitItems(item, { fulfillment_type: "dine_in" });
  assert.equal(missing.status, 400);
  assert.equal((await missing.json()).code, "LOCAL_REQUESTED_TIME_REQUIRED");

  for (const requested_time of ["12:00", "15:00", "25:00"]) {
    const response = await h.submitItems(item, { fulfillment_type: "dine_in", requested_time });
    assert.ok([400, 409].includes(response.status), requested_time);
    assert.match((await response.json()).code, /^LOCAL_REQUESTED_TIME_|INVALID_REQUESTED_TIME$/);
  }
  assert.equal(h.writes.length, 0);
});

test("la opción Ahora tolera cinco minutos mientras el cliente termina el checkout", async (t) => {
  const h = checkoutHarness(t, halfMenu, "bureau-veritas", true, [halfMenu], {
    localState: {
      open: true,
      afterGuaranteeCutoff: false,
      localDate: "2026-11-12",
      currentTime: "12:10",
      message: "Pedidos para el local disponibles."
    }
  });
  const response = await h.submitItems([{
    product_id: halfMenu.id,
    quantity: 1,
    metadata: { plate: "Pasta", _configured_unit_price: "10.00" }
  }], { fulfillment_type: "dine_in", requested_time: "12:05" });

  assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
  assert.equal((await response.json()).order.requested_time, "12:05");
});

test("una apertura local anticipada permite confirmar Ahora en el local", async (t) => {
  const h = checkoutHarness(t, halfMenu, "bureau-veritas", true, [halfMenu], {
    localState: {
      open: true,
      afterGuaranteeCutoff: false,
      localDate: "2026-11-21",
      currentTime: "08:36",
      openTime: "08:30",
      closeTime: "12:40",
      message: "Horario local anticipado activo."
    }
  });
  const response = await h.submitItems([{
    product_id: halfMenu.id,
    quantity: 1,
    metadata: { plate: "Pasta", _configured_unit_price: "10.00" }
  }], { fulfillment_type: "dine_in", requested_time: "08:36" });

  assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
  assert.equal((await response.json()).order.requested_time, "08:36");
});

test("una apertura global no reabre un horario local cerrado", async (t) => {
  const h = checkoutHarness(t, halfMenu, "bureau-veritas", true, [halfMenu], {
    deliveryOpen: true,
    localState: {
      open: false,
      afterGuaranteeCutoff: false,
      localDate: "2026-11-21",
      currentTime: "08:36",
      openTime: "09:30",
      closeTime: "15:00",
      message: "Los pedidos para el local están disponibles de lunes a viernes."
    }
  });
  const response = await h.submitItems([{
    product_id: halfMenu.id,
    quantity: 1,
    metadata: { plate: "Pasta", _configured_unit_price: "10.00" }
  }], { fulfillment_type: "pickup", requested_time: "10:00" });

  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, "LOCAL_ORDER_WINDOW_CLOSED");
  assert.equal(h.writes.length, 0);
});

test("un día configurado como sólo local bloquea reparto pero mantiene las modalidades locales", async (t) => {
  const h = checkoutHarness(t, dailyMenu, "bureau-veritas", true, [dailyMenu], { localOnlyDay: true });
  const response = await h.submit("13.50");
  assert.equal(response.status, 403);
  const payload = await response.json();
  assert.equal(payload.code, "ORDER_WINDOW_CLOSED");
  assert.match(payload.error, /no hay delivery/i);
  assert.equal(h.writes.length, 0);
});

test("un festivo oficial bloquea el delivery aunque el horario habitual esté abierto", async (t) => {
  const h = checkoutHarness(t, dailyMenu, "bureau-veritas", true, [dailyMenu], {
    operatingCalendar: {
      closures: [{
        id: "holiday",
        date: "2026-11-12",
        name: "Festivo de prueba",
        scope: "local",
        source: "official",
        closes_delivery: true,
        closes_local: true,
        enabled: true
      }]
    }
  });

  const response = await h.submit("13.50");
  assert.equal(response.status, 403);
  const payload = await response.json();
  assert.equal(payload.code, "ORDER_WINDOW_CLOSED");
  assert.match(payload.error, /Festivo de prueba/i);
  assert.equal(h.writes.length, 0);
  assert.equal(h.stripeRequests.length, 0);
});

test("una excepción puntual abre el delivery y prevalece sobre festivo y día habitual cerrado", async (t) => {
  const h = checkoutHarness(t, dailyMenu, "bureau-veritas", true, [dailyMenu], {
    globalSchedule: { active_days: [1] },
    operatingCalendar: {
      closures: [{
        id: "holiday",
        date: "2026-11-12",
        name: "Festivo de prueba",
        scope: "local",
        source: "official",
        closes_delivery: true,
        closes_local: true,
        enabled: true
      }],
      exceptions: [{
        id: "exception",
        date: "2026-11-12",
        channel: "delivery",
        company_id: null,
        mode: "custom_hours",
        open_time: "00:00",
        close_time: "23:59",
        service_start: "14:00",
        service_end: "14:30",
        menu_guarantee_cutoff: null
      }]
    }
  });

  const response = await h.submit("13.50");
  assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
  const saved = h.writes.find((write) => write.table === "orders" && write.action === "insert")?.value as Row;
  assert.equal(saved.delivery_window, "14:00 a 14:30");
});

test("si no se puede comprobar el calendario, el pedido se detiene antes de escribir o cobrar", async (t) => {
  const h = checkoutHarness(t, dailyMenu, "bureau-veritas", true, [dailyMenu], {
    operatingCalendar: { available: false }
  });

  const response = await h.submit("13.50");
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, "OPERATING_CALENDAR_UNAVAILABLE");
  assert.equal(h.writes.length, 0);
  assert.equal(h.stripeRequests.length, 0);
});

test("la entrega conserva su horario global aunque la modalidad local siga abierta", async (t) => {
  const h = checkoutHarness(t, dailyMenu, "bureau-veritas", true, [dailyMenu], { deliveryOpen: false });
  const response = await h.submit("13.50");
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, "ORDER_WINDOW_CLOSED");
  assert.equal(h.writes.length, 0);
});

test("despliegue gradual: entrega reintenta sin columnas locales para mantener compatibilidad", async (t) => {
  const missingColumn: DatabaseError = {
    code: "PGRST204",
    message: "Could not find the 'menu_selection_mode' column of 'orders' in the schema cache"
  };
  const delivery = checkoutHarness(t, dailyMenu, "bureau-veritas", true, [dailyMenu], {
    orderInsertErrors: [missingColumn]
  });
  const deliveryResponse = await delivery.submit("13.50");
  assert.equal(deliveryResponse.status, 200, JSON.stringify(await deliveryResponse.clone().json()));
  assert.equal(delivery.orderInsertAttempts(), 2);
  const deliveryInserts = delivery.writes.filter((write) => write.table === "orders" && write.action === "insert");
  assert.equal((deliveryInserts[0].value as Row).fulfillment_type, "delivery");
  assert.equal("fulfillment_type" in (deliveryInserts[1].value as Row), false);
});

test("despliegue gradual: un pedido local nunca pierde su modalidad si faltan columnas", async (t) => {
  const missingColumn: DatabaseError = {
    code: "PGRST204",
    message: "Could not find the 'menu_selection_mode' column of 'orders' in the schema cache"
  };
  const local = checkoutHarness(t, halfMenu, "bureau-veritas", true, [halfMenu], {
    orderInsertErrors: [missingColumn]
  });
  const localResponse = await local.submitItems([{
    product_id: halfMenu.id,
    quantity: 1,
    metadata: { plate: "Pasta", _configured_unit_price: "10.00" }
  }], { fulfillment_type: "pickup", requested_time: "13:15" });
  assert.equal(localResponse.status, 503);
  assert.equal((await localResponse.json()).code, "LOCAL_ORDERING_NOT_READY");
  assert.equal(local.orderInsertAttempts(), 1);
  assert.equal(local.stripeRequests.length, 0);
  assert.equal(local.writes.some((write) => write.table === "order_items"), false);
});

test("un producto de carta se puede comprar sin consultar el menú diario", async (t) => {
  const h = checkoutHarness(t, bowl, "bureau-veritas", true, [bowl], { menu: null, menuReadError: true });
  const response = await h.submit("10.50");
  assert.equal(response.status, 200);
  assert.equal((await response.json()).order.employee_total, 10.5);
  assert.deepEqual(h.menuReads, []);
  assert.equal(h.stripeRequests[0].get("line_items[0][price_data][unit_amount]"), "1050");
});

const saladCheckoutCases = [
  { product: dailyMenu, size: "Tamaño Pequeño 750ML", singleAllowed: true, price: 13.5, course: { first_course: "Ensalada a tu manera" } },
  { product: halfMenu, size: "Tamaño Mediano 1000ML", singleAllowed: false, price: 10, course: { plate: "Ensalada a tu manera" } },
  { product: { id: "salad", name: "Diseña tu ensalada", product_type: "standard", base_price: 7.5 }, size: "Tamaño Mediano 1000ML", singleAllowed: false, price: 7.5 },
  { product: { id: "salad", name: "Diseña tu ensalada", product_type: "standard", base_price: 7.5 }, size: "Tamaño Grande 1500ML", singleAllowed: false, price: 9.5 },
  { product: saladSandwichMenu, size: "Tamaño Pequeño 750ML", singleAllowed: true, price: 10 }
];

for (const scenario of saladCheckoutCases) {
  test(`${scenario.product.name} ${scenario.size}: valida las bases antes de cobrar y conserva ingredientes y precio`, async (t) => {
    const h = checkoutHarness(t, scenario.product);
    const metadata: Record<string, string> = {
      ...(scenario.course as Record<string, string> | undefined),
      salad_size: scenario.size, protein: "Pollo", toppings: "Garbanzos, Tomate, Pepino",
      dressing: "Vinagreta balsámica",
      ...(scenario.product === saladSandwichMenu ? { sandwich: "Bocadillo de jamón serrano" } : {})
    };
    const restricted = ["Quinoa", "Arroz blanco", "Arroz integral", "Garbanzos", "Lentejas"];
    const rejected = ["Quinoa, Quinoa", "Garbanzos, Garbanzos", "Quinoa, Pasta, Lentejas", ...(!scenario.singleAllowed ? restricted : [])];
    for (const bases of rejected) {
      const response = await h.submit(String(scenario.price), { ...metadata, salad_base: bases });
      assert.equal(response.status, 400, bases);
      assert.equal(h.writes.length, 0);
      assert.equal(h.stripeRequests.length, 0);
      assert.equal(h.emailCalls(), 0);
    }
    if (!scenario.singleAllowed) {
      const forgedSize = await h.submit(String(scenario.price), { ...metadata, salad_base: "Quinoa", salad_size: "Tamaño Pequeño 750ML" });
      assert.equal(forgedSize.status, 400);
      assert.equal(h.writes.length, 0);
    }
    for (const bases of ["Mézclum", "Garbanzos, Lentejas", "Quinoa, Arroz integral", ...(scenario.singleAllowed ? restricted : [])]) {
      const response = await h.submit(String(scenario.price), { ...metadata, salad_base: bases });
      assert.equal(response.status, 200, bases);
      assert.equal((await response.json()).order.subtotal, scenario.price);
      const latestLines = h.writes.filter((write) => write.table === "order_items").at(-1)?.value as Row[];
      assert.equal((latestLines[0].metadata as Row).salad_base, bases);
      assert.equal(latestLines[0].unit_price, scenario.price);
    }
  });
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

for (const price of ["13.00", "13.20", "13.49", "13.51", "0", "-1", "NaN"]) {
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
  test(`${product.name}: el nombre con erratas no permite omitir ingredientes ni suplementos`, async (t) => {
    const h = checkoutHarness(t, product);
    const selection = { [product.product_type === "daily_menu" ? "first_course" : "plate"]: "ENSALDA A TUU MANERA" };
    const incomplete = await h.submit(String(product.base_price), selection);
    assert.equal(incomplete.status, 400);
    assert.equal(h.writes.length, 0);
    assert.equal(h.stripeRequests.length, 0);

    const configured = {
      ...selection,
      salad_size: product.product_type === "daily_menu" ? "Tamaño Pequeño 750ML" : "Tamaño Mediano 1000ML",
      salad_base: "Arroz blanco, Mézclum",
      protein: "Salmón ahumado",
      toppings: "Maíz",
      dressing: "Mahonesa de soja"
    };
    assert.equal((await h.submit(String(product.base_price), configured)).status, 400);
    assert.equal(h.writes.length, 0);
    assert.equal(h.stripeRequests.length, 0);
    const response = await h.submit((Number(product.base_price) + 2.5).toFixed(2), configured);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).order.subtotal, Number(product.base_price) + 2.5);
  });

  test(`${product.name}: una ensalada de receta fija no exige el configurador`, async (t) => {
    const h = checkoutHarness(t, product);
    const response = await h.submit(String(product.base_price), {
      [product.product_type === "daily_menu" ? "first_course" : "plate"]: "ENSALADA MIXTA ( ATUN Y HUEVO )"
    });
    assert.equal(response.status, 200);
  });

  for (const premium of [false, true]) {
    test(`${product.name} con ensalada${premium ? " premium y cubiertos" : ""}: conserva configuración y usa precio actual`, async (t) => {
      const h = checkoutHarness(t, product);
      const isDaily = product.product_type === "daily_menu";
      const price = (Number(product.base_price) + (premium ? 2.5 + 0.2 : 0)).toFixed(2);
      const response = await h.submit(price, {
        [isDaily ? "first_course" : "plate"]: "ENSALADA A TU MANERA (diseña tu ensalada con tus ingredientes favoritos)",
        salad_size: isDaily ? "Tamaño Pequeño 750ML" : "Tamaño Mediano 1000ML",
        salad_base: "Arroz blanco, Mézclum",
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

test("un carrito antiguo guarda la opción de pan con la codificación correcta", async (t) => {
  const h = checkoutHarness(t);
  const response = await h.submit("13.50", { first_course: "Pasta", bread: "S\u00c3\u00ad" });
  assert.equal(response.status, 200);
  const lines = h.writes.find((write) => write.table === "order_items")?.value as Row[];
  assert.equal((lines[0].metadata as Row).bread, "Sí");
});

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
    key: "old-menu", product_id: h.productId("menu"), name: "Menú del día", product_type: "daily_menu",
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
  {
    product: { id: "sandwich", name: "Escoge tu bocadillo", product_type: "standard", base_price: "6.50" },
    metadata: { sandwich: "Bocadillo de jamón serrano" },
    expected: 6.5
  },
  { product: { id: "grill", name: "Platos combinados Matica", product_type: "standard", base_price: "11.00" }, metadata: { main_protein: "Filete de ternera a la parrilla" }, expected: 12.5 },
  { product: { id: "salad", name: "Diseña tu ensalada", product_type: "standard", base_price: "8.00" }, metadata: { salad_size: "Tamaño Mediano 1000ML", salad_base: "Arroz blanco, Mézclum", protein: "Pollo", toppings: "Maíz", dressing: "Mahonesa de soja" }, expected: 8 }
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

for (const [catalogName, selection] of [
  ["Lipton", "Nestea de limón"],
  ["Nestea de limón", "Lipton"],
  ["Nestea de limón", "Nestea de limón"]
]) {
  test(`cambio a Nestea: catálogo ${catalogName}, cesta ${selection}, mantiene precio`, async (t) => {
    const parent = { id: "selector", name: "Agua mineral", product_type: "drink", base_price: 1.5 };
    const tea = { id: "tea", name: catalogName, product_type: "drink", base_price: 2 };
    const h = checkoutHarness(t, parent, "bureau-veritas", true, [parent, tea]);
    assert.equal((await h.submit("1.50", { drink: selection })).status, 400);
    assert.equal(h.writes.length, 0);
    const response = await h.submit("2.00", { drink: selection });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).order.total, 2);
    assert.equal(h.stripeRequests[0].get("line_items[0][price_data][unit_amount]"), "200");
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
    "@/lib/supabase/server": {
      getSupabaseServerClient: () => supabase,
      getSupabaseAdminClient: () => supabase
    }
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
