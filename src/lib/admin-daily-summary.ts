import { isLocalOrder } from "./order-ticket.ts";
import { isOperationalOrderStatus, isVisibleAdminOrder } from "./order-validity.ts";
import type { AdminOrder } from "./types.ts";

export type DailyOrderCounts = {
  newOrders: number;
  preparing: number;
  local: number;
  cancelled: number;
  ready: number;
  delivered: number;
  total: number;
};

export type DailyCompanySummary = DailyOrderCounts & {
  companyId: string;
  companyName: string;
};

export type DailyOrderSummary = {
  date: string;
  totals: DailyOrderCounts;
  companies: DailyCompanySummary[];
};

type SummaryOrder = Pick<
  AdminOrder,
  "id" | "company_id" | "companies" | "status" | "payment_method" | "payment_status" | "fulfillment_type"
>;

type CountCategory = Exclude<keyof DailyOrderCounts, "total">;

const companyCollator = new Intl.Collator("es", { sensitivity: "base", numeric: true });

function emptyCounts(): DailyOrderCounts {
  return { newOrders: 0, preparing: 0, local: 0, cancelled: 0, ready: 0, delivered: 0, total: 0 };
}

function countCategory(order: SummaryOrder): CountCategory | null {
  if (!isVisibleAdminOrder(order)) return null;
  if (order.status === "cancelado") return "cancelled";
  if (!isOperationalOrderStatus(order.status)) return null;
  if (isLocalOrder(order)) return "local";

  switch (order.status) {
    case "nuevo": return "newOrders";
    case "preparando": return "preparing";
    case "listo": return "ready";
    case "entregado": return "delivered";
    default: return null;
  }
}

/** Orders must already belong to the supplied Madrid calendar date. */
export function buildDailyOrderSummary(orders: readonly SummaryOrder[], date: string): DailyOrderSummary {
  const totals = emptyCounts();
  const companies = new Map<string, DailyCompanySummary>();
  const uniqueOrders = new Map(orders.map((order) => [order.id, order]));

  for (const order of uniqueOrders.values()) {
    const category = countCategory(order);
    if (!category) continue;

    let company = companies.get(order.company_id);
    if (!company) {
      company = {
        companyId: order.company_id,
        companyName: order.companies?.name?.trim() || "Empresa sin nombre",
        ...emptyCounts()
      };
      companies.set(order.company_id, company);
    }

    company[category] += 1;
    totals[category] += 1;
    if (category !== "cancelled") {
      company.total += 1;
      totals.total += 1;
    }
  }

  return {
    date,
    totals,
    companies: [...companies.values()].sort((left, right) =>
      companyCollator.compare(left.companyName, right.companyName) || left.companyId.localeCompare(right.companyId)
    )
  };
}
