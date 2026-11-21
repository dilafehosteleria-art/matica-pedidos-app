import assert from "node:assert/strict";
import test from "node:test";
import { buildLocalRequestedTimeOptions, isRequestedLocalTimeAllowed } from "./local-order-time.ts";

test("ofrece la siguiente franja futura y nunca incluye la hora de cierre", () => {
  const options = buildLocalRequestedTimeOptions("13:31", "15:00");

  assert.equal(options[0], "13:45");
  assert.equal(options.at(-1), "14:45");
  assert.equal(options.includes("15:00"), false);
});

test("cerca del cierre conserva únicamente la opción Ahora de la interfaz", () => {
  assert.deepEqual(buildLocalRequestedTimeOptions("14:59", "15:00"), []);
  assert.deepEqual(buildLocalRequestedTimeOptions("15:00", "15:00"), []);
});

test("una apertura local anticipada acepta Ahora y respeta su cierre", () => {
  assert.equal(isRequestedLocalTimeAllowed("08:36", "08:36", "08:30", "12:40"), true);
  assert.equal(isRequestedLocalTimeAllowed("08:31", "08:36", "08:30", "12:40"), true);
  assert.equal(isRequestedLocalTimeAllowed("08:30", "08:36", "08:30", "12:40"), false);
  assert.equal(isRequestedLocalTimeAllowed("12:39", "08:36", "08:30", "12:40"), true);
  assert.equal(isRequestedLocalTimeAllowed("12:40", "08:36", "08:30", "12:40"), false);
});
