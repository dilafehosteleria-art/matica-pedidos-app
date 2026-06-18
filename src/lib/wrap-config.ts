export type WrapOption = {
  label: string;
  price?: number;
};

export const WRAP_BASE_OPTIONS: WrapOption[] = [
  { label: "Arroz blanco" },
  { label: "Arroz integral" },
  { label: "Mézclum" },
  { label: "Espinaca" },
  { label: "Quinoa" }
];

export const WRAP_PROTEIN_OPTIONS: WrapOption[] = [
  { label: "Atún" },
  { label: "Falafel vegetal de garbanzos y quinoa" },
  { label: "Lomo asado" },
  { label: "Pollo" },
  { label: "Salmón ahumado", price: 2 }
];

export const WRAP_TOPPING_OPTIONS: WrapOption[] = [
  { label: "Aceituna negra" },
  { label: "Cebolla andaluza" },
  { label: "Garbanzos" },
  { label: "Huevo" },
  { label: "Jamón York" },
  { label: "Maíz" },
  { label: "Frutas secas variadas" },
  { label: "Pepino" },
  { label: "Pimiento" },
  { label: "Queso fresco" },
  { label: "Tomate" },
  { label: "Zanahoria" }
];

export const WRAP_SAUCE_OPTIONS: WrapOption[] = [
  { label: "Mahonesa de soja" },
  { label: "Salsa de yogur" },
  { label: "Salsa Matica con mostaza y miel" },
  { label: "Vinagre balsámico" },
  { label: "Vinagreta de queso parmesano" }
];

function selectedValues(value?: string) {
  return (value ?? "")
    .split(",")
    .map((option) => option.trim())
    .filter(Boolean);
}

function validSelection(value: string | undefined, options: WrapOption[], min: number, max: number) {
  const selected = selectedValues(value);
  const allowed = new Set(options.map((option) => option.label));

  return selected.length >= min && selected.length <= max && selected.every((option) => allowed.has(option));
}

export function expectedCustomWrapUnitPrice(basePrice: number, metadata: Record<string, string>) {
  if (!validSelection(metadata.wrap_base, WRAP_BASE_OPTIONS, 1, 2)) {
    return null;
  }

  if (!validSelection(metadata.wrap_protein, WRAP_PROTEIN_OPTIONS, 1, 1)) {
    return null;
  }

  if (!validSelection(metadata.wrap_toppings, WRAP_TOPPING_OPTIONS, 1, 5)) {
    return null;
  }

  if (!validSelection(metadata.wrap_sauces, WRAP_SAUCE_OPTIONS, 0, 2)) {
    return null;
  }

  const protein = WRAP_PROTEIN_OPTIONS.find((option) => option.label === metadata.wrap_protein.trim());

  return Number((basePrice + Number(protein?.price ?? 0)).toFixed(2));
}
