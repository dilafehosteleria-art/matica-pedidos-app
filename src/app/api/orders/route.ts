import { NextRequest, NextResponse } from "next/server";
import { DELIVERY_WINDOW } from "@/lib/constants";
import { cutlerySupplement } from "@/lib/cutlery";
import { validateCompanyOrderEmail } from "@/lib/email-rules";
import { toDateInputValue } from "@/lib/format";
import { getGlobalSchedule } from "@/lib/global-settings";
import { sendOrderNotificationEmail } from "@/lib/order-email";
import { isSubsidyConsumingOrder } from "@/lib/order-validity";
import { deliveryWindowLabel, isOrderWindowOpen, orderWindowMessage } from "@/lib/schedule";
import {
  createStripeCheckoutSession,
  isOnlinePaymentMethod,
  paymentOptionsForCompany,
  resolveStripeReturnBaseUrl
} from "@/lib/payment";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { AdminOrder, OrderStatus, PaymentMethod, ProductType } from "@/lib/types";
import {
  expectedSaladUnitPrice,
  isCustomSaladChoice,
  MEDIUM_SALAD_SIZE_LABEL,
  SMALL_SALAD_SIZE_LABEL
} from "@/lib/salad-config";
import { expectedCustomWrapUnitPrice } from "@/lib/wrap-config";

export const dynamic = "force-dynamic";

type IncomingOrder = {
  company_slug?: string;
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
  payment_method?: PaymentMethod;
};

type SupabaseProduct = {
  id: string;
  name: string;
  base_price: number | string;
  product_type: ProductType;
};

type SubsidyRule = {
  product_type: ProductType;
  subsidy_amount: number | string;
};

type ExistingSubsidyOrder = {
  created_at: string;
  status: string;
  payment_method?: string | null;
  payment_status?: string | null;
  order_items: { subsidy_amount: number | string }[] | null;
};

type SupabaseCompany = {
  id: string;
  name: string;
  delivery_window?: string | null;
  allow_pay_on_delivery?: boolean | null;
  allow_card_payment?: boolean | null;
  allow_bizum_payment?: boolean | null;
  billing_type?: "employee" | "subsidized" | "company" | null;
};

const FIXED_CONFIGURED_PRICES: Record<string, number> = {
  "Menú del día": 13,
  "Medio menú": 10,
  "Menú ensalada pequeña + bocadillo": 10,
  "Caesar Crunch Chicken Bowl": 9.9,
  "Mediterranean Fresh Bowl": 9.9,
  "Tex-Mex Protein Bowl": 9.9,
  "Green Fresh Bowl": 9.9,
  "Diseña tu ensalada": 7.5,
  "Wrap Caesar Crunch": 8.9,
  "Wrap Tex-Mex Pork": 8.9,
  "Wrap Fresh Chicken": 8.9,
  "Wrap Mediterranean Tuna": 8.9,
  "Diseña tu wrap": 7.5,
  "Platos combinados Matica": 10,
  "Escoge tu bocadillo": 6,
  Cubiertos: 0.2
};

const DRINK_CONFIGURED_PRICES: Record<string, number> = {
  "Coca Cola": 2,
  "Coca Cola Zero": 2,
  Lipton: 2,
  "Fanta Naranja": 2,
  "Agua mineral": 1.5,
  "Agua con gas": 1.5
};

const DESSERT_CONFIGURED_PRICES: Record<string, number> = {
  Flan: 1,
  "Yogur de frutas": 1,
  Natillas: 1,
  Plátano: 1,
  Manzana: 1,
  "Flan de queso": 1.2,
  Cookie: 2
};

const GRILL_BASE_PRICE = 10;

const GRILL_PROTEIN_SUPPLEMENTS: Record<string, number> = {
  "Filete de ternera a la parrilla": 1.5,
  "Lomo de cerdo a la parrilla": 0,
  "Pechuga de pollo marinada a la parrilla": 0,
  "Salmón a la plancha": 2
};

