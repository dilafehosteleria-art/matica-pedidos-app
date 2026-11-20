import assert from "node:assert/strict";
import test from "node:test";
import {
  SumUpApiError,
  SumUpConfigurationError,
  SumUpValidationError,
  assertSumUpCheckoutMatches,
  createSumUpHostedCheckout,
  isSumUpConfigured,
  normalizeSumUpAmount,
  normalizeSumUpCurrency,
  readSumUpConfig,
  retrieveSumUpCheckout,
  type SumUpCheckout,
  type SumUpClientConfig,
  type SumUpFetch
} from "./sumup-hosted-checkout.ts";

const sandboxConfig: SumUpClientConfig = {
  environment: "sandbox",
  apiKey: "sandbox-secret",
  merchantCode: "MSANDBOX",
  apiBaseUrl: "https://api.sumup.test"
};

function checkoutPayload(overrides: Record<string, unknown> = {}) {
  return {
    id: "checkout-123",
    checkout_reference: "order-123",
    amount: 12.3,
    currency: "EUR",
    merchant_code: "MSANDBOX",
    description: "Pedido Matica",
    status: "PENDING",
    date: "2026-11-17T10:00:00Z",
    hosted_checkout_url: "https://checkout.sumup.test/pay/checkout-123",
    transactions: [],
    ...overrides
  };
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });
}

test("selecciona credenciales sandbox y production sin mezclar entornos", () => {
  const env = {
    SUMUP_ENVIRONMENT: "sandbox",
    SUMUP_API_KEY: "fallback-key",
    SUMUP_MERCHANT_CODE: "MFALLBACK",
    SUMUP_SANDBOX_API_KEY: "sandbox-key",
    SUMUP_SANDBOX_MERCHANT_CODE: "MSANDBOX",
    SUMUP_PRODUCTION_API_KEY: "production-key",
    SUMUP_PRODUCTION_MERCHANT_CODE: "MPRODUCTION"
  };

  assert.deepEqual(readSumUpConfig(env), {
    environment: "sandbox",
    apiKey: "sandbox-key",
    merchantCode: "MSANDBOX",
    apiBaseUrl: "https://api.sumup.com"
  });

  assert.deepEqual(readSumUpConfig({ ...env, SUMUP_ENVIRONMENT: "prod" }), {
    environment: "production",
    apiKey: "production-key",
    merchantCode: "MPRODUCTION",
    apiBaseUrl: "https://api.sumup.com"
  });
});

