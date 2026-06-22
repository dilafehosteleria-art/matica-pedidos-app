import { NextRequest, NextResponse } from "next/server";
import { assertAdmin } from "@/lib/admin";
import { getGlobalSchedule } from "@/lib/global-settings";
import { deliveryWindowLabel, normalizeGlobalSchedule, orderWindowLabel } from "@/lib/schedule";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import type { GlobalSchedule } from "@/lib/types";

export const dynamic = "force-dynamic";

function validTime(value: string) {
  return /^\d{2}:\d{2}$/.test(value);
}

export async function GET(request: NextRequest) {
  const adminError = assertAdmin(request);

  if (adminError) {
    return adminError;
  }

  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return NextResponse.json({ error: "Configura Supabase para usar el panel." }, { status: 503 });
  }

  return NextResponse.json({ schedule: await getGlobalSchedule(supabase) });
}

export async function PATCH(request: NextRequest) {
  const adminError = assertAdmin(request);

  if (adminError) {
    return adminError;
  }

  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return NextResponse.json({ error: "Configura Supabase para usar el panel." }, { status: 503 });
  }

  const body = normalizeGlobalSchedule((await request.json()) as Partial<GlobalSchedule>);

  if (!body.active_days.length) {
    return NextResponse.json({ error: "Selecciona al menos un día activo." }, { status: 400 });
  }

  if (
    !validTime(body.order_open_time) ||
    !validTime(body.order_close_time) ||
    !validTime(body.delivery_start_time) ||
    !validTime(body.delivery_end_time) ||
    body.order_open_time >= body.order_close_time ||
    body.delivery_start_time >= body.delivery_end_time
  ) {
    return NextResponse.json({ error: "Revisa las horas de pedido y entrega." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("app_settings")
    .upsert({
      id: "global",
      active: body.active,
      active_days: body.active_days,
      order_open_time: body.order_open_time,
      order_close_time: body.order_close_time,
      delivery_start_time: body.delivery_start_time,
      delivery_end_time: body.delivery_end_time,
      updated_at: new Date().toISOString()
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const savedSchedule = normalizeGlobalSchedule(data as Partial<GlobalSchedule>);
  const { error: companiesError } = await supabase
    .from("companies")
    .update({
      order_window: orderWindowLabel(savedSchedule),
      delivery_window: deliveryWindowLabel(savedSchedule)
    })
    .not("id", "is", null);

  if (companiesError) {
    return NextResponse.json({ error: companiesError.message }, { status: 400 });
  }

  return NextResponse.json({ schedule: savedSchedule });
}
