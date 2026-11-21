import assert from "node:assert/strict";
import test from "node:test";

import {
  OFFICIAL_HOLIDAY_DATASET_API,
  OFFICIAL_HOLIDAY_FALLBACK_URL,
  OFFICIAL_HOLIDAY_RESOURCE_ID
} from "./official-holiday-calendar.ts";

const sourceUrl = OFFICIAL_HOLIDAY_FALLBACK_URL;
const syncModulePath = "./official-holiday-sync.ts";
const { syncOfficialHolidayCalendars } = await import(syncModulePath);

type CsvHoliday = readonly [date: string, type: string, name: string];

const VALID_2027: CsvHoliday[] = [
  ["01/01/2027", "Festivo nacional", "Año Nuevo"],
  ["06/01/2027", "Festivo nacional", "Epifanía del Señor"],
  ["19/03/2027", "Festivo de la Comunidad de Madrid", "San José"],
  ["25/03/2027", "Festivo de la Comunidad de Madrid", "Jueves Santo"],
  ["26/03/2027", "Festivo nacional", "Viernes Santo"],
  ["01/05/2027", "Festivo nacional", "Fiesta del Trabajo"],
  ["15/05/2027", "Festivo local de la ciudad de Madrid", "San Isidro Labrador"],
  ["16/08/2027", "Festivo nacional", "Traslado de Asunción de la Virgen"],
  ["12/10/2027", "Festivo nacional", "Fiesta Nacional de España"],
  ["01/11/2027", "Festivo nacional", "Todos los Santos"],
  ["09/11/2027", "Festivo local de la ciudad de Madrid", "Nuestra Señora de la Almudena"],
  ["06/12/2027", "Festivo nacional", "Día de la Constitución Española"],
  ["08/12/2027", "Festivo nacional", "Día de la Inmaculada Concepción"],
  ["25/12/2027", "Festivo nacional", "Natividad del Señor"]
];

function csvFor(rows: CsvHoliday[]) {
  const header = "Dia;Dia_semana;laborable / festivo / domingo festivo;Tipo de Festivo;Festividad";
  return `\uFEFF${[header, ...rows.map(([date, type, name]) => `${date};viernes;festivo;${type};${name}`)].join("\r\n")}`;
}

function metadataResponse() {
  return new Response(JSON.stringify({
    success: true,
    result: {
      resources: [{
        id: OFFICIAL_HOLIDAY_RESOURCE_ID,
        format: "CSV",
        url: sourceUrl,
        last_modified: "2026-10-29T07:16:06"
      }]
    }
  }), { status: 200, headers: { "content-type": "application/json" } });
}

function officialFetcher(csv = csvFor(VALID_2027)) {
  const calls: string[] = [];
  const fetcher = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    if (url === OFFICIAL_HOLIDAY_DATASET_API) return metadataResponse();
    if (url === sourceUrl) return new Response(csv, { status: 200, headers: { "content-type": "text/csv" } });
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
  return { calls, fetcher };
}

function fakeSupabase(rpcStatus: "updated" | "unchanged" = "updated") {
  const rpcCalls: Array<{ name: string; payload: Record<string, unknown> }> = [];
  const failureUpserts: Array<Record<string, unknown>> = [];
  const client = {
    async rpc(name: string, payload: Record<string, unknown>) {
      rpcCalls.push({ name, payload });
      return { data: { status: rpcStatus }, error: null };
    },
    from(table: string) {
      assert.equal(table, "official_calendar_syncs");
      return {
        async upsert(row: Record<string, unknown>) {
          failureUpserts.push(row);
          return { error: null };
        }
      };
    }
  };
  return { client, failureUpserts, rpcCalls };
}

test("descubre el CSV oficial y envía a la RPC un año completo validado", async () => {
  const source = officialFetcher();
  const database = fakeSupabase("updated");
  const results = await syncOfficialHolidayCalendars(database.client as never, {
    years: [2027],
    now: new Date("2026-11-21T12:00:00Z"),
    fetcher: source.fetcher
  });

  assert.deepEqual(source.calls, [OFFICIAL_HOLIDAY_DATASET_API, sourceUrl]);
  assert.equal(database.rpcCalls.length, 1);
  assert.equal(database.rpcCalls[0].name, "replace_official_calendar");
  assert.equal(database.rpcCalls[0].payload.p_year, 2027);
  assert.equal(database.rpcCalls[0].payload.p_source_url, sourceUrl);
  assert.match(String(database.rpcCalls[0].payload.p_fingerprint), /^[a-f0-9]{64}$/);
  assert.equal((database.rpcCalls[0].payload.p_holidays as unknown[]).length, 14);
  assert.deepEqual(results, [{
    year: 2027,
    status: "updated",
    count: 14,
    message: "Calendario 2027 actualizado con 14 festivos oficiales."
  }]);
  assert.equal(database.failureUpserts.length, 0);
});

test("propaga unchanged cuando la huella ya está almacenada", async () => {
  const source = officialFetcher();
  const database = fakeSupabase("unchanged");
  const [result] = await syncOfficialHolidayCalendars(database.client as never, {
    years: [2027],
    now: new Date("2026-11-21T12:00:00Z"),
    fetcher: source.fetcher
  });

  assert.equal(result.status, "unchanged");
  assert.equal(result.count, 14);
  assert.equal(database.rpcCalls.length, 1);
  assert.equal(database.failureUpserts.length, 0);
});

test("marca como pendiente el año siguiente todavía no publicado y no reemplaza nada", async () => {
  const source = officialFetcher();
  const database = fakeSupabase();
  const [result] = await syncOfficialHolidayCalendars(database.client as never, {
    years: [2028],
    now: new Date("2027-11-21T12:00:00Z"),
    fetcher: source.fetcher
  });

  assert.equal(result.status, "pending");
  assert.equal(result.count, 0);
  assert.match(result.message, /todavía no está publicado/);
  assert.equal(database.rpcCalls.length, 0);
  assert.equal(database.failureUpserts.length, 1);
  assert.equal(database.failureUpserts[0].year, 2028);
});

test("un fallo de la fuente solo registra el intento y nunca llama a la RPC de reemplazo", async () => {
  const database = fakeSupabase();
  const requested: string[] = [];
  const fetcher = (async (input: string | URL | Request) => {
    requested.push(String(input));
    return new Response("temporalmente no disponible", { status: 503 });
  }) as typeof fetch;

  const results = await syncOfficialHolidayCalendars(database.client as never, {
    years: [2027, 2028],
    now: new Date("2027-11-21T12:00:00Z"),
    fetcher
  });

  assert.deepEqual(requested, [OFFICIAL_HOLIDAY_DATASET_API, OFFICIAL_HOLIDAY_FALLBACK_URL]);
  assert.deepEqual(results.map((result: { status: string }) => result.status), ["error", "error"]);
  assert.equal(database.rpcCalls.length, 0);
  assert.deepEqual(database.failureUpserts.map((row) => row.year), [2027, 2028]);
});
