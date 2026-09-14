export const LEMON_TEA_LABEL = "Nestea de limón";

// Keep open carts and previously saved menus compatible with the replaced drink.
export function normalizeDrinkChoice(value: string) {
  const normalized = value.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ");
  return /^(lipton|nestea)( (de )?limon)?$/.test(normalized) ? LEMON_TEA_LABEL : value.trim();
}
