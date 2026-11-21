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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { applyCartPriceUpdate } from "@/lib/cart-price-update";
import { employeeProductPrice } from "@/lib/product-prices";
import { DELIVERY_WINDOW } from "@/lib/constants";
import { LEMON_TEA_LABEL, normalizeDrinkChoice } from "@/lib/drink-options";
import { CUTLERY_METADATA_KEY, CUTLERY_PRICE, CUTLERY_SELECTED_LABEL, hasCutlery } from "@/lib/cutlery";
import { getDailyMenuCourses, getUnavailableMenuFields, isDailyMenuProduct, type MenuCourseField } from "@/lib/daily-menu-courses";
import { validateCompanyOrderEmail } from "@/lib/email-rules";
import { formatCurrency } from "@/lib/format";
import { activeConfigFlowGroups, displayConfigFlowStep, nextConfigFlowStepIndex } from "@/lib/config-flow";
import {
  buildLateLocalMenuMetadata,
  getLocalOrderState,
  hasLateLocalMenuConfiguration,
  isLocalFulfillmentType,
  isLocalOnlyDay,
  localOrderWindowLabel,
  type LocalOrderState
} from "@/lib/local-ordering";
import { buildLocalRequestedTimeOptions, timeToMinutes } from "@/lib/local-order-time";
import { calculateCartTotals, getSubsidyAmount } from "@/lib/pricing";
import {
  CUSTOM_SALAD_DESCRIPTION,
  isCustomSaladChoice,
  isValidSaladBaseSelection,
  saladBaseRequiresPair,
  MEDIUM_SALAD_SIZE_LABEL,
  SALAD_BASE_OPTIONS,
  SALAD_DRESSING_OPTIONS,
  SALAD_PROTEIN_OPTIONS,
  SALAD_SIZE_OPTIONS,
  SALAD_TOPPING_OPTIONS,
  SMALL_SALAD_SIZE_LABEL
} from "@/lib/salad-config";
import { deliveryWindowLabel, getOrderWindowState } from "@/lib/schedule";
import type {
  CartItem,
  CompanyBranch,
  CustomerForm,
  DailyMenu,
  FulfillmentType,
  PaymentMethod,
  Product,
  PublicData
} from "@/lib/types";
import {
  WRAP_BASE_OPTIONS,
  WRAP_PROTEIN_OPTIONS,
  WRAP_SAUCE_OPTIONS,
  WRAP_TOPPING_OPTIONS
} from "@/lib/wrap-config";

const STORAGE_KEY_PREFIX = "matica:customer";
const CUSTOMER_STORAGE_MAX_AGE_SECONDS = 60 * 60 * 24 * 180;
const EMPTY_LOCAL_ORDER_STATE: LocalOrderState = {
  open: false,
  afterGuaranteeCutoff: false,
  localDate: "",
  currentTime: "",
  openTime: "09:30",
  closeTime: "15:00",
  message: ""
};
function lateLocalNotice(cutoff: string) {
  return `A partir de las ${cutoff} puedes seguir reservando y pagando tu menú, pero los platos se eligen al llegar y están sujetos a disponibilidad.`;
}

const EMPTY_CUSTOMER: CustomerForm = {
  name: "",
  email: "",
  phone: "",
  company_branch_id: ""
};

function publicPaymentOptions(company: PublicData["company"] | null | undefined): PublicPaymentOption[] {
  const onlinePaymentsEnabled = Boolean(
    company?.online_payments_enabled ?? company?.stripe_payments_enabled
  );
  const onlinePaymentProvider =
    company?.online_payment_provider ?? (company?.stripe_payments_enabled ? "stripe" : null);
  const options: PublicPaymentOption[] = [];

  if (company?.allow_pay_on_delivery) {
    options.push({
      method: "pay_on_delivery",
      label: company.billing_type === "company" ? "Pago a cargo de la empresa" : "Pago a la entrega",
      description:
        company.billing_type === "company"
          ? `Este pedido será facturado a ${company.name}. No necesitas pagar online.`
          : "Confirmas ahora y pagas en el punto de entrega."
    });
  }

  if (onlinePaymentsEnabled && onlinePaymentProvider === "sumup" && company?.allow_card_payment) {
    options.push({
      method: "sumup_card",
      label: "Pago online con SumUp",
      description: "Completarás el pago con tarjeta a través de SumUp."
    });
  }

  if (onlinePaymentsEnabled && onlinePaymentProvider === "stripe" && company?.allow_card_payment) {
    options.push({
      method: "stripe_card",
      label: "Pago online Stripe",
      description: "Stripe Checkout mostrará tarjeta, Apple Pay, Google Pay y Bizum cuando estén disponibles."
    });
  }

  return options;
}

type SubmitState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "verifying"; message: string }
  | { status: "processing"; message: string }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

type PublicStep = "catalog" | "checkout" | "confirmation";
type RequestedTimeChoice = "now" | string;
type ProductConfiguration = { product: Product; section: PublicSection };
type MenuReview = { fields: MenuCourseField[]; replacement?: ProductConfiguration };

type PublicPaymentOption = {
  method: PaymentMethod;
  label: string;
  description: string;
};

type PaymentStatusPayload = {
  order?: {
    id?: string;
  };
  payment?: {
    status?: "pending" | "paid" | "failed" | "cancelled";
    provider?: "stripe" | "sumup" | null;
  };
  error?: string;
};

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
  instruction?: string;
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
  { label: "Coca Cola" },
  { label: "Coca Cola Zero" },
  { label: LEMON_TEA_LABEL },
  { label: "Fanta Naranja" },
  { label: "Agua mineral" },
  { label: "Agua con gas" }
];

const DESSERT_OPTIONS: Option[] = [
  { label: "Flan" },
  { label: "Yogur de frutas" },
  { label: "Natillas" },
  { label: "Plátano" },
  { label: "Manzana" },
  { label: "Flan de queso" },
  { label: "Cookie" }
];

type MenuDishOption = Option;

const MENU_DRINK_OPTIONS: Option[] = [
  { label: "Agua mineral" },
  { label: "Agua con gas" },
  { label: "Coca Cola" },
  { label: "Coca Cola Zero" },
  { label: "Fanta Naranja" },
  { label: LEMON_TEA_LABEL }
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
  { label: "Verduras a la plancha" }
];

const BREAD_CUTLERY_GROUP_KEY = "bread_cutlery";
const NO_BREAD_LABEL = "No enviar pan";
const NO_CUTLERY_LABEL = "Sin cubiertos";
const BREAD_OPTION: Option = { label: "Enviar pan" };
const CUTLERY_OPTION: Option = { label: "Incluir cubiertos", price: CUTLERY_PRICE };

function breadCutleryGroup(): ConfigGroup {
  return {
    key: BREAD_CUTLERY_GROUP_KEY,
    label: "Pan y cubiertos",
    type: "checkbox",
    options: [BREAD_OPTION, CUTLERY_OPTION]
  };
}

function cutleryGroup(): ConfigGroup {
  return {
    key: CUTLERY_METADATA_KEY,
    label: `Cubiertos (suplemento ${formatCurrency(CUTLERY_PRICE)})`,
    type: "checkbox",
    options: [CUTLERY_OPTION]
  };
}

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
    wrap_base: "Base",
    wrap_protein: "Proteína",
    wrap_toppings: "Toppings",
    wrap_sauces: "Salsas",
    main_protein: "Proteína principal",
    side: "Guarnición",
    sides: "Guarnición",
    drink: "Bebida",
    dessert: "Postre",
    bread: "Pan",
    cutlery: "Cubiertos",
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

function menuFirstCourseOptions(menu: DailyMenu | null): MenuDishOption[] {
  return getDailyMenuCourses(menu).first.map((label) => ({ label }));
}

function menuSecondCourseOptions(menu: DailyMenu | null): MenuDishOption[] {
  return getDailyMenuCourses(menu).second.map((label) => ({ label }));
}

function hasMenuChoices(product: Product, menu: DailyMenu | null) {
  if (!isDailyMenuProduct(product.product_type)) {
    return true;
  }

  const { first, second } = getDailyMenuCourses(menu);
  if (product.product_type === "daily_menu") {
    return first.length > 0 && second.length > 0;
  }

  return first.length + second.length > 0;
}

function menuDrinkOrDessertOptions(_menu: DailyMenu | null): Option[] {
  return MENU_DRINK_OR_DESSERT_OPTIONS;
}

function grillDrinkOrDessertOptions(_menu: DailyMenu | null) {
  return GRILL_DRINK_OR_DESSERT_OPTIONS;
}

function menuPlateOptions(menu: DailyMenu | null): Option[] {
  const { first, second } = getDailyMenuCourses(menu);
  return [...first, ...second].map((label) => ({ label }));
}

