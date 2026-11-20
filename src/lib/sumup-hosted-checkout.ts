export const SUMUP_SUPPORTED_CURRENCIES = [
  "BRL",
  "CHF",
  "CLP",
  "COP",
  "CZK",
  "DKK",
  "EUR",
  "GBP",
  "HRK",
  "HUF",
  "NOK",
  "PLN",
  "RON",
  "SEK",
  "USD"
] as const;

export type SumUpCurrency = (typeof SUMUP_SUPPORTED_CURRENCIES)[number];
export type SumUpEnvironment = "sandbox" | "production";
export type SumUpCheckoutStatus = "PENDING" | "FAILED" | "PAID" | "EXPIRED";

export type SumUpEnvironmentVariables = Readonly<Record<string, string | undefined>>;

export type SumUpClientConfig = {
  environment: SumUpEnvironment;
  apiKey: string;
  merchantCode: string;
  apiBaseUrl: string;
};

export type SumUpTransaction = {
  id?: string;
  transactionCode?: string;
  amount?: number;
  currency?: SumUpCurrency;
  timestamp?: string;
  status?: string;
  paymentType?: string;
  merchantCode?: string;
};

export type SumUpCheckout = {
  id: string;
  checkoutReference: string;
  transactionId?: string;
  transactionCode?: string;
  amount: number;
  currency: SumUpCurrency;
  merchantCode: string;
  description?: string;
  returnUrl?: string;
  redirectUrl?: string;
  status: SumUpCheckoutStatus;
  date: string;
  validUntil?: string | null;
  hostedCheckoutUrl?: string;
  transactions: SumUpTransaction[];
};

export type SumUpHostedCheckout = SumUpCheckout & {
  hostedCheckoutUrl: string;
};

export type CreateSumUpHostedCheckoutInput = {
  checkoutReference: string;
  amount: number;
  currency: SumUpCurrency;
  description?: string;
  redirectUrl?: string;
  returnUrl?: string;
  validUntil?: string;
};

export type SumUpCheckoutExpectation = {
  amount: number;
  currency: SumUpCurrency;
  checkoutReference?: string;
  merchantCode?: string;
  status?: SumUpCheckoutStatus;
};

export type SumUpFetch = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

export type SumUpRequestOptions = {
  config?: SumUpClientConfig;
  env?: SumUpEnvironmentVariables;
  fetchImpl?: SumUpFetch;
};

const DEFAULT_API_BASE_URL = "https://api.sumup.com";
const CURRENCY_SET = new Set<string>(SUMUP_SUPPORTED_CURRENCIES);
const CHECKOUT_STATUS_SET = new Set<string>(["PENDING", "FAILED", "PAID", "EXPIRED"]);
const MAX_CHECKOUT_REFERENCE_LENGTH = 64;
const SUMUP_REQUEST_TIMEOUT_MS = 10_000;

export class SumUpConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SumUpConfigurationError";
  }
}

export class SumUpValidationError extends Error {
  readonly field?: string;

  constructor(message: string, field?: string) {
    super(message);
    this.name = "SumUpValidationError";
    this.field = field;
  }
}

export class SumUpApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly parameter?: string;

  constructor(message: string, status: number, code?: string, parameter?: string) {
    super(message);
    this.name = "SumUpApiError";
    this.status = status;
    this.code = code;
    this.parameter = parameter;
  }
}

function firstConfiguredValue(env: SumUpEnvironmentVariables, names: string[]) {
  for (const name of names) {
    const value = env[name]?.trim();

    if (value) {
      return value;
    }
  }

  return undefined;
}

function resolveEnvironment(value: string | undefined): SumUpEnvironment {
  const normalized = value?.trim().toLowerCase();

  if (normalized === "sandbox") {
    return "sandbox";
  }

  if (normalized === "production" || normalized === "prod") {
    return "production";
  }

  throw new SumUpConfigurationError(
    "SUMUP_ENVIRONMENT debe ser 'sandbox' o 'production'."
  );
}

function normalizeApiBaseUrl(value: string) {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new SumUpConfigurationError("La URL base de SumUp no es valida.");
  }

  if (url.protocol !== "https:") {
    throw new SumUpConfigurationError("La URL base de SumUp debe usar HTTPS.");
  }

  return url.toString().replace(/\/$/, "");
}

