type SupabaseErrorLike = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

const MISSING_COLUMN_CODES = new Set(["42703", "PGRST204"]);

export function isMissingDatabaseColumn(
  error: SupabaseErrorLike | null | undefined,
  columns: readonly string[]
) {
  if (!error) {
    return false;
  }

  const text = [error.message, error.details, error.hint]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const namesMissingColumn = columns.some((column) => text.includes(column.toLowerCase()));

  if (!namesMissingColumn) {
    return false;
  }

  return (
    MISSING_COLUMN_CODES.has(error.code ?? "") ||
    text.includes("does not exist") ||
    text.includes("could not find") ||
    text.includes("schema cache") ||
    text.includes(" column")
  );
}
