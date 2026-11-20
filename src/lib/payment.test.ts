import assert from "node:assert/strict";
import test from "node:test";
import {
  activeOnlinePaymentProvider,
  isOnlinePaymentProviderConfigured,
  paymentOptionsForCompany,
  resolvePaymentReturnBaseUrl
} from "./payment.ts";

const MANAGED_ENV_KEYS = [
  "APP_URL",
  "NEXT_PUBLIC_APP_URL",
  "NODE_ENV",
  "ONLINE_PAYMENT_PROVIDER",
  "STRIPE_SECRET_KEY",
  "SUMUP_ALLOW_SANDBOX_IN_PRODUCTION",
  "SUMUP_ENVIRONMENT",
  "SUMUP_SANDBOX_API_KEY",
  "SUMUP_SANDBOX_MERCHANT_CODE"
] as const;

function withCleanPaymentEnv(run: () => void) {
  const mutableEnv = process.env as Record<string, string | undefined>;
  const original = Object.fromEntries(MANAGED_ENV_KEYS.map((key) => [key, mutableEnv[key]]));

  try {
    for (const key of MANAGED_ENV_KEYS) {
      delete mutableEnv[key];
    }

    run();
  } finally {
    for (const key of MANAGED_ENV_KEYS) {
      const value = original[key];

      if (value === undefined) {
        delete mutableEnv[key];
      } else {
        mutableEnv[key] = value;
      }
    }
  }
}

test("mantiene Stripe por defecto y falla cerrado ante un proveedor desconocido", () => {
  withCleanPaymentEnv(() => {
    const env = process.env as Record<string, string | undefined>;
    assert.equal(activeOnlinePaymentProvider(), "stripe");

    env.ONLINE_PAYMENT_PROVIDER = "sumupp";
    assert.equal(activeOnlinePaymentProvider(), null);
    assert.equal(isOnlinePaymentProviderConfigured(), false);
    assert.deepEqual(
      paymentOptionsForCompany({
        allow_pay_on_delivery: false,
        allow_card_payment: true,
        allow_bizum_payment: false
      }),
      []
    );
  });
});

test("no habilita pago a la entrega si la empresa lo tiene desactivado", () => {
  withCleanPaymentEnv(() => {
    const env = process.env as Record<string, string | undefined>;
    env.ONLINE_PAYMENT_PROVIDER = "stripe";

    assert.deepEqual(
      paymentOptionsForCompany({
        allow_pay_on_delivery: false,
        allow_card_payment: true,
        allow_bizum_payment: false
      }),
      []
    );
  });
});

test("bloquea SumUp sandbox en una compilacion de produccion salvo permiso explicito de preview", () => {
  withCleanPaymentEnv(() => {
    const env = process.env as Record<string, string | undefined>;
    env.NODE_ENV = "production";
    env.ONLINE_PAYMENT_PROVIDER = "sumup";
    env.SUMUP_ENVIRONMENT = "sandbox";
    env.SUMUP_SANDBOX_API_KEY = "sandbox-key";
    env.SUMUP_SANDBOX_MERCHANT_CODE = "sandbox-merchant";

    assert.equal(isOnlinePaymentProviderConfigured(), false);

    env.SUMUP_ALLOW_SANDBOX_IN_PRODUCTION = "true";
    assert.equal(isOnlinePaymentProviderConfigured(), true);
  });
});

test("ignora el host de la peticion como callback en produccion", () => {
  withCleanPaymentEnv(() => {
    const env = process.env as Record<string, string | undefined>;
    env.NODE_ENV = "production";

    assert.equal(
      resolvePaymentReturnBaseUrl("https://host-inyectado.example"),
      "https://matica-pedidos-app-production.up.railway.app"
    );
  });
});
