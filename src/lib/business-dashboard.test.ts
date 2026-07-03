import assert from "node:assert/strict";
import test from "node:test";
import type { DashboardOrder, DashboardRankingItem } from "./business-dashboard.ts";

const dashboardModulePath = "./business-dashboard.ts";
const { buildBusinessDashboardStats, madridDateToUtcIso, normalizeDashboardName, previousPeriod } = await import(dashboardModulePath);

function item(overrides: Partial<DashboardOrder["order_items"][number]> = {}): DashboardOrder["order_items"][number] {
  return {
    id: `item-${Math.random()}`,
    order_id: "order-id",
    product_id: "product-id",
    name: "Menú del día",
    quantity: 1,
    unit_price: 13,
    base_price: 13,
    subsidy_amount: 4,
    total_price: 13,
    metadata: {
      display_name: "Menú del día",
      first_course: "Gazpacho andaluz",
      second_course: "Pollo al horno",
      drink_or_dessert: "Agua mineral"
    },
    ...overrides
  };
}

function order(overrides: Partial<DashboardOrder> = {}): DashboardOrder {
  return {
    id: `order-${Math.random()}`,
    created_at: "2026-06-10T10:00:00.000Z",
    status_updated_at: null,
    customer_id: null,
    company_id: "bureau",
    company_branch_id: "bureau-madrid",
    customer_name: "Cliente Test",
    customer_email: "cliente@example.com",
    customer_phone: "600000000",
    status: "nuevo",
    payment_method: "stripe_card",
    payment_status: "paid",
    subtotal: 13,
    subsidy_total: 4,
    employee_total: 9,
    company_invoice_total: 4,
    total: 9,
    notes: null,
    delivery_window: "13:00 - 13:30",
    companies: { id: "bureau", name: "Bureau Veritas" },
    company_branches: { id: "bureau-madrid", name: "Bureau Madrid" },
    order_items: [item()],
    ...overrides
  };
}

const sampleOrders: DashboardOrder[] = [
  order({
    id: "old-order",
    created_at: "2026-05-20T10:00:00.000Z",
    customer_email: "old@example.com"
  }),
  order({
    id: "previous-order",
    created_at: "2026-06-04T10:00:00.000Z",
    customer_email: "prev@example.com",
    subtotal: 5,
    subsidy_total: 0,
    employee_total: 5,
    company_invoice_total: 0,
    total: 5,
    order_items: [
      item({
        name: "Cookie",
        unit_price: 5,
        total_price: 5,
        subsidy_amount: 0,
        metadata: { display_name: "Cookie" }
      })
    ]
  }),
  order({
    id: "current-old-customer",
    created_at: "2026-06-10T10:00:00.000Z",
    customer_email: "old@example.com"
  }),
  order({
    id: "current-new-customer",
    created_at: "2026-06-11T10:00:00.000Z",
    customer_email: "new@example.com",
    order_items: [
      item({
        name: "menu del dia",
        metadata: {
          display_name: " menu DEL día ",
          first_course: "gazpacho andaluz ",
          second_course: "POLLO AL HORNO",
          drink_or_dessert: "AGUA mineral"
        }
      })
    ]
  }),
  order({
    id: "icf-company-paid",
    created_at: "2026-06-12T10:00:00.000Z",
    company_id: "icf",
    company_branch_id: "icf-main",
    customer_email: "icf@example.com",
    payment_method: "pay_on_delivery",
    payment_status: "pending",
    subtotal: 10,
    subsidy_total: 0,
    employee_total: 0,
    company_invoice_total: 10,
    total: 0,
    companies: { id: "icf", name: "ICF" },
    company_branches: { id: "icf-main", name: "ICF" },
    order_items: [
      item({
        name: "Diseña tu wrap",
        unit_price: 10,
        total_price: 10,
        subsidy_amount: 0,
        metadata: { display_name: "Diseña tu wrap", drink: "Coca Cola" }
      })
    ]
  }),
  order({
    id: "cancelled-order",
    created_at: "2026-06-12T10:00:00.000Z",
    status: "cancelado",
    subtotal: 99,
    total: 99
  }),
  order({
    id: "pending-stripe-order",
    created_at: "2026-06-12T10:00:00.000Z",
    status: "pendiente_pago",
    payment_method: "stripe_card",
    payment_status: "pending",
    subtotal: 99,
    total: 99
  })
];

