import type { GlobalSchedule } from "./types";
import {
  resolveOperatingCalendar,
  type CalendarClosure,
  type ScheduleException
} from "./operating-calendar.ts";

export type DeliveryCalendarContext = {
  closures?: CalendarClosure[] | null;
  exceptions?: ScheduleException[] | null;
  companyId?: string | null;
  localOnlyDays?: number[] | null;
  available?: boolean;
};

export type OrderWindowState = {
  open: boolean;
  message: string;
  deliveryStartTime: string;
  deliveryEndTime: string;
};

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

function resolveDeliveryWindow(
  date: Date,
  schedule: GlobalSchedule,
  calendar?: DeliveryCalendarContext
) {
  const normalized = normalizeGlobalSchedule(schedule);

  if (calendar?.available === false) {
    return null;
  }

  return resolveOperatingCalendar({
    now: date,
    channel: "delivery",
    companyId: calendar?.companyId,
    weeklySchedule: normalized,
    closures: calendar?.closures,
    exceptions: calendar?.exceptions,
    localOnlyDays: calendar?.localOnlyDays
  });
}

export function isOrderWindowOpen(
  date = new Date(),
  schedule: GlobalSchedule = DEFAULT_GLOBAL_SCHEDULE,
  calendar?: DeliveryCalendarContext
) {
  const state = resolveDeliveryWindow(date, schedule, calendar);

  return state?.open === true;
}

export function getOrderWindowState(
  date = new Date(),
  schedule: GlobalSchedule = DEFAULT_GLOBAL_SCHEDULE,
  calendar?: DeliveryCalendarContext
): OrderWindowState {
  const normalized = normalizeGlobalSchedule(schedule);
  const state = resolveDeliveryWindow(date, normalized, calendar);
  const deliveryTimes = {
    deliveryStartTime: state?.serviceStart ?? normalized.delivery_start_time,
    deliveryEndTime: state?.serviceEnd ?? normalized.delivery_end_time
  };

  if (!state) {
    return {
      open: false,
      message: "No podemos comprobar ahora el calendario de aperturas. Inténtalo de nuevo en unos minutos.",
      ...deliveryTimes
    };
  }

  if (state.open) {
    return {
      open: true,
      message: `Delivery abierto hasta las ${state.closeTime ?? normalized.order_close_time}.`,
      ...deliveryTimes
    };
  }

  if (state.reason === "holiday") {
    return {
      open: false,
      message: `Hoy no hay delivery por ${state.closureName ?? "festivo"}.`,
      ...deliveryTimes
    };
  }

  if (state.reason === "exception_closed") {
    return { open: false, message: "El delivery está cerrado hoy por una configuración puntual.", ...deliveryTimes };
  }

  if (state.reason === "local_only") {
    return {
      open: false,
      message: "Hoy no hay delivery para esta empresa. Puedes comer o recoger en el local.",
      ...deliveryTimes
    };
  }

  return {
    open: false,
    message: state.source === "exception" && state.openTime && state.closeTime
      ? `El delivery de hoy está disponible de ${state.openTime} a ${state.closeTime}.`
      : orderWindowMessage(normalized),
    ...deliveryTimes
  };
}
