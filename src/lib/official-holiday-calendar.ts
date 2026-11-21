import { createHash } from "node:crypto";

export const OFFICIAL_HOLIDAY_DATASET_API =
  "https://datos.madrid.es/api/3/action/package_show?id=300082-0-calendario_laboral";
export const OFFICIAL_HOLIDAY_RESOURCE_ID = "300082-1-calendario_laboral-csv";
export const OFFICIAL_HOLIDAY_FALLBACK_URL =
  "https://datos.madrid.es/dataset/300082-0-calendario_laboral/resource/300082-1-calendario_laboral-csv/download/300082-3-calendario_laboral-xls_v2.csv";

export type OfficialHolidayScope = "national" | "regional" | "local";

export type OfficialHoliday = {
  date: string;
  name: string;
  scope: OfficialHolidayScope;
};

export type OfficialHolidaySource = {
  csvUrl: string;
  lastModified: string | null;
};

export class OfficialHolidayCalendarError extends Error {
  readonly code: "source_error" | "year_not_published" | "invalid_calendar";

  constructor(
    message: string,
    code: "source_error" | "year_not_published" | "invalid_calendar"
  ) {
    super(message);
    this.code = code;
    this.name = "OfficialHolidayCalendarError";
  }
}

function normalized(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("es-ES");
}

function parseDelimitedRows(input: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const text = input.replace(/^\uFEFF/, "");

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (!quoted && character === ";") {
      row.push(cell);
      cell = "";
      continue;
    }

    if (!quoted && (character === "\n" || character === "\r")) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += character;
  }

  if (quoted) {
    throw new OfficialHolidayCalendarError(
      "El CSV oficial contiene un campo entrecomillado sin cerrar.",
      "invalid_calendar"
    );
  }

  row.push(cell);
  if (row.some((value) => value.trim() !== "")) rows.push(row);
  return rows;
}

function columnIndex(headers: string[], expected: string) {
  const index = headers.findIndex((header) => normalized(header) === normalized(expected));
  if (index < 0) {
    throw new OfficialHolidayCalendarError(
      `El CSV oficial ya no contiene la columna «${expected}».`,
      "invalid_calendar"
    );
  }
  return index;
}

function isoDate(value: string) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!match) return null;
  const [, day, month, year] = match;
  const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (
    parsed.getUTCFullYear() !== Number(year) ||
    parsed.getUTCMonth() !== Number(month) - 1 ||
    parsed.getUTCDate() !== Number(day)
  ) return null;
  return `${year}-${month}-${day}`;
}

function officialScope(value: string): OfficialHolidayScope | null {
  const type = normalized(value);
  if (type === "festivo nacional") return "national";
  if (type === "festivo de la comunidad de madrid") return "regional";
  if (type === "festivo local de la ciudad de madrid") return "local";
  return null;
}

