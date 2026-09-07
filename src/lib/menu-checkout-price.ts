import { cutlerySupplement } from "./cutlery.ts";
import {
  expectedSaladUnitPrice,
  isCustomSaladChoice,
  MEDIUM_SALAD_SIZE_LABEL,
  SMALL_SALAD_SIZE_LABEL
} from "./salad-config.ts";

type MenuProduct = {
  base_price: number | string;
  product_type: "daily_menu" | "half_menu";
};

// Product identity and base price must come from the server's products query,
// never from display_name or a price supplied by the browser.
export function validatedMenuUnitPrice(product: MenuProduct, metadata: Record<string, string>) {
  const basePrice = Number(product.base_price);
  const invalid = { value: null, valid: false };
  if (!Number.isFinite(basePrice) || basePrice <= 0) return invalid;

  const dailyMenu = product.product_type === "daily_menu";
  const displayName = metadata.display_name?.trim();
  if (displayName && displayName !== (dailyMenu ? "Menú del día" : "Medio menú")) return invalid;

  let configuredPrice: number | null = basePrice;
  if (dailyMenu && (metadata.first_course ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes("ensalada")) {
    configuredPrice = expectedSaladUnitPrice(basePrice, metadata, SMALL_SALAD_SIZE_LABEL);
  } else if (!dailyMenu && isCustomSaladChoice(metadata.plate ?? "")) {
    configuredPrice = expectedSaladUnitPrice(basePrice, metadata, MEDIUM_SALAD_SIZE_LABEL);
  }
  if (configuredPrice === null) return invalid;

  const expectedPrice = Number((configuredPrice + cutlerySupplement(metadata)).toFixed(2));
  if (metadata._configured_unit_price !== undefined) {
    const incomingPrice = Number(metadata._configured_unit_price);
    if (!Number.isFinite(incomingPrice) || Math.abs(incomingPrice - expectedPrice) > 1e-8) return invalid;
  }

  // A legacy client may omit its price. Still use the server's full calculation,
  // including supplements, instead of trusting the client's _supplement_total.
  return { value: expectedPrice, valid: true };
}
