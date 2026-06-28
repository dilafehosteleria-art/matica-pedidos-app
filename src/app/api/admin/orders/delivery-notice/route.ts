import { NextRequest, NextResponse } from "next/server";
import { assertAdmin } from "@/lib/admin";
import {
  emptyDeliveryNoticeSummary,
  madridDayUtcRange,
  parseDeliveryNoticeScope,
  summarizeDeliveryNoticeCandidates
} from "@/lib/delivery-notice";
import { isResendEmailConfigured, sendDeliveryNoticeEmail } from "@/lib/order-email";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { AdminOrder } from "@/lib/types";

export const dynamic = "force-dynamic";
const ORDER_SELECT = "*,delivery_notice_sent_at,order_items(*),companies(name,delivery_address),company_branches(name)";

export async function POST(request: NextRequest) {
  const adminError = assertAdmin(request);

  if (adminError) {
    return adminError;
  }

  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return NextResponse.json({ error: "Configura Supabase para usar el panel." }, { status: 503 });
  }

  const scope = parseDeliveryNoticeScope(await request.json().catch(() => null));

  if (!scope) {
    return NextResponse.json({ error: "Payload no valido." }, { status: 400 });
  }

  const { today, start, end } = madridDayUtcRange();
  let query = supabase
    .from("orders")
    .select(ORDER_SELECT)
    .gte("created_at", start)
    .lt("created_at", end)
    .eq("status", "preparando")
    .order("created_at", { ascending: true });

  if (scope.scope === "company") {
    query = query.eq("company_id", scope.company_id);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const orders = ((data as AdminOrder[] | null) ?? []);
  const { eligibleOrders, summary: candidateSummary } = summarizeDeliveryNoticeCandidates(orders, today);
  const summary = {
    ...emptyDeliveryNoticeSummary(),
    omitted_already_notified: candidateSummary.omitted_already_notified,
    omitted_no_email: candidateSummary.omitted_no_email
  };

  if (eligibleOrders.length && !isResendEmailConfigured()) {
    return NextResponse.json(
      {
        error: "Resend no esta configurado. Configura RESEND_API_KEY y ORDER_NOTIFICATION_FROM antes de enviar avisos.",
        summary
      },
      { status: 503 }
    );
  }

  for (const order of eligibleOrders as AdminOrder[]) {
    const result = await sendDeliveryNoticeEmail(order);

    if (!result.sent) {
      summary.errors += 1;
      continue;
    }

    const sentAt = new Date().toISOString();
    const { data: markedOrder, error: updateError } = await supabase
      .from("orders")
      .update({ delivery_notice_sent_at: sentAt })
      .eq("id", order.id)
      .is("delivery_notice_sent_at", null)
      .select("id")
      .maybeSingle();

    if (updateError) {
      summary.errors += 1;
      continue;
    }

    if (!markedOrder) {
      summary.omitted_already_notified += 1;
      continue;
    }

    summary.sent += 1;
  }

  return NextResponse.json({
    summary,
    scope,
    total_candidates: orders.length
  });
}
