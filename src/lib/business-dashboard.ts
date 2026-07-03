import { orderCompanyInvoiceTotal, orderEmployeeTotal } from "./order-ticket.ts";
import { isBillableOrder } from "./order-validity.ts";
import type { AdminOrder, Company, CompanyBranch, OrderItem } from "./types.ts";

export const DASHBOARD_TIME_ZONE = "Europe/Madrid";

export type DashboardOrder = Omit<AdminOrder, "companies" | "company_branches"> & {
  companies?: { id?: string; name: string } | null;
  company_branches?: { id?: string; name: string } | null;
};

export type DashboardPeriod = {
  from: string;
  to: string;
};

export type DashboardFilters = DashboardPeriod & {
  clientId?: string;
  companyId?: string;
  compare?: boolean;
};

export type DashboardKpiKey =
  | "grossRevenue"
  | "orders"
  | "averageTicket"
  | "newCustomers"
  | "companyInvoice"
  | "employeeCollected"
  | "subsidyTotal";

export type DashboardKpiValue = {
  value: number;
  previousValue: number | null;
  changePercent: number | null;
  trend: "positive" | "negative" | "neutral";
  comparisonLabel: string | null;
};

export type DashboardKpis = Record<DashboardKpiKey, DashboardKpiValue>;

export type DashboardEvolutionPoint = {
  date: string;
  comparisonDate: string | null;
  orders: number;
  ordersComparison: number | null;
  grossRevenue: number;
  grossRevenueComparison: number | null;
  averageTicket: number;
  averageTicketComparison: number | null;
};

export type DashboardRankingItem = {
  key: string;
  name: string;
  units: number;
  revenue: number;
  percentage?: number;
};

export type DashboardClientSummary = {
  key: string;
  name: string;
  parentName?: string;
  orderCount: number;
  grossRevenue: number;
  companyInvoice: number;
  employeeTotal: number;
  averageTicket: number;
  uniqueCustomers: number;
};

export type DashboardStats = {
  period: DashboardPeriod;
  comparisonPeriod: DashboardPeriod | null;
  kpis: DashboardKpis;
  evolution: DashboardEvolutionPoint[];
  rankings: {
    products: DashboardRankingItem[];
    firstCourses: DashboardRankingItem[];
    secondCourses: DashboardRankingItem[];
    drinks: DashboardRankingItem[];
  };
  clients: DashboardClientSummary[];
};

type DashboardStatsInput = {
  orders: DashboardOrder[];
  period: DashboardPeriod;
  comparisonPeriod?: DashboardPeriod | null;
  clientId?: string;
  companyId?: string;
};

type MetricSummary = {
  grossRevenue: number;
  orders: number;
  averageTicket: number;
  newCustomers: number;
  companyInvoice: number;
  employeeCollected: number;
  subsidyTotal: number;
};

const ZERO_SUMMARY: MetricSummary = {
  grossRevenue: 0,
  orders: 0,
  averageTicket: 0,
  newCustomers: 0,
  companyInvoice: 0,
  employeeCollected: 0,
  subsidyTotal: 0
};

const DESSERT_SELECTIONS = new Set([
  "cookie",
  "flan",
  "flan de queso",
  "gelatina",
  "manzana",
  "natillas",
  "platano",
  "yogur de frutas"
]);

function roundMoney(value: number) {
  return Number(value.toFixed(2));
}

function roundPercent(value: number) {
  return Number(value.toFixed(1));
}

export function isDateInput(value: string | null | undefined) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

export function currentMadridDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: DASHBOARD_TIME_ZONE,
    year: "numeric"
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";

  return `${get("year")}-${get("month")}-${get("day")}`;
}

function getTimeZoneOffsetMs(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone,
    year: "numeric"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const asUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second)
  );

  return asUtc - date.getTime();
}

export function addDays(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);

  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

export function daysInPeriod(period: DashboardPeriod) {
  const from = new Date(`${period.from}T00:00:00.000Z`).getTime();
  const to = new Date(`${period.to}T00:00:00.000Z`).getTime();

  return Math.max(1, Math.round((to - from) / 86_400_000) + 1);
}

export function previousPeriod(period: DashboardPeriod): DashboardPeriod {
  const duration = daysInPeriod(period);

  return {
    from: addDays(period.from, -duration),
    to: addDays(period.from, -1)
  };
}

