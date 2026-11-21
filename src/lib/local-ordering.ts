export type LocalFulfillmentType = "dine_in" | "pickup";

export type LocalOrderingCompany = {
  local_ordering_enabled?: boolean | null;
  local_order_days?: number[] | null;
  local_ordering_open_time?: string | null;
  local_ordering_close_time?: string | null;
  local_ordering_guarantee_cutoff?: string | null;
  local_orders_closed_on?: string | null;
  local_only_days?: number[] | null;
};

export type LocalOrderState = {
  open: boolean;
  afterGuaranteeCutoff: boolean;
  localDate: string;
  currentTime: string;
  message: string;
};

export type LocalOrderingSettings = {
  local_ordering_enabled: boolean;
  local_order_days: number[];
  local_ordering_open_time: string;
  local_ordering_close_time: string;
  local_ordering_guarantee_cutoff: string;
  local_orders_closed_on: string | null;
  local_only_days: number[];
};

export type LocalOrderingSettingsValidation =
  | { valid: true; settings: LocalOrderingSettings }
  | { valid: false; message: string };

const DEFAULT_LOCAL_ORDERING_DAYS = [1, 2, 3, 4, 5];
const DEFAULT_LOCAL_ORDERING_OPEN_TIME = "09:30";
const DEFAULT_LOCAL_ORDERING_CLOSE_TIME = "15:00";
const DEFAULT_LOCAL_ORDERING_GUARANTEE_CUTOFF = "13:30";
const DAY_NAMES = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];

export function isLocalFulfillmentType(value: unknown): value is LocalFulfillmentType {
  return value === "dine_in" || value === "pickup";
}

export function buildLateLocalMenuMetadata(unitPrice: number) {
  return {
    _configured_unit_price: unitPrice.toFixed(2)
  };
}

export function hasLateLocalMenuConfiguration(metadata: Record<string, string> | null | undefined) {
  return Object.keys(metadata ?? {}).some((key) => !key.startsWith("_"));
}

function normalizeDays(value: unknown, fallback: number[]) {
  if (!Array.isArray(value)) {
    return fallback;
  }

  return Array.from(new Set(value.map(Number).filter((day) => Number.isInteger(day) && day >= 1 && day <= 7))).sort(
    (a, b) => a - b
  );
}

function normalizeTime(value: unknown, fallback: string) {
  const candidate = typeof value === "string" ? value.trim().slice(0, 5) : "";
  const match = /^(\d{2}):(\d{2})$/.exec(candidate);

  if (!match) {
    return fallback;
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  return hour <= 23 && minute <= 59 ? candidate : fallback;
}

function timeToMinutes(value: string) {
  const [hour, minute] = value.split(":").map(Number);

  return hour * 60 + minute;
}

function parseSettingsTime(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const match = /^(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,6})?)?$/.exec(value.trim());

  if (!match) {
    return null;
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] ?? 0);

  if (hour > 23 || minute > 59 || second > 59) {
    return null;
  }

  return `${match[1]}:${match[2]}`;
}

function parseSettingsDays(value: unknown, allowEmpty: boolean) {
  if (!Array.isArray(value)) {
    return null;
  }

  const days = value.map(Number);

  if (
    (!allowEmpty && days.length === 0) ||
    days.some((day) => !Number.isInteger(day) || day < 1 || day > 7) ||
    new Set(days).size !== days.length
  ) {
    return null;
  }

  return [...days].sort((a, b) => a - b);
}

function parseSettingsDate(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
    ? value
    : false;
}

export function validateLocalOrderingSettings(value: unknown): LocalOrderingSettingsValidation {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { valid: false, message: "La configuración de pedidos en local no es válida." };
  }

  const candidate = value as Partial<LocalOrderingSettings>;
  const days = parseSettingsDays(candidate.local_order_days, false);
  const localOnlyDays = parseSettingsDays(candidate.local_only_days, true);
  const openTime = parseSettingsTime(candidate.local_ordering_open_time);
  const guaranteeCutoff = parseSettingsTime(candidate.local_ordering_guarantee_cutoff);
  const closeTime = parseSettingsTime(candidate.local_ordering_close_time);
  const closedOn = parseSettingsDate(candidate.local_orders_closed_on);

  if (typeof candidate.local_ordering_enabled !== "boolean") {
    return { valid: false, message: "Indica si los pedidos en local están activos." };
  }

  if (!days) {
    return { valid: false, message: "Selecciona al menos un día local válido, sin duplicados." };
  }

  if (!localOnlyDays || localOnlyDays.some((day) => !days.includes(day))) {
    return { valid: false, message: "Los días solo local deben estar incluidos entre los días locales." };
  }

  if (!openTime || !guaranteeCutoff || !closeTime) {
    return { valid: false, message: "Revisa las horas de apertura, garantía y cierre local." };
  }

  if (
    timeToMinutes(openTime) >= timeToMinutes(guaranteeCutoff) ||
    timeToMinutes(guaranteeCutoff) >= timeToMinutes(closeTime)
  ) {
    return { valid: false, message: "La apertura debe ser anterior al corte de garantía y al cierre local." };
  }

  if (closedOn === false) {
    return { valid: false, message: "La fecha de cierre manual no es válida." };
  }

  return {
    valid: true,
    settings: {
      local_ordering_enabled: candidate.local_ordering_enabled,
      local_order_days: days,
      local_ordering_open_time: openTime,
      local_ordering_close_time: closeTime,
      local_ordering_guarantee_cutoff: guaranteeCutoff,
      local_orders_closed_on: closedOn,
      local_only_days: localOnlyDays
    }
  };
}

function getMadridParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(get("weekday")) + 1;
  const hour = get("hour");
  const minute = get("minute");

  return {
    weekday,
    localDate: `${get("year")}-${get("month")}-${get("day")}`,
    currentTime: `${hour}:${minute}`,
    currentMinutes: Number(hour) * 60 + Number(minute)
  };
}

function activeDaysLabel(days: number[]) {
  if (days.join(",") === "1,2,3,4,5") {
    return "lunes a viernes";
  }

  if (days.join(",") === "1,2,3,4,5,6,7") {
    return "todos los días";
  }

  return days.map((day) => DAY_NAMES[day - 1]).filter(Boolean).join(", ");
}

function normalizedLocalOrdering(company: LocalOrderingCompany) {
  return {
    enabled: company.local_ordering_enabled === true,
    days: normalizeDays(company.local_order_days, DEFAULT_LOCAL_ORDERING_DAYS),
    openTime: normalizeTime(company.local_ordering_open_time, DEFAULT_LOCAL_ORDERING_OPEN_TIME),
    closeTime: normalizeTime(company.local_ordering_close_time, DEFAULT_LOCAL_ORDERING_CLOSE_TIME),
    guaranteeCutoff: normalizeTime(
      company.local_ordering_guarantee_cutoff,
      DEFAULT_LOCAL_ORDERING_GUARANTEE_CUTOFF
    ),
    closedOn:
      typeof company.local_orders_closed_on === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(company.local_orders_closed_on)
        ? company.local_orders_closed_on
        : null
  };
}

export function isLocalOnlyDay(date: Date, company: LocalOrderingCompany) {
  const localOnlyDays = normalizeDays(company.local_only_days, []);

  return localOnlyDays.includes(getMadridParts(date).weekday);
}

export function localOrderWindowLabel(company: LocalOrderingCompany) {
  const config = normalizedLocalOrdering(company);

  return `${activeDaysLabel(config.days)} de ${config.openTime} a ${config.closeTime}`;
}

export function getLocalOrderState(date: Date, company: LocalOrderingCompany): LocalOrderState {
  const config = normalizedLocalOrdering(company);
  const { weekday, localDate, currentTime, currentMinutes } = getMadridParts(date);
  const openMinutes = timeToMinutes(config.openTime);
  const closeMinutes = timeToMinutes(config.closeTime);
  const guaranteeMinutes = timeToMinutes(config.guaranteeCutoff);
  const afterGuaranteeCutoff = currentMinutes >= guaranteeMinutes;
  const baseState = { localDate, currentTime, afterGuaranteeCutoff };

  if (!config.enabled) {
    return {
      ...baseState,
      open: false,
      message: "Los pedidos para comer o recoger en el local no están disponibles."
    };
  }

  if (config.closedOn === localDate) {
    return {
      ...baseState,
      open: false,
      message: "Hoy no aceptamos pedidos para comer o recoger en el local."
    };
  }

  if (!config.days.includes(weekday)) {
    return {
      ...baseState,
      open: false,
      message: `Los pedidos para el local están disponibles ${localOrderWindowLabel(company)}.`
    };
  }

  if (currentMinutes < openMinutes) {
    return {
      ...baseState,
      open: false,
      message: `Los pedidos para el local abren a las ${config.openTime}.`
    };
  }

  if (currentMinutes >= closeMinutes) {
    return {
      ...baseState,
      open: false,
      message: `Los pedidos para el local están disponibles hasta las ${config.closeTime}.`
    };
  }

  return {
    ...baseState,
    open: true,
    message: afterGuaranteeCutoff
      ? "Pedido en el local disponible. La elección de platos queda sujeta a disponibilidad."
      : `Pedidos para el local abiertos hasta las ${config.closeTime}.`
  };
}
