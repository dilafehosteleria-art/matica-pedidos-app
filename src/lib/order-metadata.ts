export type OrderMetadataEntry = {
  key: string;
  label: string;
  value: string;
  values: string[];
};

const LABELS: Record<string, string> = {
  categoria: "Categoría",
  first_course: "Primer plato",
  second_course: "Segundo plato",
  side: "Guarnición",
  sides: "Guarniciones",
  drink_or_dessert: "Bebida o postre",
  plate: "Plato único",
  salad_size: "Tamaño ensalada",
  salad_base: "Base ensalada",
  protein: "Proteína",
  toppings: "Toppings",
  dressing: "Aliño",
  sandwich: "Bocadillo",
  filling: "Relleno/base",
  sauce: "Salsa",
  wrap_base: "Base",
  wrap_protein: "Proteína",
  wrap_toppings: "Toppings",
  wrap_sauces: "Salsas",
  main_protein: "Proteína principal",
  drink: "Bebida",
  dessert: "Postre",
  bread: "Pan",
  suplementos: "Suplementos"
};

const MULTI_VALUE_KEYS = new Set([
  "salad_base",
  "toppings",
  "wrap_base",
  "wrap_toppings",
  "wrap_sauces",
  "sides",
  "suplementos"
]);

const DESSERT_SELECTIONS = new Set([
  "cookie",
  "flan",
  "flan de queso",
  "gelatina",
  "manzana",
  "natillas",
  "platano",
  "yogur de frutas"
]);

function hasValue(metadata: Record<string, string>, key: string) {
  return Boolean(metadata[key]?.trim());
}

function fallbackLabel(key: string) {
  return key.replaceAll("_", " ").replace(/^\w/, (letter) => letter.toUpperCase());
}

function normalizeSelection(value: string) {
  return value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function splitSelectionValues(key: string, value: string) {
  const normalized = value.trim();

  if (!normalized) {
    return [];
  }

  if (MULTI_VALUE_KEYS.has(key)) {
    return normalized
      .split(/\s*,\s*|\r?\n/)
      .map((part) => part.trim())
      .filter(Boolean);
  }

  return normalized
    .split(/\r?\n/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function entryLabel(key: string, value: string, label = LABELS[key]) {
  if (key === "drink_or_dessert") {
    return DESSERT_SELECTIONS.has(normalizeSelection(value)) ? "Postre" : "Bebida";
  }

  if (key === "wrap_sauces") {
    return splitSelectionValues(key, value).length === 1 ? "Salsa" : "Salsas";
  }

  return label ?? fallbackLabel(key);
}

function appendEntry(
  entries: OrderMetadataEntry[],
  metadata: Record<string, string>,
  key: string,
  label = LABELS[key]
) {
  const rawValue = metadata[key]?.trim() ?? "";
  const values = splitSelectionValues(key, rawValue);

  if (rawValue && values.length) {
    entries.push({
      key,
      label: entryLabel(key, rawValue, label),
      value: values.join("\n"),
      values
    });
  }
}

export function visibleMetadataEntries(metadata?: Record<string, string> | null): OrderMetadataEntry[] {
  if (!metadata) {
    return [];
  }

  return Object.entries(metadata)
    .filter(([key, value]) => Boolean(value) && !key.startsWith("_") && key !== "display_name")
    .map(([key, value]) => {
      const values = splitSelectionValues(key, value);

      return {
        key,
        label: entryLabel(key, value, LABELS[key]),
        value: values.join("\n"),
        values
      };
    });
}

export function buildOrderItemOptionLines(metadata?: Record<string, string> | null): OrderMetadataEntry[] {
  if (!metadata) {
    return [];
  }

  const entries: OrderMetadataEntry[] = [];
  const usedKeys = new Set<string>(["bread", "categoria", "display_name"]);
  const side = metadata.side?.trim();

  if (hasValue(metadata, "first_course")) {
    appendEntry(entries, metadata, "first_course", "Primero");
    usedKeys.add("first_course");
  }

  if (hasValue(metadata, "second_course")) {
    appendEntry(entries, metadata, "second_course", "Segundo");
    usedKeys.add("second_course");

    if (side) {
      appendEntry(entries, metadata, "side", "Guarnición");
      usedKeys.add("side");
    }
  }

  if (hasValue(metadata, "plate")) {
    appendEntry(entries, metadata, "plate", "Plato");
    usedKeys.add("plate");

    if (side) {
      appendEntry(entries, metadata, "side", "Acompañamiento");
      usedKeys.add("side");
    }
  }

  const orderedKeys: Array<[string, string]> = [
    ["salad_size", "Tamaño"],
    ["salad_base", "Bases"],
    ["filling", "Base"],
    ["wrap_base", "Base"],
    ["protein", "Proteína"],
    ["wrap_protein", "Proteína"],
    ["toppings", "Toppings"],
    ["wrap_toppings", "Ingredientes"],
    ["wrap_sauces", "Salsas"],
    ["dressing", "Salsa"],
    ["main_protein", "Proteína principal"],
    ["sides", "Guarniciones"],
    ["sauce", "Salsa"],
    ["drink_or_dessert", "Bebida"],
    ["drink", "Bebida"],
    ["dessert", "Postre"],
    ["sandwich", "Bocadillo"]
  ];

  for (const [key, label] of orderedKeys) {
    if (hasValue(metadata, key)) {
      appendEntry(entries, metadata, key, label);
      usedKeys.add(key);
    }
  }

  for (const entry of visibleMetadataEntries(metadata)) {
    if (!usedKeys.has(entry.key)) {
      entries.push(entry);
      usedKeys.add(entry.key);
    }
  }

  if (hasValue(metadata, "bread")) {
    appendEntry(entries, metadata, "bread", "Pan");
  }

  return entries;
}

export function formatOrderMetadataForReport(metadata?: Record<string, string> | null) {
  return visibleMetadataEntries(metadata)
    .map((entry) => `${entry.key}: ${entry.value}`)
    .join(" | ");
}
