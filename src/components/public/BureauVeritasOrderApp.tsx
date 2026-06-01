"use client";

import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  Clock,
  CreditCard,
  ImageIcon,
  Leaf,
  Loader2,
  Minus,
  Plus,
  ShoppingBag,
  Utensils,
  X
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  buildPublicCatalogSections,
  getCatalogDisplayName as getDisplayName,
  getProductImageUrl,
  isCustomSaladProduct,
  isCustomWrapProduct,
  isMenuSaladSandwichProduct,
  normalizeCatalogText as normalize,
  type PublicSection
} from "@/lib/catalog";
import { DELIVERY_WINDOW } from "@/lib/constants";
import { formatCurrency } from "@/lib/format";
import { calculateCartTotals, getSubsidyAmount } from "@/lib/pricing";
import type { CartItem, CompanyBranch, CustomerForm, DailyMenu, DailyMenuCourse, Product, PublicData } from "@/lib/types";

const STORAGE_KEY_PREFIX = "matica:customer";
const CUSTOMER_STORAGE_MAX_AGE_SECONDS = 60 * 60 * 24 * 180;

const EMPTY_CUSTOMER: CustomerForm = {
  name: "",
  email: "",
  phone: "",
  company_branch_id: ""
};

type SubmitState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

type PublicStep = "catalog" | "checkout" | "confirmation";

type Option = {
  label: string;
  price?: number;
  unitPrice?: number;
};

type ConfigGroup = {
  key: string;
  label: string;
  type: "single" | "multi" | "checkbox";
  min?: number;
  max?: number;
  options: Option[];
  dependsOn?: {
    key: string;
    values: string[];
  };
};

type ConfigSpec = {
  title: string;
  lead: string;
  included: string[];
  groups: ConfigGroup[];
  defaultMetadata?: Record<string, string>;
  notesPlaceholder?: string;
};

function customerCookieName(storageKey: string) {
  return storageKey.replace(/[^a-zA-Z0-9]/g, "_");
}

function normalizeStoredCustomer(value: unknown): CustomerForm {
  if (!value || typeof value !== "object") {
    return EMPTY_CUSTOMER;
  }

  const customer = value as Partial<CustomerForm>;

  return {
    name: typeof customer.name === "string" ? customer.name : "",
    email: typeof customer.email === "string" ? customer.email : "",
    phone: typeof customer.phone === "string" ? customer.phone : "",
    company_branch_id: typeof customer.company_branch_id === "string" ? customer.company_branch_id : ""
  };
}

function parseStoredCustomer(value: string | null) {
  if (!value) {
    return EMPTY_CUSTOMER;
  }

  try {
    return normalizeStoredCustomer(JSON.parse(value));
  } catch {
    return EMPTY_CUSTOMER;
  }
}

function readCustomerCookie(storageKey: string) {
  const cookieName = `${customerCookieName(storageKey)}=`;
  const cookie = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(cookieName));

  return cookie ? decodeURIComponent(cookie.slice(cookieName.length)) : null;
}

function writeCustomerCookie(storageKey: string, value: string) {
  document.cookie = `${customerCookieName(storageKey)}=${encodeURIComponent(value)}; max-age=${CUSTOMER_STORAGE_MAX_AGE_SECONDS}; path=/; samesite=lax`;
}

function readStoredCustomer(storageKey: string) {
  try {
    const stored = window.localStorage?.getItem(storageKey);

    if (stored) {
      return parseStoredCustomer(stored);
    }
  } catch {
    // Ignore storage failures and use the app cookie fallback below.
  }

  return parseStoredCustomer(readCustomerCookie(storageKey));
}

function writeStoredCustomer(storageKey: string, customer: CustomerForm) {
  const value = JSON.stringify(customer);

  try {
    if (window.localStorage) {
      window.localStorage.setItem(storageKey, value);
      return;
    }
  } catch {
    // Ignore storage failures and use the app cookie fallback below.
  }

  writeCustomerCookie(storageKey, value);
}

const SALAD_SIZE_OPTIONS: Option[] = [
  { label: "Tamaño Mediano 1000ML" },
  { label: "Tamaño Grande 1500ML", price: 2 }
];

const SMALL_SALAD_SIZE_LABEL = "Tamaño Pequeño 750ML";

const SALAD_BASE_OPTIONS: Option[] = [
  { label: "Arroz blanco" },
  { label: "Arroz integral" },
  { label: "Mézclum" },
  { label: "Espinaca" },
  { label: "Pasta" },
  { label: "Quinoa" }
];

const SALAD_PROTEIN_OPTIONS: Option[] = [
  { label: "Atún" },
  { label: "Falafel vegetal de garbanzo y quinoa" },
  { label: "Lomo Asado" },
  { label: "Pollo" },
  { label: "Salmón ahumado", price: 2.5 }
];