export function readSumUpConfig(
  env: SumUpEnvironmentVariables = process.env
): SumUpClientConfig {
  const environment = resolveEnvironment(env.SUMUP_ENVIRONMENT);
  const railwayEnvironment = env.RAILWAY_ENVIRONMENT_NAME?.trim().toLowerCase();

  if (
    environment === "sandbox" &&
    (
      railwayEnvironment === "production" ||
      (
        env.NODE_ENV?.trim().toLowerCase() === "production" &&
        env.SUMUP_ALLOW_SANDBOX_IN_PRODUCTION?.trim().toLowerCase() !== "true"
      )
    )
  ) {
    throw new SumUpConfigurationError(
      "SumUp sandbox esta bloqueado en una compilacion de produccion."
    );
  }

  const prefix = environment === "sandbox" ? "SUMUP_SANDBOX" : "SUMUP_PRODUCTION";
  const apiKey = firstConfiguredValue(env, [prefix + "_API_KEY"]);
  const merchantCode = firstConfiguredValue(env, [prefix + "_MERCHANT_CODE"]);
  const apiBaseUrl = firstConfiguredValue(env, [
    prefix + "_API_BASE_URL"
  ]) ?? DEFAULT_API_BASE_URL;

  if (!apiKey) {
    throw new SumUpConfigurationError(
      "Falta la API key de SumUp para el entorno " + environment + "."
    );
  }

  if (!merchantCode) {
    throw new SumUpConfigurationError(
      "Falta el merchant code de SumUp para el entorno " + environment + "."
    );
  }

  return {
    environment,
    apiKey,
    merchantCode,
    apiBaseUrl: normalizeApiBaseUrl(apiBaseUrl)
  };
}

export function isSumUpConfigured(
  env: SumUpEnvironmentVariables = process.env
) {
  try {
    readSumUpConfig(env);
    return true;
  } catch {
    return false;
  }
}

export function normalizeSumUpAmount(amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new SumUpValidationError(
      "El importe de SumUp debe ser un numero positivo.",
      "amount"
    );
  }

  const minorUnits = Math.round(amount * 100);

  if (
    !Number.isSafeInteger(minorUnits) ||
    Math.abs(minorUnits / 100 - amount) > 1e-9
  ) {
    throw new SumUpValidationError(
      "El importe de SumUp no puede tener mas de dos decimales.",
      "amount"
    );
  }

  return minorUnits / 100;
}

export function normalizeSumUpCurrency(currency: string): SumUpCurrency {
  const normalized = currency.trim().toUpperCase();

  if (!CURRENCY_SET.has(normalized)) {
    throw new SumUpValidationError(
      "La moneda '" + currency + "' no esta admitida por SumUp.",
      "currency"
    );
  }

  return normalized as SumUpCurrency;
}

function normalizeCheckoutReference(value: string) {
  const normalized = value.trim();

  if (!normalized) {
    throw new SumUpValidationError(
      "La referencia del checkout es obligatoria.",
      "checkoutReference"
    );
  }

  if (normalized.length > MAX_CHECKOUT_REFERENCE_LENGTH) {
    throw new SumUpValidationError(
      "La referencia del checkout no puede superar 64 caracteres.",
      "checkoutReference"
    );
  }

  return normalized;
}

function normalizeRequiredIdentifier(value: string, field: string) {
  const normalized = value.trim();

  if (!normalized) {
    throw new SumUpValidationError(
      "El identificador de SumUp es obligatorio.",
      field
    );
  }

  return normalized;
}

function normalizeOptionalUrl(value: string | undefined, field: string, requireHttps = false) {
  if (!value) {
    return undefined;
  }

  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new SumUpValidationError(
      "La URL indicada para " + field + " no es valida.",
      field
    );
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SumUpValidationError(
      "La URL indicada para " + field + " debe usar HTTP o HTTPS.",
      field
    );
  }

  if (requireHttps && url.protocol !== "https:") {
    throw new SumUpValidationError(
      "La URL indicada para " + field + " debe usar HTTPS en produccion.",
      field
    );
  }

  return url.toString();
}

function normalizeValidUntil(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  const timestamp = Date.parse(value);

  if (!Number.isFinite(timestamp)) {
    throw new SumUpValidationError(
      "validUntil debe ser una fecha ISO valida.",
      "validUntil"
    );
  }

  return new Date(timestamp).toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRequiredString(
  record: Record<string, unknown>,
  key: string,
  context: string
) {
  const value = record[key];

  if (typeof value !== "string" || !value.trim()) {
    throw new SumUpValidationError(
      "La respuesta de SumUp no incluye " + context + ".",
      key
    );
  }

  return value;
}

function readOptionalString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function parseTransactions(value: unknown): SumUpTransaction[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isRecord).map((transaction) => {
    const currencyValue = readOptionalString(transaction, "currency");
    let currency: SumUpCurrency | undefined;

    if (currencyValue) {
      try {
        currency = normalizeSumUpCurrency(currencyValue);
      } catch {
        currency = undefined;
      }
    }

    return {
      id: readOptionalString(transaction, "id"),
      transactionCode: readOptionalString(transaction, "transaction_code"),
      amount:
        typeof transaction.amount === "number" && Number.isFinite(transaction.amount)
          ? transaction.amount
          : undefined,
      currency,
      timestamp: readOptionalString(transaction, "timestamp"),
      status: readOptionalString(transaction, "status"),
      paymentType: readOptionalString(transaction, "payment_type"),
      merchantCode: readOptionalString(transaction, "merchant_code")
    };
  });
}

