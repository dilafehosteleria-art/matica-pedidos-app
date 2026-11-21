import { NextRequest, NextResponse } from "next/server";
import { readActiveDailyMenu } from "@/lib/active-daily-menu";
import { isMenuSaladSandwichProduct } from "@/lib/catalog";
import { getUnavailableMenuFields, isDailyMenuProduct } from "@/lib/daily-menu-courses";
import { validateCompanyOrderEmail } from "@/lib/email-rules";
import { toDateInputValue } from "@/lib/format";
import { getGlobalSchedule } from "@/lib/global-settings";
import {
  getLocalOrderState,
  hasLateLocalMenuConfiguration,
  isLocalFulfillmentType,
  type LocalFulfillmentType,
  type LocalOrderingCompany
} from "@/lib/local-ordering";
import { isRequestedLocalTimeAllowed } from "@/lib/local-order-time";
import { readOperatingCalendar } from "@/lib/operating-calendar-data";
import { sendOrderNotificationEmail } from "@/lib/order-email";
import { isSubsidyConsumingOrder } from "@/lib/order-validity";
import { getOrderWindowState } from "@/lib/schedule";
import {
  createStripeCheckoutSession,
  isOnlinePaymentMethod,
  paymentProviderForMethod,
  paymentOptionsForCompany,
  resolvePaymentReturnBaseUrl
} from "@/lib/payment";
import { createSumUpHostedCheckout } from "@/lib/sumup-hosted-checkout";
import { sumUpCheckoutReferenceForOrder } from "@/lib/sumup-payment";
import { priceOrderItem } from "@/lib/order-pricing";
import { isMissingDatabaseColumn } from "@/lib/supabase/errors";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import type { AdminOrder, OrderStatus, PaymentMethod, ProductType } from "@/lib/types";

export const dynamic = "force-dynamic";

