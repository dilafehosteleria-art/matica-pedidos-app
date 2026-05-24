import { NextRequest, NextResponse } from "next/server";
import { isOrderWindowOpen } from "@/lib/schedule";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type IncomingOrder = {
  customer?: {
    name?: string;
    email?: string;
    phone?: string;
    company_branch_id?: string;
  };
  items?: {
    product_id?: string;
    quantity?: number;
    metadata?: Record<string, string>;
  }[];
  notes?: string;
};

function badRequest(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: NextRequest) {
  if (!isOrderWindowOpen()) {
    return badRequest("Los pedidos están disponibles de lunes a jueves de 09:30 a 12:30.", 403);
  }

  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return badRequest("Ahora mismo no podemos registrar pedidos. Inténtalo de nuevo en unos minutos.", 503);
  }

  const body = (await request.json()) as IncomingOrder;
  const customer = body.customer;
  const items = body.items ?? [];

  if (!customer?.name?.trim() || !customer.email?.trim() || !customer.phone?.trim() || !customer.company_branch_id) {
    return badRequest("Faltan datos del cliente.");
  }

  if (!items.length) {
    return badRequest("El carrito está vacío.");
  }

  const payload = {
    company_slug: "bureau-veritas",
    customer: {
      name: customer.name.trim(),
      email: customer.email.trim().toLowerCase(),
      phone: customer.phone.trim(),
      company_branch_id: customer.company_branch_id
    },
    items: items.map((item) => ({
      product_id: item.product_id,
      quantity: Math.max(1, Number(item.quantity ?? 1)),
      metadata: item.metadata ?? {}
    })),
    notes: body.notes?.trim() ?? ""
  };

  const { data, error } = await supabase.rpc("submit_b2b_order", {
    order_payload: payload
  });

  if (error) {
    return badRequest(error.message);
  }

  return NextResponse.json({ order: data });
}
