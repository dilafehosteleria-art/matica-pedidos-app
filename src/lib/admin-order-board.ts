import { timeToMinutes } from "./local-order-time.ts";
import { isLocalOrder } from "./order-ticket.ts";
import type { AdminOrder } from "./types.ts";

export type DailyOrderPartition = {
  deliveryOrders: AdminOrder[];
  localOrders: AdminOrder[];
};

export const MANUAL_ORDER_STATUSES = ["nuevo", "preparando", "cancelado"] as const;
export type ManualOrderStatus = (typeof MANUAL_ORDER_STATUSES)[number];

export type CompanyOrderGroup = {
  id: string;
  name: string;
  orders: AdminOrder[];
};

const companyCollator = new Intl.Collator("es", { sensitivity: "base", numeric: true });

export function groupDeliveryOrders(orders: AdminOrder[]): CompanyOrderGroup[] {
  const groups = new Map<string, CompanyOrderGroup>();
  for (const order of orders) {
    const id = order.company_id;
    let group = groups.get(id);
    if (!group) {
      group = { id, name: order.companies?.name?.trim() || "Empresa sin nombre", orders: [] };
      groups.set(id, group);
    }
    group.orders.push(order);
  }

  for (const group of groups.values()) {
    group.orders.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.id.localeCompare(b.id));
  }

  return [...groups.values()].sort((a, b) => companyCollator.compare(a.name, b.name) || a.id.localeCompare(b.id));
}

function compareLocalOrders(left: AdminOrder, right: AdminOrder) {
  const leftMinutes = timeToMinutes(left.requested_time ?? "");
  const rightMinutes = timeToMinutes(right.requested_time ?? "");
  const leftHasTime = leftMinutes >= 0;
  const rightHasTime = rightMinutes >= 0;

  if (leftHasTime && rightHasTime && leftMinutes !== rightMinutes) {
    return leftMinutes - rightMinutes;
  }

  if (leftHasTime !== rightHasTime) {
    return leftHasTime ? -1 : 1;
  }

  return new Date(left.created_at).getTime() - new Date(right.created_at).getTime();
}

export function partitionDailyOrders(orders: AdminOrder[]): DailyOrderPartition {
  const deliveryOrders: AdminOrder[] = [];
  const localOrders: AdminOrder[] = [];

  for (const order of orders) {
    if (isLocalOrder(order)) {
      localOrders.push(order);
    } else {
      deliveryOrders.push(order);
    }
  }

  return {
    deliveryOrders,
    localOrders: localOrders.sort(compareLocalOrders)
  };
}
