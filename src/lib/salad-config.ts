export type SaladOption = {
  label: string;
  price?: number;
};

export const MEDIUM_SALAD_SIZE_LABEL = "Tamaño Mediano 1000ML";
export const LARGE_SALAD_SIZE_LABEL = "Tamaño Grande 1500ML";
export const SMALL_SALAD_SIZE_LABEL = "Tamaño Pequeño 750ML";
export const CUSTOM_SALAD_CHOICE_LABEL = "ENSALADA A TU MANERA (diseña tu ensalada con tus ingredientes favoritos)";

export const SALAD_SIZE_OPTIONS: SaladOption[] = [
  { label: MEDIUM_SALAD_SIZE_LABEL },
  { label: LARGE_SALAD_SIZE_LABEL, price: 2 }
];

export const SALAD_BASE_OPTIONS: SaladOption[] = [
  { label: "Arroz blanco" },
  { label: "Arroz integral" },
  { label: "Mézclum" },
  { label: "Espinaca" },
  { label: "Pasta" },
  { label: "Quinoa" }
];

export const SALAD_PROTEIN_OPTIONS: SaladOption[] = [
  { label: "Atún" },
  { label: "Falafel vegetal de garbanzo y quinoa" },
  { label: "Lomo Asado" },
  { label: "Pollo" },
  { label: "Salmón ahumado", price: 2.5 }
];

export const SALAD_TOPPING_OPTIONS: SaladOption[] = [
  { label: "Aceituna negra" },
  { label: "Cebolla andaluza" },
  { label: "Garbanzos" },
  { label: "Huevo" },
  { label: "Jamón York" },
  { label: "Maíz" },
  { label: "Mix Frutos Secos" },
  { label: "Pepino" },
  { label: "Pimiento" },
  { label: "Queso fresco" },
  { label: "Tomate" },
  { label: "Zanahoria" }
];

export const SALAD_DRESSING_OPTIONS: SaladOption[] = [
  { label: "Mahonesa de soja" },
  { label: "Sal y Vinagre (sobres individuales)" },
  { label: "Salsa Matica con mostaza y miel" },
  { label: "Vinagreta balsámica" },
  { label: "Vinagreta de queso Parmesano" }
];

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/([a-z])\1+/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export function isCustomSaladChoice(value: string) {
  const normalized = normalize(value);

  // Legacy menus contain free text, including ENSALDA and repeated letters.
  // Match the configurable recipe, never every dish containing "ensalada".
  return /\b(?:ensalada|ensalda) a tu manera\b|\bdisena tu ensalada\b/.test(normalized);
}

export function normalizeMenuSaladChoice(value: string) {
  return isCustomSaladChoice(value) ? CUSTOM_SALAD_CHOICE_LABEL : value.trim();
}

function selectedValues(value?: string) {
  return (value ?? "")
    .split(",")
    .map((option) => option.trim())
    .filter(Boolean);
}

function validSelection(value: string | undefined, options: SaladOption[], min: number, max: number) {
  const selected = selectedValues(value);
  const allowed = new Set(options.map((option) => option.label));

  return selected.length >= min && selected.length <= max && selected.every((option) => allowed.has(option));
}

export function expectedSaladUnitPrice(
  basePrice: number,
  metadata: Record<string, string>,
  requiredSize?: string
) {
  if (requiredSize) {
    if (metadata.salad_size?.trim() !== requiredSize) {
      return null;
    }
  } else if (!validSelection(metadata.salad_size, SALAD_SIZE_OPTIONS, 1, 1)) {
    return null;
  }

  if (!validSelection(metadata.salad_base, SALAD_BASE_OPTIONS, 1, 2)) {
    return null;
  }

  if (!validSelection(metadata.protein, SALAD_PROTEIN_OPTIONS, 1, 1)) {
    return null;
  }

  if (!validSelection(metadata.toppings, SALAD_TOPPING_OPTIONS, 1, 3)) {
    return null;
  }

  if (!validSelection(metadata.dressing, SALAD_DRESSING_OPTIONS, 1, 1)) {
    return null;
  }

  const size = SALAD_SIZE_OPTIONS.find((option) => option.label === metadata.salad_size.trim());
  const protein = SALAD_PROTEIN_OPTIONS.find((option) => option.label === metadata.protein.trim());

  return Number((basePrice + Number(size?.price ?? 0) + Number(protein?.price ?? 0)).toFixed(2));
}