function badRequest(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function requestBaseUrl(request: NextRequest) {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";

  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  return request.nextUrl.origin;
}

function isMissingPaymentColumnError(message?: string) {
  return Boolean(
    message &&
      (
        message.includes("'payment_method' column") ||
        message.includes("'payment_status' column") ||
        message.includes("'payment_provider' column") ||
        message.includes("'stripe_checkout_session_id' column") ||
        message.includes("'stripe_payment_intent_id' column") ||
        message.includes("'paid_at' column") ||
        message.includes("'employee_total' column") ||
        message.includes("'company_invoice_total' column")
      )
  );
}

function expectedConfiguredUnitPrice(metadata: Record<string, string>) {
  const displayName = metadata.display_name?.trim();
  const withCutlery = (price: number | null) => price === null ? null : Number((price + cutlerySupplement(metadata)).toFixed(2));

  if (
    displayName === "Menú del día" &&
    metadata.first_course?.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes("ensalada")
  ) {
    return withCutlery(expectedSaladUnitPrice(13, metadata, SMALL_SALAD_SIZE_LABEL));
  }

  if (displayName === "Medio menú" && isCustomSaladChoice(metadata.plate ?? "")) {
    return withCutlery(expectedSaladUnitPrice(10, metadata, MEDIUM_SALAD_SIZE_LABEL));
  }

  if (displayName === "Escoge tu bebida") {
    return DRINK_CONFIGURED_PRICES[metadata.drink?.trim() ?? ""] ?? null;
  }

  if (displayName === "Escoge tu postre") {
    return DESSERT_CONFIGURED_PRICES[metadata.dessert?.trim() ?? ""] ?? null;
  }

  if (displayName === "Diseña tu ensalada") {
    return withCutlery(expectedSaladUnitPrice(7.5, metadata));
  }

  if (displayName === "Diseña tu wrap") {
    return withCutlery(expectedCustomWrapUnitPrice(7.5, metadata));
  }

  if (displayName === "Menú ensalada pequeña + bocadillo") {
    return withCutlery(expectedSaladUnitPrice(10, metadata, SMALL_SALAD_SIZE_LABEL));
  }

  if (displayName === "Platos combinados Matica") {
    const proteinSupplement = GRILL_PROTEIN_SUPPLEMENTS[metadata.main_protein?.trim() ?? ""];

    return typeof proteinSupplement === "number" ? withCutlery(Number((GRILL_BASE_PRICE + proteinSupplement).toFixed(2))) : null;
  }

  const fixedPrice = FIXED_CONFIGURED_PRICES[displayName ?? ""];

  return typeof fixedPrice === "number" ? withCutlery(fixedPrice) : null;
}

function safeConfiguredUnitPrice(metadata: Record<string, string>) {
  const incomingUnitPrice = Number(metadata._configured_unit_price);
  const expectedUnitPrice = expectedConfiguredUnitPrice(metadata);
  const displayName = metadata.display_name?.trim();
  const requiresValidatedConfiguration =
    displayName === "Diseña tu wrap" ||
    displayName === "Diseña tu ensalada" ||
    displayName === "Menú ensalada pequeña + bocadillo" ||
    (
      displayName === "Menú del día" &&
      (metadata.first_course ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes("ensalada")
    ) ||
    (displayName === "Medio menú" && isCustomSaladChoice(metadata.plate ?? ""));

  if (!Number.isFinite(incomingUnitPrice) || incomingUnitPrice <= 0) {
    return { value: null, valid: !requiresValidatedConfiguration };
  }

  if (expectedUnitPrice === null || Math.abs(incomingUnitPrice - expectedUnitPrice) > 0.01) {
    return { value: null, valid: false };
  }

  return { value: expectedUnitPrice, valid: true };
}

export async function POST(request: NextRequest) {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return badRequest("Ahora mismo no podemos registrar pedidos. Inténtalo de nuevo en unos minutos.", 503);
  }

  const globalSchedule = await getGlobalSchedule(supabase);

  if (!isOrderWindowOpen(new Date(), globalSchedule)) {
    return badRequest(orderWindowMessage(globalSchedule), 403);
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

  const customerName = customer.name.trim();
  const customerEmail = customer.email.trim().toLowerCase();
  const customerPhone = customer.phone.trim();
  const companyBranchId = customer.company_branch_id;
  const companySlug = body.company_slug?.trim() || "bureau-veritas";
  const notes = body.notes?.trim() ?? "";

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("*")
    .eq("slug", companySlug)
    .eq("active", true)
    .maybeSingle();

  if (companyError || !company) {
    return badRequest("Empresa no encontrada.");
  }

  const selectedCompany = company as SupabaseCompany;
  const billingType = selectedCompany.billing_type ?? (companySlug === "bureau-veritas" ? "subsidized" : "employee");
  const emailValidation = validateCompanyOrderEmail(companySlug, customerEmail);

  if (!emailValidation.valid) {
    return badRequest(emailValidation.message);
  }

  const paymentOptions = paymentOptionsForCompany(selectedCompany);

  if (!paymentOptions.length) {
    return badRequest("No hay formas de pago disponibles para esta empresa.");
  }

  const requestedPaymentMethod = body.payment_method ?? paymentOptions[0].method;
  const selectedPaymentOption = paymentOptions.find((option) => option.method === requestedPaymentMethod);

  if (!selectedPaymentOption) {
    return badRequest("La forma de pago seleccionada no estÃ¡ disponible para esta empresa.");
  }

  const { data: branch, error: branchError } = await supabase
    .from("company_branches")
    .select("id")
    .eq("id", companyBranchId)
    .eq("company_id", selectedCompany.id)
    .eq("active", true)
    .maybeSingle();

  if (branchError || !branch) {
    return badRequest("Empresa/sociedad no válida.");
  }

  const normalizedItems = items
    .filter((item) => item.product_id)
    .map((item) => {
      const metadata = item.metadata ?? {};
      const configuredUnitPrice = safeConfiguredUnitPrice(metadata);

      return {
        product_id: item.product_id as string,
        quantity: Math.min(Math.max(1, Number(item.quantity ?? 1)), 20),
        metadata,
        configured_unit_price: configuredUnitPrice.value,
        price_valid: configuredUnitPrice.valid,
        supplement_total: Math.min(Math.max(0, Number(item.metadata?._supplement_total ?? 0)), 20)
      };
    });

  if (!normalizedItems.length) {
    return badRequest("El carrito está vacío.");
  }

  if (normalizedItems.some((item) => !item.price_valid)) {
    return badRequest("Algún precio del carrito no es válido. Vuelve a añadir el producto.");
  }

  const productIds = Array.from(new Set(normalizedItems.map((item) => item.product_id)));
  const { data: products, error: productsError } = await supabase
    .from("products")
    .select("id,name,base_price,product_type")
    .in("id", productIds)
    .eq("active", true)
    .eq("sold_out", false);

  if (productsError) {
    return badRequest(productsError.message);
  }

  const productMap = new Map((products as SupabaseProduct[] | null)?.map((product) => [product.id, product]) ?? []);

  if (productMap.size !== productIds.length) {
    return badRequest("Algún producto del carrito ya no está disponible.");
  }

  const { data: subsidyRules, error: subsidyRulesError } = await supabase
    .from("subsidy_rules")
    .select("product_type,subsidy_amount")
    .eq("company_id", selectedCompany.id)
    .eq("active", true);

  if (subsidyRulesError) {
    return badRequest(subsidyRulesError.message);
  }

  const subsidyByType = new Map(
    ((subsidyRules as SubsidyRule[] | null) ?? []).map((rule) => [rule.product_type, Number(rule.subsidy_amount)])
  );

  const recentLimit = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString();
  const today = toDateInputValue();
  const { data: existingOrders, error: subsidyUsageError } = await supabase
    .from("orders")
    .select("created_at,status,payment_method,payment_status,order_items(subsidy_amount)")
    .eq("company_id", selectedCompany.id)
    .eq("customer_email", customerEmail)
    .gte("created_at", recentLimit);

  if (subsidyUsageError) {
    return badRequest(subsidyUsageError.message);
  }

  const priorSubsidyUsed = ((existingOrders as ExistingSubsidyOrder[] | null) ?? []).some((order) => {
    const sameMadridDay = toDateInputValue(new Date(order.created_at)) === today;
    const hasSubsidy = (order.order_items ?? []).some((item) => Number(item.subsidy_amount) > 0);

    return sameMadridDay && isSubsidyConsumingOrder(order) && hasSubsidy;
  });

  await supabase.from("customers").upsert(
    {
      name: customerName,
      email: customerEmail,
      phone: customerPhone,
      company_id: selectedCompany.id,
      company_branch_id: companyBranchId
    },
    { onConflict: "company_id,email" }
  );

  let subtotal = 0;
  let subsidyTotal = 0;
  let subsidyApplied = false;

  const orderItems = normalizedItems.map((item) => {
    const product = productMap.get(item.product_id);

    if (!product) {
      throw new Error("Producto no disponible.");
    }

    const basePrice = Number(product.base_price);
    const unitPrice = item.configured_unit_price ?? Number((basePrice + item.supplement_total).toFixed(2));
    const lineSubtotal = Number((unitPrice * item.quantity).toFixed(2));
    const possibleSubsidy =
      billingType === "subsidized"
        ? subsidyByType.get(product.product_type) ?? 0
        : 0;
    const displayName =
      item.metadata.display_name?.trim() && item.metadata.display_name.length <= 80
        ? item.metadata.display_name.trim()
        : product.name;
    const lineSubsidy =
      possibleSubsidy > 0 && !priorSubsidyUsed && !subsidyApplied
        ? Number(Math.min(possibleSubsidy, lineSubtotal).toFixed(2))
        : 0;
    const lineTotal = Number((lineSubtotal - lineSubsidy).toFixed(2));

    if (lineSubsidy > 0) {
      subsidyApplied = true;
    }

    subtotal = Number((subtotal + lineSubtotal).toFixed(2));
    subsidyTotal = Number((subsidyTotal + lineSubsidy).toFixed(2));

    return {
      product_id: product.id,
      name: displayName,
      quantity: item.quantity,
      unit_price: unitPrice,
      base_price: basePrice,
      subsidy_amount: lineSubsidy,
      total_price: lineTotal,
      metadata: item.metadata
    };
  });

  const companyPaysAll = billingType === "company" && !isOnlinePaymentMethod(requestedPaymentMethod);
  const employeeTotal =
    companyPaysAll
      ? 0
      : Number((subtotal - subsidyTotal).toFixed(2));
  const companyInvoiceTotal =
    companyPaysAll
      ? subtotal
      : billingType === "subsidized"
        ? subsidyTotal
        : 0;
  const total = employeeTotal;
  const isOnlinePayment = isOnlinePaymentMethod(requestedPaymentMethod);
  const initialStatus: OrderStatus = isOnlinePayment ? "pendiente_pago" : "nuevo";

  const orderPayload = {
    customer_id: null,
    company_id: selectedCompany.id,
    company_branch_id: companyBranchId,
    customer_name: customerName,
    customer_email: customerEmail,
    customer_phone: customerPhone,
    status: initialStatus,
    payment_method: requestedPaymentMethod,
    payment_status: "pending",
    payment_provider: isOnlinePayment ? "stripe" : null,
    subtotal,
    subsidy_total: subsidyTotal,
    employee_total: employeeTotal,
    company_invoice_total: companyInvoiceTotal,
    total,
    notes,
    delivery_window: deliveryWindowLabel(globalSchedule) || selectedCompany.delivery_window || DELIVERY_WINDOW
  };

  let { data: order, error: orderError } = await supabase
    .from("orders")
    .insert(orderPayload)
    .select("id")
    .single();

  if (orderError && !isOnlinePayment && isMissingPaymentColumnError(orderError.message)) {
    const {
      payment_method: _paymentMethod,
      payment_status: _paymentStatus,
      payment_provider: _paymentProvider,
      employee_total: _employeeTotal,
      company_invoice_total: _companyInvoiceTotal,
      ...legacyOrderPayload
    } = orderPayload;

    ({ data: order, error: orderError } = await supabase
      .from("orders")
      .insert(legacyOrderPayload)
      .select("id")
      .single());
  }

  if (orderError || !order) {
    return badRequest(orderError?.message ?? "No se pudo crear el pedido.");
  }

  const { error: orderItemsError } = await supabase.from("order_items").insert(
    orderItems.map((item) => ({
      ...item,
      order_id: order.id
    }))
  );

  if (orderItemsError) {
    await supabase
      .from("orders")
      .update({
        status: "cancelado",
        notes: `${notes ? `${notes}\n` : ""}Error creando líneas: ${orderItemsError.message}`
      })
      .eq("id", order.id);

    return badRequest(orderItemsError.message);
  }

  let stripeSession: { id: string; url: string } | null = null;

  if (isOnlinePayment) {
    try {
      stripeSession = await createStripeCheckoutSession({
        amount: total,
        companyName: selectedCompany.name,
        companySlug,
        customerEmail,
        orderId: order.id,
        baseUrl: resolveStripeReturnBaseUrl(requestBaseUrl(request)),
        paymentMethod: requestedPaymentMethod
      });

      await supabase
        .from("orders")
        .update({
          stripe_checkout_session_id: stripeSession.id
        })
        .eq("id", order.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo iniciar el pago.";

      await supabase
        .from("orders")
        .update({
          status: "cancelado",
          status_updated_at: new Date().toISOString(),
          payment_status: "failed",
          notes: `${notes ? `${notes}\n` : ""}Error iniciando pago Stripe: ${message}`
        })
        .eq("id", order.id);

      return badRequest(message, 503);
    }
  } else {
    const { data: emailOrder, error: emailOrderError } = await supabase
      .from("orders")
      .select("*,order_items(*),companies(name,delivery_address),company_branches(name)")
      .eq("id", order.id)
      .single();

    if (emailOrderError || !emailOrder) {
      console.warn("[order-email] No se pudo cargar el pedido completo para notificar.", emailOrderError?.message);
    } else {
      await sendOrderNotificationEmail(emailOrder as AdminOrder);
    }
  }

  return NextResponse.json({
    order: {
      id: order.id,
      subtotal,
      subsidy_total: subsidyTotal,
      employee_total: employeeTotal,
      company_invoice_total: companyInvoiceTotal,
      total,
      subsidy_applied: subsidyApplied,
      prior_subsidy_used: priorSubsidyUsed
    },
    payment: isOnlinePayment
      ? {
          provider: "stripe",
          method: requestedPaymentMethod,
          status: "pending",
          redirect_url: stripeSession?.url ?? null
        }
      : {
          provider: "manual",
          method: requestedPaymentMethod,
          status: "pending"
        }
  });
}
