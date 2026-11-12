import { NextResponse } from "next/server";
import { readActiveDailyMenu } from "@/lib/active-daily-menu";
import { toDateInputValue } from "@/lib/format";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = getSupabaseServerClient();
  const result = supabase ? await readActiveDailyMenu(supabase, toDateInputValue()) : null;
  const headers = { "Cache-Control": "no-store" };

  if (!result || result.error) {
    return NextResponse.json({ error: "No se ha podido cargar el menú." }, { status: 503, headers });
  }

  return NextResponse.json({ menu: result.data }, { headers });
}
