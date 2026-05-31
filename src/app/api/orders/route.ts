import { NextRequest, NextResponse } from "next/server";
import { DELIVERY_WINDOW } from "@/lib/constants";
import { toDateInputValue } from "@/lib/format";
import { createPaymentPlaceholder, shouldRequireOnlinePayment } from "@/lib/payment";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { OrderStatus, ProductType } from "@/lib/types";

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
  order_items: { subsidy_amount: number | string }[] | null;
};

type SupabaseCompany = {
  id: string;
  delivery_window?: string | null;
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

const SALAD_SIZE_SUPPLEMENTS: Record<string, number> = {
  "Tamaño Mediano 1000ML": 0,
  "Tamaño Grande 1500ML": 2
};

const SALAD_PROTEIN_SUPPLEMENTS: Record<string, number> = {
  Atún: 0,
  "Falafel vegetal de garbanzo y quinoa": 0,
  "Lomo Asado": 0,
  Pollo: 0,
  "Salmón ahumado": 2.5
};

function badRequest(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function expectedSaladConfiguredUnitPrice(basePrice: number, metadata: Record<string, string>, includeSize: boolean) {
  const sizeSupplement = includeSize ? SALAD_SIZE_SUPPLEMENTS[metadata.salad_size?.trim() ?? ""] : 0;
  const proteinSupplement = SALAD_PROTEIN_SUPPLEMENTS[metadata.protein?.trim() ?? ""];

  if (typeof sizeSupplement !== "number" || typeof proteinSupplement !== "number") {
    return null;
  }

  return Number((basePrice + sizeSupplement + proteinSupplement).toFixed(2));
}

function expectedConfiguredUnitPrice(metadata: Record<string, string>) {
  const displayName = metadata.display_name?.trim();

  if (displayName === "Escoge tu bebida") {
    return DRINK_CONFIGURED_PRICES[metadata.drink?.trim() ?? ""] ?? null;
  }

  if (displayName === "Escoge tu postre") {
    return DESSERT_CONFIGURED_PRICES[metadata.dessert?.trim() ?? ""] ?? null;
  }

  if (displayName === "Diseña tu ensalada") {
    return expectedSaladConfiguredUnitPrice(7.5, metadata, true);
  }

  if (displayName === "Menú ensalada pequeña + bocadillo") {
    return expectedSaladConfiguredUnitPrice(10, metadata, false);
  }

  if (displayName === "Platos combinados Matica") {
    const proteinSupplement = GRILL_PROTEIN_SUPPLEMENTS[metadata.main_protein?.trim() ?? ""];

    return typeof proteinSupplement === "number" ? Number((GRILL_BASE_PRICE + proteinSupplement).toFixed(2)) : null;
  }

  return FIXED_CONFIGURED_PRICES[displayName ?? ""] ?? null;
}

function safeConfiguredUnitPrice(metadata: Record<string, string>) {
  const incomingUnitPrice = Number(metadata._configured_unit_price);
  const expectedUnitPrice = expectedConfiguredUnitPrice(metadata);

  if (!Number.isFinite(incomingUnitPrice) || incomingUnitPrice <= 0) {
    return { value: null, valid: true };
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
    .select("created_at,status,order_items(subsidy_amount)")
    .eq("company_id", selectedCompany.id)
    .eq("customer_email", customerEmail)
    .gte("created_at", recentLimit);

  if (subsidyUsageError) {
    return badRequest(subsidyUsageError.message);
  }

  const priorSubsidyUsed = ((existingOrders as ExistingSubsidyOrder[] | null) ?? []).some((order) => {
    const sameMadridDay = toDateInputValue(new Date(order.created_at)) === today;
    const hasSubsidy = (order.order_items ?? []).some((item) => Number(item.subsidy_amount) > 0);

    return sameMadridDay && order.status !== "cancelado" && hasSubsidy;
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
    const possibleSubsidy = subsidyByType.get(product.product_type) ?? 0;
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

  const total = Number((subtotal - subsidyTotal).toFixed(2));
  const initialStatus: OrderStatus = shouldRequireOnlinePayment() ? "pendiente_pago" : "nuevo";

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      customer_id: null,
      company_id: selectedCompany.id,
      company_branch_id: companyBranchId,
      customer_name: customerName,
      customer_email: customerEmail,
      customer_phone: customerPhone,
      status: initialStatus,
      subtotal,
      subsidy_total: subsidyTotal,
      total,
      notes,
      delivery_window: selectedCompany.delivery_window || DELIVERY_WINDOW
    })
    .select("id")
    .single();

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

  return NextResponse.json({
    order: {
      id: order.id,
      subtotal,
      subsidy_total: subsidyTotal,
      total,
      subsidy_applied: subsidyApplied,
      prior_subsidy_used: priorSubsidyUsed
    },
    payment: createPaymentPlaceholder(order.id, total)
  });
}
