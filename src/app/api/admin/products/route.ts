import { NextRequest, NextResponse } from "next/server";
import { assertAdmin } from "@/lib/admin";
import {
  CATALOG_SECTION_DEFINITIONS,
  CUSTOM_SALAD_PRODUCT_ID,
  buildPublicCatalogSections,
  getVisibleCatalogCategories,
  isCustomSaladAliasProduct,
  mergeCatalogDefaults
} from "@/lib/catalog";
import { ensureCustomSaladProduct } from "@/lib/catalog-maintenance";
import { CATEGORIES, PRODUCTS } from "@/lib/constants";
import { employeeProductPrice, validCatalogPrice, type PriceSubsidyRule } from "@/lib/product-prices";
import { getSupabaseAdminClient, getSupabaseServerClient } from "@/lib/supabase/server";
import type { Category, Product, ProductDraft } from "@/lib/types";

export const dynamic = "force-dynamic";

type SupabaseAdminClient = NonNullable<ReturnType<typeof getSupabaseAdminClient>>;

async function bureauVeritasPriceRules(supabase: SupabaseAdminClient) {
  const { data, error } = await supabase.from("companies")
    .select("subsidy_rules(product_type,subsidy_amount,active)")
    .eq("slug", "bureau-veritas").eq("active", true).maybeSingle();
  if (error || !data) throw new Error("No se pudo consultar la subvención de Bureau Veritas.");
  return (data.subsidy_rules ?? []) as PriceSubsidyRule[];
}

async function ensureDefaultProductIdentities(supabase: SupabaseAdminClient) {
  for (const product of PRODUCTS) {
    const { error } = await supabase
      .from("products")
      .update({
        category_id: product.category_id,
        name: product.name,
        sort_order: product.sort_order,
        product_type: product.product_type
      })
      .eq("id", product.id);

    if (error) {
      return error.message;
    }
  }

  return null;
}

async function ensureDefaultCatalogRows(supabase: SupabaseAdminClient) {
  const [categories, products] = await Promise.all([
    supabase.from("categories").select("id"),
    supabase.from("products").select("id,name")
  ]);

  if (categories.error || products.error) {
    return categories.error?.message ?? products.error?.message ?? "No se pudo revisar el catalogo.";
  }

  const categoryIds = new Set((categories.data ?? []).map((category) => String(category.id)));
  const productIds = new Set((products.data ?? []).map((product) => String(product.id)));
  const hasCustomSaladAlias = ((products.data ?? []) as Array<{ id: string; name: string }>).some(isCustomSaladAliasProduct);
  const missingCategories = CATEGORIES.filter((category) => !categoryIds.has(category.id));
  const missingProducts = PRODUCTS.filter(
    (product) => !productIds.has(product.id) && !(product.id === CUSTOM_SALAD_PRODUCT_ID && hasCustomSaladAlias)
  );

  if (missingCategories.length) {
    const { error } = await supabase.from("categories").insert(missingCategories);

    if (error) {
      return error.message;
    }
  }

  if (missingProducts.length) {
    const { error } = await supabase.from("products").insert(missingProducts);

    if (error) {
      return error.message;
    }
  }

  const identityError = await ensureDefaultProductIdentities(supabase);

  if (identityError) {
    return identityError;
  }

  const customSaladError = await ensureCustomSaladProduct(supabase);

  if (customSaladError) {
    return customSaladError;
  }

  return null;
}

function buildAdminCatalogPayload(categories: Category[], products: Product[]) {
  const mergedCatalog = mergeCatalogDefaults(categories, products);
  const visibleSections = buildPublicCatalogSections(mergedCatalog.categories, mergedCatalog.products);
  const categoriesBySlug = new Map(mergedCatalog.categories.map((category) => [category.slug, category]));
  const categoryIdBySectionSlug = new Map(
    CATALOG_SECTION_DEFINITIONS.map((section) => [
      section.slug,
      categoriesBySlug.get(section.categorySlug)?.id
    ])
  );

  const adminProducts = visibleSections.flatMap((section) => {
    const categoryId = categoryIdBySectionSlug.get(section.slug);

    return section.products.map((product) => ({
      ...product,
      category_id: categoryId ?? product.category_id
    }));
  });
  const seenProductIds = new Set<string>();

  return {
    categories: getVisibleCatalogCategories(mergedCatalog.categories),
    products: adminProducts.filter((product) => {
      if (seenProductIds.has(product.id)) {
        return false;
      }

      seenProductIds.add(product.id);
      return true;
    })
  };
}

export async function GET(request: NextRequest) {
  const adminError = assertAdmin(request);

  if (adminError) {
    return adminError;
  }

  const adminSupabase = getSupabaseAdminClient();
  const supabase = adminSupabase ?? getSupabaseServerClient();

  if (!supabase) {
    return NextResponse.json({ error: "Configura Supabase para usar el panel." }, { status: 503 });
  }

  if (adminSupabase) {
    const catalogError = await ensureDefaultCatalogRows(adminSupabase);

    if (catalogError) {
      return NextResponse.json({ error: catalogError }, { status: 400 });
    }
  }

  const [categories, products] = await Promise.all([
    supabase.from("categories").select("*").order("sort_order", { ascending: true }),
    supabase.from("products").select("*").order("sort_order", { ascending: true })
  ]);

  if (categories.error || products.error) {
    return NextResponse.json(
      { error: categories.error?.message ?? products.error?.message },
      { status: 400 }
    );
  }

  try {
    const subsidyRules = await bureauVeritasPriceRules(supabase);
    const catalog = buildAdminCatalogPayload(categories.data ?? [], products.data ?? []);
    // Each drink/dessert has its own price; expose the real rows to the editor.
    const individualProducts = (products.data ?? []).filter((product) => product.product_type === "drink" || product.product_type === "dessert");
    return NextResponse.json({ ...catalog, subsidyRules, products: [
      ...catalog.products.filter((product) => product.product_type !== "drink" && product.product_type !== "dessert"),
      ...individualProducts
    ] });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 503 });
  }
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

  const body = (await request.json()) as ProductDraft;

  if (!body.id) {
    return NextResponse.json({ error: "Producto requerido." }, { status: 400 });
  }

  if (!validCatalogPrice(body.base_price)) {
    return NextResponse.json({ error: "El precio debe ser mayor que cero y tener como máximo dos decimales." }, { status: 400 });
  }

  const currentProduct = await supabase.from("products").select("id,product_type").eq("id", body.id).single();
  if (currentProduct.error || !currentProduct.data) {
    return NextResponse.json({ error: "Producto no encontrado." }, { status: 404 });
  }

  let subsidyRules: PriceSubsidyRule[];
  try {
    subsidyRules = await bureauVeritasPriceRules(supabase);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 503 });
  }

  const { data, error } = await supabase
    .from("products")
    .update({
      active: body.active,
      sold_out: body.sold_out,
      base_price: Number(body.base_price),
      customer_price: employeeProductPrice(body.base_price, currentProduct.data.product_type, subsidyRules),
      description: body.description,
      image_url: body.image_url?.trim() ? body.image_url.trim() : null
    })
    .eq("id", body.id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ product: data });
}
