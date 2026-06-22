import type { GlobalSchedule } from "./types";

const DAY_NAMES = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];

export const DEFAULT_GLOBAL_SCHEDULE: GlobalSchedule = {
  id: "global",
  active: true,
  active_days: [1, 2, 3, 4, 5],
  order_open_time: "09:30",
  order_close_time: "12:40",
  delivery_start_time: "13:00",
  delivery_end_time: "13:30"
};

function normalizeTime(value: unknown, fallback: string) {
  const time = typeof value === "string" ? value.slice(0, 5) : "";

  return /^\d{2}:\d{2}$/.test(time) ? time : fallback;
}

export function normalizeGlobalSchedule(value?: Partial<GlobalSchedule> | null): GlobalSchedule {
  const activeDays = Array.isArray(value?.active_days)
    ? Array.from(new Set(value.active_days.map(Number).filter((day) => day >= 1 && day <= 7))).sort()
    : DEFAULT_GLOBAL_SCHEDULE.active_days;

  return {
    id: value?.id ?? DEFAULT_GLOBAL_SCHEDULE.id,
    active: value?.active ?? DEFAULT_GLOBAL_SCHEDULE.active,
    active_days: activeDays,
    order_open_time: normalizeTime(value?.order_open_time, DEFAULT_GLOBAL_SCHEDULE.order_open_time),
    order_close_time: normalizeTime(value?.order_close_time, DEFAULT_GLOBAL_SCHEDULE.order_close_time),
    delivery_start_time: normalizeTime(value?.delivery_start_time, DEFAULT_GLOBAL_SCHEDULE.delivery_start_time),
    delivery_end_time: normalizeTime(value?.delivery_end_time, DEFAULT_GLOBAL_SCHEDULE.delivery_end_time),
    updated_at: value?.updated_at
  };
}

function timeToMinutes(value: string) {
  const [hour, minute] = value.split(":").map(Number);

  return hour * 60 + minute;
}

function getMadridParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Madrid",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(get("weekday")) + 1;

  return {
    weekday,
    hour: Number(get("hour")),
    minute: Number(get("minute"))
  };
}

export function activeDaysLabel(activeDays: number[]) {
  const days = Array.from(new Set(activeDays)).sort();

  if (days.join(",") === "1,2,3,4,5") {
    return "lunes a viernes";
  }

  if (days.join(",") === "1,2,3,4,5,6,7") {
    return "todos los días";
  }

  return days.map((day) => DAY_NAMES[day - 1]).filter(Boolean).join(", ");
}

export function orderWindowLabel(schedule: GlobalSchedule = DEFAULT_GLOBAL_SCHEDULE) {
  const normalized = normalizeGlobalSchedule(schedule);

  return `${activeDaysLabel(normalized.active_days)} de ${normalized.order_open_time} a ${normalized.order_close_time}`;
}

export function deliveryWindowLabel(schedule: GlobalSchedule = DEFAULT_GLOBAL_SCHEDULE) {
  const normalized = normalizeGlobalSchedule(schedule);

  return `${normalized.delivery_start_time} a ${normalized.delivery_end_time}`;
}

export function orderWindowMessage(schedule: GlobalSchedule = DEFAULT_GLOBAL_SCHEDULE) {
  const normalized = normalizeGlobalSchedule(schedule);

  if (!normalized.active) {
    return "Los pedidos están temporalmente desactivados.";
  }

  return `Los pedidos están disponibles de ${orderWindowLabel(normalized)}.`;
}

export const ORDER_WINDOW_MESSAGE = orderWindowMessage(DEFAULT_GLOBAL_SCHEDULE);

export function isOrderWindowOpen(date = new Date(), schedule: GlobalSchedule = DEFAULT_GLOBAL_SCHEDULE) {
  const normalized = normalizeGlobalSchedule(schedule);

  if (!normalized.active) {
    return false;
  }

  const { weekday, hour, minute } = getMadridParts(date);
  const minutes = hour * 60 + minute;

  return (
    normalized.active_days.includes(weekday) &&
    minutes >= timeToMinutes(normalized.order_open_time) &&
    minutes < timeToMinutes(normalized.order_close_time)
  );
}

export function getOrderWindowState(date = new Date(), schedule: GlobalSchedule = DEFAULT_GLOBAL_SCHEDULE) {
  const normalized = normalizeGlobalSchedule(schedule);
  const open = isOrderWindowOpen(date, normalized);

  return {
    open,
    message: open
      ? `Pedidos abiertos hasta las ${normalized.order_close_time}.`
      : orderWindowMessage(normalized)
  };
}
