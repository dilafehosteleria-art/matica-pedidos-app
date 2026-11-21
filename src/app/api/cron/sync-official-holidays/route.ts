import { NextRequest, NextResponse } from "next/server";
import { syncOfficialHolidayCalendars } from "@/lib/official-holiday-sync";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function assertCron(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET no está configurado." }, { status: 500 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  return null;
}

async function synchronize(request: NextRequest) {
  const cronError = assertCron(request);
  if (cronError) return cronError;
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase no está configurado para sincronizar festivos." }, { status: 503 });
  }
  const results = await syncOfficialHolidayCalendars(supabase);
  const failed = results.find((result) => result.status === "error");
  return NextResponse.json({ source: "Datos Abiertos del Ayuntamiento de Madrid", results }, { status: failed ? 502 : 200 });
}

export async function POST(request: NextRequest) {
  return synchronize(request);
}
