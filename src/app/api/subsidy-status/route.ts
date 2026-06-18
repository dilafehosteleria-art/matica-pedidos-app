import { NextRequest, NextResponse } from "next/server";
import { toDateInputValue } from "@/lib/format";
import { isSubsidyConsumingOrder } from "@/lib/order-validity";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type SubsidyOrder = {
  created_at: string;
  status: string;
  payment_method?: string | null;
  payment_status?: string | null;
  order_items: { subsidy_amount: number }[] | null;
};

export async function GET(request: NextRequest) {
  const email = request.nextUrl.searchParams.get("email")?.trim().toLowerCase();
  const companySlug = request.nextUrl.searchParams.get("companySlug") ?? "bureau-veritas";

  if (!email) {
    return NextResponse.json({ used: false });
  }

  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return NextResponse.json({ used: false, source: "seed" });
  }

  const { data: company } = await supabase
    .from("companies")
    .select("id")
    .eq("slug", companySlug)
    .eq("active", true)
    .maybeSingle();

  if (!company) {
    return NextResponse.json({ used: false });
  }

  const recentLimit = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString();
  const today = toDateInputValue();

  const { data, error } = await supabase
    .from("orders")
    .select("created_at,status,payment_method,payment_status,order_items(subsidy_amount)")
    .eq("company_id", company.id)
    .eq("customer_email", email)
    .gte("created_at", recentLimit);

  if (error) {
    return NextResponse.json({ used: false });
  }

  const used = ((data as SubsidyOrder[] | null) ?? []).some((order) => {
    const sameMadridDay = toDateInputValue(new Date(order.created_at)) === today;
    const hasSubsidy = (order.order_items ?? []).some((item) => Number(item.subsidy_amount) > 0);

    return sameMadridDay && isSubsidyConsumingOrder(order) && hasSubsidy;
  });

  return NextResponse.json({ used });
}