function parseCheckout(payload: unknown): SumUpCheckout {
  if (!isRecord(payload)) {
    throw new SumUpValidationError("La respuesta de SumUp no es un objeto valido.");
  }

  const rawAmount = payload.amount;

  if (typeof rawAmount !== "number") {
    throw new SumUpValidationError(
      "La respuesta de SumUp no incluye un importe valido.",
      "amount"
    );
  }

  const rawStatus = readRequiredString(payload, "status", "el estado del checkout");

  if (!CHECKOUT_STATUS_SET.has(rawStatus)) {
    throw new SumUpValidationError(
      "SumUp ha devuelto un estado de checkout desconocido.",
      "status"
    );
  }

  const hostedCheckoutUrl = readOptionalString(payload, "hosted_checkout_url");

  return {
    id: readRequiredString(payload, "id", "el identificador del checkout"),
    checkoutReference: normalizeCheckoutReference(
      readRequiredString(payload, "checkout_reference", "la referencia del checkout")
    ),
    transactionId: readOptionalString(payload, "transaction_id"),
    transactionCode: readOptionalString(payload, "transaction_code"),
    amount: normalizeSumUpAmount(rawAmount),
    currency: normalizeSumUpCurrency(
      readRequiredString(payload, "currency", "la moneda del checkout")
    ),
    merchantCode: readRequiredString(
      payload,
      "merchant_code",
      "el merchant code del checkout"
    ),
    description: readOptionalString(payload, "description"),
    returnUrl: readOptionalString(payload, "return_url"),
    redirectUrl: readOptionalString(payload, "redirect_url"),
    status: rawStatus as SumUpCheckoutStatus,
    date: readRequiredString(payload, "date", "la fecha del checkout"),
    validUntil:
      payload.valid_until === null
        ? null
        : readOptionalString(payload, "valid_until"),
    hostedCheckoutUrl: hostedCheckoutUrl
      ? normalizeOptionalUrl(hostedCheckoutUrl, "hostedCheckoutUrl", true)
      : undefined,
    transactions: parseTransactions(payload.transactions)
  };
}

function responseErrorMessage(payload: unknown, status: number) {
  if (!isRecord(payload)) {
    return "SumUp ha rechazado la solicitud con estado " + status + ".";
  }

  return (
    readOptionalString(payload, "message") ??
    readOptionalString(payload, "detail") ??
    readOptionalString(payload, "error_message") ??
    readOptionalString(payload, "title") ??
    ("SumUp ha rechazado la solicitud con estado " + status + ".")
  );
}

function responseErrorCode(payload: unknown) {
  if (!isRecord(payload)) {
    return undefined;
  }

  return (
    readOptionalString(payload, "error_code") ??
    readOptionalString(payload, "code")
  );
}

function responseErrorParameter(payload: unknown) {
  return isRecord(payload) ? readOptionalString(payload, "param") : undefined;
}

function resolveRequestDependencies(options: SumUpRequestOptions) {
  const rawConfig = options.config ?? readSumUpConfig(options.env);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  if (!rawConfig.apiKey.trim()) {
    throw new SumUpConfigurationError("La API key de SumUp esta vacia.");
  }

  if (!rawConfig.merchantCode.trim()) {
    throw new SumUpConfigurationError("El merchant code de SumUp esta vacio.");
  }

  if (typeof fetchImpl !== "function") {
    throw new SumUpConfigurationError(
      "Este entorno no dispone de fetch para conectar con SumUp."
    );
  }

  return {
    config: {
      ...rawConfig,
      apiKey: rawConfig.apiKey.trim(),
      merchantCode: rawConfig.merchantCode.trim(),
      apiBaseUrl: normalizeApiBaseUrl(rawConfig.apiBaseUrl)
    },
    fetchImpl
  };
}

