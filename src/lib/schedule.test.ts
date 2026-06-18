import assert from "node:assert/strict";
import test from "node:test";

const scheduleModulePath = "./schedule.ts";
const { isOrderWindowOpen } = await import(scheduleModulePath);

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
