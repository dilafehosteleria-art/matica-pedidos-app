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
  origin: string;
};

export function isStripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function publicStripePaymentsEnabled() {
  return Boolean(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY && process.env.STRIPE_SECRET_KEY);
}

function companyAllows(company: Pick<Company, "allow_pay_on_delivery" | "allow_card_payment" | "allow_bizum_payment">, key: keyof Pick<Company, "allow_pay_on_delivery" | "allow_card_payment" | "allow_bizum_payment">, defaultValue: boolean) {
  return company[key] ?? defaultValue;
}

export function paymentOptionsForCompany(company: Pick<Company, "allow_pay_on_delivery" | "allow_card_payment" | "allow_bizum_payment">): PaymentOption[] {
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
      description: "Stripe mostrarÃ¡ tarjeta y monederos disponibles.",
      online: true
    });
  }

  if (stripeEnabled && companyAllows(company, "allow_bizum_payment", false)) {
    options.push({
      method: "stripe_bizum",
      label: getPaymentMethodLabel("stripe_bizum"),
      description: "Disponible si Bizum estÃ¡ habilitado en Stripe.",
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

export function isOnlinePaymentMethod(method: PaymentMethod) {
  return method === "stripe_card" || method === "stripe_bizum";
}

function amountToCents(amount: number) {
  return Math.max(0, Math.round(amount * 100));
}

function checkoutUrlFromEnv(key: "STRIPE_SUCCESS_URL" | "STRIPE_CANCEL_URL", origin: string, orderId: string, companySlug: string) {
  const configured = process.env[key];

  if (configured) {
    return configured
      .replaceAll("{ORDER_ID}", encodeURIComponent(orderId))
      .replaceAll("{COMPANY_SLUG}", encodeURIComponent(companySlug));
  }

  const status = key === "STRIPE_SUCCESS_URL" ? "success" : "cancelled";

  return `${origin}/empresa/${encodeURIComponent(companySlug)}?payment=${status}&order=${encodeURIComponent(orderId)}`;
}

export async function createStripeCheckoutSession({
  amount,
  companyName,
  companySlug,
  customerEmail,
  orderId,
  origin,
  paymentMethod
}: StripeCheckoutInput): Promise<StripeCheckoutSession> {
  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    throw new Error("Stripe no estÃ¡ configurado.");
  }

  const params = new URLSearchParams();
  params.set("mode", "payment");
  params.set("success_url", checkoutUrlFromEnv("STRIPE_SUCCESS_URL", origin, orderId, companySlug));
  params.set("cancel_url", checkoutUrlFromEnv("STRIPE_CANCEL_URL", origin, orderId, companySlug));
  params.set("client_reference_id", orderId);
  params.set("customer_email", customerEmail);
  params.set("automatic_payment_methods[enabled]", "true");
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
    throw new Error(payload.error?.message ?? "No se pudo crear la sesiÃ³n de pago.");
  }

  return {
    id: payload.id,
    url: payload.url
  };
}