const SALAD_TOPPING_OPTIONS: Option[] = [
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

const DRESSING_OPTIONS: Option[] = [
  { label: "Mahonesa de soja" },
  { label: "Sal y Vinagre (sobres individuales)" },
  { label: "Salsa Matica con mostaza y miel" },
  { label: "Vinagreta balsámica" },
  { label: "Vinagreta de queso Parmesano" }
];

const WRAP_PROTEIN_OPTIONS: Option[] = [
  { label: "Pollo asado" },
  { label: "Atún" },
  { label: "Falafel" },
  { label: "Ternera grill" },
  { label: "Heura" }
];

const WRAP_FILLING_OPTIONS: Option[] = [
  { label: "Mezclum" },
  { label: "Arroz especiado" },
  { label: "Verduras grill" },
  { label: "Queso fundido" }
];

const WRAP_TOPPING_OPTIONS: Option[] = [
  { label: "Tomate" },
  { label: "Cebolla morada" },
  { label: "Maíz" },
  { label: "Jalapeños" },
  { label: "Aguacate" }
];

const WRAP_SAUCE_OPTIONS: Option[] = [
  { label: "Chipotle suave" },
  { label: "Yogur" },
  { label: "Mostaza y miel" },
  { label: "Sin salsa" }
];

const SANDWICH_OPTIONS: Option[] = [
  { label: "Pollo con queso de cabra y cebolla caramelizada" },
  { label: "Pollo con bacon, lechuga y cebolla plancha" },
  { label: "Bocadillo de jamón serrano" },
  { label: "Bocadillo de tortilla" },
  { label: "Bocadillo de lomo con queso" },
  { label: "Bocadillo de bacon con queso" },
  { label: "Bocadillo de atún y pimientos asados" }
];

const GRILL_PROTEIN_OPTIONS: Option[] = [
  { label: "Filete de ternera a la parrilla", price: 1.5 },
  { label: "Lomo de cerdo a la parrilla" },
  { label: "Pechuga de pollo marinada a la parrilla" },
  { label: "Salmón a la plancha", price: 2 }
];

const GRILL_SIDE_OPTIONS: Option[] = [
  { label: "Arroz jazmín" },
  { label: "Ensalada de tomate natural, cebolla y aceitunas negras" },
  { label: "Patata frita" },
  { label: "Verduras a la plancha" }
];

const DRINK_OPTIONS: Option[] = [
  { label: "Coca Cola", unitPrice: 2 },
  { label: "Coca Cola Zero", unitPrice: 2 },
  { label: "Lipton", unitPrice: 2 },
  { label: "Fanta Naranja", unitPrice: 2 },
  { label: "Agua mineral", unitPrice: 1.5 },
  { label: "Agua con gas", unitPrice: 1.5 }
];

const DESSERT_OPTIONS: Option[] = [
  { label: "Flan", unitPrice: 1 },
  { label: "Yogur de frutas", unitPrice: 1 },
  { label: "Natillas", unitPrice: 1 },
  { label: "Plátano", unitPrice: 1 },
  { label: "Manzana", unitPrice: 1 },
  { label: "Flan de queso", unitPrice: 1.2 },
  { label: "Cookie", unitPrice: 2 }
];

type MenuDishOption = Option & {
  category?: "vacuno";
  excludedFromHalfMenu?: boolean;
};

const FALLBACK_MENU_FIRST_COURSE_OPTIONS: MenuDishOption[] = [
  { label: "Ensalada arroz con queso fresco" },
  { label: "Lasaña de espinacas con champiñones y pimientos asados" },
  { label: "Pasta con gambas y tomate cherry" },
  { label: "Salmorejo cordobés" }
];

const FALLBACK_MENU_SECOND_COURSE_OPTIONS: MenuDishOption[] = [
  { label: "Filete de pescado en salsa de soja y jengibre" },
  { label: "Hamburguesa clásica con bacon y queso", category: "vacuno", excludedFromHalfMenu: true },
  { label: "Lomo asado a la brasa con mojo picón" },
  { label: "Pollo asado" }
];

const MENU_DRINK_OPTIONS: Option[] = [
  { label: "Agua mineral" },
  { label: "Agua con gas" },
  { label: "Coca Cola" },
  { label: "Coca Cola Zero" },
  { label: "Fanta Naranja" },
  { label: "Lipton Limón" }
];

const MENU_DESSERT_OPTIONS: Option[] = [
  { label: "Flan" },
  { label: "Gelatina" },
  { label: "Natillas" },
  { label: "Plátano" },
  { label: "Manzana" },
  { label: "Yogur de frutas" }
];

const MENU_DRINK_OR_DESSERT_OPTIONS: Option[] = [...MENU_DRINK_OPTIONS, ...MENU_DESSERT_OPTIONS];

const GRILL_DRINK_OR_DESSERT_OPTIONS = MENU_DRINK_OR_DESSERT_OPTIONS.filter(
  (option) => option.label !== "Coca Cola" && option.label !== "Coca Cola Zero"
);

const MENU_SIDE_OPTIONS: Option[] = [
  { label: "Arroz jazmín" },
  { label: "Ensalada" },
  { label: "Patatas fritas" },
  { label: "Verduritas asadas" }
];

const BREAD_OPTION: Option = { label: "Enviar pan" };

function formatMetadataKey(key: string) {
  const labels: Record<string, string> = {
    first_course: "Primero",
    second_course: "Segundo",
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
    main_protein: "Proteína principal",
    side: "Guarnición",
    sides: "Guarnición",
    drink: "Bebida",
    dessert: "Postre",
    bread: "Pan",
    display_name: "",
    _configured_unit_price: "",
    _supplement_total: ""
  };

  return labels[key] ?? key.replaceAll("_", " ").replace(/^\w/, (letter) => letter.toUpperCase());
}

function metadataLabel(metadata?: Record<string, string>) {
  if (!metadata) {
    return "";
  }

  return Object.entries(metadata)
    .filter(([key, value]) => Boolean(value) && !key.startsWith("_") && key !== "display_name")
    .map(([key, value]) => `${formatMetadataKey(key)}: ${value}`)
    .join(" · ");
}

function courseName(course: DailyMenuCourse) {
  return typeof course === "string" ? course.trim() : course.name.trim();
}

function courseCategory(course: DailyMenuCourse) {
  return typeof course === "string" ? "" : course.category?.trim() ?? "";
}

function isCourseExcludedFromHalfMenu(course: DailyMenuCourse) {
  return typeof course === "string" ? false : Boolean(course.excluded_from_half_menu);
}

function menuFirstCourseOptions(menu: DailyMenu | null): MenuDishOption[] {
  const options = (menu?.first_courses ?? [])
    .map((label) => label.trim())
    .filter(Boolean)
    .map((label) => ({ label }));

  return options.length === 4 ? options : FALLBACK_MENU_FIRST_COURSE_OPTIONS;
}

function menuSecondCourseOptions(menu: DailyMenu | null): MenuDishOption[] {
  const options = (menu?.second_courses ?? [])
    .map((course): MenuDishOption | null => {
      const label = courseName(course);

      return label
        ? {
            label,
            category: normalize(courseCategory(course)) === "vacuno" ? ("vacuno" as const) : undefined,
            excludedFromHalfMenu: isCourseExcludedFromHalfMenu(course)
          }
        : null;
    })
    .filter((option): option is MenuDishOption => Boolean(option));

  return options.length === 4 ? options : FALLBACK_MENU_SECOND_COURSE_OPTIONS;
}

function hasMenuChoices(product: Product, menu: DailyMenu | null) {
  if (product.product_type === "daily_menu") {
    return Boolean(menuFirstCourseOptions(menu).length && menuSecondCourseOptions(menu).length && menuDrinkOrDessertOptions(menu).length);
  }

  if (product.product_type === "half_menu") {
    return Boolean(menuPlateOptions(menu).length && menuDrinkOrDessertOptions(menu).length);
  }

  return true;
}

function menuDrinkOrDessertOptions(_menu: DailyMenu | null): Option[] {
  return MENU_DRINK_OR_DESSERT_OPTIONS;
}

function grillDrinkOrDessertOptions(_menu: DailyMenu | null) {
  return GRILL_DRINK_OR_DESSERT_OPTIONS;
}

function isVacunoDish(option: MenuDishOption) {
  const label = normalize(option.label);

  return (
    option.category === "vacuno" ||
    option.excludedFromHalfMenu ||
    label.includes("[vacuno]") ||
    label.includes("(vacuno)") ||
    label.includes("tipo: vacuno") ||
    label.includes("categoria: vacuno")
  );
}

function menuPlateOptions(menu: DailyMenu | null): Option[] {
  return [...menuFirstCourseOptions(menu), ...menuSecondCourseOptions(menu).filter((option) => !isVacunoDish(option))];
}

function halfMenuSecondCourseLabels(menu: DailyMenu | null) {
  return menuSecondCourseOptions(menu)
    .filter((option) => !isVacunoDish(option))
    .map((option) => option.label);
}

function exactMultiGroup(key: string, label: string, count: number, options: Option[]): ConfigGroup {
  return {
    key,
    label,
    type: "multi",
    min: count,
    max: count,
    options
  };
}

function buildCartItem(
  product: Product,
  choices: Record<string, string>,
  displayName: string,
  unitPrice = Number(product.base_price)
): CartItem {
  return {
    key: `${product.id}:${JSON.stringify(choices)}`,
    product_id: product.id,
    name: displayName,
    quantity: 1,
    base_price: unitPrice,
    customer_price: unitPrice,
    product_type: product.product_type,
    metadata: choices
  };
}

function getOptionPrice(spec: ConfigSpec, groupKey: string, optionLabel: string) {
  return spec.groups.find((group) => group.key === groupKey)?.options.find((option) => option.label === optionLabel)?.price ?? 0;
}

function getOptionUnitPrice(spec: ConfigSpec, groupKey: string, optionLabel: string) {
  return spec.groups.find((group) => group.key === groupKey)?.options.find((option) => option.label === optionLabel)?.unitPrice;
}

function getSaladGroups({
  includeSize = false,
  exactCounts = false,
  includeSandwich = false
}: {
  includeSize?: boolean;
  exactCounts?: boolean;
  includeSandwich?: boolean;
} = {}): ConfigGroup[] {
  return [
    ...(includeSize ? [{ key: "salad_size", label: "Tamaño", type: "single" as const, options: SALAD_SIZE_OPTIONS }] : []),
    { key: "salad_base", label: "Base", type: "multi", min: 1, max: 2, options: SALAD_BASE_OPTIONS },
    { key: "protein", label: "Proteína", type: "single", options: SALAD_PROTEIN_OPTIONS },
    { key: "toppings", label: "Toppings", type: "multi", min: exactCounts ? 3 : 1, max: 3, options: SALAD_TOPPING_OPTIONS },
    { key: "dressing", label: "Aliño", type: "single", options: DRESSING_OPTIONS },
    ...(includeSandwich ? [{ key: "sandwich", label: "Bocadillo", type: "single" as const, options: SANDWICH_OPTIONS }] : [])
  ];
}

function getConfigSpec(product: Product, section: PublicSection, menu: DailyMenu | null): ConfigSpec {
  if (product.product_type === "daily_menu") {
    return {
      title: "Menú del día",
      lead: "Primer plato, segundo plato, guarnición, bebida o postre y pan opcional.",
      included: ["Subvención -4,00 €"],
      groups: [
        { key: "first_course", label: "Primer plato", type: "single", options: menuFirstCourseOptions(menu) },
        { key: "second_course", label: "Segundo plato", type: "single", options: menuSecondCourseOptions(menu) },
        { key: "side", label: "Guarnición del segundo", type: "single", options: MENU_SIDE_OPTIONS },
        { key: "drink_or_dessert", label: "Bebida o postre", type: "single", options: menuDrinkOrDessertOptions(menu) },
        { key: "bread", label: "Pan", type: "checkbox", options: [BREAD_OPTION] }
      ]
    };
  }

  if (product.product_type === "half_menu") {
    const secondCourseLabels = halfMenuSecondCourseLabels(menu);

    return {
      title: "Medio menú",
      lead: "Plato único y bebida o postre. Pan opcional.",
      included: ["Subvención -3,50 €"],
      groups: [
        { key: "plate", label: "Plato único", type: "single", options: menuPlateOptions(menu) },
        {
          key: "side",
          label: "Guarnición",
          type: "single",
          options: MENU_SIDE_OPTIONS,
          dependsOn: { key: "plate", values: secondCourseLabels }
        },
        { key: "drink_or_dessert", label: "Bebida o postre", type: "single", options: menuDrinkOrDessertOptions(menu) },
        { key: "bread", label: "Pan", type: "checkbox", options: [BREAD_OPTION] }
      ]
    };
  }

  if (isMenuSaladSandwichProduct(product)) {
    return {
      title: "Menú ensalada pequeña + bocadillo",
      lead: "Configura la ensalada y elige un bocadillo.",
      included: [SMALL_SALAD_SIZE_LABEL],
      defaultMetadata: { salad_size: SMALL_SALAD_SIZE_LABEL },
      groups: getSaladGroups({ exactCounts: true, includeSandwich: true })
    };
  }

  if (isCustomSaladProduct(product)) {
    return {
      title: "Diseña tu ensalada",
      lead: "Elige una base, 3 toppings y una proteína. Termínala con la salsa que más te guste.",
      included: [],
      groups: getSaladGroups({ includeSize: true })
    };
  }

  if (isCustomWrapProduct(product)) {
    return {
      title: "Diseña tu wrap",
      lead:
        "Diseña tu wrap con tus ingredientes favoritos. Elige 2 bases, 1 proteína, 5 toppings y 2 salsas de tu preferencia.",
      included: [],
      groups: [
        { key: "protein", label: "Proteína", type: "single", options: WRAP_PROTEIN_OPTIONS },
        { key: "filling", label: "Relleno/base", type: "multi", min: 1, max: 2, options: WRAP_FILLING_OPTIONS },
        exactMultiGroup("toppings", "Toppings", 3, WRAP_TOPPING_OPTIONS),
        { key: "sauce", label: "Salsa", type: "single", options: WRAP_SAUCE_OPTIONS }
      ]
    };
  }

  if (section.kind === "grill") {
    return {
      title: "Platos combinados Matica",
      lead: "Escoge proteína, 1 huevo frito, 2 guarniciones, bebida o postre y pan.",
      included: ["1 huevo frito", "Pan incluido"],
      groups: [
        { key: "main_protein", label: "Proteína principal", type: "single", options: GRILL_PROTEIN_OPTIONS },
        exactMultiGroup("sides", "Guarnición", 2, GRILL_SIDE_OPTIONS),
        { key: "drink_or_dessert", label: "Bebida o postre", type: "single", options: grillDrinkOrDessertOptions(menu) }
      ]
    };
  }

  if (section.kind === "sandwiches") {
    return {
      title: "Escoge tu bocadillo",
      lead: "Selecciona un bocadillo.",
      included: [],
      groups: [{ key: "sandwich", label: "Bocadillos", type: "single", options: SANDWICH_OPTIONS }]
    };
  }

  if (section.kind === "drinks") {
    return {
      title: "Escoge tu bebida",
      lead: "Selecciona una bebida.",
      included: [],
      groups: [{ key: "drink", label: "Bebidas", type: "single", options: DRINK_OPTIONS }]
    };
  }

  if (section.kind === "desserts") {
    return {
      title: "Escoge tu postre",
      lead: "Selecciona un postre.",
      included: [],
      groups: [{ key: "dessert", label: "Postres", type: "single", options: DESSERT_OPTIONS }]
    };
  }

  return {
    title: getDisplayName(product, section.kind),
    lead: product.description ?? "Producto listo para añadir.",
    included: [],
    groups: []
  };
}

export function BureauVeritasOrderApp({ companySlug = "bureau-veritas" }: { companySlug?: string }) {
  const [data, setData] = useState<PublicData | null>(null);
  const [step, setStep] = useState<PublicStep>("catalog");
  const [customer, setCustomer] = useState<CustomerForm>(EMPTY_CUSTOMER);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [notes, setNotes] = useState("");
  const [configuring, setConfiguring] = useState<{ product: Product; section: PublicSection } | null>(null);
  const [subsidyAlreadyUsed, setSubsidyAlreadyUsed] = useState(false);
  const [submitState, setSubmitState] = useState<SubmitState>({ status: "idle" });
  const [customerLoaded, setCustomerLoaded] = useState(false);
  const [lastOrder, setLastOrder] = useState<{ id: string; total: number } | null>(null);
  const storageKey = `${STORAGE_KEY_PREFIX}:${companySlug}`;

  useEffect(() => {
    setCustomer(readStoredCustomer(storageKey));
    setCustomerLoaded(true);
  }, [storageKey]);

  useEffect(() => {
    fetch(`/api/public/companies/${companySlug}`)
      .then((response) => {
        if (!response.ok) {
          throw new Error("Empresa no encontrada.");
        }

        return response.json();
      })
      .then((payload: PublicData) => setData(payload))
      .catch(() => {
        setSubmitState({
          status: "error",
          message: "No se pudo cargar la carta. Revisa la conexión e intenta de nuevo."
        });
      });
  }, [companySlug]);

  useEffect(() => {
    if (customerLoaded) {
      writeStoredCustomer(storageKey, customer);
    }
  }, [customer, customerLoaded, storageKey]);

  useEffect(() => {
    const email = customer.email.trim().toLowerCase();

    if (!email.includes("@")) {
      setSubsidyAlreadyUsed(false);
      return;
    }

    const timer = window.setTimeout(() => {
      fetch(`/api/subsidy-status?companySlug=${encodeURIComponent(companySlug)}&email=${encodeURIComponent(email)}`)
        .then((response) => response.json())
        .then((payload: { used?: boolean }) => setSubsidyAlreadyUsed(Boolean(payload.used)))
        .catch(() => setSubsidyAlreadyUsed(false));
    }, 350);

    return () => window.clearTimeout(timer);
  }, [companySlug, customer.email]);

  const publicSections = useMemo<PublicSection[]>(
    () => (data ? buildPublicCatalogSections(data.categories, data.products) : []),
    [data]
  );

  const totals = useMemo(() => calculateCartTotals(cart, subsidyAlreadyUsed), [cart, subsidyAlreadyUsed]);
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const hasSubsidizedItem = cart.some((item) => getSubsidyAmount(item.product_type) > 0);
  const companyName = data?.company.name ?? "tu empresa";
  const deliveryWindow = data?.company.delivery_window ?? DELIVERY_WINDOW;
  const selectedBranch = data?.branches.find((branch) => branch.id === customer.company_branch_id) ?? null;
  const canConfirmOrder =
    Boolean(customer.name.trim()) &&
    Boolean(customer.email.trim()) &&
    Boolean(customer.phone.trim()) &&
    Boolean(selectedBranch) &&
    cart.length > 0;

  function updateCustomer(field: keyof CustomerForm, value: string) {
    setCustomer((current) => ({ ...current, [field]: value }));
  }

  function goToStep(nextStep: PublicStep) {
    setStep(nextStep);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function addProduct(product: Product, section: PublicSection, metadata: Record<string, string>, unitPrice: number) {
    const item = buildCartItem(product, metadata, getDisplayName(product, section.kind), unitPrice);

    setCart((current) => {
      const existing = current.find((cartItem) => cartItem.key === item.key);

      if (!existing) {
        return [...current, item];
      }

      return current.map((cartItem) =>
        cartItem.key === item.key ? { ...cartItem, quantity: cartItem.quantity + 1 } : cartItem
      );
    });
    setSubmitState({ status: "idle" });
  }

  function changeQuantity(key: string, delta: number) {
    setCart((current) =>
      current
        .map((item) => (item.key === key ? { ...item, quantity: item.quantity + delta } : item))
        .filter((item) => item.quantity > 0)
    );
  }

  async function submitOrder() {
    setSubmitState({ status: "idle" });

    if (!customer.name.trim() || !customer.email.trim() || !customer.phone.trim() || !selectedBranch) {
      setSubmitState({ status: "error", message: "Completa tus datos antes de confirmar." });
      return;
    }

    if (!cart.length) {
      setSubmitState({ status: "error", message: "Añade al menos un producto al carrito." });
      return;
    }

    setSubmitState({ status: "loading" });

    const response = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        company_slug: companySlug,
        customer,
        items: cart.map((item) => ({
          product_id: item.product_id,
          quantity: item.quantity,
          metadata: item.metadata ?? {}
        })),
        notes
      })
    });

    const payload = await response.json();

    if (!response.ok) {
      setSubmitState({ status: "error", message: payload.error ?? "No se pudo confirmar el pedido." });
      return;
    }

    setCart([]);
    setNotes("");
    setLastOrder({
      id: payload.order?.id ?? "",
      total: Number(payload.order?.total ?? totals.total)
    });
    setSubsidyAlreadyUsed(Boolean(payload.order?.prior_subsidy_used || payload.order?.subsidy_applied));
    setSubmitState({
      status: "success",
      message: `Pedido confirmado. Total: ${formatCurrency(Number(payload.order?.total ?? totals.total))}.`
    });
    goToStep("confirmation");
  }

  return (
    <main className="min-h-screen bg-matica-soft pb-28 text-matica-ink sm:pb-16">
      <header className="border-b border-matica-line bg-white">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-lg bg-matica-mint px-3 py-1 text-sm font-semibold text-matica-green">
              <Leaf className="h-4 w-4" />
              Matica Fresh Food
            </div>
            <h1 className="max-w-3xl text-2xl font-black tracking-normal sm:text-4xl">
              Carta Matica para {companyName}
            </h1>
            <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-matica-ink/65 sm:text-base">
              Elige por categorías y confirma el pedido en el checkout.
            </p>
          </div>
        </div>
      </header>

      {step === "catalog" ? (
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
          <section className="space-y-5">
          {data ? (
            <div className="sticky top-0 z-20 -mx-4 border-y border-matica-line bg-matica-soft/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6 lg:mx-0 lg:rounded-lg lg:border lg:bg-white lg:px-3">
              <div className="flex items-center gap-2">
                <nav className="min-w-0 flex-1 overflow-x-auto pb-1 sm:pb-0" aria-label="Categorías">
                  <div className="flex w-max gap-1.5 pr-3">
                    {publicSections.map((section) => (
                      <a
                        key={section.slug}
                        className="matica-focus rounded-full border border-matica-line bg-white px-3 py-2 text-xs font-black text-matica-ink transition hover:border-matica-green hover:text-matica-green sm:px-4 sm:text-sm"
                        href={`#${section.slug}`}
                      >
                        {section.tabLabel ?? section.title}
                      </a>
                    ))}
                  </div>
                </nav>
                <button
                  type="button"
                  className="matica-focus hidden h-10 shrink-0 items-center gap-1.5 rounded-full border border-matica-green bg-white px-2.5 text-xs font-black text-matica-green shadow-sm sm:flex sm:px-3"
                  onClick={() => goToStep("checkout")}
                  aria-label={`Ver carrito, ${cartCount} productos, total ${formatCurrency(totals.total)}`}
                >
                  <ShoppingBag className="h-4 w-4" />
                  <span>{cartCount}</span>
                  <span className="h-4 w-px bg-matica-line" aria-hidden="true" />
                  <span>{formatCurrency(totals.total)}</span>
                </button>
              </div>
            </div>
          ) : null}

          {!data ? (
            <div className="flex min-h-72 items-center justify-center rounded-lg border border-matica-line bg-white">
              <Loader2 className="h-7 w-7 animate-spin text-matica-green" />
            </div>
          ) : (
            <div className="space-y-10 sm:space-y-12">
              {publicSections.map((section, index) => (
                <section
                  key={section.slug}
                  id={section.slug}
                  className={`scroll-mt-24 space-y-4 sm:scroll-mt-28 sm:space-y-5 ${
                    index > 0 ? "border-t border-matica-line/70 pt-10 sm:pt-12" : ""
                  }`}
                >
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <h2 className="max-w-3xl text-[2rem] font-extrabold leading-[1.08] tracking-normal text-matica-ink sm:text-4xl">
                        {section.title}
                      </h2>
                      <p className="mt-2 max-w-2xl text-base font-semibold leading-6 text-matica-ink/58 sm:text-lg">
                        {section.description}
                      </p>
                    </div>
                  </div>
                  <div className="grid gap-2.5 sm:gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {section.products.map((product) => (
                      <ProductCard
                        key={`${section.slug}-${product.id}-${product.name}`}
                        product={product}
                        section={section}
                        menu={data.dailyMenu}
                        onOpen={() => setConfiguring({ product, section })}
                      />
                    ))}
                    {!section.products.length ? (
                      <div className="rounded-lg border border-dashed border-matica-line bg-white p-6 text-sm font-semibold text-matica-ink/50">
                        Sin productos disponibles ahora.
                      </div>
                    ) : null}
                  </div>
                </section>
              ))}
            </div>
          )}
          </section>

        </div>
      ) : null}

      {data && step === "catalog" ? (
        <button
          type="button"
          className="matica-focus fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-4 z-30 flex min-h-12 items-center gap-2 rounded-full border border-matica-green bg-white px-4 text-sm font-black text-matica-green shadow-soft sm:hidden"
          onClick={() => goToStep("checkout")}
          aria-label={`Ver carrito, ${cartCount} productos, total ${formatCurrency(totals.total)}`}
        >
          <ShoppingBag className="h-4 w-4" />
          <span>Cesta</span>
          <span className="h-4 w-px bg-matica-line" aria-hidden="true" />
          <span>{cartCount}</span>
          <span className="h-4 w-px bg-matica-line" aria-hidden="true" />
          <span>{formatCurrency(totals.total)}</span>
        </button>
      ) : null}

      {step === "checkout" ? (
        <CheckoutPanel
          branches={data?.branches ?? []}
          cart={cart}
          cartCount={cartCount}
          customer={customer}
          companyName={companyName}
          deliveryWindow={deliveryWindow}
          totals={totals}
          notes={notes}
          setNotes={setNotes}
          updateCustomer={updateCustomer}
          submitState={submitState}
          canConfirmOrder={canConfirmOrder}
          hasSubsidizedItem={hasSubsidizedItem}
          subsidyAlreadyUsed={subsidyAlreadyUsed}
          changeQuantity={changeQuantity}
          submitOrder={submitOrder}
          onBack={() => goToStep("catalog")}
        />
      ) : null}

      {step === "confirmation" ? (
        <ConfirmationPanel
          order={lastOrder}
          submitState={submitState}
          onBackToCatalog={() => goToStep("catalog")}
        />
      ) : null}

      {configuring ? (
        <ConfigModal
          key={`${configuring.product.id}:${getDisplayName(configuring.product, configuring.section.kind)}`}
          product={configuring.product}
          section={configuring.section}
          onClose={() => setConfiguring(null)}
          menu={data?.dailyMenu ?? null}
          subsidyAlreadyUsed={subsidyAlreadyUsed}
          onAdd={(metadata, unitPrice) => {
            addProduct(configuring.product, configuring.section, metadata, unitPrice);
            setConfiguring(null);
          }}
        />
      ) : null}
    </main>
  );
}

