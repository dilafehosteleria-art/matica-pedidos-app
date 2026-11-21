export type OperatingChannel = "delivery" | "local";

export type CalendarClosure = {
  id?: string;
  date: string;
  name: string;
  scope: string;
  source: string;
  closes_delivery: boolean;
  closes_local: boolean;
  enabled: boolean;
};

export type ScheduleException = {
  id?: string;
  date: string;
  channel: OperatingChannel;
  company_id: string | null;
  mode: "closed" | "custom_hours";
  open_time: string | null;
  close_time: string | null;
  service_start: string | null;
  service_end: string | null;
  menu_guarantee_cutoff: string | null;
};

/**
 * Accepts the neutral field names used by the calendar as well as the current
 * delivery/local columns. This keeps the resolver independent from Supabase
 * while allowing callers to pass an existing settings row directly.
 */
export type WeeklyOperatingSchedule = {
  enabled?: boolean | null;
  active?: boolean | null;
  local_ordering_enabled?: boolean | null;
  active_days?: number[] | null;
  local_order_days?: number[] | null;
  open_time?: string | null;
  order_open_time?: string | null;
  local_ordering_open_time?: string | null;
  close_time?: string | null;
  order_close_time?: string | null;
  local_ordering_close_time?: string | null;
  service_start?: string | null;
  delivery_start_time?: string | null;
  service_end?: string | null;
  delivery_end_time?: string | null;
  menu_guarantee_cutoff?: string | null;
  local_ordering_guarantee_cutoff?: string | null;
};

export type OperatingCalendarReason =
  | "open"
  | "master_disabled"
  | "exception_closed"
  | "holiday"
  | "local_only"
  | "inactive_day"
  | "before_open"
  | "after_close"
  | "invalid_schedule"
  | "invalid_exception"
  | "invalid_date";

export type OperatingCalendarSource = "master" | "exception" | "calendar" | "weekly";

export type OperatingCalendarState = {
  channel: OperatingChannel;
  open: boolean;
  localDate: string;
  currentTime: string;
  openTime: string | null;
  closeTime: string | null;
  reason: OperatingCalendarReason;
  source: OperatingCalendarSource;
  serviceStart: string | null;
  serviceEnd: string | null;
  menuGuaranteeCutoff: string | null;
  afterMenuGuaranteeCutoff: boolean;
  closureName: string | null;
  closureScope: string | null;
  closureSource: string | null;
  exceptionId: string | null;
};

export type ResolveOperatingCalendarInput = {
  now?: Date;
  channel: OperatingChannel;
  companyId?: string | null;
  weeklySchedule: WeeklyOperatingSchedule;
  closures?: CalendarClosure[] | null;
  exceptions?: ScheduleException[] | null;
  localOnlyDays?: number[] | null;
};

type MadridParts = {
  weekday: number;
  localDate: string;
  currentTime: string;
  currentMinutes: number;
};

type NormalizedWeeklySchedule = {
  enabled: boolean;
  activeDays: number[];
  openTime: string | null;
  closeTime: string | null;
  serviceStart: string | null;
  serviceEnd: string | null;
  menuGuaranteeCutoff: string | null;
};

type EffectiveWindow = {
  openTime: string;
  closeTime: string;
  serviceStart: string | null;
  serviceEnd: string | null;
  menuGuaranteeCutoff: string | null;
};

function normalizeTime(value: unknown) {
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

function timeToMinutes(value: string) {
  const [hour, minute] = value.split(":").map(Number);

  return hour * 60 + minute;
}

function isOrderedWindow(start: string | null, end: string | null): start is string {
  return Boolean(start && end && timeToMinutes(start) < timeToMinutes(end));
}

function normalizeDays(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(value.map(Number).filter((day) => Number.isInteger(day) && day >= 1 && day <= 7))
  ).sort((a, b) => a - b);
}

function normalizeDate(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
    ? value
    : null;
}

function madridParts(date: Date): MadridParts | null {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
    return null;
  }

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

  if (!weekday || !hour || !minute) {
    return null;
  }

  return {
    weekday,
    localDate: `${get("year")}-${get("month")}-${get("day")}`,
    currentTime: `${hour}:${minute}`,
    currentMinutes: Number(hour) * 60 + Number(minute)
  };
}

function firstBoolean(...values: unknown[]) {
  return values.find((value) => typeof value === "boolean") === true;
}

