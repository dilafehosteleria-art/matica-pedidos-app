export const euro = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR"
});

export function formatCurrency(value: number) {
  return euro.format(value);
}

export function formatTime(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;

  return new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

export function toDateInputValue(date = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

export function linesToArray(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function arrayToLines(value: string[] | null | undefined) {
  return (value ?? []).join("\n");
}
