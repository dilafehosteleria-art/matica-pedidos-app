import { NextRequest, NextResponse } from "next/server";
import { reconcileSumUpCheckout } from "@/lib/sumup-payment";
import { isMissingDatabaseColumn } from "@/lib/supabase/errors";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import type { PaymentStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

type PaymentStatusRow = {
  id: string;
  payment_status: PaymentStatus | string | null;
  payment_provider: string | null;
  payment_checkout_id?: string | null;
};

const ORDER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function statusResponse(order: PaymentStatusRow, status = order.payment_status ?? "pending") {
  const normalizedStatus = ["paid", "failed", "cancelled"].includes(status) ? status : "pending";

  return NextResponse.json(
    {
      order: { id: order.id },
      payment: {
        status: normalizedStatus,
        provider: order.payment_provider === "stripe" || order.payment_provider === "sumup"
          ? order.payment_provider
          : null
      }
    },
    {
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}

export async function GET(request: NextRequest) {
  const orderId = request.nextUrl.searchParams.get("order")?.trim() ?? "";

  if (!ORDER_ID_PATTERN.test(orderId)) {
    return NextResponse.json({ error: "Referencia de pedido no valida." }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return NextResponse.json({ error: "Servicio no disponible." }, { status: 503 });
  }

  let { data, error } = await supabase
    .from("orders")
    .select("id,payment_status,payment_provider,payment_checkout_id")
    .eq("id", orderId)
    .maybeSingle();

  if (isMissingDatabaseColumn(error, ["payment_checkout_id"])) {
    ({ data, error } = await supabase
      .from("orders")
      .select("id,payment_status,payment_provider")
      .eq("id", orderId)
      .maybeSingle());
  }

  if (error) {
    return NextResponse.json({ error: "No se pudo comprobar el pago." }, { status: 503 });
  }

  if (!data) {
    return NextResponse.json({ error: "Pedido no encontrado." }, { status: 404 });
  }

  const order = data as PaymentStatusRow;

  if (order.payment_provider === "sumup" && order.payment_status !== "paid" && order.payment_checkout_id) {
    try {
      const reconciliation = await reconcileSumUpCheckout(order.payment_checkout_id);

      return statusResponse(order, reconciliation.paymentStatus);
    } catch (reconciliationError) {
      console.warn(
        "[payment-status] No se pudo reconciliar el checkout SumUp.",
        reconciliationError instanceof Error ? reconciliationError.message : reconciliationError
      );
    }
  }

  return statusResponse(order);
}
