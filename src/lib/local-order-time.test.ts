import assert from "node:assert/strict";
import test from "node:test";
import { buildLocalRequestedTimeOptions } from "./local-order-time.ts";

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