export function madridDateToUtcIso(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  const utcGuess = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  const offset = getTimeZoneOffsetMs(utcGuess, DASHBOARD_TIME_ZONE);

  return new Date(utcGuess.getTime() - offset).toISOString();
}

export function orderMadridDate(order: Pick<AdminOrder, "created_at">) {
  return new Intl.DateTimeFormat("sv-SE", {
    day: "2-digit",
    month: "2-digit",
    timeZone: DASHBOARD_TIME_ZONE,
    year: "numeric"
  }).format(new Date(order.created_at));
}

export function normalizeDashboardName(value: string) {
  return value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function canonicalDashboardName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function inPeriod(order: DashboardOrder, period: DashboardPeriod) {
  const date = orderMadridDate(order);

  return date >= period.from && date <= period.to;
}

function filteredOrders(orders: DashboardOrder[], clientId?: string, companyId?: string) {
  return orders.filter((order) => {
    if (clientId && order.company_id !== clientId) {
      return false;
    }

    if (companyId && order.company_branch_id !== companyId) {
      return false;
    }

    return isBillableOrder(order);
  });
}

function customerEmail(order: DashboardOrder) {
  return order.customer_email.trim().toLowerCase();
}

function addMoney(a: number, b: number) {
  return roundMoney(a + Number(b ?? 0));
}

function summarizeOrders(orders: DashboardOrder[], allValidOrders: DashboardOrder[], period: DashboardPeriod): MetricSummary {
  const summary = { ...ZERO_SUMMARY };
  const orderIds = new Set<string>();

  for (const order of orders) {
    orderIds.add(order.id);
    summary.grossRevenue = addMoney(summary.grossRevenue, Number(order.subtotal));
    summary.companyInvoice = addMoney(summary.companyInvoice, orderCompanyInvoiceTotal(order));
    summary.employeeCollected = addMoney(summary.employeeCollected, orderEmployeeTotal(order));
    summary.subsidyTotal = addMoney(summary.subsidyTotal, Number(order.subsidy_total));
  }

  summary.orders = orderIds.size;
  summary.averageTicket = summary.orders ? roundMoney(summary.grossRevenue / summary.orders) : 0;

  const firstOrderByEmail = new Map<string, string>();

  for (const order of allValidOrders) {
    const email = customerEmail(order);

    if (!email) {
      continue;
    }

    const date = orderMadridDate(order);
    const current = firstOrderByEmail.get(email);

    if (!current || date < current) {
      firstOrderByEmail.set(email, date);
    }
  }

  summary.newCustomers = Array.from(firstOrderByEmail.values()).filter(
    (date) => date >= period.from && date <= period.to
  ).length;

  return summary;
}

function kpiValue(value: number, previousValue: number | null): DashboardKpiValue {
  if (previousValue === null) {
    return {
      value,
      previousValue,
      changePercent: null,
      trend: "neutral",
      comparisonLabel: null
    };
  }

  if (previousValue === 0) {
    return {
      value,
      previousValue,
      changePercent: null,
      trend: value === 0 ? "neutral" : "positive",
      comparisonLabel: "Sin periodo anterior comparable"
    };
  }

  const changePercent = roundPercent(((value - previousValue) / Math.abs(previousValue)) * 100);

  return {
    value,
    previousValue,
    changePercent,
    trend: changePercent > 0 ? "positive" : changePercent < 0 ? "negative" : "neutral",
    comparisonLabel: null
  };
}

function buildKpis(current: MetricSummary, previous: MetricSummary | null): DashboardKpis {
  return {
    grossRevenue: kpiValue(current.grossRevenue, previous?.grossRevenue ?? null),
    orders: kpiValue(current.orders, previous?.orders ?? null),
    averageTicket: kpiValue(current.averageTicket, previous?.averageTicket ?? null),
    newCustomers: kpiValue(current.newCustomers, previous?.newCustomers ?? null),
    companyInvoice: kpiValue(current.companyInvoice, previous?.companyInvoice ?? null),
    employeeCollected: kpiValue(current.employeeCollected, previous?.employeeCollected ?? null),
    subsidyTotal: kpiValue(current.subsidyTotal, previous?.subsidyTotal ?? null)
  };
}

function ordersByDate(orders: DashboardOrder[]) {
  const byDate = new Map<string, MetricSummary>();

  for (const order of orders) {
    const date = orderMadridDate(order);
    const current = byDate.get(date) ?? { ...ZERO_SUMMARY };

    current.orders += 1;
    current.grossRevenue = addMoney(current.grossRevenue, Number(order.subtotal));
    current.companyInvoice = addMoney(current.companyInvoice, orderCompanyInvoiceTotal(order));
    current.employeeCollected = addMoney(current.employeeCollected, orderEmployeeTotal(order));
    current.subsidyTotal = addMoney(current.subsidyTotal, Number(order.subsidy_total));
    current.averageTicket = current.orders ? roundMoney(current.grossRevenue / current.orders) : 0;
    byDate.set(date, current);
  }

  return byDate;
}

function buildEvolution(
  currentOrders: DashboardOrder[],
  comparisonOrders: DashboardOrder[],
  period: DashboardPeriod,
  comparisonPeriod: DashboardPeriod | null
) {
  const currentByDate = ordersByDate(currentOrders);
  const comparisonByDate = ordersByDate(comparisonOrders);
  const duration = daysInPeriod(period);

  return Array.from({ length: duration }, (_, index): DashboardEvolutionPoint => {
    const date = addDays(period.from, index);
    const comparisonDate = comparisonPeriod ? addDays(comparisonPeriod.from, index) : null;
    const current = currentByDate.get(date) ?? ZERO_SUMMARY;
    const comparison = comparisonDate ? comparisonByDate.get(comparisonDate) ?? ZERO_SUMMARY : null;

    return {
      date,
      comparisonDate,
      orders: current.orders,
      ordersComparison: comparison ? comparison.orders : null,
      grossRevenue: current.grossRevenue,
      grossRevenueComparison: comparison ? comparison.grossRevenue : null,
      averageTicket: current.averageTicket,
      averageTicketComparison: comparison ? comparison.averageTicket : null
    };
  });
}

function itemDisplayName(item: OrderItem) {
  return canonicalDashboardName(item.metadata?.display_name || item.name);
}

function addRanking(
  map: Map<string, DashboardRankingItem & { canonicalCount: Map<string, number> }>,
  rawName: string,
  units: number,
  revenue = 0
) {
  const canonical = canonicalDashboardName(rawName);
  const key = normalizeDashboardName(canonical);

  if (!key || units <= 0) {
    return;
  }

  const current =
    map.get(key) ??
    {
      key,
      name: canonical,
      units: 0,
      revenue: 0,
      canonicalCount: new Map<string, number>()
    };

  current.units += units;
  current.revenue = addMoney(current.revenue, revenue);
  current.canonicalCount.set(canonical, (current.canonicalCount.get(canonical) ?? 0) + units);
  current.name = Array.from(current.canonicalCount.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es"))[0][0];
  map.set(key, current);
}

function rankingRows(map: Map<string, DashboardRankingItem & { canonicalCount: Map<string, number> }>, withPercentage = false) {
  const total = Array.from(map.values()).reduce((sum, item) => sum + item.units, 0);

  return Array.from(map.values())
    .map(({ canonicalCount: _canonicalCount, ...item }) => ({
      ...item,
      units: roundMoney(item.units),
      revenue: roundMoney(item.revenue),
      ...(withPercentage ? { percentage: total ? roundPercent((item.units / total) * 100) : 0 } : {})
    }))
    .sort((a, b) => b.units - a.units || b.revenue - a.revenue || a.name.localeCompare(b.name, "es"))
    .slice(0, 12);
}

function metadataQuantityValues(item: OrderItem, key: string) {
  const value = item.metadata?.[key]?.trim();

  if (!value) {
    return [];
  }

  return value
    .split(/\r?\n/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((name) => ({ name, units: Number(item.quantity) }));
}

function isDessertSelection(value: string) {
  return DESSERT_SELECTIONS.has(normalizeDashboardName(value));
}

function buildRankings(orders: DashboardOrder[]) {
  const products = new Map<string, DashboardRankingItem & { canonicalCount: Map<string, number> }>();
  const firstCourses = new Map<string, DashboardRankingItem & { canonicalCount: Map<string, number> }>();
  const secondCourses = new Map<string, DashboardRankingItem & { canonicalCount: Map<string, number> }>();
  const drinks = new Map<string, DashboardRankingItem & { canonicalCount: Map<string, number> }>();

  for (const order of orders) {
    for (const item of order.order_items ?? []) {
      const quantity = Number(item.quantity);

      addRanking(products, itemDisplayName(item), quantity, Number(item.total_price));

      for (const selection of metadataQuantityValues(item, "first_course")) {
        addRanking(firstCourses, selection.name, selection.units);
      }

      for (const selection of metadataQuantityValues(item, "second_course")) {
        addRanking(secondCourses, selection.name, selection.units);
      }

      const drinkOrDessert = item.metadata?.drink_or_dessert?.trim();

      if (drinkOrDessert && !isDessertSelection(drinkOrDessert)) {
        addRanking(drinks, drinkOrDessert, quantity);
      }

      for (const selection of metadataQuantityValues(item, "drink")) {
        addRanking(drinks, selection.name, selection.units);
      }
    }
  }

  return {
    products: rankingRows(products),
    firstCourses: rankingRows(firstCourses, true),
    secondCourses: rankingRows(secondCourses, true),
    drinks: rankingRows(drinks)
  };
}

function buildClientSummaries(orders: DashboardOrder[], selectedClientId?: string) {
  const rows = new Map<string, DashboardClientSummary & { orderIds: Set<string>; customerEmails: Set<string> }>();

  for (const order of orders) {
    const groupByBranch = Boolean(selectedClientId);
    const key = groupByBranch ? order.company_branch_id ?? "no-branch" : order.company_id;
    const name = groupByBranch ? order.company_branches?.name ?? "Sin empresa interna" : order.companies?.name ?? "Sin cliente principal";
    const parentName = groupByBranch ? order.companies?.name ?? "Cliente principal" : undefined;
    const row =
      rows.get(key) ??
      {
        key,
        name,
        parentName,
        orderCount: 0,
        grossRevenue: 0,
        companyInvoice: 0,
        employeeTotal: 0,
        averageTicket: 0,
        uniqueCustomers: 0,
        orderIds: new Set<string>(),
        customerEmails: new Set<string>()
      };

    row.orderIds.add(order.id);
    row.customerEmails.add(customerEmail(order));
    row.grossRevenue = addMoney(row.grossRevenue, Number(order.subtotal));
    row.companyInvoice = addMoney(row.companyInvoice, orderCompanyInvoiceTotal(order));
    row.employeeTotal = addMoney(row.employeeTotal, orderEmployeeTotal(order));
    rows.set(key, row);
  }

  return Array.from(rows.values())
    .map(({ orderIds, customerEmails, ...row }) => ({
      ...row,
      orderCount: orderIds.size,
      uniqueCustomers: Array.from(customerEmails).filter(Boolean).length,
      averageTicket: orderIds.size ? roundMoney(row.grossRevenue / orderIds.size) : 0
    }))
    .sort((a, b) => b.grossRevenue - a.grossRevenue || a.name.localeCompare(b.name, "es"));
}

export function buildBusinessDashboardStats({
  orders,
  period,
  comparisonPeriod = null,
  clientId,
  companyId
}: DashboardStatsInput): DashboardStats {
  const allValidOrders = filteredOrders(orders, clientId, companyId);
  const currentOrders = allValidOrders.filter((order) => inPeriod(order, period));
  const comparisonOrders = comparisonPeriod ? allValidOrders.filter((order) => inPeriod(order, comparisonPeriod)) : [];
  const currentSummary = summarizeOrders(currentOrders, allValidOrders, period);
  const comparisonSummary = comparisonPeriod ? summarizeOrders(comparisonOrders, allValidOrders, comparisonPeriod) : null;

  return {
    period,
    comparisonPeriod,
    kpis: buildKpis(currentSummary, comparisonSummary),
    evolution: buildEvolution(currentOrders, comparisonOrders, period, comparisonPeriod),
    rankings: buildRankings(currentOrders),
    clients: buildClientSummaries(currentOrders, clientId)
  };
}

export function dashboardOptions(companies: Company[], branches: CompanyBranch[]) {
  return {
    companies: companies
      .map((company) => ({ id: company.id, name: company.name, slug: company.slug, active: company.active }))
      .sort((a, b) => a.name.localeCompare(b.name, "es")),
    branches: branches
      .map((branch) => ({ id: branch.id, company_id: branch.company_id, name: branch.name, active: branch.active }))
      .sort((a, b) => a.name.localeCompare(b.name, "es"))
  };
}
