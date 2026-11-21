import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveOperatingCalendar,
  type CalendarClosure,
  type ScheduleException,
  type WeeklyOperatingSchedule
} from "./operating-calendar.ts";

const deliverySchedule: WeeklyOperatingSchedule = {
  active: true,
  active_days: [1, 2, 3, 4, 5],
  order_open_time: "09:30:00",
  order_close_time: "12:40:00",
  delivery_start_time: "13:00:00",
  delivery_end_time: "13:30:00"
};

const localSchedule: WeeklyOperatingSchedule = {
  local_ordering_enabled: true,
  local_order_days: [1, 2, 3, 4, 5],
  local_ordering_open_time: "09:30:00",
  local_ordering_close_time: "15:00:00",
  local_ordering_guarantee_cutoff: "13:30:00"
};

function exception(overrides: Partial<ScheduleException> = {}): ScheduleException {
  return {
    id: "exception-global",
    date: "2026-11-21",
    channel: "delivery",
    company_id: null,
    mode: "custom_hours",
    open_time: "08:30",
    close_time: "12:40",
    service_start: null,
    service_end: null,
    menu_guarantee_cutoff: null,
    ...overrides
  };
}

function closure(overrides: Partial<CalendarClosure> = {}): CalendarClosure {
  return {
    id: "holiday-1",
    date: "2026-05-15",
    name: "San Isidro",
    scope: "madrid_city",
    source: "official",
    closes_delivery: true,
    closes_local: true,
    enabled: true,
    ...overrides
  };
}

test("resuelve el horario semanal en Madrid con apertura inclusiva y cierre exclusivo", () => {
  const atOpen = resolveOperatingCalendar({
    now: new Date("2026-06-15T07:30:00.000Z"),
    channel: "delivery",
    weeklySchedule: deliverySchedule
  });
  const atClose = resolveOperatingCalendar({
    now: new Date("2026-06-15T10:40:00.000Z"),
    channel: "delivery",
    weeklySchedule: deliverySchedule
  });

  assert.equal(atOpen.open, true);
  assert.equal(atOpen.source, "weekly");
  assert.equal(atOpen.openTime, "09:30");
  assert.equal(atOpen.serviceStart, "13:00");
  assert.equal(atClose.open, false);
  assert.equal(atClose.reason, "after_close");
});

test("mantiene delivery y local independientes", () => {
  const now = new Date("2026-06-15T11:00:00.000Z"); // 13:00 Madrid

  assert.equal(resolveOperatingCalendar({ now, channel: "delivery", weeklySchedule: deliverySchedule }).open, false);
  assert.equal(resolveOperatingCalendar({ now, channel: "local", weeklySchedule: localSchedule }).open, true);
});

test("un cierre maestro prevalece incluso sobre una apertura excepcional", () => {
  const state = resolveOperatingCalendar({
    now: new Date("2026-11-21T08:00:00.000Z"),
    channel: "delivery",
    weeklySchedule: { ...deliverySchedule, active: false },
    exceptions: [exception()]
  });

  assert.equal(state.open, false);
  assert.equal(state.reason, "master_disabled");
  assert.equal(state.source, "master");
});

test("la excepción de empresa prevalece sobre la global", () => {
  const state = resolveOperatingCalendar({
    now: new Date("2026-11-21T08:00:00.000Z"),
    channel: "delivery",
    companyId: "bureau-veritas",
    weeklySchedule: deliverySchedule,
    exceptions: [
      exception({ id: "global-closed", mode: "closed" }),
      exception({ id: "bv-open", company_id: "bureau-veritas", open_time: "09:00", close_time: "11:30" })
    ]
  });

  assert.equal(state.open, true);
  assert.equal(state.source, "exception");
  assert.equal(state.exceptionId, "bv-open");
  assert.equal(state.openTime, "09:00");
});

test("una excepción global se aplica cuando no hay otra de empresa", () => {
  const state = resolveOperatingCalendar({
    now: new Date("2026-11-21T08:00:00.000Z"),
    channel: "delivery",
    companyId: "bureau-veritas",
    weeklySchedule: deliverySchedule,
    exceptions: [exception()]
  });

  assert.equal(state.open, true);
  assert.equal(state.source, "exception");
});

test("una excepción de cierre total gana al horario habitual", () => {
  const state = resolveOperatingCalendar({
    now: new Date("2026-11-21T08:00:00.000Z"),
    channel: "delivery",
    weeklySchedule: { ...deliverySchedule, active_days: [1, 2, 3, 4, 5, 6] },
    exceptions: [exception({ mode: "closed" })]
  });

  assert.equal(state.open, false);
  assert.equal(state.reason, "exception_closed");
  assert.equal(state.source, "exception");
});

test("una apertura excepcional prevalece sobre el festivo solo en su canal", () => {
  const sanIsidro = closure();
  const delivery = resolveOperatingCalendar({
    now: new Date("2026-05-15T08:00:00.000Z"),
    channel: "delivery",
    weeklySchedule: deliverySchedule,
    closures: [sanIsidro],
    exceptions: [exception({ date: "2026-05-15", open_time: "09:00", close_time: "12:00" })]
  });
  const local = resolveOperatingCalendar({
    now: new Date("2026-05-15T08:00:00.000Z"),
    channel: "local",
    weeklySchedule: localSchedule,
    closures: [sanIsidro],
    exceptions: [exception({ date: "2026-05-15", open_time: "09:00", close_time: "12:00" })]
  });

  assert.equal(delivery.open, true);
  assert.equal(delivery.source, "exception");
  assert.equal(local.open, false);
  assert.equal(local.reason, "holiday");
  assert.equal(local.closureName, "San Isidro");
  assert.equal(local.closureScope, "madrid_city");
});

