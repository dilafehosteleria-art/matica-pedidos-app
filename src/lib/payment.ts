import type { Company, PaymentMethod } from "@/lib/types";
import { paymentMethodLabel as getPaymentMethodLabel } from "@/lib/payment-display";

export { operationalPaymentLabel, paymentMethodLabel, paymentStatusLabel } from "@/lib/payment-display";

export type PaymentOption = {
  method: PaymentMethod;
  label: string;
  description: string;
  online: boolean;
};

export type StripeCheckoutSession = {
  id: string;
  url: string;
};

type StripeCheckoutInput = {
  orderId: string;
  amount: number;
  customerEmail: string;
  companyName: string;
  companySlug: string;
  paymentMethod: PaymentMethod;
  baseUrl: string;
};

const PRODUCTION_APP_URL = "https://matica-pedidos-app-production.up.railway.app";

export function isStripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function publicStripePaymentsEnabled() {
  return Boolean(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY && process.env.STRIPE_SECRET_KEY);
}

function companyAllows(
  company: Pick<Company, "allow_pay_on_delivery" | "allow_card_payment" | "allow_bizum_payment">,
  key: keyof Pick<Company, "allow_pay_on_delivery" | "allow_card_payment" | "allow_bizum_payment">,
  defaultValue: boolean
) {
  return company[key] ?? defaultValue;
}

export function paymentOptionsForCompany(
  company: Pick<Company, "allow_pay_on_delivery" | "allow_card_payment" | "allow_bizum_payment">
): PaymentOption[] {
  const stripeEnabled = isStripeConfigured();
  const options: PaymentOption[] = [];

  if (companyAllows(company, "allow_pay_on_delivery", true) || !stripeEnabled) {
    options.push({
      method: "pay_on_delivery",
      label: getPaymentMethodLabel("pay_on_delivery"),
      description: "Confirmas ahora y pagas en el punto de entrega.",
      online: false
    });
  }

  if (stripeEnabled && companyAllows(company, "allow_card_payment", false)) {
    options.push({
      method: "stripe_card",
      label: getPaymentMethodLabel("stripe_card"),
      description: "Stripe mostrara tarjeta, Bizum y monederos disponibles.",
      online: true
    });
  }

  return options.length ? options : [{
    method: "pay_on_delivery",
    label: getPaymentMethodLabel("pay_on_delivery"),
    description: "Confirmas ahora y pagas en el punto de entrega.",
    online: false
  }];
}

export function publicCheckoutPaymentOptions(): PaymentOption[] {
  if (!isStripeConfigured()) {
    return [];
  }

  return [{
    method: "stripe_card",
    label: "Stripe Checkout",
    description: "Stripe mostrara tarjeta, Apple Pay, Google Pay y Bizum cuando esten disponibles.",
    online: true
  }];
}

export function isOnlinePaymentMethod(method: PaymentMethod) {
  return method === "stripe_card" || method === "stripe_bizum";
}

function amountToCents(amount: number) {
  return Math.max(0, Math.round(amount * 100));
}

function isLocalAppUrl(value: string) {
  try {
    const hostname = new URL(value).hostname;

    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return true;
  }
}

function normalizeBaseUrl(value: string | undefined) {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);

    if (!["http:", "https:"].includes(url.protocol)) {
      return null;
    }

    if (process.env.NODE_ENV === "production" && isLocalAppUrl(url.toString())) {
      return null;
    }

    return url.origin;
  } catch {
    return null;
  }
}

export function resolveStripeReturnBaseUrl(requestBaseUrl: string) {
  return (
    normalizeBaseUrl(process.env.APP_URL) ??
    normalizeBaseUrl(process.env.NEXT_PUBLIC_APP_URL) ??
    normalizeBaseUrl(requestBaseUrl) ??
    PRODUCTION_APP_URL
  );
}

function checkoutReturnUrl(baseUrl: string, status: "success" | "cancelled", orderId: string, companySlug: string) {
  const safeBaseUrl = resolveStripeReturnBaseUrl(baseUrl);

  return `${safeBaseUrl}/empresa/${encodeURIComponent(companySlug)}?payment=${status}&order=${encodeURIComponent(orderId)}`;
}

function checkoutSuccessUrl(baseUrl: string, orderId: string, companySlug: string) {
  return checkoutReturnUrl(baseUrl, "success", orderId, companySlug);
}

function checkoutCancelUrl(baseUrl: string, orderId: string, companySlug: string) {
  return checkoutReturnUrl(baseUrl, "cancelled", orderId, companySlug);
}

export async function createStripeCheckoutSession({
  amount,
  companyName,
  companySlug,
  customerEmail,
  orderId,
  baseUrl,
  paymentMethod
}: StripeCheckoutInput): Promise<StripeCheckoutSession> {
  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    throw new Error("Stripe no esta configurado.");
  }

  const params = new URLSearchParams();
  params.set("mode", "payment");
  params.set("success_url", checkoutSuccessUrl(baseUrl, orderId, companySlug));
  params.set("cancel_url", checkoutCancelUrl(baseUrl, orderId, companySlug));
  params.set("client_reference_id", orderId);
  params.set("customer_email", customerEmail);
  params.set("metadata[order_id]", orderId);
  params.set("metadata[payment_method]", paymentMethod);
  params.set("line_items[0][quantity]", "1");
  params.set("line_items[0][price_data][currency]", "eur");
  params.set("line_items[0][price_data][unit_amount]", String(amountToCents(amount)));
  params.set("line_items[0][price_data][product_data][name]", `Pedido Matica B2B - ${companyName}`);

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params
  });
  const payload = await response.json();

  if (!response.ok || typeof payload.url !== "string" || typeof payload.id !== "string") {
    throw new Error(payload.error?.message ?? "No se pudo crear la sesion de pago.");
  }

  return {
    id: payload.id,
    url: payload.url
  };
}