test("calcula KPIs solo con pedidos económicamente válidos", () => {
  const stats = buildBusinessDashboardStats({
    orders: sampleOrders,
    period: { from: "2026-06-08", to: "2026-06-14" },
    comparisonPeriod: previousPeriod({ from: "2026-06-08", to: "2026-06-14" })
  });

  assert.equal(stats.kpis.orders.value, 3);
  assert.equal(stats.kpis.grossRevenue.value, 36);
  assert.equal(stats.kpis.companyInvoice.value, 18);
  assert.equal(stats.kpis.employeeCollected.value, 18);
  assert.equal(stats.kpis.subsidyTotal.value, 8);
  assert.equal(stats.kpis.averageTicket.value, 12);
  assert.equal(stats.kpis.newCustomers.value, 2);
  assert.equal(stats.kpis.orders.previousValue, 1);
  assert.equal(stats.kpis.orders.changePercent, 200);
});

test("periodo sin datos devuelve ceros y listas vacías", () => {
  const stats = buildBusinessDashboardStats({
    orders: sampleOrders,
    period: { from: "2026-07-01", to: "2026-07-03" }
  });

  assert.equal(stats.kpis.orders.value, 0);
  assert.equal(stats.kpis.grossRevenue.value, 0);
  assert.equal(stats.evolution.length, 3);
  assert.deepEqual(stats.rankings.products, []);
  assert.deepEqual(stats.clients, []);
});

test("evita porcentajes engañosos cuando el periodo anterior es cero", () => {
  const stats = buildBusinessDashboardStats({
    orders: sampleOrders,
    period: { from: "2026-06-08", to: "2026-06-14" },
    comparisonPeriod: { from: "2026-06-01", to: "2026-06-03" }
  });

  assert.equal(stats.kpis.orders.previousValue, 0);
  assert.equal(stats.kpis.orders.changePercent, null);
  assert.equal(stats.kpis.orders.comparisonLabel, "Sin periodo anterior comparable");
});

test("normaliza rankings de productos, primeros, segundos y bebidas sin tocar datos", () => {
  const stats = buildBusinessDashboardStats({
    orders: sampleOrders,
    period: { from: "2026-06-08", to: "2026-06-14" }
  });

  assert.equal(stats.rankings.products[0].key, "menu del dia");
  assert.equal(stats.rankings.products[0].units, 2);
  assert.equal(stats.rankings.products[0].revenue, 26);
  assert.equal(stats.rankings.firstCourses[0].key, "gazpacho andaluz");
  assert.equal(stats.rankings.firstCourses[0].units, 2);
  assert.equal(stats.rankings.firstCourses[0].percentage, 100);
  assert.equal(stats.rankings.secondCourses[0].key, "pollo al horno");
  assert.equal(stats.rankings.secondCourses[0].units, 2);
  assert.equal(stats.rankings.drinks.find((row: { key: string }) => row.key === "agua mineral")?.units, 2);
  assert.equal(stats.rankings.drinks.find((row: { key: string }) => row.key === "coca cola")?.units, 1);
  assert.equal(normalizeDashboardName("  Menú  DEL Día "), "menu del dia");
});

test("filtra por cliente principal y por empresa interna", () => {
  const clientStats = buildBusinessDashboardStats({
    orders: sampleOrders,
    period: { from: "2026-06-08", to: "2026-06-14" },
    clientId: "bureau"
  });

  assert.equal(clientStats.kpis.orders.value, 2);
  assert.equal(clientStats.kpis.grossRevenue.value, 26);
  assert.equal(clientStats.clients.length, 1);
  assert.equal(clientStats.clients[0].name, "Bureau Madrid");

  const branchStats = buildBusinessDashboardStats({
    orders: sampleOrders,
    period: { from: "2026-06-08", to: "2026-06-14" },
    clientId: "bureau",
    companyId: "missing-branch"
  });

  assert.equal(branchStats.kpis.orders.value, 0);
});

