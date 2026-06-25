import { NextRequest, NextResponse } from "next/server";
import { assertAdmin } from "@/lib/admin";
import { isVisibleAdminOrder } from "@/lib/order-validity";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { AdminOrder, OrderStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const VALID_STATUSES: OrderStatus[] = ["pendiente_pago", "nuevo", "preparando", "listo", "entregado", "cancelado"];

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const adminError = assertAdmin(request);

  if (adminError) {
    return adminError;
  }

  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return NextResponse.json({ error: "Configura Supabase para usar el panel." }, { status: 503 });
  }

  const { id } = await context.params;
  const { data, error } = await supabase
    .from("orders")
    .select("*,order_items(*),companies(name,delivery_address),company_branches(name)")
    .eq("id", id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  const order = data as AdminOrder;

  if (!isVisibleAdminOrder(order)) {
    return NextResponse.json({ error: "Pedido no disponible." }, { status: 404 });
  }

  return NextResponse.json({ order });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const adminError = assertAdmin(request);

  if (adminError) {
    return adminError;
  }

  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return NextResponse.json({ error: "Configura Supabase para usar el panel." }, { status: 503 });
  }

  const { id } = await context.params;
  const body = (await request.json()) as { status?: OrderStatus };
  const status = body.status;

  if (!status || !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: "Estado no válido." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("orders")
    .update({
      status,
      status_updated_at: new Date().toISOString()
    })
    .eq("id", id)
    .select("*,order_items(*),companies(name,delivery_address),company_branches(name)")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ order: data });
}