function firstTime(...values: unknown[]) {
  for (const value of values) {
    const normalized = normalizeTime(value);

    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function normalizeWeeklySchedule(
  channel: OperatingChannel,
  schedule: WeeklyOperatingSchedule
): NormalizedWeeklySchedule {
  const enabled = channel === "delivery"
    ? firstBoolean(schedule.enabled, schedule.active)
    : firstBoolean(schedule.enabled, schedule.local_ordering_enabled);
  const activeDays = normalizeDays(
    channel === "delivery" ? schedule.active_days : schedule.local_order_days ?? schedule.active_days
  );
  const openTime = channel === "delivery"
    ? firstTime(schedule.open_time, schedule.order_open_time)
    : firstTime(schedule.open_time, schedule.local_ordering_open_time);
  const closeTime = channel === "delivery"
    ? firstTime(schedule.close_time, schedule.order_close_time)
    : firstTime(schedule.close_time, schedule.local_ordering_close_time);
  const serviceStart = firstTime(schedule.service_start, schedule.delivery_start_time);
  const serviceEnd = firstTime(schedule.service_end, schedule.delivery_end_time);
  const menuGuaranteeCutoff = firstTime(
    schedule.menu_guarantee_cutoff,
    schedule.local_ordering_guarantee_cutoff
  );

  return {
    enabled,
    activeDays,
    openTime,
    closeTime,
    serviceStart: isOrderedWindow(serviceStart, serviceEnd) ? serviceStart : null,
    serviceEnd: isOrderedWindow(serviceStart, serviceEnd) ? serviceEnd : null,
    menuGuaranteeCutoff
  };
}

function blankState(
  channel: OperatingChannel,
  parts: Pick<OperatingCalendarState, "localDate" | "currentTime">,
  reason: OperatingCalendarReason,
  source: OperatingCalendarSource,
  weekly?: NormalizedWeeklySchedule
): OperatingCalendarState {
  const cutoff = channel === "local" ? weekly?.menuGuaranteeCutoff ?? null : null;

  return {
    channel,
    open: false,
    localDate: parts.localDate,
    currentTime: parts.currentTime,
    openTime: weekly?.openTime ?? null,
    closeTime: weekly?.closeTime ?? null,
    reason,
    source,
    serviceStart: weekly?.serviceStart ?? null,
    serviceEnd: weekly?.serviceEnd ?? null,
    menuGuaranteeCutoff: cutoff,
    afterMenuGuaranteeCutoff: channel === "local" && cutoff
      ? timeToMinutes(parts.currentTime) >= timeToMinutes(cutoff)
      : channel === "local" && cutoff === null,
    closureName: null,
    closureScope: null,
    closureSource: null,
    exceptionId: null
  };
}

function matchingException(
  exceptions: ScheduleException[] | null | undefined,
  localDate: string,
  channel: OperatingChannel,
  companyId: string | null
) {
  const candidates = (Array.isArray(exceptions) ? exceptions : []).filter((exception) =>
    exception &&
    normalizeDate(exception.date) === localDate &&
    exception.channel === channel
  );
  const exact = companyId
    ? candidates.find((exception) => exception.company_id === companyId)
    : undefined;

  return exact ?? candidates.find((exception) => exception.company_id === null || exception.company_id === undefined) ?? null;
}

function exceptionWindow(
  exception: ScheduleException,
  weekly: NormalizedWeeklySchedule
): EffectiveWindow | null {
  const openTime = normalizeTime(exception.open_time);
  const closeTime = normalizeTime(exception.close_time);

  if (!isOrderedWindow(openTime, closeTime) || !closeTime) {
    return null;
  }

  const rawServiceStart = exception.service_start;
  const rawServiceEnd = exception.service_end;
  const hasServiceOverride = rawServiceStart !== null && rawServiceStart !== undefined ||
    rawServiceEnd !== null && rawServiceEnd !== undefined;
  const serviceStart = hasServiceOverride ? normalizeTime(rawServiceStart) : weekly.serviceStart;
  const serviceEnd = hasServiceOverride ? normalizeTime(rawServiceEnd) : weekly.serviceEnd;

  if (hasServiceOverride && (!isOrderedWindow(serviceStart, serviceEnd) || !serviceEnd)) {
    return null;
  }

  const hasCutoffOverride = exception.menu_guarantee_cutoff !== null &&
    exception.menu_guarantee_cutoff !== undefined;
  const menuGuaranteeCutoff = hasCutoffOverride
    ? normalizeTime(exception.menu_guarantee_cutoff)
    : weekly.menuGuaranteeCutoff;

  if (hasCutoffOverride && !menuGuaranteeCutoff) {
    return null;
  }

  return {
    openTime,
    closeTime,
    serviceStart: serviceStart ?? null,
    serviceEnd: serviceEnd ?? null,
    menuGuaranteeCutoff
  };
}

function stateForWindow(
  channel: OperatingChannel,
  parts: MadridParts,
  window: EffectiveWindow,
  source: "exception" | "weekly",
  exceptionId: string | null = null
): OperatingCalendarState {
  const openMinutes = timeToMinutes(window.openTime);
  const closeMinutes = timeToMinutes(window.closeTime);
  const open = parts.currentMinutes >= openMinutes && parts.currentMinutes < closeMinutes;
  const reason: OperatingCalendarReason = open
    ? "open"
    : parts.currentMinutes < openMinutes
      ? "before_open"
      : "after_close";
  const cutoff = channel === "local" ? window.menuGuaranteeCutoff : null;

  return {
    channel,
    open,
    localDate: parts.localDate,
    currentTime: parts.currentTime,
    openTime: window.openTime,
    closeTime: window.closeTime,
    reason,
    source,
    serviceStart: window.serviceStart,
    serviceEnd: window.serviceEnd,
    menuGuaranteeCutoff: cutoff,
    afterMenuGuaranteeCutoff: channel === "local" && cutoff
      ? parts.currentMinutes >= timeToMinutes(cutoff)
      : channel === "local" && cutoff === null,
    closureName: null,
    closureScope: null,
    closureSource: null,
    exceptionId
  };
}

export function resolveOperatingCalendar(input: ResolveOperatingCalendarInput): OperatingCalendarState {
  const now = input.now ?? new Date();
  const parts = madridParts(now);

  if (!parts) {
    return blankState(input.channel, { localDate: "", currentTime: "" }, "invalid_date", "master");
  }

  const weekly = normalizeWeeklySchedule(input.channel, input.weeklySchedule ?? {});

  if (!weekly.enabled) {
    return blankState(input.channel, parts, "master_disabled", "master", weekly);
  }

  const companyId = typeof input.companyId === "string" && input.companyId.trim()
    ? input.companyId.trim()
    : null;
  const exception = matchingException(input.exceptions, parts.localDate, input.channel, companyId);

  if (exception) {
    if (exception.mode === "closed") {
      const state = blankState(input.channel, parts, "exception_closed", "exception");
      state.exceptionId = exception.id ?? null;
      return state;
    }

    if (exception.mode !== "custom_hours") {
      const state = blankState(input.channel, parts, "invalid_exception", "exception");
      state.exceptionId = exception.id ?? null;
      return state;
    }

    const window = exceptionWindow(exception, weekly);

    if (!window) {
      const state = blankState(input.channel, parts, "invalid_exception", "exception");
      state.exceptionId = exception.id ?? null;
      return state;
    }

    return stateForWindow(input.channel, parts, window, "exception", exception.id ?? null);
  }

  const closure = (Array.isArray(input.closures) ? input.closures : []).find((candidate) =>
    candidate &&
    candidate.enabled === true &&
    normalizeDate(candidate.date) === parts.localDate &&
    (input.channel === "delivery" ? candidate.closes_delivery === true : candidate.closes_local === true)
  );

  if (closure) {
    const state = blankState(input.channel, parts, "holiday", "calendar", weekly);
    state.closureName = typeof closure.name === "string" && closure.name.trim() ? closure.name.trim() : "Día cerrado";
    state.closureScope = typeof closure.scope === "string" && closure.scope.trim() ? closure.scope.trim() : null;
    state.closureSource = typeof closure.source === "string" && closure.source.trim() ? closure.source.trim() : null;
    return state;
  }

  if (
    input.channel === "delivery" &&
    normalizeDays(input.localOnlyDays).includes(parts.weekday)
  ) {
    return blankState(input.channel, parts, "local_only", "weekly", weekly);
  }

  if (!weekly.openTime || !weekly.closeTime || !isOrderedWindow(weekly.openTime, weekly.closeTime)) {
    return blankState(input.channel, parts, "invalid_schedule", "weekly", weekly);
  }

  if (!weekly.activeDays.length || !weekly.activeDays.includes(parts.weekday)) {
    return blankState(input.channel, parts, "inactive_day", "weekly", weekly);
  }

  return stateForWindow(input.channel, parts, {
    openTime: weekly.openTime,
    closeTime: weekly.closeTime,
    serviceStart: weekly.serviceStart,
    serviceEnd: weekly.serviceEnd,
    menuGuaranteeCutoff: weekly.menuGuaranteeCutoff
  }, "weekly");
}

export const resolveOperatingChannel = resolveOperatingCalendar;