test("detecta configuracion incompleta o insegura", async () => {
  assert.equal(isSumUpConfigured({}), false);
  assert.equal(
    isSumUpConfigured({
      SUMUP_ENVIRONMENT: "sandbox",
      SUMUP_SANDBOX_API_KEY: "key",
      SUMUP_SANDBOX_MERCHANT_CODE: "merchant"
    }),
    true
  );
  assert.equal(
    isSumUpConfigured({
      SUMUP_ENVIRONMENT: "sandbox",
      SUMUP_API_KEY: "production-key",
      SUMUP_MERCHANT_CODE: "production-merchant"
    }),
    false
  );
  assert.equal(
    isSumUpConfigured({
      NODE_ENV: "production",
      SUMUP_ENVIRONMENT: "sandbox",
      SUMUP_SANDBOX_API_KEY: "key",
      SUMUP_SANDBOX_MERCHANT_CODE: "merchant"
    }),
    false
  );
  assert.equal(
    isSumUpConfigured({
      NODE_ENV: "production",
      SUMUP_ENVIRONMENT: "sandbox",
      SUMUP_ALLOW_SANDBOX_IN_PRODUCTION: "true",
      SUMUP_SANDBOX_API_KEY: "key",
      SUMUP_SANDBOX_MERCHANT_CODE: "merchant"
    }),
    true
  );
  assert.equal(
    isSumUpConfigured({
      NODE_ENV: "production",
      RAILWAY_ENVIRONMENT_NAME: "production",
      SUMUP_ENVIRONMENT: "sandbox",
      SUMUP_ALLOW_SANDBOX_IN_PRODUCTION: "true",
      SUMUP_SANDBOX_API_KEY: "key",
      SUMUP_SANDBOX_MERCHANT_CODE: "merchant"
    }),
    false
  );

  assert.throws(
    () =>
      readSumUpConfig({
        SUMUP_ENVIRONMENT: "production",
        SUMUP_PRODUCTION_API_KEY: "key"
      }),
    SumUpConfigurationError
  );
  assert.throws(
    () =>
      readSumUpConfig({
        SUMUP_ENVIRONMENT: "sandbox",
        SUMUP_SANDBOX_API_KEY: "key",
        SUMUP_SANDBOX_MERCHANT_CODE: "merchant",
        SUMUP_SANDBOX_API_BASE_URL: "http://api.sumup.test"
      }),
    /HTTPS/
  );

  await assert.rejects(
    createSumUpHostedCheckout(
      {
        checkoutReference: "order-123",
        amount: 12.3,
        currency: "EUR",
        redirectUrl: "http://app.example/orders/order-123"
      },
      {
        config: {
          ...sandboxConfig,
          environment: "production"
        },
        fetchImpl: async () => jsonResponse(checkoutPayload(), 201)
      }
    ),
    /HTTPS en produccion/
  );
});

test("crea un Hosted Checkout y valida la respuesta contra el pedido", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl: SumUpFetch = async (input, init) => {
    calls.push({ url: String(input), init });
    return jsonResponse(checkoutPayload(), 201);
  };

  const checkout = await createSumUpHostedCheckout(
    {
      checkoutReference: " order-123 ",
      amount: 12.3,
      currency: "EUR",
      description: " Pedido Matica ",
      redirectUrl: "https://app.example/orders/order-123",
      returnUrl: "https://app.example/api/sumup/webhook",
      validUntil: "2030-12-31T23:59:59Z"
    },
    {
      config: sandboxConfig,
      fetchImpl
    }
  );

  assert.equal(checkout.id, "checkout-123");
  assert.equal(
    checkout.hostedCheckoutUrl,
    "https://checkout.sumup.test/pay/checkout-123"
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, "https://api.sumup.test/v0.1/checkouts");
  assert.equal(calls[0]?.init?.method, "POST");
  assert.equal(
    new Headers(calls[0]?.init?.headers).get("Authorization"),
    "Bearer sandbox-secret"
  );
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), {
    checkout_reference: "order-123",
    amount: 12.3,
    currency: "EUR",
    merchant_code: "MSANDBOX",
    hosted_checkout: {
      enabled: true
    },
    description: "Pedido Matica",
    redirect_url: "https://app.example/orders/order-123",
    return_url: "https://app.example/api/sumup/webhook",
    valid_until: "2030-12-31T23:59:59.000Z"
  });
});

test("rechaza una respuesta de creacion con importe, moneda o URL alterados", async () => {
  const responseFor = (overrides: Record<string, unknown>): SumUpFetch =>
    async () => jsonResponse(checkoutPayload(overrides), 201);

  await assert.rejects(
    createSumUpHostedCheckout(
      {
        checkoutReference: "order-123",
        amount: 12.3,
        currency: "EUR"
      },
      {
        config: sandboxConfig,
        fetchImpl: responseFor({ amount: 13.3 })
      }
    ),
    /importe.*no coincide/
  );

  await assert.rejects(
    createSumUpHostedCheckout(
      {
        checkoutReference: "order-123",
        amount: 12.3,
        currency: "EUR"
      },
      {
        config: sandboxConfig,
        fetchImpl: responseFor({ currency: "USD" })
      }
    ),
    /moneda.*no coincide/
  );

  await assert.rejects(
    createSumUpHostedCheckout(
      {
        checkoutReference: "order-123",
        amount: 12.3,
        currency: "EUR"
      },
      {
        config: sandboxConfig,
        fetchImpl: responseFor({ hosted_checkout_url: undefined })
      }
    ),
    /URL del Hosted Checkout/
  );
});