function InputField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required = false
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="space-y-1">
      <span className="text-sm font-bold text-matica-ink/70">{label}</span>
      <input
        className="matica-focus w-full rounded-lg border border-matica-line px-3 py-3"
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required={required}
      />
    </label>
  );
}

function ProductCard({
  product,
  section,
  menu,
  onOpen
}: {
  product: Product;
  section: PublicSection;
  menu: DailyMenu | null;
  onOpen: () => void;
}) {
  const canAdd = !product.sold_out && hasMenuChoices(product, menu);
  const subsidy = getSubsidyAmount(product.product_type);
  const displayName = getDisplayName(product, section.kind);
  const imageUrl = getProductImageUrl(product);
  const [imageFailed, setImageFailed] = useState(false);
  const pricePrefix = section.kind === "drinks" || section.kind === "desserts" ? "desde " : "";

  console.log({
    id: product.id,
    name: product.name,
    image_url: product.image_url
  });

  useEffect(() => {
    setImageFailed(false);
  }, [imageUrl]);

  return (
    <article className="flex min-h-[132px] overflow-hidden rounded-lg border border-matica-line bg-white shadow-sm sm:block sm:min-h-0">
      <div className="relative order-2 m-3 ml-0 h-28 w-28 shrink-0 overflow-hidden rounded-lg bg-matica-soft sm:m-0 sm:aspect-[16/10] sm:h-auto sm:w-auto sm:rounded-none">
        {imageUrl && !imageFailed ? (
          <img
            className="block h-full w-full object-cover object-center"
            src={imageUrl}
            alt={displayName}
            onLoad={(event) => {
              console.log({
                id: product.id,
                name: product.name,
                image_url: product.image_url,
                img_src: event.currentTarget.currentSrc || event.currentTarget.src
              });
            }}
            onError={(event) => {
              console.log({
                id: product.id,
                name: product.name,
                image_url: product.image_url,
                img_src: event.currentTarget.currentSrc || event.currentTarget.src,
                image_error: true
              });
              setImageFailed(true);
            }}
          />
        ) : (
          <div className="grid h-full place-items-center bg-gradient-to-br from-matica-mint via-white to-matica-soft text-matica-green">
            <div className="grid h-11 w-11 place-items-center rounded-full bg-white/80 shadow-sm">
              <ImageIcon className="h-5 w-5" />
            </div>
          </div>
        )}
        {product.sold_out ? (
          <span className="absolute left-3 top-3 rounded-lg bg-white px-3 py-1 text-xs font-black text-matica-ink/60">
            Agotado
          </span>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2 p-3 pr-2 sm:gap-3 sm:p-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
          <div className="min-w-0">
            <h3 className="text-[17px] font-black leading-5 sm:text-base">{displayName}</h3>
            {product.description ? (
              <p className="mt-0.5 line-clamp-2 text-xs font-semibold leading-4 text-matica-ink/60 sm:mt-1 sm:text-sm sm:leading-5">
                {product.description}
              </p>
            ) : null}
          </div>
          <div className="shrink-0 text-right">
            <p className="text-left text-base font-black sm:text-right">{pricePrefix}{formatCurrency(Number(product.customer_price))}</p>
            {subsidy > 0 ? (
              <p className="text-left text-xs font-bold text-matica-ink/45 line-through sm:text-right">
                {formatCurrency(Number(product.base_price))}
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-auto flex items-center justify-between gap-2 pt-0.5 sm:pt-1">
          {product.sold_out ? (
            <span className="rounded-lg bg-matica-ink/10 px-2 py-1.5 text-xs font-black text-matica-ink/60">Agotado</span>
          ) : subsidy > 0 ? (
            <span className="rounded-lg bg-matica-mint px-2 py-1.5 text-xs font-black text-matica-green">
              Subvención -{formatCurrency(subsidy)}
            </span>
          ) : (
            <span className="hidden items-center gap-1 text-xs font-bold text-matica-ink/50 sm:flex">
              <Clock className="h-3.5 w-3.5" />
              Configurar al pulsar
            </span>
          )}
          <button
            className="matica-focus ml-auto flex min-h-8 items-center gap-1.5 rounded-lg bg-matica-green px-2.5 py-1 text-xs font-black text-white disabled:cursor-not-allowed disabled:bg-matica-ink/30 sm:min-h-9 sm:px-3 sm:py-1.5 sm:text-sm"
            onClick={onOpen}
            disabled={!canAdd}
            type="button"
          >
            <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            Elegir
          </button>
        </div>
      </div>
    </article>
  );
}

function ConfigModal({
  product,
  section,
  menu,
  subsidyAlreadyUsed,
  onClose,
  onAdd
}: {
  product: Product;
  section: PublicSection;
  menu: DailyMenu | null;
  subsidyAlreadyUsed: boolean;
  onClose: () => void;
  onAdd: (metadata: Record<string, string>, unitPrice: number) => void;
}) {
  const spec = getConfigSpec(product, section, menu);
  const [stepIndex, setStepIndex] = useState(0);
  const [singleValues, setSingleValues] = useState<Record<string, string>>({});
  const [multiValues, setMultiValues] = useState<Record<string, string[]>>({});
  const activeGroups = spec.groups.filter((group) => isGroupActive(group));
  const currentGroup = activeGroups[stepIndex];

  useEffect(() => {
    if (stepIndex >= activeGroups.length) {
      setStepIndex(Math.max(activeGroups.length - 1, 0));
    }
  }, [activeGroups.length, stepIndex]);

  const configuredUnitPrice = activeGroups.reduce((price, group) => {
    const selected =
      group.type === "multi" ? multiValues[group.key] ?? [] : [singleValues[group.key]].filter(Boolean);
    const unitOverride = selected
      .map((value) => getOptionUnitPrice(spec, group.key, value))
      .find((value): value is number => typeof value === "number");

    if (typeof unitOverride === "number") {
      return unitOverride;
    }

    return price + selected.reduce((sum, value) => sum + getOptionPrice(spec, group.key, value), 0);
  }, Number(product.base_price));
  const subsidy = getSubsidyAmount(product.product_type);
  const customerUnitPrice = !subsidyAlreadyUsed && subsidy > 0 ? Math.max(configuredUnitPrice - subsidy, 0) : configuredUnitPrice;
  const canSubmitConfig = activeGroups.every((group) => isGroupComplete(group));
  const canGoNext = currentGroup ? isGroupComplete(currentGroup) && stepIndex < activeGroups.length - 1 : false;

  function isGroupActive(group: ConfigGroup) {
    if (!group.dependsOn) {
      return true;
    }

    return group.dependsOn.values.includes(singleValues[group.dependsOn.key]);
  }

  function isGroupComplete(group: ConfigGroup) {
    if (group.type === "checkbox") {
      return true;
    }

    if (group.type === "single") {
      return Boolean(singleValues[group.key]);
    }

    const selected = multiValues[group.key] ?? [];
    const selectedCount = selected.length;

    if (group.key === "salad_base") {
      return selectedCount >= 1 && selectedCount <= 2;
    }

    const min = group.min ?? 0;
    const max = group.max ?? Number.POSITIVE_INFINITY;

    return selectedCount >= min && selectedCount <= max;
  }

  function toggleMulti(group: ConfigGroup, optionLabel: string) {
    setMultiValues((current) => {
      const selected = current[group.key] ?? [];

      if (selected.includes(optionLabel)) {
        return { ...current, [group.key]: selected.filter((value) => value !== optionLabel) };
      }

      if (group.max && selected.length >= group.max) {
        return current;
      }

      const nextSelected = [...selected, optionLabel];

      if (group.max && nextSelected.length === group.max && stepIndex < activeGroups.length - 1) {
        window.setTimeout(() => setStepIndex((currentStep) => Math.min(currentStep + 1, activeGroups.length - 1)), 120);
      }

      return { ...current, [group.key]: nextSelected };
    });
  }

  function selectSingle(group: ConfigGroup, optionLabel: string) {
    setSingleValues((current) => ({ ...current, [group.key]: optionLabel }));

    if (stepIndex < activeGroups.length - 1) {
      window.setTimeout(() => setStepIndex((currentStep) => Math.min(currentStep + 1, activeGroups.length - 1)), 120);
    }
  }

  function toggleCheckbox(group: ConfigGroup, optionLabel: string) {
    setSingleValues((current) => ({
      ...current,
      [group.key]: current[group.key] === optionLabel ? "" : optionLabel
    }));
  }

  function submit() {
    if (!canSubmitConfig) {
      return;
    }

    const metadata: Record<string, string> = {
      display_name: getDisplayName(product, section.kind),
      categoria: section.title,
      ...(spec.defaultMetadata ?? {}),
      _configured_unit_price: configuredUnitPrice.toFixed(2),
      _supplement_total: Math.max(0, configuredUnitPrice - Number(product.base_price)).toFixed(2)
    };

    for (const group of activeGroups.filter((activeGroup) => activeGroup.type !== "multi")) {
      const value = singleValues[group.key];

      if (group.type === "checkbox" && group.key === "bread") {
        metadata[group.key] = value ? "Sí" : "No";
        continue;
      }

      if (!value) {
        continue;
      }

      metadata[group.key] = value;
    }

    for (const group of activeGroups.filter((activeGroup) => activeGroup.type === "multi")) {
      const value = multiValues[group.key] ?? [];
      metadata[group.key] = value.join(", ");
    }

    const supplements = activeGroups.flatMap((group) => {
      if (group.type !== "multi") {
        const value = singleValues[group.key];
        const price = getOptionPrice(spec, group.key, value);
        return price > 0 ? [`${value} +${formatCurrency(price)}`] : [];
      }

      return (multiValues[group.key] ?? []).flatMap((value) => {
        const price = getOptionPrice(spec, group.key, value);
        return price > 0 ? [`${value} +${formatCurrency(price)}`] : [];
      });
    });

    if (supplements.length) {
      metadata.suplementos = supplements.join(", ");
    }

    onAdd(metadata, configuredUnitPrice);
  }

  return (
    <div className="fixed inset-0 z-40 grid place-items-end bg-matica-ink/45 p-0 sm:place-items-center sm:p-4">
      <div className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-lg bg-white shadow-soft sm:max-w-2xl sm:rounded-lg">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-matica-line bg-white p-4">
          <div>
            <p className="text-sm font-black uppercase text-matica-green">{section.title}</p>
            <h3 className="text-2xl font-black">{spec.title}</h3>
            <p className="mt-1 text-sm font-semibold text-matica-ink/60">{spec.lead}</p>
          </div>
          <button
            className="matica-focus grid h-10 w-10 place-items-center rounded-lg border border-matica-line"
            onClick={onClose}
            aria-label="Cerrar configurador"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-5">
          {spec.included.length ? (
            <div className="mb-4 rounded-lg bg-matica-soft p-3">
              <p className="text-xs font-black uppercase text-matica-ink/45">Incluye</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {spec.included.map((item) => (
                  <span key={item} className="rounded-lg bg-white px-3 py-1 text-sm font-bold text-matica-ink/70">
                    {item}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {spec.groups.length ? (
            <div className="space-y-4">
              <div className="flex gap-1.5">
                {activeGroups.map((group, index) => (
                  <button
                    key={group.key}
                    type="button"
                    className={`h-1.5 flex-1 rounded-full ${index <= stepIndex ? "bg-matica-green" : "bg-matica-line"}`}
                    onClick={() => setStepIndex(index)}
                    aria-label={`Ir a ${group.label}`}
                  />
                ))}
              </div>

              {currentGroup ? (
                <fieldset className="space-y-3">
                  <legend>
                    <span className="block text-xs font-black uppercase text-matica-green">
                      Paso {stepIndex + 1} de {activeGroups.length}
                    </span>
                    <span className="mt-1 block text-2xl font-black">{currentGroup.label}</span>
                    {currentGroup.type === "multi" && (currentGroup.min || currentGroup.max) ? (
                      <span className="mt-1 block text-sm font-semibold text-matica-ink/55">
                        {currentGroup.min && currentGroup.max === currentGroup.min
                          ? `Escoge ${currentGroup.min}`
                          : currentGroup.min && currentGroup.max
                            ? `Escoge de ${currentGroup.min} a ${currentGroup.max}`
                            : currentGroup.max
                            ? `Escoge hasta ${currentGroup.max}`
                            : `Escoge al menos ${currentGroup.min}`}
                      </span>
                    ) : null}
                  </legend>

                  <div className="grid gap-2 sm:grid-cols-2">
                    {currentGroup.options.map((option) => {
                      const checked =
                        currentGroup.type === "multi"
                          ? (multiValues[currentGroup.key] ?? []).includes(option.label)
                          : singleValues[currentGroup.key] === option.label;

                      return (
                        <label
                          key={`${currentGroup.key}-${option.label}`}
                          className={`flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-3 text-sm font-bold ${
                            checked ? "border-matica-green bg-matica-mint text-matica-green" : "border-matica-line bg-white text-matica-ink"
                          }`}
                        >
                          <span>{option.label}</span>
                          {currentGroup.type !== "checkbox" || option.unitPrice || option.price ? (
                            <span className="text-xs font-black">
                              {option.unitPrice ? formatCurrency(option.unitPrice) : option.price ? `+${formatCurrency(option.price)}` : "incluido"}
                            </span>
                          ) : null}
                          <input
                            className="sr-only"
                            type={currentGroup.type === "single" ? "radio" : "checkbox"}
                            name={currentGroup.key}
                            checked={checked}
                            onChange={() =>
                              currentGroup.type === "single"
                                ? selectSingle(currentGroup, option.label)
                                : currentGroup.type === "checkbox"
                                  ? toggleCheckbox(currentGroup, option.label)
                                  : toggleMulti(currentGroup, option.label)
                            }
                          />
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              ) : (
                <div className="rounded-lg border border-matica-line bg-matica-soft p-4">
                  <p className="text-sm font-semibold text-matica-ink/65">{product.description ?? "Listo para añadir al carrito."}</p>
                </div>
              )}

              <div className="flex items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  className="matica-focus rounded-lg border border-matica-line bg-white px-4 py-2 text-sm font-black disabled:opacity-40"
                  disabled={stepIndex === 0}
                  onClick={() => setStepIndex((current) => Math.max(0, current - 1))}
                >
                  Atrás
                </button>
                <button
                  type="button"
                  className="matica-focus rounded-lg border border-matica-line bg-white px-4 py-2 text-sm font-black disabled:opacity-40"
                  disabled={!canGoNext}
                  onClick={() => setStepIndex((current) => Math.min(activeGroups.length - 1, current + 1))}
                >
                  Siguiente
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-matica-line bg-matica-soft p-4">
              <p className="text-sm font-semibold text-matica-ink/65">{product.description ?? "Listo para añadir al carrito."}</p>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-matica-line bg-white p-4">
          <div>
            <p className="text-xs font-black uppercase text-matica-ink/45">Total producto</p>
            <p className="text-xl font-black">{formatCurrency(customerUnitPrice)}</p>
            {!subsidyAlreadyUsed && subsidy > 0 ? (
              <p className="text-xs font-bold text-matica-green">Subvención -{formatCurrency(subsidy)}</p>
            ) : null}
          </div>
          <button
            className="matica-focus flex min-h-12 items-center gap-2 rounded-lg bg-matica-green px-5 font-black text-white disabled:cursor-not-allowed disabled:bg-matica-ink/30"
            onClick={submit}
            disabled={!canSubmitConfig}
            type="button"
          >
            <Plus className="h-5 w-5" />
            Añadir
          </button>
        </div>
      </div>
    </div>
  );
}

function CheckoutPanel({
  branches,
  cart,
  cartCount,
  customer,
  companyName,
  deliveryWindow,
  totals,
  notes,
  setNotes,
  updateCustomer,
  submitState,
  canConfirmOrder,
  hasSubsidizedItem,
  subsidyAlreadyUsed,
  changeQuantity,
  submitOrder,
  onBack
}: {
  branches: CompanyBranch[];
  cart: CartItem[];
  cartCount: number;
  customer: CustomerForm;
  companyName: string;
  deliveryWindow: string;
  totals: ReturnType<typeof calculateCartTotals>;
  notes: string;
  setNotes: (value: string) => void;
  updateCustomer: (field: keyof CustomerForm, value: string) => void;
  submitState: SubmitState;
  canConfirmOrder: boolean;
  hasSubsidizedItem: boolean;
  subsidyAlreadyUsed: boolean;
  changeQuantity: (key: string, delta: number) => void;
  submitOrder: () => void;
  onBack: () => void;
}) {
  return (
    <section id="checkout" className="mx-auto max-w-6xl px-4 py-5 sm:px-6 lg:px-8">
      <button
        type="button"
        className="matica-focus inline-flex min-h-11 items-center gap-2 rounded-lg border border-matica-line bg-white px-4 font-black text-matica-ink"
        onClick={onBack}
      >
        <ArrowLeft className="h-4 w-4" />
        Volver al catálogo
      </button>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <section className="rounded-lg border border-matica-line bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-black">Carrito</h2>
                <p className="text-sm font-semibold text-matica-ink/55">{cartCount} productos</p>
              </div>
              <div className="grid h-11 w-11 place-items-center rounded-lg bg-matica-mint text-matica-green">
                <ShoppingBag className="h-5 w-5" />
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {cart.length ? (
                cart.map((item) => (
                  <div key={item.key} className="border-b border-matica-line pb-3 last:border-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-black">{item.name}</p>
                        <p className="mt-1 text-xs font-semibold leading-5 text-matica-ink/55">{metadataLabel(item.metadata)}</p>
                      </div>
                      <p className="shrink-0 font-black">{formatCurrency(item.base_price * item.quantity)}</p>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <button
                          className="matica-focus grid h-10 w-10 place-items-center rounded-lg border border-matica-line bg-white"
                          onClick={() => changeQuantity(item.key, -1)}
                          aria-label={`Quitar ${item.name}`}
                          type="button"
                        >
                          <Minus className="h-4 w-4" />
                        </button>
                        <span className="w-8 text-center font-black">{item.quantity}</span>
                        <button
                          className="matica-focus grid h-10 w-10 place-items-center rounded-lg border border-matica-line bg-white"
                          onClick={() => changeQuantity(item.key, 1)}
                          aria-label={`Añadir ${item.name}`}
                          type="button"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                      {getSubsidyAmount(item.product_type) > 0 ? (
                        <span className="rounded-lg bg-matica-mint px-2 py-1 text-xs font-black text-matica-green">
                          Subvencionable
                        </span>
                      ) : null}
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-lg border border-dashed border-matica-line bg-matica-soft p-5 text-center">
                  <Utensils className="mx-auto h-6 w-6 text-matica-green" />
                  <p className="mt-2 text-sm font-bold text-matica-ink/60">Elige productos para preparar tu pedido.</p>
                </div>
              )}
            </div>

            <label className="mt-4 block space-y-1">
              <span className="text-sm font-bold text-matica-ink/70">Observaciones</span>
              <textarea
                className="matica-focus min-h-24 w-full rounded-lg border border-matica-line px-3 py-3"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Sin cebolla, alergias, detalles de entrega..."
              />
            </label>
          </section>

          <section className="rounded-lg border border-matica-line bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-lg bg-matica-mint text-matica-green">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-2xl font-black">Datos del cliente</h2>
                <p className="text-sm font-semibold text-matica-ink/55">Entrega {companyName}, {deliveryWindow}</p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="space-y-1 md:col-span-2">
                <span className="text-sm font-bold text-matica-ink/70">Empresa seleccionada</span>
                <input
                  className="w-full rounded-lg border border-matica-line bg-matica-soft px-3 py-3 font-bold text-matica-ink/70"
                  value={companyName}
                  disabled
                  readOnly
                />
              </label>
              <InputField label="Nombre" value={customer.name} onChange={(value) => updateCustomer("name", value)} placeholder="Nombre y apellidos" required />
              <InputField
                label="Email corporativo"
                value={customer.email}
                onChange={(value) => updateCustomer("email", value)}
                placeholder="nombre@bureauveritas.com"
                type="email"
                required
              />
              <InputField label="Teléfono" value={customer.phone} onChange={(value) => updateCustomer("phone", value)} placeholder="600 000 000" required />
              <label className="space-y-1">
                <span className="text-sm font-bold text-matica-ink/70">Empresa</span>
                <select
                  className="matica-focus w-full rounded-lg border border-matica-line bg-white px-3 py-3"
                  value={customer.company_branch_id}
                  onChange={(event) => updateCustomer("company_branch_id", event.target.value)}
                  required
                >
                  <option value="">Selecciona empresa</option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>
        </div>

        <aside className="h-fit rounded-lg border border-matica-line bg-white p-4 shadow-soft lg:sticky lg:top-5">
          <h2 className="text-xl font-black">Resumen</h2>
          <div className="mt-4 space-y-2 rounded-lg bg-matica-soft p-3">
            <div className="flex justify-between text-sm font-bold">
              <span>Subtotal</span>
              <span>{formatCurrency(totals.subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm font-bold text-matica-green">
              <span>Subvención {companyName}</span>
              <span>-{formatCurrency(totals.subsidyTotal)}</span>
            </div>
            <div className="flex justify-between border-t border-matica-line pt-2 text-lg font-black">
              <span>Total</span>
              <span>{formatCurrency(totals.total)}</span>
            </div>
          </div>

          <div className="mt-4 rounded-lg border border-matica-line bg-white p-3">
            <div className="flex items-center gap-2 text-sm font-black text-matica-ink">
              <CreditCard className="h-4 w-4 text-matica-green" />
              Pago online
            </div>
            <p className="mt-1 text-sm font-semibold text-matica-ink/60">
              Pago online próximamente. Durante el piloto, el pedido se confirma sin cobro online.
            </p>
          </div>

          {subsidyAlreadyUsed && hasSubsidizedItem ? (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-900">
              Este email ya ha usado la subvención hoy. Los menús se cobrarán a precio completo.
            </div>
          ) : null}

          {submitState.status === "error" ? (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">
              {submitState.message}
            </div>
          ) : null}

          <button
            className="matica-focus mt-4 flex min-h-14 w-full items-center justify-center gap-2 rounded-lg bg-matica-green px-4 py-3 text-base font-black text-white disabled:cursor-not-allowed disabled:bg-matica-ink/30"
            disabled={submitState.status === "loading" || !canConfirmOrder}
            onClick={submitOrder}
            type="button"
          >
            {submitState.status === "loading" ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
            Confirmar pedido
          </button>
        </aside>
      </div>
    </section>
  );
}

function ConfirmationPanel({
  order,
  submitState,
  onBackToCatalog
}: {
  order: { id: string; total: number } | null;
  submitState: SubmitState;
  onBackToCatalog: () => void;
}) {
  return (
    <section className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="rounded-lg border border-matica-line bg-white p-6 text-center shadow-soft">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-lg bg-matica-mint text-matica-green">
          <CheckCircle2 className="h-8 w-8" />
        </div>
        <h2 className="mt-4 text-3xl font-black">Pedido confirmado</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm font-semibold leading-6 text-matica-ink/65">
          {submitState.status === "success" ? submitState.message : "Hemos recibido tu pedido."}
        </p>
        {order?.id ? (
          <p className="mt-3 text-xs font-black uppercase text-matica-ink/45">Referencia {order.id.slice(0, 8)}</p>
        ) : null}
        {order ? <p className="mt-2 text-2xl font-black text-matica-green">{formatCurrency(order.total)}</p> : null}

        <div className="mt-5 rounded-lg border border-matica-line bg-matica-soft p-4 text-left">
          <div className="flex items-center gap-2 font-black">
            <CreditCard className="h-5 w-5 text-matica-green" />
            Pago futuro con Adyen
          </div>
          <p className="mt-1 text-sm font-semibold text-matica-ink/60">
            Pago online próximamente. Durante el piloto, el pedido se confirma sin cobro online.
          </p>
        </div>

        <button
          type="button"
          className="matica-focus mt-5 inline-flex min-h-12 items-center justify-center rounded-lg bg-matica-green px-5 font-black text-white"
          onClick={onBackToCatalog}
        >
          Volver al catálogo
        </button>
      </div>
    </section>
  );
}
