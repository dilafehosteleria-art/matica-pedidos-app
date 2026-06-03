import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CUSTOM_SALAD_PRODUCT_ID,
  isCustomSaladAliasProduct
} from "@/lib/catalog";
import { CATEGORIES, PRODUCTS } from "@/lib/constants";
import type { Product } from "@/lib/types";

const CUSTOM_SALAD_PRODUCT = PRODUCTS.find((product) => product.id === CUSTOM_SALAD_PRODUCT_ID);
const CUSTOM_SALAD_CATEGORY = CATEGORIES.find((category) => category.slug === "bowls-ensaladas");

type CatalogProductRow = Product;

export async function ensureCustomSaladProduct(supabase: SupabaseClient) {
  if (!CUSTOM_SALAD_PRODUCT || !CUSTOM_SALAD_CATEGORY) {
    return "No se encontro el producto configurable de ensalada en el catalogo base.";
  }

  const { error: categoryError } = await supabase
    .from("categories")
    .upsert(CUSTOM_SALAD_CATEGORY, { onConflict: "id" });

  if (categoryError) {
    return categoryError.message;
  }

  const { data, error } = await supabase
    .from("products")
    .select("*");

  if (error) {
    return error.message;
  }

  const products = (data ?? []) as CatalogProductRow[];
  const canonicalProduct = products.find((product) => product.id === CUSTOM_SALAD_PRODUCT_ID);
  const aliasProduct = products.find(isCustomSaladAliasProduct);

  if (!canonicalProduct) {
    const { error: insertError } = await supabase
      .from("products")
      .insert({
        ...CUSTOM_SALAD_PRODUCT,
        description: aliasProduct?.description ?? CUSTOM_SALAD_PRODUCT.description,
        base_price: Number(aliasProduct?.base_price ?? CUSTOM_SALAD_PRODUCT.base_price),
        customer_price: Number(aliasProduct?.customer_price ?? CUSTOM_SALAD_PRODUCT.customer_price),
        image_url: aliasProduct?.image_url ?? CUSTOM_SALAD_PRODUCT.image_url,
        active: true
      });

    return insertError?.message ?? null;
  }

  const copiedImageUrl = !canonicalProduct.image_url && aliasProduct?.image_url
    ? aliasProduct.image_url
    : undefined;

  const updatePayload: Partial<Product> = {
    category_id: CUSTOM_SALAD_PRODUCT.category_id,
    name: CUSTOM_SALAD_PRODUCT.name,
    description: canonicalProduct.description?.trim() ? canonicalProduct.description : CUSTOM_SALAD_PRODUCT.description,
    base_price: Number(canonicalProduct.base_price ?? CUSTOM_SALAD_PRODUCT.base_price),
    customer_price: Number(canonicalProduct.customer_price ?? CUSTOM_SALAD_PRODUCT.customer_price),
    active: true,
    sort_order: CUSTOM_SALAD_PRODUCT.sort_order,
    product_type: CUSTOM_SALAD_PRODUCT.product_type
  };

  if (copiedImageUrl) {
    updatePayload.image_url = copiedImageUrl;
  }

  const { error: updateError } = await supabase
    .from("products")
    .update(updatePayload)
    .eq("id", canonicalProduct.id);

  return updateError?.message ?? null;
}