async function sumUpRequest(
  path: string,
  method: "GET" | "POST",
  options: SumUpRequestOptions,
  body?: Record<string, unknown>
) {
  const { config, fetchImpl } = resolveRequestDependencies(options);
  let response: Response;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SUMUP_REQUEST_TIMEOUT_MS);

  try {
    response = await fetchImpl(config.apiBaseUrl + path, {
      method,
      headers: {
        Accept: "application/json",
        Authorization: "Bearer " + config.apiKey,
        ...(body ? { "Content-Type": "application/json" } : {})
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
      signal: controller.signal
    });
  } catch {
    throw new SumUpApiError("No se pudo conectar con SumUp.", 0);
  } finally {
    clearTimeout(timeout);
  }

  const rawBody = await response.text();
  let payload: unknown = null;

  if (rawBody) {
    try {
      payload = JSON.parse(rawBody) as unknown;
    } catch {
      if (response.ok) {
        throw new SumUpApiError(
          "SumUp ha devuelto una respuesta que no es JSON valido.",
          response.status
        );
      }
    }
  }

  if (!response.ok) {
    throw new SumUpApiError(
      responseErrorMessage(payload, response.status),
      response.status,
      responseErrorCode(payload),
      responseErrorParameter(payload)
    );
  }

  if (payload === null) {
    throw new SumUpApiError(
      "SumUp ha devuelto una respuesta vacia.",
      response.status
    );
  }

  return { payload, config };
}

export function assertSumUpCheckoutMatches(
  checkout: SumUpCheckout,
  expected: SumUpCheckoutExpectation
) {
  const expectedAmount = normalizeSumUpAmount(expected.amount);
  const expectedCurrency = normalizeSumUpCurrency(expected.currency);

  if (Math.round(checkout.amount * 100) !== Math.round(expectedAmount * 100)) {
    throw new SumUpValidationError(
      "El importe del checkout de SumUp no coincide con el pedido.",
      "amount"
    );
  }

  if (checkout.currency !== expectedCurrency) {
    throw new SumUpValidationError(
      "La moneda del checkout de SumUp no coincide con el pedido.",
      "currency"
    );
  }

  if (
    expected.checkoutReference &&
    checkout.checkoutReference !== normalizeCheckoutReference(expected.checkoutReference)
  ) {
    throw new SumUpValidationError(
      "La referencia del checkout de SumUp no coincide con el pedido.",
      "checkoutReference"
    );
  }

  if (
    expected.merchantCode &&
    checkout.merchantCode !== expected.merchantCode.trim()
  ) {
    throw new SumUpValidationError(
      "El merchant code del checkout de SumUp no coincide.",
      "merchantCode"
    );
  }

  if (expected.status && checkout.status !== expected.status) {
    throw new SumUpValidationError(
      "El estado del checkout de SumUp no es el esperado.",
      "status"
    );
  }

  return checkout;
}

export async function createSumUpHostedCheckout(
  input: CreateSumUpHostedCheckoutInput,
  options: SumUpRequestOptions = {}
): Promise<SumUpHostedCheckout> {
  const { config } = resolveRequestDependencies(options);
  const checkoutReference = normalizeCheckoutReference(input.checkoutReference);
  const amount = normalizeSumUpAmount(input.amount);
  const currency = normalizeSumUpCurrency(input.currency);
  const requireHttps = config.environment === "production";
  const redirectUrl = normalizeOptionalUrl(input.redirectUrl, "redirectUrl", requireHttps);
  const returnUrl = normalizeOptionalUrl(input.returnUrl, "returnUrl", requireHttps);
  const validUntil = normalizeValidUntil(input.validUntil);
  const description = input.description?.trim() || undefined;
  const body: Record<string, unknown> = {
    checkout_reference: checkoutReference,
    amount,
    currency,
    merchant_code: config.merchantCode,
    hosted_checkout: {
      enabled: true
    }
  };

  if (description) {
    body.description = description;
  }

  if (redirectUrl) {
    body.redirect_url = redirectUrl;
  }

  if (returnUrl) {
    body.return_url = returnUrl;
  }

  if (validUntil) {
    body.valid_until = validUntil;
  }

  const { payload } = await sumUpRequest(
    "/v0.1/checkouts",
    "POST",
    {
      ...options,
      config
    },
    body
  );
  const checkout = parseCheckout(payload);

  assertSumUpCheckoutMatches(checkout, {
    amount,
    currency,
    checkoutReference,
    merchantCode: config.merchantCode
  });

  if (!checkout.hostedCheckoutUrl) {
    throw new SumUpValidationError(
      "SumUp no ha devuelto la URL del Hosted Checkout.",
      "hostedCheckoutUrl"
    );
  }

  return checkout as SumUpHostedCheckout;
}

export async function retrieveSumUpCheckout(
  checkoutId: string,
  options: SumUpRequestOptions = {}
) {
  const normalizedCheckoutId = normalizeRequiredIdentifier(
    checkoutId,
    "checkoutId"
  );
  const { payload, config } = await sumUpRequest(
    "/v0.1/checkouts/" + encodeURIComponent(normalizedCheckoutId),
    "GET",
    options
  );
  const checkout = parseCheckout(payload);

  if (checkout.merchantCode !== config.merchantCode) {
    throw new SumUpValidationError(
      "El checkout recuperado no pertenece al merchant configurado.",
      "merchantCode"
    );
  }

  return checkout;
}
