import { NextRequest, NextResponse } from "next/server";
import { assertAdmin } from "@/lib/admin";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { CompanyDraft } from "@/lib/types";

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

  const { data, error } = await supabase
    .from("companies")
    .select("*,subsidy_rules(product_type,subsidy_amount,active)")
    .order("name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ companies: data ?? [] });
}

export async function PATCH(request: NextRequest) {
  const adminError = assertAdmin(request);

  if (adminError) {
    return adminError;
  }

  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return NextResponse.json({ error: "Configura Supabase para usar el panel." }, { status: 503 });
  }

  const body = (await request.json()) as CompanyDraft;

  if (!body.id || !body.name?.trim() || !body.slug?.trim()) {
    return NextResponse.json({ error: "Empresa, nombre y slug requeridos." }, { status: 400 });
  }

  const { error: companyError } = await supabase
    .from("companies")
    .update({
      name: body.name.trim(),
      slug: body.slug.trim(),
      active: body.active,
      order_window: body.order_window?.trim() || null,
      delivery_window: body.delivery_window?.trim() || null,
      allow_pay_on_delivery: Boolean(body.allow_pay_on_delivery),
      allow_card_payment: Boolean(body.allow_card_payment),
      allow_bizum_payment: Boolean(body.allow_bizum_payment)
    })
    .eq("id", body.id);

  if (companyError) {
    return NextResponse.json({ error: companyError.message }, { status: 400 });
  }

  const { error: subsidyError } = await supabase.from("subsidy_rules").upsert(
    [
      {
        company_id: body.id,
        product_type: "daily_menu",
        subsidy_amount: Number(body.daily_menu_subsidy ?? 0),
        max_uses_per_customer_per_day: 1,
        active: true
      },
      {
        company_id: body.id,
        product_type: "half_menu",
        subsidy_amount: Number(body.half_menu_subsidy ?? 0),
        max_uses_per_customer_per_day: 1,
        active: true
      }
    ],
    { onConflict: "company_id,product_type" }
  );

  if (subsidyError) {
    return NextResponse.json({ error: subsidyError.message }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("companies")
    .select("*,subsidy_rules(product_type,subsidy_amount,active)")
    .eq("id", body.id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ company: data });
}
