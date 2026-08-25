export type InvoiceBranch = {
  id?: string;
  company_id?: string;
  name: string;
  fiscal_name?: string | null;
  tax_id?: string | null;
  fiscal_address?: string | null;
  fiscal_city?: string | null;
  fiscal_postal_code?: string | null;
};

export type InvoiceCandidate = {
  amount: number;
  branch: InvoiceBranch;
  companyName?: string | null;
  quantity: number;
  type: string;
};

export type InvoiceGroup = {
  amount: number;
  quantity: number;
  type: string;
};

export type InvoiceRecipientGroup = {
  branch: InvoiceBranch;
  groups: Map<string, InvoiceGroup>;
};

const BUREAU_VERITAS_KEY = "__bureau_veritas_inversiones__";

export const BUREAU_VERITAS_INVERSIONES: InvoiceBranch = {
  id: BUREAU_VERITAS_KEY,
  name: "BUREAU VERITAS INVERSIONES",
  fiscal_name: "BUREAU VERITAS INVERSIONES, S.L.",
  tax_id: "B63091557",
  fiscal_address: "Cami Can Ametller, 34",
  fiscal_city: "San Cugat del Valle",
  fiscal_postal_code: "08174"
};

function normalizedName(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

export function isBureauVeritasInvoiceCandidate(candidate: Pick<InvoiceCandidate, "branch" | "companyName">) {
  return normalizedName(candidate.companyName).includes("BUREAU VERITAS")
    || normalizedName(candidate.branch.name).includes("BUREAU VERITAS");
}

function bureauVeritasRecipient(availableBranches: InvoiceBranch[], candidates: InvoiceCandidate[]) {
  const target = [...availableBranches, ...candidates.map((candidate) => candidate.branch)]
    .find((branch) => normalizedName(branch.name).includes("BUREAU VERITAS INVERSIONES"));

  return {
    ...target,
    ...BUREAU_VERITAS_INVERSIONES,
    id: target?.id || BUREAU_VERITAS_INVERSIONES.id,
    company_id: target?.company_id
  };
}

export function buildInvoiceRecipientGroups(candidates: InvoiceCandidate[], availableBranches: InvoiceBranch[] = []) {
  const byRecipient = new Map<string, InvoiceRecipientGroup>();
  const bvRecipient = bureauVeritasRecipient(availableBranches, candidates);

  for (const candidate of candidates.filter((entry) => entry.amount > 0)) {
    const isBureauVeritas = isBureauVeritasInvoiceCandidate(candidate);
    const key = isBureauVeritas ? BUREAU_VERITAS_KEY : candidate.branch.id || normalizedName(candidate.branch.name);
    const branch = isBureauVeritas ? bvRecipient : candidate.branch;
    const current = byRecipient.get(key) ?? { branch, groups: new Map<string, InvoiceGroup>() };
    const group = current.groups.get(candidate.type) ?? { amount: 0, quantity: 0, type: candidate.type };

    group.amount = Math.round((group.amount + candidate.amount + Number.EPSILON) * 100) / 100;
    group.quantity += candidate.quantity;
    current.groups.set(candidate.type, group);
    byRecipient.set(key, current);
  }

  return Array.from(byRecipient.values());
}
