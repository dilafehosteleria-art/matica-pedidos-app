import { NextRequest, NextResponse } from "next/server";
import { assertAdmin } from "@/lib/admin";
import { isVisibleAdminOrder } from "@/lib/order-validity";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { AdminOrder, OrderStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const TIME_ZONE = "Europe/Madrid";
const DAILY_STATUSES: OrderStatus[] = ["nuevo", "preparando", "listo", "cancelado"];
const VALID_STATUSES: OrderStatus[] = ["pendiente_pago", "nuevo", "preparando", "listo", "entregado", "cancelado"];

function isDateInput(value: string | null) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function currentMadridDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: TIME_ZONE,
    year: "numeric"
  }).formatToParts(new Date());
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

function addDays(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);

  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function madridDateToUtcIso(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  const utcGuess = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  const offset = getTimeZoneOffsetMs(utcGuess, TIME_ZONE);

  return new Date(utcGuess.getTime() - offset).toISOString();
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function filterHistoryOrders(orders: AdminOrder[], request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const rawStatus = params.get("status")?.trim() ?? "";
  const status = VALID_STATUSES.includes(rawStatus as OrderStatus) ? rawStatus : "";
  const customer = normalize(params.get("customer") ?? "");
  const branch = normalize(params.get("branch") ?? "");
  const reference = normalize(params.get("reference") ?? "").replace(/^#/, "");

  return orders.filter((order) => {
    if (status && order.status !== status) {
      return false;
    }

    if (reference && !order.id.toLowerCase().startsWith(reference)) {
      return false;
    }

    if (customer) {
      const haystack = `${order.customer_name} ${order.customer_email} ${order.customer_phone}`.toLowerCase();

      if (!haystack.includes(customer)) {
        return false;
      }
    }

    if (branch && !(order.company_branches?.name ?? "").toLowerCase().includes(branch)) {
      return false;
    }

    return true;
  });
}

export async function GET(request: NextRequest) {
  const adminError = assertAdmin(request);

  if (adminError) {
    return adminError;
  }

  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return NextResponse.json({ error: "Configura Supabase para usar el panel." }, { status: 503 });
  }

  const params = request.nextUrl.searchParams;
  const mode = params.get("mode") === "history" ? "history" : "daily";
  const today = currentMadridDate();
  const dateFrom = isDateInput(params.get("date_from")) ? params.get("date_from")! : today;
  const dateTo = isDateInput(params.get("date_to")) ? params.get("date_to")! : dateFrom;
  const start = madridDateToUtcIso(dateFrom);
  const end = madridDateToUtcIso(addDays(dateTo, 1));

  let query = supabase
    .from("orders")
    .select("*,order_items(*),companies(name,delivery_address),company_branches(name)")
    .gte("created_at", start)
    .lt("created_at", end)
    .order("created_at", { ascending: true });

  if (mode === "daily") {
    query = query.in("status", DAILY_STATUSES);
  } else {
    const status = params.get("status")?.trim() ?? "";

    if (VALID_STATUSES.includes(status as OrderStatus)) {
      query = query.eq("status", status);
    }
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const confirmedOrders = ((data as AdminOrder[] | null) ?? []).filter(isVisibleAdminOrder);
  const visibleOrders = mode === "history" ? filterHistoryOrders(confirmedOrders, request) : confirmedOrders;

  return NextResponse.json({ orders: visibleOrders });
}