test("un festivo deshabilitado o que no cierra el canal no afecta", () => {
  const now = new Date("2026-05-15T08:00:00.000Z");
  const disabled = resolveOperatingCalendar({
    now,
    channel: "delivery",
    weeklySchedule: deliverySchedule,
    closures: [closure({ enabled: false })]
  });
  const localOnlyClosure = resolveOperatingCalendar({
    now,
    channel: "delivery",
    weeklySchedule: deliverySchedule,
    closures: [closure({ closes_delivery: false })]
  });

  assert.equal(disabled.open, true);
  assert.equal(localOnlyClosure.open, true);
});

test("un día solo local cierra el delivery base pero una excepción puede abrirlo", () => {
  const now = new Date("2026-06-19T08:00:00.000Z"); // viernes, 10:00 Madrid
  const base = resolveOperatingCalendar({
    now,
    channel: "delivery",
    weeklySchedule: deliverySchedule,
    localOnlyDays: [5]
  });
  const exceptional = resolveOperatingCalendar({
    now,
    channel: "delivery",
    weeklySchedule: deliverySchedule,
    localOnlyDays: [5],
    exceptions: [exception({ date: "2026-06-19", open_time: "09:30", close_time: "12:40" })]
  });
  const local = resolveOperatingCalendar({
    now,
    channel: "local",
    weeklySchedule: localSchedule,
    localOnlyDays: [5]
  });

  assert.equal(base.open, false);
  assert.equal(base.reason, "local_only");
  assert.equal(exceptional.open, true);
  assert.equal(local.open, true);
});

test("normaliza horas de Supabase y expone el corte de garantía local", () => {
  const beforeCutoff = resolveOperatingCalendar({
    now: new Date("2026-06-15T11:29:00.000Z"),
    channel: "local",
    weeklySchedule: localSchedule
  });
  const atCutoff = resolveOperatingCalendar({
    now: new Date("2026-06-15T11:30:00.000Z"),
    channel: "local",
    weeklySchedule: localSchedule
  });

  assert.equal(beforeCutoff.menuGuaranteeCutoff, "13:30");
  assert.equal(beforeCutoff.afterMenuGuaranteeCutoff, false);
  assert.equal(atCutoff.afterMenuGuaranteeCutoff, true);
});

test("una excepción puede sustituir las ventanas de servicio y el corte", () => {
  const state = resolveOperatingCalendar({
    now: new Date("2026-11-21T09:00:00.000Z"),
    channel: "local",
    weeklySchedule: localSchedule,
    exceptions: [exception({
      channel: "local",
      open_time: "09:00:00",
      close_time: "16:00:00",
      service_start: "10:00:00",
      service_end: "15:30:00",
      menu_guarantee_cutoff: "12:00:00"
    })]
  });

  assert.equal(state.open, true);
  assert.equal(state.serviceStart, "10:00");
  assert.equal(state.serviceEnd, "15:30");
  assert.equal(state.menuGuaranteeCutoff, "12:00");
  assert.equal(state.afterMenuGuaranteeCutoff, false);
});

test("una excepción inválida cierra de forma segura en vez de caer al horario habitual", () => {
  const crossMidnight = resolveOperatingCalendar({
    now: new Date("2026-11-21T21:30:00.000Z"),
    channel: "delivery",
    weeklySchedule: { ...deliverySchedule, active_days: [1, 2, 3, 4, 5, 6] },
    exceptions: [exception({ open_time: "22:00", close_time: "02:00" })]
  });
  const invalidServiceWindow = resolveOperatingCalendar({
    now: new Date("2026-11-21T09:00:00.000Z"),
    channel: "delivery",
    weeklySchedule: deliverySchedule,
    exceptions: [exception({ service_start: "13:30", service_end: null })]
  });

  assert.equal(crossMidnight.open, false);
  assert.equal(crossMidnight.reason, "invalid_exception");
  assert.equal(invalidServiceWindow.open, false);
  assert.equal(invalidServiceWindow.reason, "invalid_exception");
});

test("un horario semanal inválido también cierra de forma segura", () => {
  const state = resolveOperatingCalendar({
    now: new Date("2026-06-15T08:00:00.000Z"),
    channel: "delivery",
    weeklySchedule: { ...deliverySchedule, order_open_time: "25:00" }
  });

  assert.equal(state.open, false);
  assert.equal(state.reason, "invalid_schedule");
});

test("usa la fecha de Madrid aunque en UTC todavía sea el día anterior", () => {
  const state = resolveOperatingCalendar({
    now: new Date("2026-05-14T22:30:00.000Z"), // 15 de mayo, 00:30 en Madrid
    channel: "delivery",
    weeklySchedule: deliverySchedule,
    closures: [closure()]
  });

  assert.equal(state.localDate, "2026-05-15");
  assert.equal(state.currentTime, "00:30");
  assert.equal(state.reason, "holiday");
});

test("rechaza una fecha de ejecución inválida sin lanzar", () => {
  const state = resolveOperatingCalendar({
    now: new Date("invalid"),
    channel: "delivery",
    weeklySchedule: deliverySchedule
  });

  assert.equal(state.open, false);
  assert.equal(state.reason, "invalid_date");
});
