import { timeToMinutes } from "./local-order-time.ts";
import { isLocalOrder } from "./order-ticket.ts";
import type { AdminOrder } from "./types.ts";

export type DailyOrderPartition = {
  deliveryOrders: AdminOrder[];
  localOrders: AdminOrder[];
};

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
