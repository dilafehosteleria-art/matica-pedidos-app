import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLateLocalMenuMetadata,
  getLocalOrderState,
  hasLateLocalMenuConfiguration,
  isLocalFulfillmentType,
  isLocalOnlyDay,
  localOrderWindowLabel,
  validateLocalOrderingSettings,
  type LocalOrderingCompany
} from "./local-ordering.ts";

const bureauVeritasLocalOrdering: LocalOrderingCompany = {
  local_ordering_enabled: true,
  local_order_days: [1, 2, 3, 4, 5],
  local_ordering_open_time: "09:30:00",
  local_ordering_close_time: "15:00:00",
  local_ordering_guarantee_cutoff: "13:30:00",
  local_orders_closed_on: null,
  local_only_days: [5]
};

test("reconoce únicamente las modalidades de pedido en el local", () => {
  assert.equal(isLocalFulfillmentType("dine_in"), true);
  assert.equal(isLocalFulfillmentType("pickup"), true);
  assert.equal(isLocalFulfillmentType("delivery"), false);
  assert.equal(isLocalFulfillmentType(null), false);
});

test("el menú tardío conserva el precio visto sin confundirlo con una selección de platos", () => {
  const metadata = buildLateLocalMenuMetadata(13.5);

  assert.deepEqual(metadata, { _configured_unit_price: "13.50" });
  assert.equal(hasLateLocalMenuConfiguration(metadata), false);
  assert.equal(hasLateLocalMenuConfiguration({ ...metadata, first_course: "Pasta" }), true);
});

test("abre a las 09:30 y mantiene garantizada la selección antes de las 13:30", () => {
  const state = getLocalOrderState(new Date("2026-06-19T07:30:00.000Z"), bureauVeritasLocalOrdering);

  assert.equal(state.open, true);
  assert.equal(state.afterGuaranteeCutoff, false);
  assert.equal(state.localDate, "2026-06-19");
  assert.equal(state.currentTime, "09:30");
});

test("a las 13:30 sigue abierto pero la selección deja de estar garantizada", () => {
  const beforeCutoff = getLocalOrderState(
    new Date("2026-06-19T11:29:00.000Z"),
    bureauVeritasLocalOrdering
  );
  const atCutoff = getLocalOrderState(
    new Date("2026-06-19T11:30:00.000Z"),
    bureauVeritasLocalOrdering
  );

  assert.equal(beforeCutoff.open, true);
  assert.equal(beforeCutoff.afterGuaranteeCutoff, false);
  assert.equal(atCutoff.open, true);
  assert.equal(atCutoff.afterGuaranteeCutoff, true);
  assert.match(atCutoff.message, /sujeta a disponibilidad/i);
});

test("permite hasta las 14:59 y cierra de forma exclusiva a las 15:00", () => {
  const beforeClose = getLocalOrderState(
    new Date("2026-06-19T12:59:00.000Z"),
    bureauVeritasLocalOrdering
  );
  const atClose = getLocalOrderState(
    new Date("2026-06-19T13:00:00.000Z"),
    bureauVeritasLocalOrdering
  );

  assert.equal(beforeClose.open, true);
  assert.equal(atClose.open, false);
  assert.equal(atClose.afterGuaranteeCutoff, true);
});

test("viernes está activo y se identifica como día solo local", () => {
  const friday = new Date("2026-06-19T10:00:00.000Z");

  assert.equal(getLocalOrderState(friday, bureauVeritasLocalOrdering).open, true);
  assert.equal(isLocalOnlyDay(friday, bureauVeritasLocalOrdering), true);
  assert.equal(isLocalOnlyDay(new Date("2026-06-18T10:00:00.000Z"), bureauVeritasLocalOrdering), false);
});

test("bloquea sábados aunque la hora esté dentro de la franja", () => {
  const state = getLocalOrderState(new Date("2026-06-20T10:00:00.000Z"), bureauVeritasLocalOrdering);

  assert.equal(state.open, false);
});

test("bloquea la modalidad local cuando está deshabilitada", () => {
  const state = getLocalOrderState(new Date("2026-06-19T10:00:00.000Z"), {
    ...bureauVeritasLocalOrdering,
    local_ordering_enabled: false
  });

  assert.equal(state.open, false);
  assert.match(state.message, /no están disponibles/i);
});

test("el cierre manual afecta solo a la fecha indicada y reabre al día siguiente", () => {
  const company = {
    ...bureauVeritasLocalOrdering,
    local_orders_closed_on: "2026-06-17"
  };
  const closedDay = getLocalOrderState(new Date("2026-06-17T10:00:00.000Z"), company);
  const nextDay = getLocalOrderState(new Date("2026-06-18T10:00:00.000Z"), company);

  assert.equal(closedDay.open, false);
  assert.match(closedDay.message, /hoy no aceptamos/i);
  assert.equal(nextDay.open, true);
});

test("describe la franja local normalizando horas de Supabase", () => {
  assert.equal(localOrderWindowLabel(bureauVeritasLocalOrdering), "lunes a viernes de 09:30 a 15:00");
});

test("normaliza una configuración administrativa válida", () => {
  const result = validateLocalOrderingSettings(bureauVeritasLocalOrdering);

  assert.equal(result.valid, true);
  if (!result.valid) return;
  assert.deepEqual(result.settings, {
    local_ordering_enabled: true,
    local_order_days: [1, 2, 3, 4, 5],
    local_ordering_open_time: "09:30",
    local_ordering_close_time: "15:00",
    local_ordering_guarantee_cutoff: "13:30",
    local_orders_closed_on: null,
    local_only_days: [5]
  });
});

test("rechaza días duplicados o días solo local fuera de la franja semanal", () => {
  assert.equal(validateLocalOrderingSettings({
    ...bureauVeritasLocalOrdering,
    local_order_days: [1, 1, 5]
  }).valid, false);
  assert.equal(validateLocalOrderingSettings({
    ...bureauVeritasLocalOrdering,
    local_order_days: [1, 2, 3, 4],
    local_only_days: [5]
  }).valid, false);
});

test("rechaza horas desordenadas y fechas de cierre inexistentes", () => {
  assert.equal(validateLocalOrderingSettings({
    ...bureauVeritasLocalOrdering,
    local_ordering_guarantee_cutoff: "15:00"
  }).valid, false);
  assert.equal(validateLocalOrderingSettings({
    ...bureauVeritasLocalOrdering,
    local_orders_closed_on: "2026-02-31"
  }).valid, false);
});
