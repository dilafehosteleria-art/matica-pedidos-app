import assert from "node:assert/strict";
import test from "node:test";

const calendarModulePath = "./official-holiday-calendar.ts";
const { officialCalendarFingerprint, parseOfficialHolidayCalendar } = await import(calendarModulePath);

type CsvHoliday = readonly [date: string, type: string, name: string];

const VALID_HOLIDAYS: CsvHoliday[] = [
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

function csvFor(rows: CsvHoliday[], options: { bom?: boolean; includeWorkingDay?: boolean } = {}) {
  const header = "Dia;Dia_semana;laborable / festivo / domingo festivo;Tipo de Festivo;Festividad";
  const content = rows.map(([date, type, name]) => `${date};viernes;festivo;${type};${name}`);
  if (options.includeWorkingDay) content.splice(1, 0, "02/01/2027;sábado;sabado;;");
  return `${options.bom ? "\uFEFF" : ""}${[header, ...content].join("\r\n")}`;
}

test("interpreta el CSV oficial con BOM y conserva solo los 14 festivos", () => {
  const holidays = parseOfficialHolidayCalendar(csvFor(VALID_HOLIDAYS, { bom: true, includeWorkingDay: true }), 2027);

  assert.equal(holidays.length, 14);
  assert.deepEqual(
    holidays.filter((holiday: { scope: string }) => holiday.scope === "local").map((holiday: { date: string }) => holiday.date),
    ["2027-05-15", "2027-11-09"]
  );
  assert.deepEqual(holidays[0], { date: "2027-01-01", name: "Año Nuevo", scope: "national" });
});

test("la huella es estable aunque el Ayuntamiento cambie el orden de las filas", () => {
  const ordered = parseOfficialHolidayCalendar(csvFor(VALID_HOLIDAYS), 2027);
  const reversed = parseOfficialHolidayCalendar(csvFor([...VALID_HOLIDAYS].reverse()), 2027);

  assert.equal(officialCalendarFingerprint(ordered), officialCalendarFingerprint(reversed));
  assert.match(officialCalendarFingerprint(ordered), /^[a-f0-9]{64}$/);
});

test("rechaza un calendario incompleto de 13 festivos", () => {
  assert.throws(() => parseOfficialHolidayCalendar(csvFor(VALID_HOLIDAYS.slice(0, 13)), 2027));
});

test("rechaza fechas duplicadas aunque haya 14 filas", () => {
  const duplicateDate = [...VALID_HOLIDAYS.slice(0, 13), VALID_HOLIDAYS[0]];

  assert.throws(() => parseOfficialHolidayCalendar(csvFor(duplicateDate), 2027));
});

test("rechaza un calendario que corresponde a otro año", () => {
  const wrongYear = VALID_HOLIDAYS.map(([date, type, name]) => [date.replace("/2027", "/2028"), type, name] as const);

  assert.throws(() => parseOfficialHolidayCalendar(csvFor(wrongYear), 2027));
});

test("rechaza un tipo de festivo desconocido en vez de ignorarlo", () => {
  const unknownScope = VALID_HOLIDAYS.map((row, index) => index === 2
    ? [row[0], "Festivo provincial desconocido", row[2]] as const
    : row);

  assert.throws(() => parseOfficialHolidayCalendar(csvFor(unknownScope), 2027));
});
