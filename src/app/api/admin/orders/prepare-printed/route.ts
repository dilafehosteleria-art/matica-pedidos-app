import { NextRequest, NextResponse } from "next/server";
import { assertAdmin } from "@/lib/admin";
import { madridDayUtcRange } from "@/lib/delivery-notice";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

const ORDER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// PostgREST encodes the list of IDs in the URL, even for an UPDATE.
const IDS_PER_UPDATE = 100;

export async function POST(request: NextRequest) {
  const adminError = await assertAdmin(request);
  if (adminError) return adminError;

  const body = await request.json().catch(() => null);
  const ids: unknown = body?.orderIds;
  if (
    !Array.isArray(ids) || ids.length === 0 ||
    !ids.every((id): id is string => typeof id === "string" && ORDER_ID.test(id))
  ) {
    return NextResponse.json({ error: "Selecciona un lote válido de comandas impresas." }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Configura Supabase para usar el panel." }, { status: 503 });
  }

  const orderIds = [...new Set(ids.map((id) => id.toLowerCase()))];
  const updatedIds: string[] = [];
  const now = new Date();
  const { start, end } = madridDayUtcRange(now);

  for (let offset = 0; offset < orderIds.length; offset += IDS_PER_UPDATE) {
    const { data, error } = await supabase
      .from("orders")
      .update({ status: "preparando", status_updated_at: now.toISOString() })
      .in("id", orderIds.slice(offset, offset + IDS_PER_UPDATE))
      .eq("status", "nuevo")
      .or("fulfillment_type.eq.delivery,fulfillment_type.is.null")
      .gte("created_at", start)
      .lt("created_at", end)
      .or("payment_status.eq.paid,and(payment_method.eq.pay_on_delivery,or(payment_status.is.null,payment_status.not.in.(failed,cancelled)))")
      .select("id");

    if (error) {
      return NextResponse.json({ error: "No se pudo completar el lote. Puedes volver a intentarlo." }, { status: 503 });
    }
    updatedIds.push(...(data ?? []).map((order) => order.id));
  }

  return NextResponse.json({ updatedIds, skipped: orderIds.length - updatedIds.length });
}
