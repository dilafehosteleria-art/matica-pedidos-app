const BUREAU_VERITAS_SLUG = "bureau-veritas";
const BUREAU_VERITAS_ALLOWED_DOMAIN = "@bureauveritas.com";
const BUREAU_VERITAS_TEST_EMAILS = new Set([
  "dilafehosteleria@gmail.com",
  "pedidomatica@gmail.com",
  "diaztiburcio@gmail.com"
]);

export const BUREAU_VERITAS_EMAIL_ERROR =
  "Para pedidos de Bureau Veritas debes usar tu email corporativo @bureauveritas.com.";

export function isBureauVeritasEmailAllowed(email: string) {
  const normalizedEmail = email.trim().toLowerCase();

  return (
    normalizedEmail.endsWith(BUREAU_VERITAS_ALLOWED_DOMAIN) ||
    BUREAU_VERITAS_TEST_EMAILS.has(normalizedEmail)
  );
}

export function validateCompanyOrderEmail(companySlug: string, email: string) {
  if (companySlug.trim().toLowerCase() !== BUREAU_VERITAS_SLUG) {
    return { valid: true, message: "" };
  }

  if (!email.trim() || isBureauVeritasEmailAllowed(email)) {
    return { valid: true, message: "" };
  }

  return { valid: false, message: BUREAU_VERITAS_EMAIL_ERROR };
}
