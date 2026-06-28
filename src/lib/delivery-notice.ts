import { toDateInputValue } from "./format.ts";
import { isConfirmedPayment } from "./order-validity.ts";
import type { AdminOrder } from "./types.ts";

export type DeliveryNoticeScope =
  | { scope: "all" }
  | { scope: "company"; company_id: string };

export type DeliveryNoticeSummary = {
  sent: number;
  omitted_already_notified: number;
  omitted_no_email: number;
  errors: number;
};

export type DeliveryNoticeCandidateSummary = DeliveryNoticeSummary & {
  eligible: number;
  omitted_not_today: number;
  omitted_not_preparing: number;
  omitted_invalid_payment: number;
};

export type DeliveryNoticeOrder = Pick<
  AdminOrder,
  | "id"
  | "company_id"
  | "created_at"
  | "customer_email"
  | "delivery_notice_sent_at"
  | "payment_method"
  | "payment_status"
  | "status"
>;

type DeliveryNoticeEligibility =
  | "eligible"
  | "already_notified"
  | "invalid_payment"
  | "no_email"
  | "not_preparing"
  | "not_today";

export function parseDeliveryNoticeScope(body: unknown): DeliveryNoticeScope | null {
  if (!body || typeof body !== "object") {
    return null;
  }

  const payload = body as { scope?: unknown; company_id?: unknown };

  if (payload.scope === "all") {
    return { scope: "all" };
  }

  if (payload.scope === "company" && typeof payload.company_id === "string" && payload.company_id.trim()) {
    return {
      scope: "company",
      company_id: payload.company_id.trim()
    };
  }

  return null;
}

export function emptyDeliveryNoticeSummary(): DeliveryNoticeSummary {
  return {
    sent: 0,
    omitted_already_notified: 0,
    omitted_no_email: 0,
    errors: 0
  };
}

export function madridDayUtcRange(date = new Date()) {
  const today = toDateInputValue(date);

  return {
    today,
    start: madridDateToUtcIso(today),
    end: madridDateToUtcIso(addDays(today, 1))
  };
}

export function deliveryNoticeEligibility(order: DeliveryNoticeOrder, today = toDateInputValue()): DeliveryNoticeEligibility {
  if (!Object.prototype.hasOwnProperty.call(order, "delivery_notice_sent_at")) {
    return "already_notified";
  }

  if (toDateInputValue(new Date(order.created_at)) !== today) {
    return "not_today";
  }

  if (order.status !== "preparando") {
    return "not_preparing";
  }

  if (order.delivery_notice_sent_at) {
    return "already_notified";
  }

  if (!isConfirmedPayment(order)) {
    return "invalid_payment";
  }

  if (!order.customer_email?.trim()) {
    return "no_email";
  }

  return "eligible";
}

export function summarizeDeliveryNoticeCandidates(orders: DeliveryNoticeOrder[], today = toDateInputValue()) {
  const summary: DeliveryNoticeCandidateSummary = {
    ...emptyDeliveryNoticeSummary(),
    eligible: 0,
    omitted_not_today: 0,
    omitted_not_preparing: 0,
    omitted_invalid_payment: 0
  };
  const eligibleOrders: DeliveryNoticeOrder[] = [];

  for (const order of orders) {
    const eligibility = deliveryNoticeEligibility(order, today);

    if (eligibility === "eligible") {
      summary.eligible += 1;
      eligibleOrders.push(order);
    } else if (eligibility === "already_notified") {
      summary.omitted_already_notified += 1;
    } else if (eligibility === "no_email") {
      summary.omitted_no_email += 1;
    } else if (eligibility === "not_today") {
      summary.omitted_not_today += 1;
    } else if (eligibility === "not_preparing") {
      summary.omitted_not_preparing += 1;
    } else if (eligibility === "invalid_payment") {
      summary.omitted_invalid_payment += 1;
    }
  }

  return {
    eligibleOrders,
    summary
  };
}

function addDays(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);

  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
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

function madridDateToUtcIso(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  const utcGuess = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  const offset = getTimeZoneOffsetMs(utcGuess, "Europe/Madrid");

  return new Date(utcGuess.getTime() - offset).toISOString();
}
