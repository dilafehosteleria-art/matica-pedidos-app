import { NextRequest, NextResponse } from "next/server";
import { reconcileSumUpCheckout } from "@/lib/sumup-payment";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SumUpWebhookEvent = {
  event_type?: unknown;
  id?: unknown;
};

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: NextRequest) {
  let event: SumUpWebhookEvent;

  try {
    event = (await request.json()) as SumUpWebhookEvent;
  } catch {
    return jsonError("Evento SumUp no valido.");
  }

  if (event.event_type !== "CHECKOUT_STATUS_CHANGED") {
    return new NextResponse(null, { status: 204 });
  }

  if (typeof event.id !== "string" || !event.id.trim()) {
    return jsonError("El evento SumUp no incluye checkout id.");
  }

  try {
    await reconcileSumUpCheckout(event.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo procesar el webhook SumUp.";

    console.warn("[sumup-webhook]", message);
    return jsonError("No se pudo procesar el webhook SumUp.", 500);
  }

  return new NextResponse(null, { status: 204 });
}
