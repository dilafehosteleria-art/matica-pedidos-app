import assert from "node:assert/strict";
import test from "node:test";

const modulePath = "./operating-calendar-data.ts";
const { readOperatingCalendar } = await import(modulePath);

type QueryResult = { data: unknown; error: { message: string } | null };

class FakeQuery implements PromiseLike<QueryResult> {
  private readonly result: QueryResult;

  constructor(result: QueryResult) {
    this.result = result;
  }

  select() {
    return this;
  }

  eq() {
    return this;
  }

  maybeSingle() {
    return Promise.resolve(this.result);
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.result).then(onfulfilled, onrejected);
  }
}

function fakeSupabase(overrides: Partial<Record<string, QueryResult>> = {}) {
  const defaults: Record<string, QueryResult> = {
    calendar_closures: {
      data: [{
        id: "holiday-1",
        date: "2027-01-01",
        name: "Año Nuevo",
        scope: "national",
        source: "official",
        closes_delivery: true,
        closes_local: true,
        enabled: true
      }],
      error: null
    },
    schedule_exceptions: {
      data: [{
        id: "exception-1",
        date: "2027-01-02",
        channel: "delivery",
        company_id: null,
        mode: "closed",
        open_time: null,
        close_time: null,
        service_start_time: null,
        service_end_time: null,
        menu_guarantee_cutoff: null
      }],
      error: null
    },
    official_calendar_syncs: {
      data: { year: 2027, complete: true, official_count: 14 },
      error: null
    }
  };
  const results = { ...defaults, ...overrides };
  return {
    from(table: string) {
      return new FakeQuery(results[table] ?? { data: null, error: null });
    }
  };
}

test("devuelve el calendario cuando el año tiene cobertura oficial completa", async () => {
  const result = await readOperatingCalendar(fakeSupabase() as never, {
    companyId: "company-1",
    date: "2027-01-02"
  });

  assert.equal(result.available, true);
  assert.equal(result.closures.length, 1);
  assert.equal(result.exceptions.length, 1);
});

test("falla cerrado cuando no existe cobertura para el año solicitado", async () => {
  const result = await readOperatingCalendar(fakeSupabase({
    official_calendar_syncs: { data: null, error: null }
  }) as never, { date: "2028-01-02" });

  assert.deepEqual(result, { closures: [], exceptions: [], available: false });
});

test("falla cerrado cuando la cobertura está marcada como incompleta", async () => {
  for (const coverage of [
    { year: 2027, complete: false, official_count: 14 },
    { year: 2027, complete: true, official_count: 13 }
  ]) {
    const result = await readOperatingCalendar(fakeSupabase({
      official_calendar_syncs: { data: coverage, error: null }
    }) as never, { date: "2027-01-02" });

    assert.equal(result.available, false);
  }
});

test("falla cerrado si no puede consultar el estado del calendario", async () => {
  const result = await readOperatingCalendar(fakeSupabase({
    official_calendar_syncs: { data: null, error: { message: "unavailable" } }
  }) as never, { date: "2027-01-02" });

  assert.deepEqual(result, { closures: [], exceptions: [], available: false });
});
