import type { getSupabaseAdminClient } from "./supabase/server.ts";
import {
  OFFICIAL_HOLIDAY_DATASET_API,
  OFFICIAL_HOLIDAY_FALLBACK_URL,
  OfficialHolidayCalendarError,
  officialCalendarFingerprint,
  officialHolidaySourceFromMetadata,
  parseOfficialHolidayCalendar,
  type OfficialHolidaySource
} from "./official-holiday-calendar.ts";

type AdminClient = NonNullable<ReturnType<typeof getSupabaseAdminClient>>;
type Fetcher = typeof fetch;

export type OfficialHolidaySyncResult = {
  year: number;
  status: "updated" | "unchanged" | "pending" | "error";
  count: number;
  message: string;
};

const MAX_SOURCE_BYTES = 5_000_000;

function madridYear(date = new Date()) {
  return Number(new Intl.DateTimeFormat("en", { timeZone: "Europe/Madrid", year: "numeric" }).format(date));
}

export function officialCalendarTargetYears(date = new Date()) {
  const current = madridYear(date);
  return [current, current + 1];
}

async function responseText(response: Response, label: string) {
  if (!response.ok) {
    throw new OfficialHolidayCalendarError(`${label} respondió con estado ${response.status}.`, "source_error");
  }
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_SOURCE_BYTES) {
    throw new OfficialHolidayCalendarError(`${label} supera el tamaño máximo permitido.`, "source_error");
  }
  const text = await response.text();
  if (text.length === 0 || text.length > MAX_SOURCE_BYTES) {
    throw new OfficialHolidayCalendarError(`${label} está vacío o supera el tamaño máximo permitido.`, "source_error");
  }
  return text;
}

async function discoverOfficialSource(fetcher: Fetcher): Promise<OfficialHolidaySource> {
  try {
    const response = await fetcher(OFFICIAL_HOLIDAY_DATASET_API, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15_000)
    });
    const text = await responseText(response, "El catálogo oficial de Madrid");
    return officialHolidaySourceFromMetadata(JSON.parse(text) as unknown);
  } catch (cause) {
    if (cause instanceof OfficialHolidayCalendarError && cause.code !== "source_error") throw cause;
    return { csvUrl: OFFICIAL_HOLIDAY_FALLBACK_URL, lastModified: null };
  }
}

async function recordFailure(supabase: AdminClient, year: number, message: string) {
  const { error } = await supabase.from("official_calendar_syncs").upsert({
    year,
    last_checked_at: new Date().toISOString(),
    last_error: message.slice(0, 500),
    updated_at: new Date().toISOString()
  }, { onConflict: "year" });
  if (error) console.error("No se pudo registrar el fallo de sincronización de festivos", { year, error: error.message });
}

function errorMessage(cause: unknown) {
  return cause instanceof Error ? cause.message : "No se pudo validar el calendario oficial.";
}

export async function syncOfficialHolidayCalendars(
  supabase: AdminClient,
  options: { years?: number[]; fetcher?: Fetcher; now?: Date } = {}
): Promise<OfficialHolidaySyncResult[]> {
  const now = options.now ?? new Date();
  const currentYear = madridYear(now);
  const years = options.years ?? officialCalendarTargetYears(now);
  const uniqueYears = Array.from(new Set(years)).sort((left, right) => left - right);
  const fetcher = options.fetcher ?? fetch;
  let source: OfficialHolidaySource;
  let csv: string;

  try {
    source = await discoverOfficialSource(fetcher);
    const response = await fetcher(source.csvUrl, {
      cache: "no-store",
      headers: { Accept: "text/csv,text/plain;q=0.9,*/*;q=0.1" },
      signal: AbortSignal.timeout(20_000)
    });
    csv = await responseText(response, "El CSV oficial de festivos de Madrid");
  } catch (cause) {
    const message = errorMessage(cause);
    await Promise.all(uniqueYears.map((year) => recordFailure(supabase, year, message)));
    return uniqueYears.map((year) => ({ year, status: "error", count: 0, message }));
  }

  const results: OfficialHolidaySyncResult[] = [];
  for (const year of uniqueYears) {
    try {
      const holidays = parseOfficialHolidayCalendar(csv, year);
      const fingerprint = officialCalendarFingerprint(holidays);
      const { data, error } = await supabase.rpc("replace_official_calendar", {
        p_year: year,
        p_holidays: holidays,
        p_source_url: source.csvUrl,
        p_fingerprint: fingerprint
      });
      if (error) throw new Error(error.message);
      const status = data && typeof data === "object" && "status" in data && data.status === "unchanged"
        ? "unchanged"
        : "updated";
      results.push({
        year,
        status,
        count: holidays.length,
        message: status === "unchanged"
          ? `El calendario ${year} ya estaba actualizado.`
          : `Calendario ${year} actualizado con ${holidays.length} festivos oficiales.`
      });
    } catch (cause) {
      const message = errorMessage(cause);
      const pending = cause instanceof OfficialHolidayCalendarError &&
        cause.code === "year_not_published" && year > currentYear;
      await recordFailure(supabase, year, message);
      results.push({ year, status: pending ? "pending" : "error", count: 0, message });
    }
  }
  return results;
}
