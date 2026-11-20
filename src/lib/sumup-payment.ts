import { sendOrderNotificationEmail } from "@/lib/order-email";
import {
  assertSumUpCheckoutMatches,
  retrieveSumUpCheckout,
  type SumUpCheckout
} from "@/lib/sumup-hosted-checkout";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import type { AdminOrder, PaymentStatus } from "@/lib/types";

type SumUpOrder = {
  id: string;
  total: number | string;
  payment_status: PaymentStatus | string | null;
  payment_provider: string | null;
  payment_checkout_id: string | null;
  payment_notification_sent_at: string | null;
  payment_notification_claimed_at: string | null;
};

const PAYMENT_NOTIFICATION_CLAIM_TTL_MS = 5 * 60 * 1000;

export function sumUpCheckoutReferenceForOrder(orderId: string) {
  return `matica-${orderId}`;
}

function completedTransactionId(checkout: SumUpCheckout) {
  if (checkout.transactionId || checkout.transactionCode) {
    return checkout.transactionId ?? checkout.transactionCode ?? null;
  }

  const successfulTransaction = checkout.transactions.find(
    (candidate) => candidate.status?.trim().toUpperCase() === "SUCCESSFUL"
  );
  const transaction = successfulTransaction ?? checkout.transactions.find(
    (candidate) => candidate.id || candidate.transactionCode
  );

  return transaction?.id ?? transaction?.transactionCode ?? null;
}

async function loadOrderForEmail(orderId: string) {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from("orders")
    .select("*,order_items(*),companies(name,delivery_address),company_branches(name)")
    .eq("id", orderId)
    .single();

  if (error || !data) {
    console.warn("[sumup-webhook] No se pudo cargar el pedido para email.", error?.message);
    return null;
  }

  return data as AdminOrder;
}

async function sendPaymentNotificationIfNeeded(order: SumUpOrder) {
  if (order.payment_notification_sent_at) {
    return;
  }

  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return;
  }

  const claimedAt = new Date().toISOString();
  const staleBefore = new Date(Date.now() - PAYMENT_NOTIFICATION_CLAIM_TTL_MS).toISOString();
  const { data: claimedOrder, error: claimError } = await supabase
    .from("orders")
    .update({ payment_notification_claimed_at: claimedAt })
    .eq("id", order.id)
    .is("payment_notification_sent_at", null)
    .or(`payment_notification_claimed_at.is.null,payment_notification_claimed_at.lt.${staleBefore}`)
    .select("id")
    .maybeSingle();

  if (claimError) {
    console.warn("[sumup-webhook] No se pudo reservar la notificacion del pago.", claimError.message);
    return;
  }

  if (!claimedOrder) {
    return;
  }

  const releaseClaim = async () => {
    const { error } = await supabase
      .from("orders")
      .update({ payment_notification_claimed_at: null })
      .eq("id", order.id)
      .eq("payment_notification_claimed_at", claimedAt);

    if (error) {
      console.warn("[sumup-webhook] No se pudo liberar la reserva de email.", error.message);
    }
  };

  const fullOrder = await loadOrderForEmail(order.id);

  if (!fullOrder) {
    await releaseClaim();
    return;
  }

  const notification = await sendOrderNotificationEmail(fullOrder);

  if (!notification.matica_sent) {
    await releaseClaim();
    return;
  }

  const { error } = await supabase
    .from("orders")
    .update({
      payment_notification_sent_at: new Date().toISOString(),
      payment_notification_claimed_at: null
    })
    .eq("id", order.id)
    .is("payment_notification_sent_at", null)
    .eq("payment_notification_claimed_at", claimedAt);

  if (error) {
    console.warn("[sumup-webhook] No se pudo registrar la notificacion del pago.", error.message);
  }
}

export type SumUpReconciliationResult = {
  found: boolean;
  orderId: string | null;
  paymentStatus: PaymentStatus | "pending";
  checkoutStatus: SumUpCheckout["status"] | null;
};

export async function reconcileSumUpCheckout(checkoutId: string): Promise<SumUpReconciliationResult> {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    throw new Error("Supabase no esta configurado.");
  }

  const { data, error } = await supabase
    .from("orders")
    .select("id,total,payment_status,payment_provider,payment_checkout_id,payment_notification_sent_at,payment_notification_claimed_at")
    .eq("payment_provider", "sumup")
    .eq("payment_checkout_id", checkoutId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  const order = data as SumUpOrder | null;

  if (!order) {
    return {
      found: false,
      orderId: null,
      paymentStatus: "pending",
      checkoutStatus: null
    };
  }

  const checkout = await retrieveSumUpCheckout(checkoutId);

  assertSumUpCheckoutMatches(checkout, {
    amount: Number(order.total),
    currency: "EUR",
    checkoutReference: sumUpCheckoutReferenceForOrder(order.id)
  });

  if (checkout.status === "PAID") {
    if (order.payment_status === "paid") {
      await sendPaymentNotificationIfNeeded(order);

      return {
        found: true,
        orderId: order.id,
        paymentStatus: "paid",
        checkoutStatus: checkout.status
      };
    }

    const { data: updatedOrder, error: updateError } = await supabase
      .from("orders")
      .update({
        status: "nuevo",
        status_updated_at: new Date().toISOString(),
        payment_status: "paid",
        payment_provider: "sumup",
        payment_checkout_id: checkout.id,
        payment_transaction_id: completedTransactionId(checkout),
        paid_at: new Date().toISOString()
      })
      .eq("id", order.id)
      .neq("payment_status", "paid")
      .select("id")
      .maybeSingle();

    if (updateError) {
      throw new Error(updateError.message);
    }

    if (updatedOrder) {
      order.payment_status = "paid";
    }

    await sendPaymentNotificationIfNeeded(order);

    return {
      found: true,
      orderId: order.id,
      paymentStatus: "paid",
      checkoutStatus: checkout.status
    };
  }

  if (checkout.status === "FAILED") {
    const { error: updateError } = await supabase
      .from("orders")
      .update({
        status_updated_at: new Date().toISOString(),
        payment_status: "failed"
      })
      .eq("id", order.id)
      .neq("payment_status", "paid");

    if (updateError) {
      throw new Error(updateError.message);
    }

    return {
      found: true,
      orderId: order.id,
      paymentStatus: "failed",
      checkoutStatus: checkout.status
    };
  }

  if (checkout.status === "EXPIRED") {
    const { error: updateError } = await supabase
      .from("orders")
      .update({
        status: "cancelado",
        status_updated_at: new Date().toISOString(),
        payment_status: "failed"
      })
      .eq("id", order.id)
      .neq("payment_status", "paid");

    if (updateError) {
      throw new Error(updateError.message);
    }

    return {
      found: true,
      orderId: order.id,
      paymentStatus: "failed",
      checkoutStatus: checkout.status
    };
  }

  return {
    found: true,
    orderId: order.id,
    paymentStatus: "pending",
    checkoutStatus: checkout.status
  };
}
