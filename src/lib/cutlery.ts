export const CUTLERY_METADATA_KEY = "cutlery";
export const CUTLERY_PRICE = 0.2;
export const CUTLERY_SELECTED_LABEL = "Si (+0,20 €)";

export function hasCutlery(metadata?: Record<string, string> | null) {
  const value = metadata?.[CUTLERY_METADATA_KEY]
    ?.trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  return value?.startsWith("si") ?? false;
}

export function cutlerySupplement(metadata?: Record<string, string> | null) {
  return hasCutlery(metadata) ? CUTLERY_PRICE : 0;
}
