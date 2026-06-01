import { NextRequest, NextResponse } from "next/server";
import { assertAdmin } from "@/lib/admin";
import {
  CATALOG_SECTION_DEFINITIONS,
  CUSTOM_SALAD_PRODUCT_ID,
  buildPublicCatalogSections,
  getVisibleCatalogCategories,
  isCustomSaladCatalogProduct,
  mergeCatalogDefaults
} from "@/lib/catalog";
import { ensureCustomSaladProduct } from "@/lib/catalog-maintenance";
import { CATEGORIES, PRODUCTS } from "@/lib/constants";
import { getSupabaseAdminClient, getSupabaseServerClient } from "@/lib/supabase/server";
import type { Category, Product, ProductDraft } from "@/lib/types";

export const dynamic = "force-dynamic";

type SupabaseAdminClient = NonNullable<ReturnType<typeof getSupabaseAdminClient>>;

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
  const hasCustomSaladAlias = ((products.data ?? []) as Array<{ id: string; name: string }>).some(
    (product) => product.id !== CUSTOM_SALAD_PRODUCT_ID && isCustomSaladCatalogProduct(product)
  );
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

  return {
    categories: getVisibleCatalogCategories(mergedCatalog.categories),
    products: visibleSections.flatMap((section) => {
      const categoryId = categoryIdBySectionSlug.get(section.slug);

      return section.products.map((product) => ({
        ...product,
        category_id: categoryId ?? product.category_id
      }));
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

  return NextResponse.json(buildAdminCatalogPayload(categories.data ?? [], products.data ?? []));
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

  const { data, error } = await supabase
    .from("products")
    .update({
      active: body.active,
      sold_out: body.sold_out,
      base_price: Number(body.base_price),
      customer_price: Number(body.customer_price),
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