export function parseOfficialHolidayCalendar(csv: string, year: number): OfficialHoliday[] {
  if (!Number.isInteger(year) || year < 2000 || year > 2200) {
    throw new OfficialHolidayCalendarError("El año solicitado no es válido.", "invalid_calendar");
  }

  const rows = parseDelimitedRows(csv);
  if (rows.length < 2) {
    throw new OfficialHolidayCalendarError("El CSV oficial está vacío.", "source_error");
  }

  const headers = rows[0].map((header) => header.trim());
  const dateColumn = columnIndex(headers, "Dia");
  const kindColumn = columnIndex(headers, "laborable / festivo / domingo festivo");
  const typeColumn = columnIndex(headers, "Tipo de Festivo");
  const nameColumn = columnIndex(headers, "Festividad");
  const holidays: OfficialHoliday[] = [];

  for (const row of rows.slice(1)) {
    const rawDate = row[dateColumn]?.trim() ?? "";
    const date = isoDate(rawDate);
    const rowTargetsYear = rawDate.endsWith(`/${year}`);
    if (!rowTargetsYear) continue;
    if (!date) {
      throw new OfficialHolidayCalendarError(
        `El calendario ${year} contiene una fecha no válida: ${rawDate || "vacía"}.`,
        "invalid_calendar"
      );
    }
    if (normalized(row[kindColumn] ?? "") !== "festivo") continue;

    const scope = officialScope(row[typeColumn] ?? "");
    const name = (row[nameColumn] ?? "").trim();
    if (!scope) {
      throw new OfficialHolidayCalendarError(
        `El festivo ${date} tiene un ámbito oficial desconocido.`,
        "invalid_calendar"
      );
    }
    if (!name || name.length > 160) {
      throw new OfficialHolidayCalendarError(
        `El festivo ${date} no tiene un nombre válido.`,
        "invalid_calendar"
      );
    }
    holidays.push({ date, name, scope });
  }

  if (holidays.length === 0) {
    throw new OfficialHolidayCalendarError(
      `El calendario oficial de ${year} todavía no está publicado.`,
      "year_not_published"
    );
  }
  if (holidays.length !== 14) {
    throw new OfficialHolidayCalendarError(
      `El calendario oficial de ${year} contiene ${holidays.length} festivos en lugar de 14.`,
      "invalid_calendar"
    );
  }

  const dates = new Set(holidays.map((holiday) => holiday.date));
  if (dates.size !== holidays.length) {
    throw new OfficialHolidayCalendarError(
      `El calendario oficial de ${year} contiene fechas duplicadas.`,
      "invalid_calendar"
    );
  }

  const localCount = holidays.filter((holiday) => holiday.scope === "local").length;
  const scopes = new Set(holidays.map((holiday) => holiday.scope));
  if (localCount !== 2 || !scopes.has("national") || !scopes.has("regional")) {
    throw new OfficialHolidayCalendarError(
      `El calendario oficial de ${year} no contiene la combinación esperada de festivos nacionales, autonómicos y los 2 locales de Madrid capital.`,
      "invalid_calendar"
    );
  }

  return holidays.sort((left, right) =>
    left.date.localeCompare(right.date) || left.scope.localeCompare(right.scope) || left.name.localeCompare(right.name, "es")
  );
}

export function officialCalendarFingerprint(holidays: OfficialHoliday[]) {
  const canonical = holidays
    .map(({ date, name, scope }) => ({ date, name: name.trim(), scope }))
    .sort((left, right) =>
      left.date.localeCompare(right.date) || left.scope.localeCompare(right.scope) || left.name.localeCompare(right.name, "es")
    );
  return createHash("sha256").update(JSON.stringify(canonical), "utf8").digest("hex");
}

function safeOfficialCsvUrl(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    const expectedPath = `/dataset/300082-0-calendario_laboral/resource/${OFFICIAL_HOLIDAY_RESOURCE_ID}/download/`;
    return url.protocol === "https:" &&
      url.hostname === "datos.madrid.es" &&
      url.pathname.startsWith(expectedPath) &&
      url.pathname.length > expectedPath.length
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

export function officialHolidaySourceFromMetadata(value: unknown): OfficialHolidaySource {
  if (!value || typeof value !== "object" || !("success" in value) || value.success !== true || !("result" in value)) {
    throw new OfficialHolidayCalendarError("El catálogo oficial de Madrid no devolvió una respuesta válida.", "source_error");
  }
  const result = value.result;
  if (!result || typeof result !== "object" || !("resources" in result) || !Array.isArray(result.resources)) {
    throw new OfficialHolidayCalendarError("El catálogo oficial no incluye sus recursos descargables.", "source_error");
  }
  const resource = result.resources.find((item) =>
    item && typeof item === "object" && "id" in item && item.id === OFFICIAL_HOLIDAY_RESOURCE_ID
  );
  if (!resource || typeof resource !== "object") {
    throw new OfficialHolidayCalendarError("No se encontró el CSV acumulado en el catálogo oficial.", "source_error");
  }
  const format = "format" in resource && typeof resource.format === "string" ? resource.format.toUpperCase() : "";
  const csvUrl = "url" in resource ? safeOfficialCsvUrl(resource.url) : null;
  if (format !== "CSV" || !csvUrl) {
    throw new OfficialHolidayCalendarError("El recurso oficial no es un CSV válido de datos.madrid.es.", "source_error");
  }
  return {
    csvUrl,
    lastModified: "last_modified" in resource && typeof resource.last_modified === "string"
      ? resource.last_modified
      : null
  };
}
