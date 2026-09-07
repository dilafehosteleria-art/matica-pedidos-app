import { cutlerySupplement } from "./cutlery.ts";
import { validatedMenuUnitPrice } from "./menu-checkout-price.ts";
import { expectedSaladUnitPrice, SMALL_SALAD_SIZE_LABEL } from "./salad-config.ts";
import { expectedCustomWrapUnitPrice } from "./wrap-config.ts";

export type PricedProduct = { id: string; name: string; base_price: number | string; product_type: string };

const GRILL_SUPPLEMENTS: Record<string, number> = {
  "Filete de ternera a la parrilla": 1.5,
  "Lomo de cerdo a la parrilla": 0,
  "Pechuga de pollo marinada a la parrilla": 0,
  "Salmón a la plancha": 2
};

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

// Catalog prices are authoritative. Only option supplements remain fixed.
export function expectedProductUnitPrice(product: PricedProduct, metadata: Record<string, string>, catalog: PricedProduct[]) {
  const basePrice = Number(product.base_price);
  if (!Number.isFinite(basePrice) || basePrice <= 0) return null;
  if (product.product_type === "daily_menu" || product.product_type === "half_menu") {
    const { _configured_unit_price: _quotedPrice, ...configuration } = metadata;
    return validatedMenuUnitPrice({ ...product, product_type: product.product_type }, configuration).value;
  }
  if (product.product_type === "drink" || product.product_type === "dessert") {
    const choice = metadata[product.product_type === "drink" ? "drink" : "dessert"];
    const selected = choice
      ? catalog.find((candidate) => candidate.product_type === product.product_type && normalize(candidate.name) === normalize(choice))
      : product;
    const price = Number(selected?.base_price);
    return Number.isFinite(price) && price > 0 ? price : null;
  }

  const name = normalize(product.name);
  let price: number | null = basePrice;
  if (name.includes("ensalada") && name.includes("bocadillo")) {
    price = expectedSaladUnitPrice(basePrice, metadata, SMALL_SALAD_SIZE_LABEL);
  } else if (name.includes("disena tu ensalada") || name.includes("ensalada a tu manera") || name.includes("ensalada mediana")) {
    price = expectedSaladUnitPrice(basePrice, metadata);
  } else if (name.includes("disena tu wrap") || name.includes("wrap a tu manera")) {
    price = expectedCustomWrapUnitPrice(basePrice, metadata);
  } else if (name.includes("platos combinados")) {
    const supplement = GRILL_SUPPLEMENTS[metadata.main_protein?.trim() ?? ""];
    price = typeof supplement === "number" ? basePrice + supplement : null;
  }
  return price === null ? null : Number((price + cutlerySupplement(metadata)).toFixed(2));
}
