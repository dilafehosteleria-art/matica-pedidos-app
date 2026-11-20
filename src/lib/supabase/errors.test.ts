import assert from "node:assert/strict";
import test from "node:test";
import { isMissingDatabaseColumn } from "./errors.ts";

test("reconoce columnas ausentes de Postgres y de la cache de PostgREST", () => {
  assert.equal(
    isMissingDatabaseColumn(
      { code: "42703", message: "column orders.payment_checkout_id does not exist" },
      ["payment_checkout_id"]
    ),
    true
  );
  assert.equal(
    isMissingDatabaseColumn(
      { code: "PGRST204", message: "Could not find the 'payment_checkout_id' column in the schema cache" },
      ["payment_checkout_id"]
    ),
    true
  );
});

test("no confunde otros errores ni otras columnas", () => {
  assert.equal(
    isMissingDatabaseColumn(
      { code: "42501", message: "permission denied for table orders" },
      ["payment_checkout_id"]
    ),
    false
  );
  assert.equal(
    isMissingDatabaseColumn(
      { code: "42703", message: "column orders.unrelated_column does not exist" },
      ["payment_checkout_id"]
    ),
    false
  );
});
