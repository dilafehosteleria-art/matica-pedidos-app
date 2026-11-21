import { NextRequest, NextResponse } from "next/server";
import { assertAdmin } from "@/lib/admin";
import { toDateInputValue } from "@/lib/format";
import { getGlobalSchedule } from "@/lib/global-settings";
import { validateLocalOrderingSettings } from "@/lib/local-ordering";
import { deliveryWindowLabel, orderWindowLabel } from "@/lib/schedule";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import type { CompanyDraft, NewCompanyDraft } from "@/lib/types";

export const dynamic = "force-dynamic";

type LocalOrderingActionRequest = {
  id?: string;
  local_ordering_action?: "close_today" | "reopen_today";
};

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
  const adminError = await assertAdmin(request);

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
  const adminError = await assertAdmin(request);

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
  const adminError = await assertAdmin(request);

  if (adminError) {
    return adminError;
  }

  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return NextResponse.json({ error: "Configura Supabase para usar el panel." }, { status: 503 });
  }

  const rawBody = (await request.json()) as unknown;

  if (rawBody && typeof rawBody === "object" && !Array.isArray(rawBody) && "local_ordering_action" in rawBody) {
    const actionBody = rawBody as LocalOrderingActionRequest;
    const id = typeof actionBody.id === "string" ? actionBody.id.trim() : "";
    const action = actionBody.local_ordering_action;

    if (!id || (action !== "close_today" && action !== "reopen_today")) {
      return NextResponse.json({ error: "Acción de pedidos en local no válida." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("companies")
      .update({ local_orders_closed_on: action === "close_today" ? toDateInputValue() : null })
      .eq("id", id)
      .select("*,subsidy_rules(product_type,subsidy_amount,active)")
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "No se pudo actualizar la operativa local." }, { status: 400 });
    }

    return NextResponse.json({ company: data });
  }

  if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
    return NextResponse.json({ error: "La configuración de empresa no es válida." }, { status: 400 });
  }

  const body = rawBody as CompanyDraft;

  if (
    typeof body.id !== "string" ||
    typeof body.name !== "string" ||
    typeof body.slug !== "string" ||
    !body.id.trim() ||
    !body.name.trim() ||
    !normalizeSlug(body.slug)
  ) {
    return NextResponse.json({ error: "Empresa, nombre y slug requeridos." }, { status: 400 });
  }

  if (
    typeof body.active !== "boolean" ||
    typeof body.allow_pay_on_delivery !== "boolean" ||
    typeof body.allow_card_payment !== "boolean" ||
    typeof body.allow_bizum_payment !== "boolean" ||
    (body.delivery_address != null && typeof body.delivery_address !== "string") ||
    (body.order_window != null && typeof body.order_window !== "string") ||
    (body.delivery_window != null && typeof body.delivery_window !== "string")
  ) {
    return NextResponse.json({ error: "La configuración de acceso o pago no es válida." }, { status: 400 });
  }

  if (!(["employee", "subsidized", "company"] as const).includes(body.billing_type)) {
    return NextResponse.json({ error: "El tipo de facturación no es válido." }, { status: 400 });
  }

  if (
    typeof body.daily_menu_subsidy !== "number" ||
    typeof body.half_menu_subsidy !== "number" ||
    !Number.isFinite(body.daily_menu_subsidy) ||
    !Number.isFinite(body.half_menu_subsidy) ||
    body.daily_menu_subsidy < 0 ||
    body.half_menu_subsidy < 0
  ) {
    return NextResponse.json({ error: "Las subvenciones deben ser importes válidos y no negativos." }, { status: 400 });
  }

  if (!body.allow_pay_on_delivery && !body.allow_card_payment && !body.allow_bizum_payment) {
    return NextResponse.json({ error: "Selecciona al menos una forma de pago." }, { status: 400 });
  }

  const localOrdering = validateLocalOrderingSettings(body);

  if (!localOrdering.valid) {
    return NextResponse.json({ error: localOrdering.message }, { status: 400 });
  }

  const companyUpdate = {
    name: body.name.trim(),
    slug: normalizeSlug(body.slug),
    delivery_address: body.delivery_address?.trim() || null,
    active: body.active,
    order_window: body.order_window?.trim() || null,
    delivery_window: body.delivery_window?.trim() || null,
    allow_pay_on_delivery: body.allow_pay_on_delivery,
    allow_card_payment: body.allow_card_payment,
    allow_bizum_payment: body.allow_bizum_payment,
    billing_type: body.billing_type,
    ...localOrdering.settings
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
        subsidy_amount: body.daily_menu_subsidy,
        max_uses_per_customer_per_day: 1,
        active: body.billing_type === "subsidized"
      },
      {
        company_id: body.id,
        product_type: "half_menu",
        subsidy_amount: body.half_menu_subsidy,
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
