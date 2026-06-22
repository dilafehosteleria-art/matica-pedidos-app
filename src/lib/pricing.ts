import type { CartItem, Company } from "./types";

export function getSubsidyAmount(productType: string, company?: Pick<Company, "billing_type" | "subsidy_rules"> | null) {
  if (company?.billing_type !== "subsidized") {
    return 0;
  }

  const rule = company.subsidy_rules?.find((candidate) => candidate.product_type === productType && candidate.active);

  return Number(rule?.subsidy_amount ?? 0);
}

export function calculateCartTotals(
  items: CartItem[],
  company?: Pick<Company, "billing_type" | "subsidy_rules"> | null,
  subsidyAlreadyUsed = false
) {
  let subsidyApplied = false;
  const subtotal = items.reduce((sum, item) => sum + item.base_price * item.quantity, 0);
  let subsidyTotal = 0;

  for (const item of items) {
    const subsidy = getSubsidyAmount(item.product_type, company);

    if (!subsidyAlreadyUsed && !subsidyApplied && subsidy > 0 && item.quantity > 0) {
      subsidyTotal += subsidy;
      subsidyApplied = true;
    }
  }

  const companyPaysAll = company?.billing_type === "company";
  const employeeTotal = companyPaysAll ? 0 : Math.max(subtotal - subsidyTotal, 0);
  const companyInvoiceTotal = companyPaysAll ? subtotal : subsidyTotal;

  return {
    subtotal,
    subsidyTotal,
    total: employeeTotal,
    employeeTotal,
    companyInvoiceTotal,
    subsidyApplied,
    fullPriceBecauseSubsidyUsed:
      subsidyAlreadyUsed && items.some((item) => getSubsidyAmount(item.product_type, company) > 0)
  };
}