test("recupera un checkout por id y conserva estado y transacciones", async () => {
  let requestedUrl = "";
  let requestedMethod = "";
  const fetchImpl: SumUpFetch = async (input, init) => {
    requestedUrl = String(input);
    requestedMethod = String(init?.method);

    return jsonResponse(
      checkoutPayload({
        status: "PAID",
        transaction_id: "transaction-success",
        transaction_code: "TSUCCESS",
        transactions: [
          {
            id: "transaction-1",
            transaction_code: "TABC123",
            amount: 12.3,
            currency: "EUR",
            status: "SUCCESSFUL",
            payment_type: "ECOM",
            merchant_code: "MSANDBOX"
          }
        ]
      })
    );
  };

  const checkout = await retrieveSumUpCheckout("checkout/123", {
    config: sandboxConfig,
    fetchImpl
  });

  assert.equal(
    requestedUrl,
    "https://api.sumup.test/v0.1/checkouts/checkout%2F123"
  );
  assert.equal(requestedMethod, "GET");
  assert.equal(checkout.status, "PAID");
  assert.equal(checkout.transactionId, "transaction-success");
  assert.equal(checkout.transactionCode, "TSUCCESS");
  assert.deepEqual(checkout.transactions[0], {
    id: "transaction-1",
    transactionCode: "TABC123",
    amount: 12.3,
    currency: "EUR",
    timestamp: undefined,
    status: "SUCCESSFUL",
    paymentType: "ECOM",
    merchantCode: "MSANDBOX"
  });
});

test("impide aceptar un checkout recuperado de otro merchant", async () => {
  const fetchImpl: SumUpFetch = async () =>
    jsonResponse(checkoutPayload({ merchant_code: "MOTHER" }));

  await assert.rejects(
    retrieveSumUpCheckout("checkout-123", {
      config: sandboxConfig,
      fetchImpl
    }),
    /no pertenece al merchant/
  );
});

test("normaliza y valida importes, monedas y referencias", () => {
  assert.equal(normalizeSumUpAmount(10.1), 10.1);
  assert.equal(normalizeSumUpCurrency(" eur "), "EUR");
  assert.throws(() => normalizeSumUpAmount(0), SumUpValidationError);
  assert.throws(() => normalizeSumUpAmount(10.001), /dos decimales/);
  assert.throws(() => normalizeSumUpCurrency("XYZ"), /no esta admitida/);

  const checkout = checkoutPayload({ status: "PAID" }) as unknown as SumUpCheckout;

  assert.throws(
    () =>
      assertSumUpCheckoutMatches(checkout, {
        amount: 12.3,
        currency: "EUR",
        checkoutReference: "otra-referencia"
      }),
    /referencia.*no coincide/
  );
});

test("convierte errores de la API sin exponer la credencial", async () => {
  const fetchImpl: SumUpFetch = async () =>
    jsonResponse(
      {
        message: "Validation error",
        error_code: "MISSING",
        param: "merchant_code"
      },
      400
    );

  await assert.rejects(
    createSumUpHostedCheckout(
      {
        checkoutReference: "order-123",
        amount: 12.3,
        currency: "EUR"
      },
      {
        config: sandboxConfig,
        fetchImpl
      }
    ),
    (error: unknown) => {
      assert.ok(error instanceof SumUpApiError);
      assert.equal(error.status, 400);
      assert.equal(error.code, "MISSING");
      assert.equal(error.parameter, "merchant_code");
      assert.equal(error.message, "Validation error");
      assert.equal(error.message.includes(sandboxConfig.apiKey), false);
      return true;
    }
  );
});
