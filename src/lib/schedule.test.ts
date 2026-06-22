import assert from "node:assert/strict";
import test from "node:test";

const scheduleModulePath = "./schedule.ts";
const { isOrderWindowOpen } = await import(scheduleModulePath);
const customSchedule = {
  active: true,
  active_days: [1, 2, 3, 4, 5],
  order_open_time: "09:30",
  order_close_time: "13:00",
  delivery_start_time: "13:00",
  delivery_end_time: "13:30"
};

test("permite pedidos el viernes a las 12:35 en Madrid", () => {
  assert.equal(isOrderWindowOpen(new Date("2026-06-19T10:35:00.000Z")), true);
});

test("bloquea pedidos a partir de las 12:40 en Madrid", () => {
  assert.equal(isOrderWindowOpen(new Date("2026-06-19T10:40:00.000Z")), false);
});

test("bloquea pedidos en sabado y domingo", () => {
  assert.equal(isOrderWindowOpen(new Date("2026-06-20T10:00:00.000Z")), false);
  assert.equal(isOrderWindowOpen(new Date("2026-06-21T10:00:00.000Z")), false);
});

test("obedece un cierre global cambiado a las 13:00", () => {
  assert.equal(isOrderWindowOpen(new Date("2026-06-19T10:55:00.000Z"), customSchedule), true);
  assert.equal(isOrderWindowOpen(new Date("2026-06-19T11:00:00.000Z"), customSchedule), false);
});

test("bloquea un día desactivado y el cierre global", () => {
  assert.equal(
    isOrderWindowOpen(new Date("2026-06-19T10:35:00.000Z"), { ...customSchedule, active_days: [1, 2, 3, 4] }),
    false
  );
  assert.equal(
    isOrderWindowOpen(new Date("2026-06-19T10:35:00.000Z"), { ...customSchedule, active: false }),
    false
  );
});
