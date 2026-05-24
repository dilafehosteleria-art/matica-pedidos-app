import { NextRequest, NextResponse } from "next/server";
import { assertAdmin } from "@/lib/admin";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { AdminOrder } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const adminError = assertAdmin(request);

  if (adminError) {
    return adminError;
  }

  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return NextResponse.json({ error: "Configura Supabase para usar el panel." }, { status: 503 });
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const fiveHoursAgo = Date.now() - 5 * 60 * 60 * 1000;

  const { data, error } = await supabase
    .from("orders")
    .select("*,order_items(*),companies(name),company_branches(name)")
    .gte("created_at", sevenDaysAgo)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const visibleOrders = ((data as AdminOrder[] | null) ?? []).filter((order) => {
    if (order.status !== "entregado") {
      return true;
    }

    const reference = order.status_updated_at ?? order.created_at;
    return new Date(reference).getTime() >= fiveHoursAgo;
  });

  return NextResponse.json({ orders: visibleOrders });
}
