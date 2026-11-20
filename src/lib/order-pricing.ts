import { PRODUCTS } from "./constants.ts";
import { expectedProductUnitPrice, type PricedProduct } from "./configured-price.ts";
import { isCustomSaladChoice } from "./salad-config.ts";
import type { ProductType } from "./types";

export type OrderPricingProduct = {
  id: string;
  name?: string;
  base_price: number | string;
  product_type: ProductType;
};

export type PricedOrderItem = {
  valid: boolean;
  displayName: string | null;
  metadata: Record<string, string>;
  unitPrice: number | null;
};

type PricingProfileKind =
  | "daily_menu"
  | "half_menu"
  | "drink"
  | "dessert"
  | "custom_salad"
  | "custom_wrap"
  | "salad_sandwich"
  | "sandwich"
  | "grill"
  | "fixed";

type PricingProfile = {
  displayName: string;
  kind: PricingProfileKind;
  productName: string;
  productType: ProductType;
};

const SANDWICH_OPTIONS = new Set([
  "Pollo con queso de cabra y cebolla caramelizada",
  "Pollo con bacon, lechuga y cebolla plancha",
  "Bocadillo de jamón serrano",
  "Bocadillo de tortilla",
  "Bocadillo de lomo con queso",
  "Bocadillo de bacon con queso",
  "Bocadillo de atún y pimientos asados"
]);

const SALAD_METADATA_KEYS = ["salad_size", "salad_base", "protein", "toppings", "dressing"] as const;
const WRAP_METADATA_KEYS = ["wrap_base", "wrap_protein", "wrap_toppings", "wrap_sauces"] as const;
const COMMON_METADATA_KEYS = new Set([
  "display_name",
  "categoria",
  "_configured_unit_price",
  "_supplement_total"
]);

const ALLOWED_METADATA_BY_PROFILE: Record<PricingProfileKind, ReadonlySet<string>> = {
  daily_menu: new Set([
    "first_course",
    "second_course",
    "side",
    "drink_or_dessert",
    "bread",
    "cutlery",
    "suplementos",
    ...SALAD_METADATA_KEYS
  ]),
  half_menu: new Set([
    "plate",
    "side",
    "drink_or_dessert",
    "bread",
    "cutlery",
    "suplementos",
    ...SALAD_METADATA_KEYS
  ]),
  drink: new Set(["drink"]),
  dessert: new Set(["dessert"]),
  custom_salad: new Set([...SALAD_METADATA_KEYS, "suplementos"]),
  custom_wrap: new Set([...WRAP_METADATA_KEYS, "suplementos"]),
  salad_sandwich: new Set([...SALAD_METADATA_KEYS, "sandwich", "cutlery", "suplementos"]),
  sandwich: new Set(["sandwich"]),
  grill: new Set(["main_protein", "sides", "drink_or_dessert", "suplementos"]),
  fixed: new Set()
};

function profileKind(productName: string, productType: ProductType): PricingProfileKind {
  if (productType === "daily_menu") {
    return "daily_menu";
  }

  if (productType === "half_menu") {
    return "half_menu";
  }

  if (productType === "drink") {
    return "drink";
  }

  if (productType === "dessert") {
    return "dessert";
  }

  if (productName === "Diseña tu ensalada") {
    return "custom_salad";
  }

  if (productName === "Diseña tu wrap") {
    return "custom_wrap";
  }

  if (productName === "Menú ensalada pequeña + bocadillo") {
    return "salad_sandwich";
  }

  if (productName === "Platos combinados Matica") {
    return "grill";
  }

  if (productName === "Escoge tu bocadillo") {
    return "sandwich";
  }

  return "fixed";
}

const PRICING_PROFILES = new Map<string, PricingProfile>(
  PRODUCTS.map((product) => {
    const displayName =
      product.product_type === "drink"
        ? "Escoge tu bebida"
        : product.product_type === "dessert"
          ? "Escoge tu postre"
          : product.name;

    return [
      product.id,
      {
        displayName,
        kind: profileKind(product.name, product.product_type),
        productName: product.name,
        productType: product.product_type
      }
    ];
  })
);

