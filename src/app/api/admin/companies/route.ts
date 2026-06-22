import { NextRequest, NextResponse } from "next/server";
import { assertAdmin } from "@/lib/admin";
import { getGlobalSchedule } from "@/lib/global-settings";
import { deliveryWindowLabel, orderWindowLabel } from "@/lib/schedule";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import type { CompanyDraft, NewCompanyDraft } from "@/lib/types";

export const dynamic = "force-dynamic";

function isMissingPaymentSettingsColumn(message?: string) {
  return Boolean(
    message &&
      (
        message.includes("'allow_pay_on_delivery' column") ||
        message.includes("'allow_card_payment' column") ||
        message.includes("'allow_bizum_payment' column") ||
        message.includes("'billing_type' column")
      )
  );
}

function normalizeSlug(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function paymentSettings(mode: NewCompanyDraft["payment_mode"]) {
  return {
    allow_pay_on_delivery: mode === "company" || mode === "both",
    allow_card_payment: mode === "stripe" || mode === "both",
    allow_bizum_payment: false,
    billing_type: mode === "stripe" ? "employee" : "company"
  } as const;
}

export async function GET(request: NextRequest) {
  const adminError = assertAdmin(request);

  if (adminError) {
    return adminError;
  }

  const supabase = getSupabaseAdminClient();

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

export async function POST(request: NextRequest) {
  const adminError = assertAdmin(request);

  if (adminError) {
    return adminError;
  }

  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return NextResponse.json({ error: "Configura Supabase para usar el panel." }, { status: 503 });
  }

  const body = (await request.json()) as NewCompanyDraft;
  const name = body.name?.trim();
  const slug = normalizeSlug(body.slug || body.name || "");
  const deliveryAddress = body.delivery_address?.trim();

  if (!name || !slug || !deliveryAddress) {
    return NextResponse.json({ error: "Nombre, slug y dirección de entrega son obligatorios." }, { status: 400 });
  }

  if (!["stripe", "company", "both"].includes(body.payment_mode)) {
    return NextResponse.json({ error: "Selecciona una forma de pago válida." }, { status: 400 });
  }

  const schedule = await getGlobalSchedule(supabase);
  const { data: company, error: companyError } = await supabase
    .from("companies")
    .insert({
      name,
      slug,
      delivery_address: deliveryAddress,
      active: body.active ?? true,
      order_window: orderWindowLabel(schedule),
      delivery_window: deliveryWindowLabel(schedule),
      ...paymentSettings(body.payment_mode)
    })
    .select("*")
    .single();

  if (companyError || !company) {
    const duplicate = companyError?.code === "23505";
    return NextResponse.json(
      { error: duplicate ? "Ya existe una empresa con ese slug." : companyError?.message ?? "No se pudo crear la empresa." },
      { status: 400 }
    );
  }

  const { error: branchError } = await supabase.from("company_branches").insert({
    company_id: company.id,
    name,
    active: true
  });

  if (branchError) {
    await supabase.from("companies").delete().eq("id", company.id);
    return NextResponse.json({ error: branchError.message }, { status: 400 });
  }

  const { error: subsidyError } = await supabase.from("subsidy_rules").upsert(
    [
      {
        company_id: company.id,
        product_type: "daily_menu",
        subsidy_amount: 0,
        max_uses_per_customer_per_day: 1,
        active: false
      },
      {
        company_id: company.id,
        product_type: "half_menu",
        subsidy_amount: 0,
        max_uses_per_customer_per_day: 1,
        active: false
      }
    ],
    { onConflict: "company_id,product_type" }
  );

  if (subsidyError) {
    await supabase.from("companies").delete().eq("id", company.id);
    return NextResponse.json({ error: subsidyError.message }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("companies")
    .select("*,subsidy_rules(product_type,subsidy_amount,active)")
    .eq("id", company.id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ company: data }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const adminError = assertAdmin(request);

  if (adminError) {
    return adminError;
  }

  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return NextResponse.json({ error: "Configura Supabase para usar el panel." }, { status: 503 });
  }

  const body = (await request.json()) as CompanyDraft;

  if (!body.id || !body.name?.trim() || !body.slug?.trim()) {
    return NextResponse.json({ error: "Empresa, nombre y slug requeridos." }, { status: 400 });
  }

  if (!body.allow_pay_on_delivery && !body.allow_card_payment && !body.allow_bizum_payment) {
    return NextResponse.json({ error: "Selecciona al menos una forma de pago." }, { status: 400 });
  }

  const companyUpdate = {
    name: body.name.trim(),
    slug: normalizeSlug(body.slug),
    delivery_address: body.delivery_address?.trim() || null,
    active: body.active,
    order_window: body.order_window?.trim() || null,
    delivery_window: body.delivery_window?.trim() || null,
    allow_pay_on_delivery: Boolean(body.allow_pay_on_delivery),
    allow_card_payment: Boolean(body.allow_card_payment),
    allow_bizum_payment: Boolean(body.allow_bizum_payment),
    billing_type: body.billing_type ?? "employee"
  };

  let { error: companyError } = await supabase
    .from("companies")
    .update(companyUpdate)
    .eq("id", body.id);

  if (companyError && isMissingPaymentSettingsColumn(companyError.message)) {
    const {
      allow_pay_on_delivery: _allowPayOnDelivery,
      allow_card_payment: _allowCardPayment,
      allow_bizum_payment: _allowBizumPayment,
      billing_type: _billingType,
      ...legacyCompanyUpdate
    } = companyUpdate;

    ({ error: companyError } = await supabase
      .from("companies")
      .update(legacyCompanyUpdate)
      .eq("id", body.id));
  }

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
        active: body.billing_type === "subsidized"
      },
      {
        company_id: body.id,
        product_type: "half_menu",
        subsidy_amount: Number(body.half_menu_subsidy ?? 0),
        max_uses_per_customer_per_day: 1,
        active: body.billing_type === "subsidized"
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