type IncomingOrder = {
  company_slug?: string;
  fulfillment_type?: "delivery" | LocalFulfillmentType;
  requested_time?: unknown;
  availability_acknowledged?: boolean;
  customer?: {
    name?: string;
    email?: string;
    phone?: string;
    company_branch_id?: string;
  };
  items?: {
    product_id?: string;
    quantity?: number;
    metadata?: Record<string, unknown>;
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

type SupabaseCompany = LocalOrderingCompany & {
  id: string;
  name: string;
  delivery_window?: string | null;
  allow_pay_on_delivery?: boolean | null;
  allow_card_payment?: boolean | null;
  allow_bizum_payment?: boolean | null;
  billing_type?: "employee" | "subsidized" | "company" | null;
};

type FulfillmentType = "delivery" | LocalFulfillmentType;
type MenuSelectionMode = "confirmed" | "on_arrival";

function badRequest(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function codedError(code: string, message: string, status: number, details: Record<string, unknown> = {}) {
  return NextResponse.json({ code, error: message, ...details }, { status });
}

function normalizeRequestedTime(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return { valid: true, value: null } as const;
  }

  if (typeof value !== "string") {
    return { valid: false, value: null } as const;
  }

  const match = value.trim().match(/^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/);
  return match
    ? { valid: true, value: `${match[1]}:${match[2]}` } as const
    : { valid: false, value: null } as const;
}

function sanitizeMetadata(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {} as Record<string, string>;
  }

  const metadata: Record<string, string> = {};

  for (const [key, entry] of Object.entries(value).slice(0, 50)) {
    if (
      !/^[a-z0-9_]{1,64}$/i.test(key) ||
      ["__proto__", "constructor", "prototype"].includes(key) ||
      typeof entry !== "string" ||
      entry.length > 1_000
    ) {
      continue;
    }

    metadata[key] = entry;
  }

  return metadata;
}

function requestBaseUrl(request: NextRequest) {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";

  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  return request.nextUrl.origin;
}

const PAYMENT_COLUMNS = [
  "payment_method",
  "payment_status",
  "payment_provider",
  "payment_checkout_id",
  "payment_transaction_id",
  "stripe_checkout_session_id",
  "stripe_payment_intent_id",
  "paid_at",
  "employee_total",
  "company_invoice_total"
] as const;
const LOCAL_ORDER_COLUMNS = ["fulfillment_type", "requested_time", "menu_selection_mode"] as const;
const PRODUCT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return badRequest("Ahora mismo no podemos registrar pedidos. Inténtalo de nuevo en unos minutos.", 503);
  }

  let body: IncomingOrder;

  try {
    body = (await request.json()) as IncomingOrder;
  } catch {
    return badRequest("El pedido no tiene un formato válido.");
  }

  const companySlug = body.company_slug?.trim() || "bureau-veritas";
  const rawFulfillmentType = body.fulfillment_type ?? "delivery";

  if (rawFulfillmentType !== "delivery" && !isLocalFulfillmentType(rawFulfillmentType)) {
    return codedError(
      "INVALID_FULFILLMENT_TYPE",
      "La modalidad del pedido no es válida. Elige entrega, comer en el local o recoger en el local.",
      400
    );
  }

  const fulfillmentType = rawFulfillmentType as FulfillmentType;
  const requestedTimeResult = normalizeRequestedTime(body.requested_time);

  if (!requestedTimeResult.valid) {
    return codedError("INVALID_REQUESTED_TIME", "La hora solicitada debe tener formato HH:MM.", 400);
  }

  const requestedTime = fulfillmentType === "delivery" ? null : requestedTimeResult.value;
  const companyQuery = supabase
    .from("companies")
    .select("*")
    .eq("slug", companySlug)
    .eq("active", true)
    .maybeSingle();
  const [{ data: company, error: companyError }, globalSchedule] = await Promise.all([
    companyQuery,
    getGlobalSchedule(supabase)
  ]);

  if (companyError || !company) {
    return badRequest("Empresa no encontrada.");
  }

  const selectedCompany = company as SupabaseCompany;
  const now = new Date();
  const operatingCalendar = await readOperatingCalendar(supabase, {
    companyId: selectedCompany.id,
    date: toDateInputValue(now)
  });

  if (!operatingCalendar.available) {
    return codedError(
      "OPERATING_CALENDAR_UNAVAILABLE",
      "No podemos comprobar ahora el calendario de aperturas. Inténtalo de nuevo en unos minutos.",
      503
    );
  }

  const calendarContext = {
    closures: operatingCalendar.closures,
    exceptions: operatingCalendar.exceptions,
    companyId: selectedCompany.id,
    localOnlyDays: selectedCompany.local_only_days,
    available: true
  };
  const deliveryOrderState = getOrderWindowState(now, globalSchedule, calendarContext);
  const localOrderState = fulfillmentType === "delivery"
    ? null
    : getLocalOrderState(now, selectedCompany, calendarContext);

  if (fulfillmentType === "delivery" && !deliveryOrderState.open) {
    return codedError("ORDER_WINDOW_CLOSED", deliveryOrderState.message, 403, {
      fulfillment_type: fulfillmentType
    });
  }

  if (localOrderState && !localOrderState.open) {
    return codedError("LOCAL_ORDER_WINDOW_CLOSED", localOrderState.message, 403, {
      fulfillment_type: fulfillmentType,
      local_date: localOrderState.localDate,
      current_time: localOrderState.currentTime
    });
  }

  if (localOrderState && !requestedTime) {
    return codedError(
      "LOCAL_REQUESTED_TIME_REQUIRED",
      "Indica a qué hora quieres comer o recoger el pedido en Matica.",
      400,
      { fulfillment_type: fulfillmentType }
    );
  }

  if (
    localOrderState &&
    requestedTime &&
    !isRequestedLocalTimeAllowed(
      requestedTime,
      localOrderState.currentTime,
      localOrderState.openTime,
      localOrderState.closeTime
    )
  ) {
    const localOpenTime = localOrderState.openTime;
    const localCloseTime = localOrderState.closeTime;
    return codedError(
      "LOCAL_REQUESTED_TIME_OUTSIDE_WINDOW",
      localOpenTime && localCloseTime
        ? `Elige una hora desde ahora y antes de las ${localCloseTime}. El servicio local está disponible de ${localOpenTime} a ${localCloseTime}.`
        : "La hora elegida no está disponible para pedidos en el local.",
      409,
      {
        fulfillment_type: fulfillmentType,
        requested_time: requestedTime,
        current_time: localOrderState.currentTime,
        local_open_time: localOpenTime,
        local_close_time: localCloseTime
      }
    );
  }

  const guaranteeCutoff = localOrderState?.guaranteeCutoff
    ?? selectedCompany.local_ordering_guarantee_cutoff?.slice(0, 5)
    ?? "12:40";
  const menuSelectionMode: MenuSelectionMode = localOrderState?.afterGuaranteeCutoff
    ? "on_arrival"
    : "confirmed";

  const customer = body.customer;
  const items = Array.isArray(body.items) ? body.items : [];

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
  const notes = body.notes?.trim() ?? "";
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
    return badRequest("La forma de pago seleccionada no está disponible para esta empresa.");
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

  const normalizedItems = items.map((item, index) => {
    const productId = item && typeof item.product_id === "string" ? item.product_id : "";
    const metadata = sanitizeMetadata(item.metadata);
    const quantity = Number(item.quantity ?? 1);

    return {
      index,
      product_id: productId,
      product_id_valid: PRODUCT_ID_PATTERN.test(productId),
      quantity,
      quantity_valid: Number.isInteger(quantity) && quantity >= 1 && quantity <= 20,
      metadata,
    };
  });

  if (!normalizedItems.length) {
    return badRequest("El carrito está vacío.");
  }

  if (normalizedItems.some((item) => !item.quantity_valid)) {
    return badRequest("Alguna cantidad del carrito no es válida.");
  }

  if (normalizedItems.some((item) => !item.product_id_valid)) {
    return badRequest("Algún producto del carrito no es válido.");
  }

  const productIds = Array.from(new Set(normalizedItems.map((item) => item.product_id)));
  const { data: products, error: productsError } = await supabase
    .from("products")
    .select("id,name,base_price,product_type")
    .eq("active", true)
    .eq("sold_out", false);

  if (productsError) {
    return badRequest(productsError.message);
  }

  const pricingCatalog = (products as SupabaseProduct[] | null) ?? [];
  const productMap = new Map(pricingCatalog.map((product) => [product.id, product]));

  if (productIds.some((id) => !productMap.has(id))) {
    return badRequest("Algún producto del carrito ya no está disponible.");
  }

  if (
    localOrderState &&
    normalizedItems.some((item) => isMenuSaladSandwichProduct(productMap.get(item.product_id)!))
  ) {
    return codedError(
      "LOCAL_PRODUCT_NOT_AVAILABLE",
      "El Menú de ensalada pequeña con bocadillo no está disponible para comer o recoger en el restaurante porque no tiene subvención.",
      409,
      { fulfillment_type: fulfillmentType }
    );
  }

  if (
    menuSelectionMode === "on_arrival" &&
    normalizedItems.some((item) => !isDailyMenuProduct(productMap.get(item.product_id)!.product_type))
  ) {
    return codedError(
      "LOCAL_MENU_CUTOFF",
      `En los pedidos realizados a partir de las ${guaranteeCutoff}, solo puedes incluir Menú del día o Medio menú. Los platos se eligen al llegar, según disponibilidad.`,
      409,
      {
        fulfillment_type: fulfillmentType,
        menu_selection_mode: menuSelectionMode,
        allowed_product_types: ["daily_menu", "half_menu"],
        guarantee_cutoff: guaranteeCutoff,
        local_date: localOrderState?.localDate,
        current_time: localOrderState?.currentTime
      }
    );
  }


  if (
    menuSelectionMode === "on_arrival" &&
    normalizedItems.some((item) => hasLateLocalMenuConfiguration(item.metadata))
  ) {
    return codedError(
      "LOCAL_SELECTION_CHANGED",
      `En los pedidos realizados a partir de las ${guaranteeCutoff}, los platos se eligen al llegar según disponibilidad. Revisa el carrito para continuar sin una selección confirmada.`,
      409,
      {
        fulfillment_type: fulfillmentType,
        menu_selection_mode: menuSelectionMode,
        guarantee_cutoff: guaranteeCutoff,
        local_date: localOrderState?.localDate,
        current_time: localOrderState?.currentTime
      }
    );
  }

  if (menuSelectionMode === "on_arrival" && body.availability_acknowledged !== true) {
    return codedError(
      "LOCAL_AVAILABILITY_ACK_REQUIRED",
      `Confirma que, al realizar el pedido a partir de las ${guaranteeCutoff}, elegirás los platos al llegar según disponibilidad.`,
      409,
      {
        fulfillment_type: fulfillmentType,
        menu_selection_mode: menuSelectionMode,
        guarantee_cutoff: guaranteeCutoff
      }
    );
  }

  // Validate only after loading current prices, before any customer/order writes.
  const pricedItems = normalizedItems.map((item) => {
    const product = productMap.get(item.product_id)!;
    const { _configured_unit_price: quoted, ...unquotedMetadata } = item.metadata;
    const validatedItem = priceOrderItem(product, unquotedMetadata, pricingCatalog);
    const unitPrice = validatedItem.unitPrice;
    const incoming = quoted === undefined ? null : Number(quoted);
    const quoteValid = quoted === undefined || (incoming !== null && Number.isFinite(incoming) && incoming > 0);
    const priceMatches = quoted === undefined || (incoming !== null && unitPrice !== null && Math.abs(incoming - unitPrice) < 1e-8);

    return {
      ...item,
      configured_unit_price: unitPrice,
      display_name: validatedItem.displayName,
      metadata: validatedItem.metadata,
      price_valid: validatedItem.valid && unitPrice !== null && quoteValid && priceMatches,
      price_recoverable: validatedItem.valid && unitPrice !== null && quoteValid
    };
  });

  if (pricedItems.some((item) => !item.price_valid)) {
    return NextResponse.json({
      error: "Algún precio del carrito no es válido. Vuelve a añadir el producto.",
      ...(pricedItems.every((item) => item.price_recoverable) ? {
        code: "PRICE_CHANGED",
        prices: pricedItems.map((item) => ({ product_id: item.product_id, unit_price: item.configured_unit_price }))
      } : {})
    }, { status: 400 });
  }

  const menuItems = pricedItems.flatMap((item) => {
    const type = productMap.get(item.product_id)!.product_type;
    return isDailyMenuProduct(type) ? [{ item, type }] : [];
  });
  const today = toDateInputValue(now);
  const recentLimit = new Date(now.getTime() - 36 * 60 * 60 * 1000).toISOString();
  const subsidyRulesQuery = supabase
    .from("subsidy_rules")
    .select("product_type,subsidy_amount")
    .eq("company_id", selectedCompany.id)
    .eq("active", true);
  const existingOrdersQuery = supabase
    .from("orders")
    .select("created_at,status,payment_method,payment_status,order_items(subsidy_amount)")
    .eq("company_id", selectedCompany.id)
    .eq("customer_email", customerEmail)
    .gte("created_at", recentLimit);
  const [
    { data: subsidyRules, error: subsidyRulesError },
    { data: existingOrders, error: subsidyUsageError },
    menuResult
  ] = await Promise.all([
    subsidyRulesQuery,
    existingOrdersQuery,
    menuItems.length && menuSelectionMode === "confirmed" ? readActiveDailyMenu(supabase, today) : null
  ]);

  if (subsidyRulesError) {
    return badRequest(subsidyRulesError.message);
  }

  const subsidyByType = new Map(
    ((subsidyRules as SubsidyRule[] | null) ?? []).map((rule) => [rule.product_type, Number(rule.subsidy_amount)])
  );

  if (subsidyUsageError) {
    return badRequest(subsidyUsageError.message);
  }

  const priorSubsidyUsed = ((existingOrders as ExistingSubsidyOrder[] | null) ?? []).some((order) => {
    const sameMadridDay = toDateInputValue(new Date(order.created_at)) === today;
    const hasSubsidy = (order.order_items ?? []).some((item) => Number(item.subsidy_amount) > 0);

    return sameMadridDay && isSubsidyConsumingOrder(order) && hasSubsidy;
  });

  if (menuResult) {
    const { data: menu, error: menuError } = menuResult;
    if (menuError) {
      return badRequest("No se ha podido comprobar el menú. Inténtalo de nuevo en unos segundos.", 503);
    }

    const invalidItems = menuItems.flatMap(({ item, type }) => {
      const fields = getUnavailableMenuFields(type, item.metadata, menu);
      return fields.length ? [{ index: item.index, fields }] : [];
    });

    if (invalidItems.length) {
      return NextResponse.json({
        code: "MENU_CHANGED",
        error: menu ? "El menú ha cambiado. Actualiza la página y vuelve a elegir el plato." : "El menú de hoy todavía no está disponible.",
        menu,
        invalidItems
      }, { status: 409 });
    }
  }

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

  const orderItems = pricedItems.map((item) => {
    const product = productMap.get(item.product_id);

    if (!product) {
      throw new Error("Producto no disponible.");
    }

    const basePrice = Number(product.base_price);
    const unitPrice = item.configured_unit_price!;
    const lineSubtotal = Number((unitPrice * item.quantity).toFixed(2));
    const possibleSubsidy =
      billingType === "subsidized"
        ? subsidyByType.get(product.product_type) ?? 0
        : 0;
    const displayName = item.display_name ?? product.name;
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
  const paymentProvider = paymentProviderForMethod(requestedPaymentMethod);
  const isOnlinePayment = isOnlinePaymentMethod(requestedPaymentMethod);
  const initialStatus: OrderStatus = isOnlinePayment ? "pendiente_pago" : "nuevo";
  const serviceWindow = fulfillmentType === "delivery"
    ? `${deliveryOrderState.deliveryStartTime} a ${deliveryOrderState.deliveryEndTime}`
    : `En Matica · ${requestedTime}`;

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
    payment_provider: paymentProvider,
    subtotal,
    subsidy_total: subsidyTotal,
    employee_total: employeeTotal,
    company_invoice_total: companyInvoiceTotal,
    total,
    notes,
    fulfillment_type: fulfillmentType,
    requested_time: requestedTime,
    menu_selection_mode: menuSelectionMode,
    delivery_window: serviceWindow
  };

  let insertPayload: Record<string, unknown> = orderPayload;
  let order: { id: string } | null = null;
  let orderError: { code?: string | null; message?: string | null; details?: string | null; hint?: string | null } | null = null;
  let removedLocalColumns = false;
  let removedPaymentColumns = false;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    ({ data: order, error: orderError } = await supabase
      .from("orders")
      .insert(insertPayload)
      .select("id")
      .single());

    if (!orderError && order) {
      break;
    }

    if (!removedLocalColumns && isMissingDatabaseColumn(orderError, LOCAL_ORDER_COLUMNS)) {
      if (fulfillmentType !== "delivery") {
        return codedError(
          "LOCAL_ORDERING_NOT_READY",
          "La opción de comer o recoger en el local se está activando. Inténtalo de nuevo en unos minutos.",
          503
        );
      }

      const {
        fulfillment_type: _fulfillmentType,
        requested_time: _requestedTime,
        menu_selection_mode: _menuSelectionMode,
        ...legacyDeliveryPayload
      } = insertPayload;
      insertPayload = legacyDeliveryPayload;
      removedLocalColumns = true;
      continue;
    }

    if (!isOnlinePayment && !removedPaymentColumns && isMissingDatabaseColumn(orderError, PAYMENT_COLUMNS)) {
      const {
        payment_method: _paymentMethod,
        payment_status: _paymentStatus,
        payment_provider: _paymentProvider,
        employee_total: _employeeTotal,
        company_invoice_total: _companyInvoiceTotal,
        ...legacyPaymentPayload
      } = insertPayload;
      insertPayload = legacyPaymentPayload;
      removedPaymentColumns = true;
      continue;
    }

    break;
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

  let onlineCheckout: { id: string; url: string } | null = null;

  if (isOnlinePayment) {
    try {
      const baseUrl = resolvePaymentReturnBaseUrl(requestBaseUrl(request));

      if (paymentProvider === "sumup") {
        const checkoutReference = sumUpCheckoutReferenceForOrder(order.id);
        const sumUpCheckout = await createSumUpHostedCheckout({
          checkoutReference,
          amount: total,
          currency: "EUR",
          description: `Pedido Matica ${order.id.slice(0, 8)} - ${selectedCompany.name}`,
          returnUrl: `${baseUrl}/api/sumup/webhook`,
          redirectUrl: `${baseUrl}/empresa/${encodeURIComponent(companySlug)}?payment=processing&order=${encodeURIComponent(order.id)}`
        });

        onlineCheckout = {
          id: sumUpCheckout.id,
          url: sumUpCheckout.hostedCheckoutUrl
        };

        const { error: checkoutUpdateError } = await supabase
          .from("orders")
          .update({
            payment_checkout_id: sumUpCheckout.id
          })
          .eq("id", order.id);

        if (checkoutUpdateError) {
          throw new Error(checkoutUpdateError.message);
        }
      } else {
        const stripeSession = await createStripeCheckoutSession({
          amount: total,
          companyName: selectedCompany.name,
          companySlug,
          customerEmail,
          orderId: order.id,
          baseUrl,
          paymentMethod: requestedPaymentMethod
        });

        onlineCheckout = stripeSession;

        const stripeUpdate = await supabase
          .from("orders")
          .update({
            payment_checkout_id: stripeSession.id,
            stripe_checkout_session_id: stripeSession.id
          })
          .eq("id", order.id);

        if (stripeUpdate.error && isMissingDatabaseColumn(stripeUpdate.error, PAYMENT_COLUMNS)) {
          const { error: legacyStripeUpdateError } = await supabase
            .from("orders")
            .update({
              stripe_checkout_session_id: stripeSession.id
            })
            .eq("id", order.id);

          if (legacyStripeUpdateError) {
            throw new Error(legacyStripeUpdateError.message);
          }
        } else if (stripeUpdate.error) {
          throw new Error(stripeUpdate.error.message);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo iniciar el pago.";
      const providerLabel = paymentProvider === "sumup" ? "SumUp" : "Stripe";

      await supabase
        .from("orders")
        .update({
          status: "cancelado",
          status_updated_at: new Date().toISOString(),
          payment_status: "failed",
          notes: `${notes ? `${notes}\n` : ""}Error iniciando pago ${providerLabel}: ${message}`
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
      prior_subsidy_used: priorSubsidyUsed,
      fulfillment_type: fulfillmentType,
      requested_time: requestedTime,
      menu_selection_mode: menuSelectionMode
    },
    payment: isOnlinePayment
      ? {
          provider: paymentProvider,
          method: requestedPaymentMethod,
          status: "pending",
          redirect_url: onlineCheckout?.url ?? null
        }
      : {
          provider: "manual",
          method: requestedPaymentMethod,
          status: "pending"
        }
  });
}
