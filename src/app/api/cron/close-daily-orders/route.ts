import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import type { OrderStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const TIME_ZONE = "Europe/Madrid";
const CLOSABLE_STATUSES: OrderStatus[] = ["pendiente_pago", "preparando", "listo"];

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

function assertCron(request: NextRequest) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET no está configurado." }, { status: 500 });
  }

  const authorization = request.headers.get("authorization") ?? "";

  if (authorization !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  return null;
}

async function closeDailyOrders(request: NextRequest) {
  const cronError = assertCron(request);

  if (cronError) {
    return cronError;
  }

  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return NextResponse.json(
      { error: "Configura NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY para ejecutar el cierre." },
      { status: 503 }
    );
  }

  const date = isDateInput(request.nextUrl.searchParams.get("date"))
    ? request.nextUrl.searchParams.get("date")!
    : currentMadridDate();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("orders")
    .update({
      status: "entregado",
      status_updated_at: now
    })
    .gte("created_at", madridDateToUtcIso(date))
    .lt("created_at", madridDateToUtcIso(addDays(date, 1)))
    .in("status", CLOSABLE_STATUSES)
    .select("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({
    date,
    closed_count: data?.length ?? 0,
    closed_statuses: CLOSABLE_STATUSES
  });
}

export async function POST(request: NextRequest) {
  return closeDailyOrders(request);
}

export async function GET(request: NextRequest) {
  return closeDailyOrders(request);
}