const DEFAULT_PRICING_CATALOG: PricedProduct[] = PRODUCTS.map((product) => ({
  id: product.id,
  name: product.name,
  base_price: product.base_price,
  product_type: product.product_type
}));

function hasValue(metadata: Record<string, string>, key: string) {
  return Boolean(metadata[key]?.trim());
}

function hasIncompatibleConfiguration(profile: PricingProfile, metadata: Record<string, string>) {
  const allowedKeys = ALLOWED_METADATA_BY_PROFILE[profile.kind];

  for (const [key, value] of Object.entries(metadata)) {
    if (value.trim() && !COMMON_METADATA_KEYS.has(key) && !allowedKeys.has(key)) {
      return true;
    }
  }

  const hasSaladConfiguration = SALAD_METADATA_KEYS.some((key) => hasValue(metadata, key));

  if (
    profile.kind === "daily_menu" &&
    hasSaladConfiguration &&
    !isCustomSaladChoice(metadata.first_course ?? "")
  ) {
    return true;
  }

  if (
    profile.kind === "half_menu" &&
    hasSaladConfiguration &&
    !isCustomSaladChoice(metadata.plate ?? "")
  ) {
    return true;
  }

  if (
    (profile.kind === "sandwich" || profile.kind === "salad_sandwich") &&
    !SANDWICH_OPTIONS.has(metadata.sandwich?.trim() ?? "")
  ) {
    return true;
  }

  return false;
}

export function priceOrderItem(
  product: OrderPricingProduct,
  incomingMetadata: Record<string, string>,
  catalog: PricedProduct[] = DEFAULT_PRICING_CATALOG
): PricedOrderItem {
  const profile = PRICING_PROFILES.get(product.id);

  if (!profile || profile.productType !== product.product_type) {
    return {
      valid: false,
      displayName: null,
      metadata: incomingMetadata,
      unitPrice: null
    };
  }

  if (hasIncompatibleConfiguration(profile, incomingMetadata)) {
    return {
      valid: false,
      displayName: profile.displayName,
      metadata: incomingMetadata,
      unitPrice: null
    };
  }

  const incomingDisplayName = incomingMetadata.display_name?.trim();

  if (incomingDisplayName && incomingDisplayName !== profile.displayName) {
    return {
      valid: false,
      displayName: profile.displayName,
      metadata: incomingMetadata,
      unitPrice: null
    };
  }

  const basePrice = Number(product.base_price);

  if (!Number.isFinite(basePrice) || basePrice <= 0) {
    return {
      valid: false,
      displayName: profile.displayName,
      metadata: incomingMetadata,
      unitPrice: null
    };
  }

  const metadata: Record<string, string> = {
    ...incomingMetadata,
    display_name: profile.displayName
  };
  delete metadata._supplement_total;
  delete metadata.suplementos;
  const unitPrice = expectedProductUnitPrice(
    {
      id: product.id,
      name: product.name ?? profile.productName,
      base_price: product.base_price,
      product_type: product.product_type
    },
    metadata,
    catalog
  );

  if (unitPrice === null || !Number.isFinite(unitPrice) || unitPrice <= 0) {
    return {
      valid: false,
      displayName: profile.displayName,
      metadata,
      unitPrice: null
    };
  }

  const incomingUnitPrice = incomingMetadata._configured_unit_price?.trim();

  if (incomingUnitPrice) {
    const parsedIncomingUnitPrice = Number(incomingUnitPrice);

    if (
      !Number.isFinite(parsedIncomingUnitPrice) ||
      Math.abs(parsedIncomingUnitPrice - unitPrice) > 0.01
    ) {
      return {
        valid: false,
        displayName: profile.displayName,
        metadata,
        unitPrice: null
      };
    }
  }

  return {
    valid: true,
    displayName: profile.displayName,
    metadata,
    unitPrice
  };
}
