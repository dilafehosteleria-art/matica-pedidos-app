import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { sendOrderNotificationEmail } from "@/lib/order-email";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { AdminOrder } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type StripeEvent = {
  id: string;
  type: string;
  data: {
    object: {
      id?: string;
      client_reference_id?: string | null;
      metadata?: Record<string, string> | null;
      payment_status?: string | null;
      payment_intent?: string | null;
    };
  };
};

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function parseStripeSignature(header: string | null) {
  const parts = (header ?? "").split(",").map((part) => part.trim());
  const timestamp = parts.find((part) => part.startsWith("t="))?.slice(2) ?? "";
  const signature = parts.find((part) => part.startsWith("v1="))?.slice(3) ?? "";

  return { timestamp, signature };
}

function verifySignature(rawBody: string, signatureHeader: string | null) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secret) {
    throw new Error("STRIPE_WEBHOOK_SECRET no esta configurado.");
  }

  const { timestamp, signature } = parseStripeSignature(signatureHeader);

  if (!timestamp || !signature) {
    throw new Error("Firma Stripe incompleta.");
  }

  const signedPayload = `${timestamp}.${rawBody}`;
  const expected = createHmac("sha256", secret).update(signedPayload).digest("hex");
  const received = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");

  if (received.length !== expectedBuffer.length || !timingSafeEqual(received, expectedBuffer)) {
    throw new Error("Firma Stripe no valida.");
  }
}

async function loadOrder(orderId: string) {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from("orders")
    .select("*,order_items(*),companies(name),company_branches(name)")
    .eq("id", orderId)
    .single();

  if (error || !data) {
    console.warn("[stripe-webhook] No se pudo cargar el pedido para email.", error?.message);
    return null;
  }

  return data as AdminOrder;
}

async function markCheckoutCompleted(session: StripeEvent["data"]["object"]) {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    throw new Error("Supabase no esta configurado.");
  }

  const orderId = session.metadata?.order_id ?? session.client_reference_id ?? "";

  if (!orderId) {
    throw new Error("La sesion de Stripe no incluye order_id.");
  }

  const { data: existingOrder, error: existingError } = await supabase
    .from("orders")
    .select("payment_status")
    .eq("id", orderId)
    .single();

  if (existingError) {
    throw new Error(existingError.message);
  }

  if (existingOrder?.payment_status === "paid") {
    return;
  }

  const { error } = await supabase
    .from("orders")
    .update({
      status: "nuevo",
      status_updated_at: new Date().toISOString(),
      payment_status: "paid",
      payment_provider: "stripe",
      stripe_checkout_session_id: session.id ?? null,
      stripe_payment_intent_id: session.payment_intent ?? null,
      paid_at: new Date().toISOString()
    })
    .eq("id", orderId);

  if (error) {
    throw new Error(error.message);
  }

  const order = await loadOrder(orderId);

  if (order) {
    await sendOrderNotificationEmail(order);
  }
}

async function markCheckoutFailed(session: StripeEvent["data"]["object"]) {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    throw new Error("Supabase no esta configurado.");
  }

  const orderId = session.metadata?.order_id ?? session.client_reference_id ?? "";

  if (!orderId) {
    return;
  }

  const { error } = await supabase
    .from("orders")
    .update({
      payment_status: "failed"
    })
    .eq("id", orderId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  try {
    verifySignature(rawBody, request.headers.get("stripe-signature"));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Firma Stripe no valida.";

    return jsonError(message, 400);
  }

  let event: StripeEvent;

  try {
    event = JSON.parse(rawBody) as StripeEvent;
  } catch {
    return jsonError("Evento Stripe no valido.");
  }

  try {
    if (event.type === "checkout.session.completed") {
      await markCheckoutCompleted(event.data.object);
    }

    if (event.type === "checkout.session.expired") {
      await markCheckoutFailed(event.data.object);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo procesar el webhook.";

    console.warn("[stripe-webhook]", message);
    return jsonError(message, 500);
  }

  return NextResponse.json({ received: true });
}
