export type OrderMetadataEntry = {
  key: string;
  label: string;
  value: string;
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

function hasValue(metadata: Record<string, string>, key: string) {
  return Boolean(metadata[key]?.trim());
}

function appendEntry(
  entries: OrderMetadataEntry[],
  metadata: Record<string, string>,
  key: string,
  label = LABELS[key]
) {
  const value = metadata[key]?.trim();

  if (value) {
    entries.push({
      key,
      label: label ?? key.replaceAll("_", " ").replace(/^\w/, (letter) => letter.toUpperCase()),
      value
    });
  }
}

export function visibleMetadataEntries(metadata?: Record<string, string> | null): OrderMetadataEntry[] {
  if (!metadata) {
    return [];
  }

  return Object.entries(metadata)
    .filter(([key, value]) => Boolean(value) && !key.startsWith("_") && key !== "display_name")
    .map(([key, value]) => ({
      key,
      label: LABELS[key] ?? key.replaceAll("_", " ").replace(/^\w/, (letter) => letter.toUpperCase()),
      value
    }));
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
    entries.push({
      key: "second_course",
      label: "Segundo",
      value: side ? `${metadata.second_course.trim()} · Guarnición: ${side}` : metadata.second_course.trim()
    });
    usedKeys.add("second_course");
    usedKeys.add("side");
  }

  if (hasValue(metadata, "plate")) {
    entries.push({
      key: "plate",
      label: "Plato único",
      value: side ? `${metadata.plate.trim()} · Guarnición: ${side}` : metadata.plate.trim()
    });
    usedKeys.add("plate");
    usedKeys.add("side");
  }

  const orderedKeys: Array<[string, string]> = [
    ["salad_size", "Tamaño"],
    ["salad_base", "Bases"],
    ["filling", "Base"],
    ["wrap_base", "Base"],
    ["toppings", "Toppings"],
    ["protein", "Proteína"],
    ["wrap_protein", "Proteína"],
    ["wrap_toppings", "Toppings"],
    ["main_protein", "Proteína principal"],
    ["sides", "Guarniciones"],
    ["sauce", "Salsa"],
    ["wrap_sauces", "Salsas"],
    ["dressing", "Aliño"],
    ["drink_or_dessert", "Bebida o postre"],
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
