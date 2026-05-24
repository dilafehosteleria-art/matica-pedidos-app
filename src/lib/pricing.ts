import type { CartItem } from "./types";

const SUBSIDY_BY_TYPE: Record<string, number> = {
  daily_menu: 4,
  half_menu: 3.5
};

export function getSubsidyAmount(productType: string) {
  return SUBSIDY_BY_TYPE[productType] ?? 0;
}

export function calculateCartTotals(items: CartItem[], subsidyAlreadyUsed = false) {
  let subsidyApplied = false;
  const subtotal = items.reduce((sum, item) => sum + item.base_price * item.quantity, 0);
  let subsidyTotal = 0;

  for (const item of items) {
    const subsidy = getSubsidyAmount(item.product_type);

    if (!subsidyAlreadyUsed && !subsidyApplied && subsidy > 0 && item.quantity > 0) {
      subsidyTotal += subsidy;
      subsidyApplied = true;
    }
  }

  return {
    subtotal,
    subsidyTotal,
    total: Math.max(subtotal - subsidyTotal, 0),
    subsidyApplied,
    fullPriceBecauseSubsidyUsed: subsidyAlreadyUsed && items.some((item) => getSubsidyAmount(item.product_type) > 0)
  };
}