test("clientes nuevos usa el primer pedido valido historico segun el alcance activo", () => {
  const orders: DashboardOrder[] = [
    order({
      id: "global-first-bureau",
      created_at: "2026-06-01T10:00:00.000Z",
      company_id: "bureau",
      company_branch_id: "bureau-madrid",
      customer_email: "shared@example.com"
    }),
    order({
      id: "later-icf-same-email",
      created_at: "2026-06-10T10:00:00.000Z",
      company_id: "icf",
      company_branch_id: "icf-main",
      customer_email: "shared@example.com",
      payment_method: "pay_on_delivery",
      payment_status: "pending",
      subtotal: 10,
      subsidy_total: 0,
      employee_total: 0,
      company_invoice_total: 10,
      total: 0,
      companies: { id: "icf", name: "ICF" },
      company_branches: { id: "icf-main", name: "ICF" }
    }),
    order({
      id: "later-bureau-other-branch-same-email",
      created_at: "2026-06-11T10:00:00.000Z",
      company_id: "bureau",
      company_branch_id: "bureau-barcelona",
      customer_email: "branch-scope@example.com",
      company_branches: { id: "bureau-barcelona", name: "Bureau Barcelona" }
    }),
    order({
      id: "first-bureau-madrid-same-email",
      created_at: "2026-06-12T10:00:00.000Z",
      company_id: "bureau",
      company_branch_id: "bureau-madrid",
      customer_email: "branch-scope@example.com"
    }),
    order({
      id: "invalid-pending-before-valid",
      created_at: "2026-06-02T10:00:00.000Z",
      customer_email: "invalid-before@example.com",
      status: "pendiente_pago",
      payment_method: "stripe_card",
      payment_status: "pending"
    }),
    order({
      id: "invalid-cancelled-before-valid",
      created_at: "2026-06-03T10:00:00.000Z",
      customer_email: "invalid-before@example.com",
      status: "cancelado",
      payment_method: "stripe_card",
      payment_status: "cancelled"
    }),
    order({
      id: "valid-after-invalid",
      created_at: "2026-06-13T10:00:00.000Z",
      customer_email: "invalid-before@example.com"
    })
  ];

  const period = { from: "2026-06-10", to: "2026-06-14" };

  const allClients = buildBusinessDashboardStats({ orders, period });
  const icfOnly = buildBusinessDashboardStats({ orders, period, clientId: "icf" });
  const bureauOnly = buildBusinessDashboardStats({ orders, period, clientId: "bureau" });
  const bureauMadridOnly = buildBusinessDashboardStats({
    orders,
    period,
    clientId: "bureau",
    companyId: "bureau-madrid"
  });

  assert.equal(allClients.kpis.newCustomers.value, 2);
  assert.equal(icfOnly.kpis.newCustomers.value, 1);
  assert.equal(bureauOnly.kpis.newCustomers.value, 2);
  assert.equal(bureauMadridOnly.kpis.newCustomers.value, 2);
});

test("ranking de productos usa cantidades e importes de linea sin duplicar facturacion del pedido", () => {
  const multiProductOrder = order({
    id: "multi-product-order",
    created_at: "2026-06-15T10:00:00.000Z",
    subtotal: 48,
    subsidy_total: 4,
    employee_total: 44,
    company_invoice_total: 4,
    total: 44,
    order_items: [
      item({
        id: "menus",
        name: "Menú del día",
        quantity: 3,
        unit_price: 13,
        subsidy_amount: 4,
        total_price: 35,
        metadata: { display_name: "Menú del día", first_course: "Crema", second_course: "Pollo", drink_or_dessert: "Agua" }
      }),
      item({
        id: "wrap",
        name: "Diseña tu wrap",
        quantity: 1,
        unit_price: 9,
        subsidy_amount: 0,
        total_price: 9,
        metadata: { display_name: "Diseña tu wrap", _supplement_total: "1.50", drink: "Coca Cola" }
      }),
      item({
        id: "free-product",
        name: "Producto promocional",
        quantity: 2,
        unit_price: 0,
        subsidy_amount: 0,
        total_price: 0,
        metadata: { display_name: "Producto promocional" }
      })
    ]
  });

  const stats = buildBusinessDashboardStats({
    orders: [multiProductOrder],
    period: { from: "2026-06-15", to: "2026-06-15" }
  });
  const productRows = stats.rankings.products as DashboardRankingItem[];
  const products = new Map<string, DashboardRankingItem>(productRows.map((row) => [row.key, row]));
  const attributedRevenue = productRows.reduce((sum: number, row: DashboardRankingItem) => Number((sum + row.revenue).toFixed(2)), 0);

  assert.equal(stats.kpis.orders.value, 1);
  assert.equal(stats.kpis.grossRevenue.value, 48);
  assert.equal(products.get("menu del dia")?.units, 3);
  assert.equal(products.get("menu del dia")?.revenue, 35);
  assert.equal(products.get("disena tu wrap")?.units, 1);
  assert.equal(products.get("disena tu wrap")?.revenue, 9);
  assert.equal(products.get("producto promocional")?.units, 2);
  assert.equal(products.get("producto promocional")?.revenue, 0);
  assert.equal(attributedRevenue, 44);
  assert.notEqual(products.get("menu del dia")?.revenue, multiProductOrder.subtotal);
});