function halfMenuSecondCourseLabels(menu: DailyMenu | null) {
  return menuSecondCourseOptions(menu).map((option) => option.label);
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

function getSaladGroups({
  includeSize = false,
  exactCounts = false,
  includeSandwich = false,
  dependsOn
}: {
  includeSize?: boolean;
  exactCounts?: boolean;
  includeSandwich?: boolean;
  dependsOn?: ConfigGroup["dependsOn"];
} = {}): ConfigGroup[] {
  return [
    ...(includeSize ? [{ key: "salad_size", label: "Tamaño", type: "single" as const, options: SALAD_SIZE_OPTIONS, dependsOn }] : []),
    { key: "salad_base", label: "Bases", type: "multi", min: 1, max: 2, options: SALAD_BASE_OPTIONS, dependsOn },
    { key: "protein", label: "Proteína", type: "single", options: SALAD_PROTEIN_OPTIONS, dependsOn },
    { key: "toppings", label: "Toppings", type: "multi", min: exactCounts ? 3 : 1, max: 3, options: SALAD_TOPPING_OPTIONS, dependsOn },
    { key: "dressing", label: "Salsa", type: "single", options: SALAD_DRESSING_OPTIONS, dependsOn },
    ...(includeSandwich ? [{ key: "sandwich", label: "Bocadillo", type: "single" as const, options: SANDWICH_OPTIONS, dependsOn }] : [])
  ];
}

function catalogOptions(options: Option[], type: "drink" | "dessert", products: Product[]): Option[] {
  const normalizeChoice = (value: string) => normalize(type === "drink" ? normalizeDrinkChoice(value) : value);
  return options.flatMap((option) => {
    const selected = products.find((item) => item.product_type === type && normalizeChoice(item.name) === normalizeChoice(option.label) && item.active && !item.sold_out);
    return selected ? [{ ...option, unitPrice: Number(selected.base_price) }] : [];
  });
}

function getConfigSpec(
  product: Product,
  section: PublicSection,
  menu: DailyMenu | null,
  company?: PublicData["company"] | null,
  products: Product[] = []
): ConfigSpec {
  if (product.product_type === "daily_menu") {
    const saladFirstCourses = menuFirstCourseOptions(menu)
      .filter((option) => isCustomSaladChoice(option.label))
      .map((option) => option.label);
    const subsidy = getSubsidyAmount(product.product_type, company);

    return {
      title: "Menú del día",
      lead: "Primer plato, segundo plato, guarnición, bebida o postre y pan opcional.",
      included: [
        ...(subsidy > 0 ? [`Subvención -${formatCurrency(subsidy)}`] : []),
        ...(saladFirstCourses.length ? [SMALL_SALAD_SIZE_LABEL] : [])
      ],
      groups: [
        { key: "first_course", label: "Primer plato", type: "single", options: menuFirstCourseOptions(menu) },
        ...getSaladGroups({ dependsOn: { key: "first_course", values: saladFirstCourses } }),
        { key: "second_course", label: "Segundo plato", type: "single", options: menuSecondCourseOptions(menu) },
        { key: "side", label: "Guarnición del segundo", type: "single", options: MENU_SIDE_OPTIONS },
        { key: "drink_or_dessert", label: "Bebida o postre", type: "single", options: menuDrinkOrDessertOptions(menu) },
        breadCutleryGroup()
      ]
    };
  }

  if (product.product_type === "half_menu") {
    const secondCourseLabels = halfMenuSecondCourseLabels(menu);
    const customSaladPlates = menuPlateOptions(menu)
      .filter((option) => isCustomSaladChoice(option.label))
      .map((option) => option.label);
    const subsidy = getSubsidyAmount(product.product_type, company);

    return {
      title: "Medio menú",
      lead: "Plato único y bebida o postre. Pan opcional.",
      included: [
        ...(subsidy > 0 ? [`Subvención -${formatCurrency(subsidy)}`] : []),
        ...(customSaladPlates.length ? [MEDIUM_SALAD_SIZE_LABEL] : [])
      ],
      groups: [
        { key: "plate", label: "Plato único", type: "single", options: menuPlateOptions(menu) },
        ...getSaladGroups({ dependsOn: { key: "plate", values: customSaladPlates } }),
        {
          key: "side",
          label: "Guarnición",
          type: "single",
          options: MENU_SIDE_OPTIONS,
          dependsOn: { key: "plate", values: secondCourseLabels }
        },
        { key: "drink_or_dessert", label: "Bebida o postre", type: "single", options: menuDrinkOrDessertOptions(menu) },
        breadCutleryGroup()
      ]
    };
  }

  if (isMenuSaladSandwichProduct(product)) {
    return {
      title: "Menú ensalada pequeña + bocadillo",
      lead: "Configura la ensalada y elige un bocadillo.",
      included: [SMALL_SALAD_SIZE_LABEL],
      defaultMetadata: { salad_size: SMALL_SALAD_SIZE_LABEL },
      groups: [...getSaladGroups({ exactCounts: true, includeSandwich: true }), cutleryGroup()]
    };
  }

  if (isCustomSaladProduct(product)) {
    return {
      title: "Diseña tu ensalada",
      lead: CUSTOM_SALAD_DESCRIPTION,
      included: [],
      groups: getSaladGroups({ includeSize: true })
    };
  }

  if (isCustomWrapProduct(product)) {
    return {
      title: "Diseña tu wrap",
      lead:
        "Diseña tu wrap con tus ingredientes favoritos.",
      included: [],
      groups: [
        {
          key: "wrap_base",
          label: "Base",
          type: "multi",
          min: 1,
          max: 2,
          instruction: "Escoge de 1 a 2",
          options: WRAP_BASE_OPTIONS
        },
        {
          key: "wrap_protein",
          label: "Proteína",
          type: "single",
          instruction: "Escoge 1",
          options: WRAP_PROTEIN_OPTIONS
        },
        {
          key: "wrap_toppings",
          label: "Toppings",
          type: "multi",
          min: 1,
          max: 5,
          instruction: "Escoge de 1 a 5",
          options: WRAP_TOPPING_OPTIONS
        },
        {
          key: "wrap_sauces",
          label: "Salsas",
          type: "multi",
          min: 0,
          max: 2,
          instruction: "Escoge 2 (opcional)",
          options: WRAP_SAUCE_OPTIONS
        }
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
      groups: [{ key: "drink", label: "Bebidas", type: "single", options: catalogOptions(DRINK_OPTIONS, "drink", products) }]
    };
  }

  if (section.kind === "desserts") {
    return {
      title: "Escoge tu postre",
      lead: "Selecciona un postre.",
      included: [],
      groups: [{ key: "dessert", label: "Postres", type: "single", options: catalogOptions(DESSERT_OPTIONS, "dessert", products) }]
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
  const [configuring, setConfiguring] = useState<(ProductConfiguration & { replaceItem?: CartItem; fields?: MenuCourseField[] }) | null>(null);
  const [subsidyAlreadyUsed, setSubsidyAlreadyUsed] = useState(false);
  const [submitState, setSubmitState] = useState<SubmitState>({ status: "idle" });
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("pay_on_delivery");
  const [fulfillmentType, setFulfillmentType] = useState<FulfillmentType>("delivery");
  const [requestedTimeChoice, setRequestedTimeChoice] = useState<RequestedTimeChoice>("now");
  const [lateAvailabilityAccepted, setLateAvailabilityAccepted] = useState(false);
  const [serverRequiresOnArrival, setServerRequiresOnArrival] = useState(false);
  const [customerLoaded, setCustomerLoaded] = useState(false);
  const [orderWindow, setOrderWindow] = useState({ open: false, message: "" });
  const [localOrderState, setLocalOrderState] = useState<LocalOrderState>(EMPTY_LOCAL_ORDER_STATE);
  const [localOnlyDay, setLocalOnlyDay] = useState(false);
  const [lastOrder, setLastOrder] = useState<{ id: string; total: number } | null>(null);
  const previousOrderWindow = useRef<boolean | null>(null);
  const menuRequest = useRef<AbortController | null>(null);
  const orderSubmitting = useRef(false);
  const storageKey = `${STORAGE_KEY_PREFIX}:${companySlug}`;
  const catalogLoaded = data !== null;
  const schedule = data?.schedule;
  const dailyMenu = data?.dailyMenu ?? null;

  const updateDailyMenu = useCallback((menu: DailyMenu | null) => {
    setData((current) => current ? { ...current, dailyMenu: menu } : current);
  }, []);

  const refreshDailyMenu = useCallback(async () => {
    if (menuRequest.current || orderSubmitting.current) {
      return;
    }

    const request = new AbortController();
    menuRequest.current = request;

    try {
      const response = await fetch("/api/public/daily-menu", { cache: "no-store", signal: request.signal });
      if (response.ok) {
        const { menu } = await response.json() as { menu: DailyMenu | null };
        if (!request.signal.aborted) updateDailyMenu(menu);
      }
    } catch {
      // Checkout will verify the current menu if this background refresh fails.
    } finally {
      if (menuRequest.current === request) menuRequest.current = null;
    }
  }, [updateDailyMenu]);

  const refreshPublicData = useCallback(async () => {
    const response = await fetch(`/api/public/companies/${companySlug}`, { cache: "no-store" });

    if (!response.ok) {
      throw new Error("Empresa no encontrada.");
    }

    const payload = await response.json() as PublicData;
    setData(payload);
  }, [companySlug]);

  useEffect(() => {
    setCustomer(readStoredCustomer(storageKey));
    setCustomerLoaded(true);
  }, [storageKey]);

  useEffect(() => {
    const refreshOrderWindow = () => {
      const now = new Date();
      const next = getOrderWindowState(now, schedule);
      setOrderWindow((current) => current.open === next.open && current.message === next.message ? current : next);

      if (data?.company) {
        const nextLocal = getLocalOrderState(now, data.company);
        setLocalOrderState((current) =>
          current.open === nextLocal.open &&
          current.afterGuaranteeCutoff === nextLocal.afterGuaranteeCutoff &&
          current.localDate === nextLocal.localDate &&
          current.currentTime === nextLocal.currentTime &&
          current.openTime === nextLocal.openTime &&
          current.closeTime === nextLocal.closeTime &&
          current.message === nextLocal.message
            ? current
            : nextLocal
        );
        setLocalOnlyDay(isLocalOnlyDay(now, data.company));
      } else {
        setLocalOrderState(EMPTY_LOCAL_ORDER_STATE);
        setLocalOnlyDay(false);
      }
    };

    refreshOrderWindow();
    const interval = window.setInterval(refreshOrderWindow, 30_000);

    return () => window.clearInterval(interval);
  }, [data?.company, schedule]);

  useEffect(() => {
    if (!catalogLoaded) return;
    const wasOpen = previousOrderWindow.current;
    previousOrderWindow.current = orderWindow.open;
    if (wasOpen === false && orderWindow.open) void refreshDailyMenu();
  }, [catalogLoaded, orderWindow.open, refreshDailyMenu]);

  useEffect(() => {
    if (!catalogLoaded) return;

    function refreshVisibleMenu() {
      if (document.visibilityState === "visible") void refreshDailyMenu();
    }

    function refreshRestoredMenu(event: PageTransitionEvent) {
      if (event.persisted) refreshVisibleMenu();
    }

    document.addEventListener("visibilitychange", refreshVisibleMenu);
    window.addEventListener("pageshow", refreshRestoredMenu);

    return () => {
      document.removeEventListener("visibilitychange", refreshVisibleMenu);
      window.removeEventListener("pageshow", refreshRestoredMenu);
      menuRequest.current?.abort();
      menuRequest.current = null;
    };
  }, [catalogLoaded, refreshDailyMenu]);

  useEffect(() => {
    setConfiguring((current) => current && hasMenuChoices(current.product, dailyMenu) ? current : null);
  }, [dailyMenu]);

  useEffect(() => {
    void refreshPublicData()
      .catch(() => {
        setSubmitState({
          status: "error",
          message: "No se pudo cargar la carta. Revisa la conexión e intenta de nuevo."
        });
      });
  }, [refreshPublicData]);

  useEffect(() => {
    const refreshOperationalSettings = () => {
      if (document.visibilityState === "visible") {
        void refreshPublicData().catch(() => { /* El servidor mantiene la última configuración válida. */ });
      }
    };
    const interval = window.setInterval(refreshOperationalSettings, 60_000);

    window.addEventListener("focus", refreshOperationalSettings);
    document.addEventListener("visibilitychange", refreshOperationalSettings);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshOperationalSettings);
      document.removeEventListener("visibilitychange", refreshOperationalSettings);
    };
  }, [refreshPublicData]);

  useEffect(() => {
    const url = new URL(window.location.href);
    const paymentReturn = url.searchParams.get("payment");
    const orderId = url.searchParams.get("order")?.trim() ?? "";

    if (!["processing", "success", "cancelled"].includes(paymentReturn ?? "")) {
      return;
    }

    const clearPaymentReturn = () => {
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete("payment");
      cleanUrl.searchParams.delete("order");
      window.history.replaceState(null, "", `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);
    };

    setCart([]);
    setNotes("");
    setConfiguring(null);
    setLastOrder(orderId ? { id: orderId, total: 0 } : null);
    setStep("confirmation");
    window.scrollTo({ top: 0 });

    if (paymentReturn === "cancelled") {
      setSubmitState({
        status: "error",
        message: "Pago cancelado. Tu pedido no se ha confirmado."
      });
      clearPaymentReturn();
      return;
    }

    if (!orderId) {
      setSubmitState({
        status: "error",
        message: "No hemos podido identificar el pedido para verificar el pago."
      });
      clearPaymentReturn();
      return;
    }

    const controller = new AbortController();
    let pollTimer: number | undefined;
    let pollAttempt = 0;
    const pollingStartedAt = Date.now();
    const maxPollingDurationMs = 2 * 60 * 1000;

    const scheduleNextCheck = () => {
      if (Date.now() - pollingStartedAt >= maxPollingDurationMs) {
        setSubmitState({
          status: "processing",
          message:
            "El pago sigue pendiente de confirmación. Puedes cerrar esta página; el pedido se confirmará automáticamente cuando responda el proveedor."
        });
        clearPaymentReturn();
        return;
      }

      const delay = Math.min(1_800 * 2 ** pollAttempt, 15_000);
      pollAttempt += 1;
      pollTimer = window.setTimeout(() => {
        void checkPaymentStatus();
      }, delay);
    };

    const checkPaymentStatus = async () => {
      setSubmitState({
        status: "verifying",
        message: "Estamos verificando el pago con el proveedor. No cierres esta página."
      });

      try {
        const response = await fetch(`/api/payments/status?order=${encodeURIComponent(orderId)}`, {
          cache: "no-store",
          signal: controller.signal
        });
        const payload = (await response.json().catch(() => ({}))) as PaymentStatusPayload;

        if (response.status === 404) {
          setSubmitState({
            status: "error",
            message: "No encontramos el pedido y no hemos podido confirmar el pago."
          });
          clearPaymentReturn();
          return;
        }

        if (!response.ok) {
          if (response.status >= 400 && response.status < 500) {
            setSubmitState({
              status: "error",
              message: payload.error ?? "No hemos podido verificar el pago de este pedido."
            });
            clearPaymentReturn();
            return;
          }

          throw new Error(payload.error ?? "No se pudo consultar el estado del pago.");
        }

        if (payload.payment?.status === "paid") {
          setLastOrder({ id: payload.order?.id ?? orderId, total: 0 });
          setSubmitState({
            status: "success",
            message: "Pago confirmado. Hemos recibido tu pedido correctamente."
          });
          clearPaymentReturn();
          return;
        }

        if (payload.payment?.status === "failed" || payload.payment?.status === "cancelled") {
          setSubmitState({
            status: "error",
            message:
              payload.payment.status === "cancelled"
                ? "Pago cancelado. Tu pedido no se ha confirmado."
                : "El pago ha fallado y el pedido no se ha confirmado."
          });
          clearPaymentReturn();
          return;
        }

        if (payload.payment?.status !== "pending") {
          throw new Error("El servidor ha devuelto un estado de pago no reconocido.");
        }

        setSubmitState({
          status: "verifying",
          message: "El pago sigue procesándose. Lo comprobaremos de nuevo automáticamente."
        });
        scheduleNextCheck();
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        console.warn("[payment-status] No se pudo verificar el pago todavía.", error);
        setSubmitState({
          status: "verifying",
          message: "Aún no podemos comprobar el pago. Seguimos reintentándolo automáticamente."
        });
        scheduleNextCheck();
      }
    };

    void checkPaymentStatus();

    return () => {
      controller.abort();

      if (pollTimer !== undefined) {
        window.clearTimeout(pollTimer);
      }
    };
  }, []);

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

  const categories = data?.categories;
  const products = data?.products;
  const localOrderingEnabled = data?.company.local_ordering_enabled === true;
  const localFulfillment = isLocalFulfillmentType(fulfillmentType);
  const deliveryAvailable = orderWindow.open && !(localOrderingEnabled && localOnlyDay);
  const deliveryAvailabilityMessage = localOrderingEnabled && localOnlyDay
    ? "Hoy no hay reparto para esta empresa. Puedes comer o recoger en el local."
    : orderWindow.message;
  const lateLocalMode = localFulfillment && (localOrderState.afterGuaranteeCutoff || serverRequiresOnArrival);
  const requestedTime = localFulfillment
    ? requestedTimeChoice === "now"
      ? localOrderState.currentTime
      : requestedTimeChoice
    : null;
  const localCloseTime = localOrderState.closeTime || data?.company.local_ordering_close_time?.slice(0, 5) || "15:00";
  const localGuaranteeCutoff = data?.company.local_ordering_guarantee_cutoff?.slice(0, 5) || "13:30";
  const localWindowLabelForDisplay = data ? localOrderWindowLabel(data.company) : "";
  const localRequestedTimeOptions = useMemo(
    () => buildLocalRequestedTimeOptions(localOrderState.currentTime, localCloseTime),
    [localCloseTime, localOrderState.currentTime]
  );
  const publicSections = useMemo<PublicSection[]>(
    () => (categories && products ? buildPublicCatalogSections(categories, products) : []),
    [categories, products]
  );
  const catalogSections = useMemo(
    () => lateLocalMode
      ? publicSections
          .map((section) => ({
            ...section,
            products: section.products.filter((product) => isDailyMenuProduct(product.product_type))
          }))
          .filter((section) => section.products.length > 0)
      : publicSections,
    [lateLocalMode, publicSections]
  );
  const menuReviews = useMemo(() => {
    const reviews = new Map<string, MenuReview>();

    if (lateLocalMode) {
      return reviews;
    }

    for (const item of cart) {
      if (!isDailyMenuProduct(item.product_type)) continue;
      const fields = getUnavailableMenuFields(item.product_type, item.metadata ?? {}, dailyMenu);
      if (!fields.length) continue;

      const section = publicSections.find(({ products }) => products.some(({ id }) => id === item.product_id));
      const product = section?.products.find(({ id }) => id === item.product_id);
      const replacement = section && product && !product.sold_out && hasMenuChoices(product, dailyMenu)
        ? { product, section }
        : undefined;
      reviews.set(item.key, { fields, replacement });
    }

    return reviews;
  }, [cart, dailyMenu, lateLocalMode, publicSections]);
  const paymentOptions = useMemo(() => publicPaymentOptions(data?.company), [data?.company]);

  useEffect(() => {
    if (!paymentOptions.some((option) => option.method === paymentMethod)) {
      setPaymentMethod(paymentOptions[0]?.method ?? "pay_on_delivery");
    }
  }, [paymentMethod, paymentOptions]);

  useEffect(() => {
    if (!localOrderingEnabled) {
      setFulfillmentType("delivery");
      return;
    }

    if (fulfillmentType === "delivery" && !deliveryAvailable && localOrderState.open) {
      setFulfillmentType("dine_in");
      setLateAvailabilityAccepted(false);
    }
  }, [deliveryAvailable, fulfillmentType, localOrderState.open, localOrderingEnabled]);

  useEffect(() => {
    if (
      requestedTimeChoice !== "now" &&
      (
        timeToMinutes(requestedTimeChoice) < timeToMinutes(localOrderState.currentTime) ||
        timeToMinutes(requestedTimeChoice) >= timeToMinutes(localCloseTime)
      )
    ) {
      setRequestedTimeChoice("now");
    }
  }, [localCloseTime, localOrderState.currentTime, requestedTimeChoice]);

  useEffect(() => {
    if (!lateLocalMode) {
      setLateAvailabilityAccepted(false);
      setServerRequiresOnArrival(false);
    }
  }, [lateLocalMode]);

  const totals = useMemo(
    () => calculateCartTotals(cart, data?.company, subsidyAlreadyUsed, paymentMethod),
    [cart, data?.company, paymentMethod, subsidyAlreadyUsed]
  );
  const displayTotal = totals.employeeTotal === 0 && totals.companyInvoiceTotal > 0 ? totals.subtotal : totals.total;
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const lateCartNeedsReview = lateLocalMode && cart.some((item) =>
    !isDailyMenuProduct(item.product_type) || hasLateLocalMenuConfiguration(item.metadata)
  );
  const hasSubsidizedItem = cart.some((item) => getSubsidyAmount(item.product_type, data?.company) > 0);
  const companyName = data?.company.name ?? "tu empresa";
  const deliveryWindow = data?.schedule
    ? deliveryWindowLabel(data.schedule)
    : data?.company.delivery_window ?? DELIVERY_WINDOW;
  const selectedBranch = data?.branches.find((branch) => branch.id === customer.company_branch_id) ?? null;
  const emailValidation = validateCompanyOrderEmail(companySlug, customer.email);
  const canConfirmOrder =
    Boolean(customer.name.trim()) &&
    Boolean(customer.email.trim()) &&
    emailValidation.valid &&
    Boolean(customer.phone.trim()) &&
    Boolean(selectedBranch) &&
    paymentOptions.some((option) => option.method === paymentMethod) &&
    (localFulfillment ? localOrderState.open : deliveryAvailable) &&
    (!localFulfillment || Boolean(requestedTime)) &&
    (!lateLocalMode || lateAvailabilityAccepted) &&
    !lateCartNeedsReview &&
    menuReviews.size === 0 &&
    cart.length > 0;

  function updateCustomer(field: keyof CustomerForm, value: string) {
    setCustomer((current) => ({ ...current, [field]: value }));
  }

  function updateFulfillmentType(next: FulfillmentType) {
    if (next !== "delivery" && !localOrderingEnabled) {
      return;
    }

    setFulfillmentType(next);
    setLateAvailabilityAccepted(false);
    setServerRequiresOnArrival(false);
    setSubmitState({ status: "idle" });
  }

  function adaptCartForLateLocal() {
    if (!data) return;

    const normalized = new Map<string, CartItem>();

    for (const item of cart) {
      if (!isDailyMenuProduct(item.product_type)) continue;
      const product = data.products.find((candidate) => candidate.id === item.product_id);

      if (!product) continue;

      const basePrice = Number(product.base_price);
      const nextItem = buildCartItem(product, buildLateLocalMenuMetadata(basePrice), item.name, basePrice);
      const existing = normalized.get(nextItem.key);
      normalized.set(nextItem.key, {
        ...nextItem,
        quantity: (existing?.quantity ?? 0) + item.quantity
      });
    }

    setCart(Array.from(normalized.values()));
    setLateAvailabilityAccepted(false);
    setSubmitState({ status: "idle" });
  }

  function goToStep(nextStep: PublicStep) {
    setStep(nextStep);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function addProduct(product: Product, section: PublicSection, metadata: Record<string, string>, unitPrice: number, replacementKey?: string) {
    const item = buildCartItem(product, metadata, getDisplayName(product, section.kind), unitPrice);

    setCart((current) => {
      const replaced = current.find((cartItem) => cartItem.key === replacementKey);
      if (replacementKey && !replaced) return current;

      const quantity = replaced?.quantity ?? 1;
      const existing = current.find((cartItem) => cartItem.key === item.key && cartItem.key !== replacementKey);
      if (existing) {
        return current.filter((cartItem) => cartItem.key !== replacementKey).map((cartItem) =>
          cartItem.key === item.key ? { ...cartItem, quantity: cartItem.quantity + quantity } : cartItem
        );
      }

      const nextItem = { ...item, quantity };
      return replaced
        ? current.map((cartItem) => cartItem.key === replacementKey ? nextItem : cartItem)
        : [...current, nextItem];
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
    if (orderSubmitting.current || menuReviews.size) return;
    setSubmitState({ status: "idle" });

    if (!data) {
      setSubmitState({ status: "error", message: "La carta todavía se está cargando." });
      return;
    }

    const now = new Date();
    const currentLocalState = getLocalOrderState(now, data.company);
    const currentLocalOnlyDay = data.company.local_ordering_enabled === true && isLocalOnlyDay(now, data.company);
    const currentLateLocalMode = localFulfillment && (currentLocalState.afterGuaranteeCutoff || serverRequiresOnArrival);
    const currentLateCartNeedsReview = currentLateLocalMode && cart.some((item) =>
      !isDailyMenuProduct(item.product_type) || hasLateLocalMenuConfiguration(item.metadata)
    );
    const requestedTimeForSubmit = localFulfillment
      ? requestedTimeChoice === "now"
        ? currentLocalState.currentTime
        : requestedTimeChoice
      : null;

    if (!localFulfillment && (!orderWindow.open || currentLocalOnlyDay)) {
      setSubmitState({
        status: "error",
        message: currentLocalOnlyDay ? deliveryAvailabilityMessage : orderWindow.message
      });
      return;
    }

    if (localFulfillment && !currentLocalState.open) {
      setLocalOrderState(currentLocalState);
      setSubmitState({ status: "error", message: currentLocalState.message });
      return;
    }

    if (localFulfillment && !requestedTimeForSubmit) {
      setSubmitState({ status: "error", message: "Indica una hora aproximada para venir al restaurante." });
      return;
    }

    if (currentLateLocalMode && currentLateCartNeedsReview) {
      setLocalOrderState(currentLocalState);
      setServerRequiresOnArrival(true);
      setLateAvailabilityAccepted(false);
      setSubmitState({
        status: "error",
        message: `${lateLocalNotice(localGuaranteeCutoff)} Revisa y adapta la cesta antes de confirmar.`
      });
      return;
    }

    if (currentLateLocalMode && !lateAvailabilityAccepted) {
      setLocalOrderState(currentLocalState);
      setServerRequiresOnArrival(true);
      setSubmitState({ status: "error", message: "Confirma que aceptas elegir los platos al llegar." });
      return;
    }

    if (!customer.name.trim() || !customer.email.trim() || !customer.phone.trim() || !selectedBranch) {
      setSubmitState({ status: "error", message: "Completa tus datos antes de confirmar." });
      return;
    }

    if (!emailValidation.valid) {
      setSubmitState({ status: "error", message: emailValidation.message });
      return;
    }

    if (!cart.length) {
      setSubmitState({ status: "error", message: "Añade al menos un producto al carrito." });
      return;
    }

    if (!paymentOptions.some((option) => option.method === paymentMethod)) {
      setSubmitState({ status: "error", message: "Selecciona una forma de pago disponible." });
      return;
    }

    orderSubmitting.current = true;
    menuRequest.current?.abort();
    menuRequest.current = null;
    setSubmitState({ status: "loading" });

    let response: Response;
    let payload;
    try {
      response = await fetch("/api/orders", {
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
          notes,
          payment_method: paymentMethod,
          fulfillment_type: fulfillmentType,
          requested_time: requestedTimeForSubmit,
          availability_acknowledged: currentLateLocalMode ? lateAvailabilityAccepted : false
        })
      });
      payload = await response.json();
    } catch {
      setSubmitState({ status: "error", message: "No se pudo confirmar el pedido. Revisa la conexión e inténtalo de nuevo." });
      return;
    } finally {
      orderSubmitting.current = false;
    }

    if (!response.ok) {
      if (
        payload.code === "LOCAL_SELECTION_CHANGED" ||
        payload.code === "LOCAL_MENU_CUTOFF" ||
        payload.code === "LOCAL_AVAILABILITY_ACK_REQUIRED"
      ) {
        setServerRequiresOnArrival(true);
        setLateAvailabilityAccepted(false);
        setSubmitState({
          status: "error",
          message: payload.error ?? `${lateLocalNotice(localGuaranteeCutoff)} Adapta la cesta y acepta la condición antes de continuar.`
        });
        return;
      }

      if (
        payload.code === "LOCAL_ORDER_WINDOW_CLOSED" ||
        payload.code === "LOCAL_ONLY_DAY" ||
        payload.code === "LOCAL_REQUESTED_TIME_OUTSIDE_WINDOW"
      ) {
        void refreshPublicData().catch(() => { /* Conservamos el mensaje validado por el servidor. */ });
        setSubmitState({ status: "error", message: payload.error ?? "La operativa acaba de cambiar. Revisa la modalidad y vuelve a intentarlo." });
        return;
      }

      if (payload.code === "MENU_CHANGED") {
        updateDailyMenu(payload.menu);
        setSubmitState({ status: "idle" });
        return;
      }

      if (payload.code === "PRICE_CHANGED") {
        const updatedCart = applyCartPriceUpdate(cart, payload.prices);
        if (updatedCart) {
          setCart(updatedCart);
          void fetch(`/api/public/companies/${companySlug}`, { cache: "no-store" })
            .then((result) => result.ok ? result.json() : null)
            .then((freshData: PublicData | null) => {
              if (freshData) {
                setData((current) => current?.company.slug === freshData.company.slug
                  ? { ...freshData, dailyMenu: current.dailyMenu }
                  : current);
              }
            })
            .catch(() => { /* The server price update already keeps this cart usable. */ });
          setSubmitState({ status: "error", message: "El precio ha cambiado. Hemos actualizado tu carrito conservando tus selecciones. Revisa el nuevo total y vuelve a confirmar el pedido." });
          return;
        }
      }
      setSubmitState({ status: "error", message: payload.error ?? "No se pudo confirmar el pedido." });
      return;
    }

    if (payload.payment?.redirect_url) {
      window.location.href = payload.payment.redirect_url;
      return;
    }

    setCart([]);
    setNotes("");
    const confirmedDisplayTotal = Number(
      payload.order?.employee_total === 0 && payload.order?.company_invoice_total > 0
        ? payload.order?.subtotal
        : payload.order?.total ?? displayTotal
    );

    setLastOrder({
      id: payload.order?.id ?? "",
      total: confirmedDisplayTotal
    });
    setSubsidyAlreadyUsed(Boolean(payload.order?.prior_subsidy_used || payload.order?.subsidy_applied));
    setSubmitState({
      status: "success",
      message: `Pedido confirmado. Importe: ${formatCurrency(confirmedDisplayTotal)}.`
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
            <FulfillmentSelector
              enabled={localOrderingEnabled}
              fulfillmentType={fulfillmentType}
              onChange={updateFulfillmentType}
              deliveryAvailable={deliveryAvailable}
              deliveryMessage={deliveryAvailabilityMessage}
              deliveryWindow={deliveryWindow}
              localOrderState={localOrderState}
              localWindowLabel={localWindowLabelForDisplay}
              guaranteeCutoff={localGuaranteeCutoff}
              requestedTimeChoice={requestedTimeChoice}
              requestedTimeOptions={localRequestedTimeOptions}
              onRequestedTimeChange={setRequestedTimeChoice}
              lateLocalMode={lateLocalMode}
              lateAvailabilityAccepted={lateAvailabilityAccepted}
              onLateAvailabilityAccepted={setLateAvailabilityAccepted}
            />
          ) : null}

          {lateCartNeedsReview ? (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm font-semibold text-amber-950">
              <p className="font-black">La cesta contiene platos elegidos o productos no disponibles después de las {localGuaranteeCutoff}.</p>
              <p className="mt-1">Conservaremos únicamente Menú del día y Medio menú, sin selección de platos.</p>
              <button
                type="button"
                className="matica-focus mt-3 rounded-lg bg-amber-900 px-4 py-2 font-black text-white"
                onClick={adaptCartForLateLocal}
              >
                Adaptar mi cesta
              </button>
            </div>
          ) : null}

          {data ? (
            <div className="sticky top-0 z-20 -mx-4 border-y border-matica-line bg-matica-soft/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6 lg:mx-0 lg:rounded-lg lg:border lg:bg-white lg:px-3">
              <div className="flex items-center gap-2">
                <nav className="min-w-0 flex-1 overflow-x-auto pb-1 sm:pb-0" aria-label="Categorías">
                  <div className="flex w-max gap-1.5 pr-3">
                    {catalogSections.map((section) => (
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
                  aria-label={`Ver carrito, ${cartCount} productos, total ${formatCurrency(displayTotal)}`}
                >
                  <ShoppingBag className="h-4 w-4" />
                  <span>{cartCount}</span>
                  <span className="h-4 w-px bg-matica-line" aria-hidden="true" />
                  <span>{formatCurrency(displayTotal)}</span>
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
              {catalogSections.map((section, index) => (
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
                  {!lateLocalMode && section.products.some((product) => isDailyMenuProduct(product.product_type) && !product.sold_out && !hasMenuChoices(product, dailyMenu)) ? (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-matica-line bg-white p-3 text-sm font-semibold text-matica-ink/65">
                      <p>El menú de hoy aún no está disponible.</p>
                      <button type="button" className="matica-focus font-bold text-matica-green underline" onClick={() => void refreshDailyMenu()}>
                        Actualizar menú
                      </button>
                    </div>
                  ) : null}
                  <div className="grid gap-2.5 sm:gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {section.products.map((product, productIndex) => (
                      <ProductCard
                        key={`${section.slug}-${product.id}-${product.name}`}
                        product={product}
                        section={section}
                        menu={data.dailyMenu}
                        company={data.company}
                        eagerImage={index === 0 && productIndex < 3}
                        allowUnconfiguredMenu={lateLocalMode}
                        onOpen={() => {
                          if (lateLocalMode && isDailyMenuProduct(product.product_type)) {
                            const basePrice = Number(product.base_price);
                            addProduct(product, section, buildLateLocalMenuMetadata(basePrice), basePrice);
                            return;
                          }

                          setConfiguring({ product, section });
                        }}
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
          aria-label={`Ver carrito, ${cartCount} productos, total ${formatCurrency(displayTotal)}`}
        >
          <ShoppingBag className="h-4 w-4" />
          <span>Cesta</span>
          <span className="h-4 w-px bg-matica-line" aria-hidden="true" />
          <span>{cartCount}</span>
          <span className="h-4 w-px bg-matica-line" aria-hidden="true" />
          <span>{formatCurrency(displayTotal)}</span>
        </button>
      ) : null}

      {step === "checkout" ? (
        <CheckoutPanel
          branches={data?.branches ?? []}
          company={data?.company}
          cart={cart}
          cartCount={cartCount}
          customer={customer}
          companyName={companyName}
          deliveryWindow={deliveryWindow}
          deliveryAddress={data?.company.delivery_address ?? ""}
          localOrderingEnabled={localOrderingEnabled}
          fulfillmentType={fulfillmentType}
          setFulfillmentType={updateFulfillmentType}
          deliveryAvailable={deliveryAvailable}
          deliveryAvailabilityMessage={deliveryAvailabilityMessage}
          localOrderState={localOrderState}
          localWindowLabel={localWindowLabelForDisplay}
          guaranteeCutoff={localGuaranteeCutoff}
          requestedTimeChoice={requestedTimeChoice}
          requestedTimeOptions={localRequestedTimeOptions}
          setRequestedTimeChoice={setRequestedTimeChoice}
          lateLocalMode={lateLocalMode}
          lateAvailabilityAccepted={lateAvailabilityAccepted}
          setLateAvailabilityAccepted={setLateAvailabilityAccepted}
          lateCartNeedsReview={lateCartNeedsReview}
          adaptCartForLateLocal={adaptCartForLateLocal}
          totals={totals}
          notes={notes}
          setNotes={setNotes}
          updateCustomer={updateCustomer}
          paymentOptions={paymentOptions}
          paymentMethod={paymentMethod}
          setPaymentMethod={setPaymentMethod}
          emailValidationMessage={emailValidation.valid ? "" : emailValidation.message}
          submitState={submitState}
          canConfirmOrder={canConfirmOrder}
          hasSubsidizedItem={hasSubsidizedItem}
          subsidyAlreadyUsed={subsidyAlreadyUsed}
          menuReviews={menuReviews}
          onReplaceMenuItem={(item, review) => {
            if (review.replacement) {
              setConfiguring({ ...review.replacement, replaceItem: item, fields: review.fields });
            }
          }}
          onRemoveMenuItem={(key) => setCart((current) => current.filter((item) => item.key !== key))}
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

      {configuring && !lateLocalMode && hasMenuChoices(configuring.product, dailyMenu) ? (
        <ConfigModal
          key={configuring.replaceItem?.key ?? `${configuring.product.id}:${getDisplayName(configuring.product, configuring.section.kind)}`}
          product={configuring.product}
          products={data?.products ?? []}
          section={configuring.section}
          onClose={() => setConfiguring(null)}
          menu={dailyMenu}
          company={data?.company}
          subsidyAlreadyUsed={subsidyAlreadyUsed}
          replaceItem={configuring.replaceItem}
          fieldsToReplace={configuring.fields}
          onAdd={(metadata, unitPrice) => {
            addProduct(configuring.product, configuring.section, metadata, unitPrice, configuring.replaceItem?.key);
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

function FulfillmentSelector({
  enabled,
  fulfillmentType,
  onChange,
  deliveryAvailable,
  deliveryMessage,
  deliveryWindow,
  localOrderState,
  localWindowLabel,
  guaranteeCutoff,
  requestedTimeChoice,
  requestedTimeOptions,
  onRequestedTimeChange,
  lateLocalMode,
  lateAvailabilityAccepted,
  onLateAvailabilityAccepted
}: {
  enabled: boolean;
  fulfillmentType: FulfillmentType;
  onChange: (value: FulfillmentType) => void;
  deliveryAvailable: boolean;
  deliveryMessage: string;
  deliveryWindow: string;
  localOrderState: LocalOrderState;
  localWindowLabel: string;
  guaranteeCutoff: string;
  requestedTimeChoice: RequestedTimeChoice;
  requestedTimeOptions: string[];
  onRequestedTimeChange: (value: RequestedTimeChoice) => void;
  lateLocalMode: boolean;
  lateAvailabilityAccepted: boolean;
  onLateAvailabilityAccepted: (value: boolean) => void;
}) {
  if (!enabled) return null;

  const options: Array<{
    type: FulfillmentType;
    title: string;
    description: string;
    available: boolean;
  }> = [
    {
      type: "delivery",
      title: "Entrega en la empresa",
      description: `Reparto ${deliveryWindow}`,
      available: deliveryAvailable
    },
    {
      type: "dine_in",
      title: "Comer aquí",
      description: "Te esperamos en el restaurante",
      available: localOrderState.open
    },
    {
      type: "pickup",
      title: "Recoger",
      description: "Pide y llévatelo",
      available: localOrderState.open
    }
  ];
  const localFulfillment = isLocalFulfillmentType(fulfillmentType);

  return (
    <section className="rounded-lg border border-matica-green/25 bg-white p-4 shadow-sm">
      <div>
        <h2 className="text-xl font-black">¿Cómo quieres recibir tu pedido?</h2>
        <p className="mt-1 text-sm font-semibold text-matica-ink/55">
          Elige la modalidad antes de preparar la cesta.
        </p>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {options.map((option) => {
          const selected = fulfillmentType === option.type;

          return (
            <button
              key={option.type}
              type="button"
              aria-pressed={selected}
              disabled={!option.available}
              onClick={() => onChange(option.type)}
              className={`matica-focus min-h-24 rounded-lg border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-55 ${
                selected
                  ? "border-matica-green bg-matica-mint text-matica-green"
                  : "border-matica-line bg-white text-matica-ink"
              }`}
            >
              <span className="block font-black">{option.title}</span>
              <span className="mt-1 block text-xs font-semibold text-matica-ink/60">{option.description}</span>
              <span className={`mt-2 inline-flex rounded-full px-2 py-1 text-[11px] font-black ${
                option.available ? "bg-matica-mint text-matica-green" : "bg-matica-ink/10 text-matica-ink/55"
              }`}>
                {option.available ? "Disponible" : "No disponible ahora"}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-3 rounded-lg bg-matica-soft px-3 py-2 text-xs font-bold text-matica-ink/65">
        {localFulfillment
          ? `${localOrderState.message} Horario: ${localWindowLabel}.`
          : deliveryAvailable
            ? `Entrega disponible ${deliveryWindow}.`
            : deliveryMessage}
      </div>

      {localFulfillment ? (
        <div className="mt-4 space-y-3">
          <label className="block space-y-1">
            <span className="text-sm font-black text-matica-ink">Hora aproximada</span>
            <select
              className="matica-focus w-full rounded-lg border border-matica-line bg-white px-3 py-3 font-bold"
              value={requestedTimeChoice}
              onChange={(event) => onRequestedTimeChange(event.target.value)}
            >
              <option value="now">Ahora ({localOrderState.currentTime || "hora actual"})</option>
              {requestedTimeOptions.map((time) => (
                <option key={time} value={time}>{time}</option>
              ))}
            </select>
            <span className="block text-xs font-semibold text-matica-ink/50">Las horas son aproximadas y se muestran en franjas de 15 minutos.</span>
          </label>

          {lateLocalMode ? (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
              <p className="font-black">Platos según disponibilidad</p>
              <p className="mt-1 font-semibold leading-5">{lateLocalNotice(guaranteeCutoff)}</p>
              <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-lg border border-amber-300 bg-white p-3 font-black">
                <input
                  className="mt-0.5 h-4 w-4 accent-matica-green"
                  type="checkbox"
                  checked={lateAvailabilityAccepted}
                  onChange={(event) => onLateAvailabilityAccepted(event.target.checked)}
                />
                <span>Acepto elegir los platos al llegar entre las opciones disponibles.</span>
              </label>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function ProductCard({
  product,
  section,
  menu,
  company,
  eagerImage = false,
  allowUnconfiguredMenu = false,
  onOpen
}: {
  product: Product;
  section: PublicSection;
  menu: DailyMenu | null;
  company: PublicData["company"];
  eagerImage?: boolean;
  allowUnconfiguredMenu?: boolean;
  onOpen: () => void;
}) {
  const canAdd = !product.sold_out && (allowUnconfiguredMenu || hasMenuChoices(product, menu));
  const subsidy = getSubsidyAmount(product.product_type, company);
  const employeePrice = employeeProductPrice(Number(product.base_price), product.product_type, company.billing_type === "subsidized" ? company.subsidy_rules : []);
  const displayName = getDisplayName(product, section.kind);
  const imageUrl = getProductImageUrl(product);
  const [imageFailed, setImageFailed] = useState(false);
  const pricePrefix = section.kind === "drinks" || section.kind === "desserts" ? "desde " : "";

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
            decoding="async"
            fetchPriority={eagerImage ? "high" : "auto"}
            loading={eagerImage ? "eager" : "lazy"}
            sizes="(max-width: 640px) 112px, (max-width: 1280px) 50vw, 33vw"
            onError={() => {
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
            <p className="text-left text-base font-black sm:text-right">
              {pricePrefix}{formatCurrency(employeePrice)}
            </p>
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
            {allowUnconfiguredMenu && isDailyMenuProduct(product.product_type) ? "Añadir menú" : "Elegir"}
          </button>
        </div>
      </div>
    </article>
  );
}

function ConfigModal({
  product,
  products,
  section,
  menu,
  company,
  subsidyAlreadyUsed,
  replaceItem,
  fieldsToReplace,
  onClose,
  onAdd
}: {
  product: Product;
  products: Product[];
  section: PublicSection;
  menu: DailyMenu | null;
  company?: PublicData["company"];
  subsidyAlreadyUsed: boolean;
  replaceItem?: CartItem;
  fieldsToReplace?: MenuCourseField[];
  onClose: () => void;
  onAdd: (metadata: Record<string, string>, unitPrice: number) => void;
}) {
  const spec = getConfigSpec(product, section, menu, company, products);
  const initialSingleValues: Record<string, string> = {};
  const initialMultiValues: Record<string, string[]> = {};
  const priorChoices = replaceItem?.metadata;

  if (priorChoices) {
    if (priorChoices.bread && priorChoices.bread !== "No") initialSingleValues.bread = BREAD_OPTION.label;
    if (hasCutlery(priorChoices)) initialSingleValues[CUTLERY_METADATA_KEY] = CUTLERY_OPTION.label;

    for (const group of spec.groups) {
      const previous = priorChoices[group.key];
      if (!previous || fieldsToReplace?.some((field) => field === group.key)) continue;

      if (group.type === "single") {
        const savedOption = group.options.find(({ label }) =>
          label === previous || (isCustomSaladChoice(label) && isCustomSaladChoice(previous))
        );
        if (savedOption) initialSingleValues[group.key] = savedOption.label;
      } else if (group.type === "multi") {
        const selected = previous.split(",").map((value) => value.trim());
        initialMultiValues[group.key] = selected.filter((value) => group.options.some(({ label }) => label === value));
      }
    }
  }

  const [stepIndex, setStepIndex] = useState(() => Math.max(
    0,
    activeConfigFlowGroups(spec.groups, initialSingleValues).findIndex((group) =>
      fieldsToReplace?.some((field) => field === group.key)
    )
  ));
  const [singleValues, setSingleValues] = useState(initialSingleValues);
  const [multiValues, setMultiValues] = useState(initialMultiValues);
  const activeGroups = activeConfigFlowGroups(spec.groups, singleValues);
  const currentGroup = activeGroups[stepIndex];
  const displayStep = displayConfigFlowStep(activeGroups, stepIndex);
  const saladSize = product.product_type === "daily_menu"
    ? SMALL_SALAD_SIZE_LABEL
    : product.product_type === "half_menu"
      ? MEDIUM_SALAD_SIZE_LABEL
      : spec.defaultMetadata?.salad_size ?? singleValues.salad_size;
  const selectedSaladBases = multiValues.salad_base ?? [];
  const needsSecondSaladBase = selectedSaladBases.length === 1 && saladBaseRequiresPair(selectedSaladBases[0], saladSize);
  const firstUnavailableCourse = activeGroups.findIndex((group) =>
    ["plate", "first_course", "second_course"].includes(group.key) &&
    singleValues[group.key] &&
    !group.options.some(({ label }) => label === singleValues[group.key])
  );

  useEffect(() => {
    if (firstUnavailableCourse >= 0 && stepIndex > firstUnavailableCourse) {
      setStepIndex(firstUnavailableCourse);
    } else if (stepIndex >= activeGroups.length) {
      setStepIndex(Math.max(activeGroups.length - 1, 0));
    }
  }, [activeGroups.length, firstUnavailableCourse, stepIndex]);

  function selectedValuesForGroup(group: ConfigGroup) {
    if (group.key === BREAD_CUTLERY_GROUP_KEY) {
      return [singleValues.bread, singleValues[CUTLERY_METADATA_KEY]].filter(Boolean);
    }

    return group.type === "multi" ? multiValues[group.key] ?? [] : [singleValues[group.key]].filter(Boolean);
  }

  function optionPriceForGroup(group: ConfigGroup, optionLabel: string) {
    return group.options.find((option) => option.label === optionLabel)?.price ?? 0;
  }

  function optionUnitPriceForGroup(group: ConfigGroup, optionLabel: string) {
    return group.options.find((option) => option.label === optionLabel)?.unitPrice;
  }

  const configuredUnitPrice = activeGroups.reduce((price, group) => {
    const selected = selectedValuesForGroup(group);
    const unitOverride = selected
      .map((value) => optionUnitPriceForGroup(group, value))
      .find((value): value is number => typeof value === "number");

    if (typeof unitOverride === "number") {
      return unitOverride;
    }

    return price + selected.reduce((sum, value) => sum + optionPriceForGroup(group, value), 0);
  }, Number(product.base_price));
  const subsidy = getSubsidyAmount(product.product_type, company);
  const customerUnitPrice =
    !subsidyAlreadyUsed && subsidy > 0
      ? Math.max(configuredUnitPrice - subsidy, 0)
      : configuredUnitPrice;
  const canSubmitConfig = activeGroups.every((group) => isGroupComplete(group));
  const canGoNext = currentGroup ? isGroupComplete(currentGroup) && stepIndex < activeGroups.length - 1 : false;

  function isGroupComplete(group: ConfigGroup) {
    if (group.type === "checkbox") {
      return true;
    }

    if (group.type === "single") {
      return group.options.some(({ label }) => label === singleValues[group.key]);
    }

    const selected = multiValues[group.key] ?? [];
    const selectedCount = selected.length;

    if (group.key === "salad_base") {
      return isValidSaladBaseSelection(selected, saladSize);
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
    const nextSingleValues = { ...singleValues, [group.key]: optionLabel };
    const nextStepIndex = nextConfigFlowStepIndex(spec.groups, group.key, nextSingleValues);

    setSingleValues(nextSingleValues);

    if (nextStepIndex !== stepIndex) {
      window.setTimeout(() => setStepIndex(nextStepIndex), 120);
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

    if (activeGroups.some((group) => group.key === "salad_base")) {
      if (product.product_type === "daily_menu") {
        metadata.salad_size = SMALL_SALAD_SIZE_LABEL;
      }

      if (product.product_type === "half_menu") {
        metadata.salad_size = MEDIUM_SALAD_SIZE_LABEL;
      }
    }

    for (const group of activeGroups) {
      if (group.key === BREAD_CUTLERY_GROUP_KEY) {
        metadata.bread = singleValues.bread ? "SÃ­" : "No";

        if (singleValues[CUTLERY_METADATA_KEY]) {
          metadata[CUTLERY_METADATA_KEY] = CUTLERY_SELECTED_LABEL;
        }

        continue;
      }

      if (group.type === "multi") {
        metadata[group.key] = (multiValues[group.key] ?? []).join(", ");
        continue;
      }

      const value = singleValues[group.key];
      if (group.type === "checkbox" && group.key === "bread") {
        metadata[group.key] = value ? "Sí" : "No";
        continue;
      }

      if (group.type === "checkbox" && group.key === CUTLERY_METADATA_KEY) {
        if (value) {
          metadata[group.key] = CUTLERY_SELECTED_LABEL;
        }
        continue;
      }

      if (!value) {
        continue;
      }

      metadata[group.key] = value;
    }

    const supplements = activeGroups.flatMap((group) => {
      if (group.key === CUTLERY_METADATA_KEY || group.key === BREAD_CUTLERY_GROUP_KEY) {
        return [];
      }

      if (group.type !== "multi") {
        const value = singleValues[group.key];
        const price = optionPriceForGroup(group, value);
        return price > 0 ? [`${value} +${formatCurrency(price)}`] : [];
      }

      return (multiValues[group.key] ?? []).flatMap((value) => {
        const price = optionPriceForGroup(group, value);
        return price > 0 ? [`${value} +${formatCurrency(price)}`] : [];
      });
    });

    if (supplements.length) {
      metadata.suplementos = supplements.join(", ");
    }

    onAdd(metadata, configuredUnitPrice);
  }

  function setCheckboxChoice(key: string, optionLabel: string, selected: boolean) {
    setSingleValues((current) => ({
      ...current,
      [key]: selected ? optionLabel : ""
    }));
  }

  function renderChoiceButton({
    checked,
    label,
    onClick,
    priceLabel
  }: {
    checked: boolean;
    label: string;
    onClick: () => void;
    priceLabel?: string;
  }) {
    return (
      <button
        type="button"
        className={`matica-focus flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-3 text-left text-sm font-bold ${
          checked ? "border-matica-green bg-matica-mint text-matica-green" : "border-matica-line bg-white text-matica-ink"
        }`}
        onClick={onClick}
      >
        <span>{label}</span>
        {priceLabel ? <span className="text-xs font-black">{priceLabel}</span> : null}
      </button>
    );
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
                      Paso {displayStep.current} de {displayStep.total}
                    </span>
                    <span className="mt-1 block text-2xl font-black">{currentGroup.label}</span>
                    {currentGroup.instruction || (currentGroup.type === "multi" && (currentGroup.min || currentGroup.max)) ? (
                      <span className="mt-1 block text-sm font-semibold text-matica-ink/55">
                        {currentGroup.instruction ??
                        (currentGroup.min && currentGroup.max === currentGroup.min
                          ? `Escoge ${currentGroup.min}`
                          : currentGroup.min && currentGroup.max
                            ? `Escoge de ${currentGroup.min} a ${currentGroup.max}`
                            : currentGroup.max
                            ? `Escoge hasta ${currentGroup.max}`
                            : `Escoge al menos ${currentGroup.min}`)}
                      </span>
                    ) : null}
                  </legend>

                  {currentGroup.key === "salad_base" && saladSize !== SMALL_SALAD_SIZE_LABEL ? (
                    <div className="space-y-1 text-sm font-semibold">
                      <p className="text-matica-ink/65">Las bases marcadas «Para combinar» necesitan una segunda base.</p>
                      {needsSecondSaladBase ? (
                        <p role="status" className="text-matica-green">Elige una segunda base para completar tu ensalada.</p>
                      ) : null}
                    </div>
                  ) : null}

                  {currentGroup.key === BREAD_CUTLERY_GROUP_KEY ? (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <p className="text-xs font-black uppercase text-matica-ink/45">Pan</p>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {renderChoiceButton({
                            checked: !singleValues.bread,
                            label: NO_BREAD_LABEL,
                            onClick: () => setCheckboxChoice("bread", BREAD_OPTION.label, false)
                          })}
                          {renderChoiceButton({
                            checked: singleValues.bread === BREAD_OPTION.label,
                            label: BREAD_OPTION.label,
                            onClick: () => setCheckboxChoice("bread", BREAD_OPTION.label, true)
                          })}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <p className="text-xs font-black uppercase text-matica-ink/45">Cubiertos</p>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {renderChoiceButton({
                            checked: !singleValues[CUTLERY_METADATA_KEY],
                            label: NO_CUTLERY_LABEL,
                            onClick: () => setCheckboxChoice(CUTLERY_METADATA_KEY, CUTLERY_OPTION.label, false)
                          })}
                          {renderChoiceButton({
                            checked: singleValues[CUTLERY_METADATA_KEY] === CUTLERY_OPTION.label,
                            label: "Incluir cubiertos",
                            onClick: () => setCheckboxChoice(CUTLERY_METADATA_KEY, CUTLERY_OPTION.label, true),
                            priceLabel: `+${formatCurrency(CUTLERY_PRICE)}`
                          })}
                        </div>
                      </div>
                    </div>
                  ) : (
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
                            <span>
                              {option.label}
                              {currentGroup.key === "salad_base" && saladBaseRequiresPair(option.label, saladSize) ? (
                                <span className="mt-0.5 block text-xs font-semibold text-matica-ink/60">Para combinar</span>
                              ) : null}
                            </span>
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
                  )}
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
            {replaceItem ? "Guardar cambio" : "Añadir"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CheckoutPanel({
  branches,
  company,
  cart,
  cartCount,
  customer,
  companyName,
  deliveryWindow,
  deliveryAddress,
  localOrderingEnabled,
  fulfillmentType,
  setFulfillmentType,
  deliveryAvailable,
  deliveryAvailabilityMessage,
  localOrderState,
  localWindowLabel,
  guaranteeCutoff,
  requestedTimeChoice,
  requestedTimeOptions,
  setRequestedTimeChoice,
  lateLocalMode,
  lateAvailabilityAccepted,
  setLateAvailabilityAccepted,
  lateCartNeedsReview,
  adaptCartForLateLocal,
  totals,
  notes,
  setNotes,
  updateCustomer,
  paymentOptions,
  paymentMethod,
  setPaymentMethod,
  emailValidationMessage,
  submitState,
  canConfirmOrder,
  hasSubsidizedItem,
  subsidyAlreadyUsed,
  menuReviews,
  onReplaceMenuItem,
  onRemoveMenuItem,
  changeQuantity,
  submitOrder,
  onBack
}: {
  branches: CompanyBranch[];
  company?: PublicData["company"];
  cart: CartItem[];
  cartCount: number;
  customer: CustomerForm;
  companyName: string;
  deliveryWindow: string;
  deliveryAddress: string;
  localOrderingEnabled: boolean;
  fulfillmentType: FulfillmentType;
  setFulfillmentType: (value: FulfillmentType) => void;
  deliveryAvailable: boolean;
  deliveryAvailabilityMessage: string;
  localOrderState: LocalOrderState;
  localWindowLabel: string;
  guaranteeCutoff: string;
  requestedTimeChoice: RequestedTimeChoice;
  requestedTimeOptions: string[];
  setRequestedTimeChoice: (value: RequestedTimeChoice) => void;
  lateLocalMode: boolean;
  lateAvailabilityAccepted: boolean;
  setLateAvailabilityAccepted: (value: boolean) => void;
  lateCartNeedsReview: boolean;
  adaptCartForLateLocal: () => void;
  totals: ReturnType<typeof calculateCartTotals>;
  notes: string;
  setNotes: (value: string) => void;
  updateCustomer: (field: keyof CustomerForm, value: string) => void;
  paymentOptions: PublicPaymentOption[];
  paymentMethod: PaymentMethod;
  setPaymentMethod: (method: PaymentMethod) => void;
  emailValidationMessage: string;
  submitState: SubmitState;
  canConfirmOrder: boolean;
  hasSubsidizedItem: boolean;
  subsidyAlreadyUsed: boolean;
  menuReviews: ReadonlyMap<string, MenuReview>;
  onReplaceMenuItem: (item: CartItem, review: MenuReview) => void;
  onRemoveMenuItem: (key: string) => void;
  changeQuantity: (key: string, delta: number) => void;
  submitOrder: () => void;
  onBack: () => void;
}) {
  const companyPaidOrder =
    company?.billing_type === "company" &&
    paymentMethod === "pay_on_delivery";
  const displayTotal = companyPaidOrder ? totals.subtotal : totals.total;
  const localFulfillment = isLocalFulfillmentType(fulfillmentType);

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
          <FulfillmentSelector
            enabled={localOrderingEnabled}
            fulfillmentType={fulfillmentType}
            onChange={setFulfillmentType}
            deliveryAvailable={deliveryAvailable}
            deliveryMessage={deliveryAvailabilityMessage}
            deliveryWindow={deliveryWindow}
            localOrderState={localOrderState}
            localWindowLabel={localWindowLabel}
            guaranteeCutoff={guaranteeCutoff}
            requestedTimeChoice={requestedTimeChoice}
            requestedTimeOptions={requestedTimeOptions}
            onRequestedTimeChange={setRequestedTimeChoice}
            lateLocalMode={lateLocalMode}
            lateAvailabilityAccepted={lateAvailabilityAccepted}
            onLateAvailabilityAccepted={setLateAvailabilityAccepted}
          />

          {lateCartNeedsReview ? (
            <section className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm font-semibold text-amber-950">
              <p className="font-black">Después de las {guaranteeCutoff}, adapta la cesta al modo de disponibilidad antes de confirmar.</p>
              <p className="mt-1">Se conservarán los menús y se retirarán sus elecciones de platos; otros productos saldrán de la cesta.</p>
              <button
                type="button"
                className="matica-focus mt-3 rounded-lg bg-amber-900 px-4 py-2 font-black text-white"
                onClick={adaptCartForLateLocal}
              >
                Adaptar mi cesta
              </button>
            </section>
          ) : null}

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
                cart.map((item) => {
                  const review = menuReviews.get(item.key);

                  return (
                    <div key={item.key} className="border-b border-matica-line pb-3 last:border-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-black">{item.name}</p>
                          <p className="mt-1 text-xs font-semibold leading-5 text-matica-ink/55">
                            {lateLocalMode && isDailyMenuProduct(item.product_type) && Object.keys(item.metadata ?? {}).length === 0
                              ? "Platos a elegir al llegar según disponibilidad"
                              : metadataLabel(item.metadata)}
                          </p>
                        </div>
                        <p className="shrink-0 font-black">{formatCurrency(item.base_price * item.quantity)}</p>
                      </div>
                      {review ? (
                        <div className="mt-2 rounded-lg bg-amber-50 p-2.5 text-sm font-semibold text-amber-900">
                          <p>{review.replacement
                            ? `El menú ha cambiado. Revisa ${review.fields.map((field) => `el ${formatMetadataKey(field).toLowerCase()}`).join(" y ")}.`
                            : "Este menú no está disponible ahora."}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                            {review.replacement ? (
                              <button type="button" className="matica-focus font-bold underline" onClick={() => onReplaceMenuItem(item, review)}>
                                Volver a elegir
                              </button>
                            ) : null}
                            <button type="button" className="matica-focus underline" onClick={() => onRemoveMenuItem(item.key)}>
                              Quitar del carrito
                            </button>
                          </div>
                        </div>
                      ) : null}
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
                        {getSubsidyAmount(item.product_type, company) > 0 ? (
                          <span className="rounded-lg bg-matica-mint px-2 py-1 text-xs font-black text-matica-green">
                            Subvencionable
                          </span>
                        ) : null}
                      </div>
                    </div>
                  );
                })
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
                <p className="text-sm font-semibold text-matica-ink/55">
                  {localFulfillment
                    ? `${fulfillmentType === "dine_in" ? "Comer aquí" : "Recoger"} · ${requestedTimeChoice === "now" ? `Ahora (${localOrderState.currentTime})` : requestedTimeChoice}`
                    : `Entrega ${companyName}, ${deliveryWindow}`}
                </p>
                {!localFulfillment && deliveryAddress ? <p className="text-sm font-semibold text-matica-ink/55">{deliveryAddress}</p> : null}
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
                placeholder="nombre@empresa.com"
                type="email"
                required
              />
              {emailValidationMessage ? (
                <div className="-mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700 md:col-span-2">
                  {emailValidationMessage}
                </div>
              ) : null}
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
            {totals.subsidyTotal > 0 ? (
              <div className="flex justify-between text-sm font-bold text-matica-green">
                <span>Subvención {companyName}</span>
                <span>-{formatCurrency(totals.subsidyTotal)}</span>
              </div>
            ) : null}
            {totals.companyInvoiceTotal > 0 && !companyPaidOrder ? (
              <div className="flex justify-between text-sm font-bold text-matica-green">
                <span>Factura empresa</span>
                <span>{formatCurrency(totals.companyInvoiceTotal)}</span>
              </div>
            ) : null}
            <div className="flex justify-between border-t border-matica-line pt-2 text-lg font-black">
              <span>{companyPaidOrder ? "Importe del pedido" : "Total"}</span>
              <span>{formatCurrency(displayTotal)}</span>
            </div>
          </div>

          <div className="mt-4 rounded-lg border border-matica-line bg-white p-3">
            <div className="flex items-center gap-2 text-sm font-black text-matica-ink">
              <CreditCard className="h-4 w-4 text-matica-green" />
              Forma de pago
            </div>
            <div className="mt-3 space-y-2">
              {paymentOptions.length ? (
                paymentOptions.map((option) => (
                  <label
                    key={option.method}
                    className={`block cursor-pointer rounded-lg border p-3 transition ${
                      paymentMethod === option.method
                        ? "border-matica-green bg-matica-mint text-matica-green"
                        : "border-matica-line bg-white text-matica-ink"
                    }`}
                  >
                    <span className="flex items-start gap-2">
                      <input
                        className="mt-1 h-4 w-4 accent-matica-green"
                        type="radio"
                        name="payment_method"
                        value={option.method}
                        checked={paymentMethod === option.method}
                        onChange={() => setPaymentMethod(option.method)}
                      />
                      <span>
                        <span className="block text-sm font-black">{option.label}</span>
                        <span className="mt-0.5 block text-xs font-bold text-matica-ink/55">{option.description}</span>
                      </span>
                    </span>
                  </label>
                ))
              ) : (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">
                  El pago online no está disponible temporalmente.
                </div>
              )}
            </div>
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
          {menuReviews.size ? (
            <p role="status" className="mt-3 text-sm font-bold text-amber-900">
              Revisa los platos indicados en la cesta antes de confirmar.
            </p>
          ) : null}

          {!(localFulfillment ? localOrderState.open : deliveryAvailable) ? (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-900">
              {localFulfillment ? localOrderState.message : deliveryAvailabilityMessage}
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
  const isError = submitState.status === "error";
  const isVerifying = submitState.status === "verifying";
  const isProcessing = submitState.status === "processing";
  const isSuccess = submitState.status === "success";

  return (
    <section className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="rounded-lg border border-matica-line bg-white p-6 text-center shadow-soft">
        <div
          className={`mx-auto grid h-14 w-14 place-items-center rounded-lg ${
            isError
              ? "bg-red-50 text-red-600"
              : isVerifying || isProcessing
                ? "bg-amber-50 text-amber-700"
                : "bg-matica-mint text-matica-green"
          }`}
        >
          {isError ? (
            <X className="h-8 w-8" />
          ) : isVerifying ? (
            <Loader2 className="h-8 w-8 animate-spin" />
          ) : isProcessing ? (
            <Clock className="h-8 w-8" />
          ) : (
            <CheckCircle2 className="h-8 w-8" />
          )}
        </div>
        <h2 className="mt-4 text-3xl font-black">
          {isError
            ? "Pago no confirmado"
            : isVerifying
              ? "Verificando el pago"
              : isProcessing
                ? "Pago en proceso"
                : "Pedido confirmado"}
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-sm font-semibold leading-6 text-matica-ink/65">
          {"message" in submitState ? submitState.message : "Estamos procesando tu pedido."}
        </p>
        {isSuccess ? (
          <>
            <p className="mx-auto mt-2 max-w-xl text-sm font-semibold leading-6 text-matica-ink/65">
              Recibirás un email de confirmación con el detalle del pedido.
            </p>
            <p className="mx-auto mt-2 max-w-xl text-sm font-semibold leading-6 text-matica-ink/65">
              Puedes cerrar esta página.
            </p>
          </>
        ) : null}
        {order?.id ? (
          <p className="mt-3 text-xs font-black uppercase text-matica-ink/45">Referencia {order.id.slice(0, 8)}</p>
        ) : null}
        {order && order.total > 0 ? <p className="mt-2 text-2xl font-black text-matica-green">{formatCurrency(order.total)}</p> : null}

        <div className="mt-5 rounded-lg border border-matica-line bg-matica-soft p-4 text-left">
          <div className="flex items-center gap-2 font-black">
            <CreditCard className="h-5 w-5 text-matica-green" />
            {isError
              ? "Pago no confirmado"
              : isVerifying
                ? "Verificación en curso"
                : isProcessing
                  ? "Confirmación pendiente"
                  : "Confirmación enviada"}
          </div>
          <p className="mt-1 text-sm font-semibold text-matica-ink/60">
            {isError
              ? "Si quieres finalizar el pedido, vuelve a la carta y repite el pago."
              : isVerifying
                ? "Esperaremos la confirmación del proveedor antes de enviar el pedido al equipo de Matica."
                : isProcessing
                  ? "No repetiremos el cobro. El servidor seguirá esperando la confirmación del proveedor."
                  : "El servidor ha confirmado el pago y el equipo de Matica ha recibido el aviso."}
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
