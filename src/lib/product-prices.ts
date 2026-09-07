export type PriceSubsidyRule = { product_type: string; subsidy_amount: number | string; active: boolean };

export function employeeProductPrice(basePrice: number, productType: string, rules: PriceSubsidyRule[] = []) {
  const subsidy = Number(rules.find((rule) => rule.active && rule.product_type === productType)?.subsidy_amount ?? 0);
  return Number(Math.max(0, basePrice - subsidy).toFixed(2));
}

export function validCatalogPrice(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 &&
    Math.abs(value * 100 - Math.round(value * 100)) < 1e-8;
}