test("pedidos y totales cuadran con las reglas de informes para BV, ICF y pedidos invalidos", () => {
  const orders: DashboardOrder[] = [
    order({
      id: "bv-paid",
      created_at: "2026-06-16T10:00:00.000Z",
      subtotal: 13,
      subsidy_total: 4,
      employee_total: 9,
      company_invoice_total: 4,
      total: 9
    }),
    order({
      id: "bv-pending",
      created_at: "2026-06-16T10:05:00.000Z",
      status: "pendiente_pago",
      payment_method: "stripe_card",
      payment_status: "pending",
      subtotal: 13,
      subsidy_total: 4,
      employee_total: 9,
      company_invoice_total: 4,
      total: 9
    }),
    order({
      id: "icf-valid",
      created_at: "2026-06-16T10:10:00.000Z",
      company_id: "icf",
      company_branch_id: "icf-main",
      payment_method: "pay_on_delivery",
      payment_status: "pending",
      subtotal: 10,
      subsidy_total: 0,
      employee_total: 0,
      company_invoice_total: 10,
      total: 0,
      companies: { id: "icf", name: "ICF" },
      company_branches: { id: "icf-main", name: "ICF" },
      order_items: [
        item({
          name: "Medio menú",
          unit_price: 10,
          total_price: 10,
          subsidy_amount: 0,
          metadata: { display_name: "Medio menú" }
        })
      ]
    }),
    order({
      id: "cancelled",
      created_at: "2026-06-16T10:15:00.000Z",
      status: "cancelado",
      subtotal: 99,
      subsidy_total: 99,
      employee_total: 99,
      company_invoice_total: 99,
      total: 99
    })
  ];

  const stats = buildBusinessDashboardStats({
    orders,
    period: { from: "2026-06-16", to: "2026-06-16" },
    comparisonPeriod: { from: "2026-06-15", to: "2026-06-15" }
  });
  const bureauStats = buildBusinessDashboardStats({
    orders,
    period: { from: "2026-06-16", to: "2026-06-16" },
    clientId: "bureau"
  });
  const icfStats = buildBusinessDashboardStats({
    orders,
    period: { from: "2026-06-16", to: "2026-06-16" },
    clientId: "icf"
  });
  const emptyStats = buildBusinessDashboardStats({
    orders,
    period: { from: "2026-06-17", to: "2026-06-17" }
  });

  assert.equal(stats.kpis.orders.value, 2);
  assert.equal(stats.kpis.grossRevenue.value, 23);
  assert.equal(stats.kpis.companyInvoice.value, 14);
  assert.equal(stats.kpis.employeeCollected.value, 9);
  assert.equal(stats.kpis.subsidyTotal.value, 4);
  assert.equal(stats.kpis.averageTicket.value, 11.5);
  assert.equal(stats.kpis.grossRevenue.previousValue, 0);
  assert.equal(stats.kpis.grossRevenue.comparisonLabel, "Sin periodo anterior comparable");
  assert.equal(bureauStats.kpis.orders.value, 1);
  assert.equal(bureauStats.kpis.grossRevenue.value, 13);
  assert.equal(bureauStats.kpis.companyInvoice.value, 4);
  assert.equal(bureauStats.kpis.employeeCollected.value, 9);
  assert.equal(bureauStats.kpis.subsidyTotal.value, 4);
  assert.equal(icfStats.kpis.orders.value, 1);
  assert.equal(icfStats.kpis.grossRevenue.value, 10);
  assert.equal(icfStats.kpis.companyInvoice.value, 10);
  assert.equal(icfStats.kpis.employeeCollected.value, 0);
  assert.equal(icfStats.kpis.subsidyTotal.value, 0);
  assert.equal(emptyStats.kpis.orders.value, 0);
  assert.equal(emptyStats.kpis.grossRevenue.value, 0);
});

test("fechas Madrid son inclusivas y la comparacion usa los dias inmediatamente anteriores", () => {
  const period = { from: "2026-07-01", to: "2026-07-07" };
  const stats = buildBusinessDashboardStats({
    orders: [
      order({
        id: "late-june-30-utc-july-1-madrid",
        created_at: "2026-06-30T22:30:00.000Z"
      }),
      order({
        id: "late-july-7-madrid",
        created_at: "2026-07-07T21:59:59.999Z"
      }),
      order({
        id: "july-8-madrid",
        created_at: "2026-07-07T22:00:00.000Z"
      }),
      order({
        id: "comparison-june-24",
        created_at: "2026-06-23T22:30:00.000Z"
      }),
      order({
        id: "comparison-june-30",
        created_at: "2026-06-30T21:59:59.999Z"
      })
    ],
    period,
    comparisonPeriod: previousPeriod(period)
  });

  assert.deepEqual(previousPeriod(period), { from: "2026-06-24", to: "2026-06-30" });
  assert.equal(madridDateToUtcIso("2026-07-01"), "2026-06-30T22:00:00.000Z");
  assert.equal(stats.kpis.orders.value, 2);
  assert.equal(stats.kpis.orders.previousValue, 2);
  assert.equal(stats.evolution[0].date, "2026-07-01");
  assert.equal(stats.evolution[0].orders, 1);
  assert.equal(stats.evolution[0].comparisonDate, "2026-06-24");
  assert.equal(stats.evolution[0].ordersComparison, 1);
});
