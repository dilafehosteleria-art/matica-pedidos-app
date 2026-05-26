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
  SlidersHorizontal,
  Utensils,
  X
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { DELIVERY_WINDOW } from "@/lib/constants";
import { formatCurrency } from "@/lib/format";
import { calculateCartTotals, getSubsidyAmount } from "@/lib/pricing";
import type { CartItem, CompanyBranch, CustomerForm, DailyMenu, Product, PublicData } from "@/lib/types";

const STORAGE_KEY_PREFIX = "matica:customer";

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

type MenuChoiceState = Record<string, Record<string, string>>;
type PublicStep = "catalog" | "checkout" | "confirmation";

type SectionKind =
  | "menus"
  | "daily_menu"
  | "half_menu"
  | "signature_bowls"
  | "custom_salad"
  | "wraps_signature"
  | "custom_wrap"
  | "grill"
  | "sandwiches"
  | "drinks"
  | "desserts"
  | "extras";

type PublicSection = {
  slug: string;
  title: string;
  tabLabel?: string;
  description: string;
  kind: SectionKind;
  products: Product[];
  configurable?: boolean;
};

type Option = {
  label: string;
  price?: number;
};

type ConfigGroup = {
  key: string;
  label: string;
  type: "single" | "multi";
  min?: number;
  max?: number;
  options: Option[];
};

type ConfigSpec = {
  title: string;
  lead: string;
  included: string[];
  groups: ConfigGroup[];
  notesPlaceholder?: string;
};

const COMPANY_SECTION_DEFINITIONS: Omit<PublicSection, "products">[] = [
  {
    slug: "menus",
    title: "Menús",
    tabLabel: "Menús",
    description: "Menú del día, medio menú y combinaciones rápidas.",
    kind: "menus"
  },
  {
    slug: "bowls-signature",
    title: "Matica Signature Bowls y Ensaladas",
    tabLabel: "Bowls",
    description: "Cuatro recetas signature y la ensalada a tu manera al final.",
    kind: "signature_bowls"
  },
  {
    slug: "wraps-signature",
    title: "Wraps Signature",
    tabLabel: "Wraps",
    description: "Cuatro wraps Matica y el wrap a tu manera al final.",
    kind: "wraps_signature"
  },
  {
    slug: "matica-grill",
    title: "Matica Grill",
    tabLabel: "Grill",
    description: "Plato combinado configurable con proteína, guarniciones y bebida o postre.",
    kind: "grill"
  },
  {
    slug: "bocadillos",
    title: "Bocadillos",
    tabLabel: "Bocadillos",
    description: "Elige entre los seis bocadillos disponibles.",
    kind: "sandwiches"
  },
  {
    slug: "bebidas",
    title: "Bebidas",
    tabLabel: "Bebidas",
    description: "Aguas y refrescos.",
    kind: "drinks"
  },
  {
    slug: "postres",
    title: "Postres",
    tabLabel: "Postres",
    description: "Dulces y fruta para cerrar el menú.",
    kind: "desserts"
  }
];

const CONFIG_SPECS: Partial<Record<SectionKind, ConfigSpec>> = {
  custom_salad: {
    title: "Ensalada a tu manera",
    lead: "Incluye 1 base, 1 proteína, hasta 4 toppings y 1 salsa.",
    included: ["Base", "Proteína", "4 toppings", "Salsa"],
    notesPlaceholder: "Sin cebolla, salsa aparte, alergias...",
    groups: [
      {
        key: "base",
        label: "Base",
        type: "single",
        options: [
          { label: "Mezclum" },
          { label: "Arroz integral" },
          { label: "Pasta fría" },
          { label: "Quinoa", price: 1 }
        ]
      },
      {
        key: "proteina",
        label: "Proteína",
        type: "single",
        options: [
          { label: "Pollo asado" },
          { label: "Atún" },
          { label: "Huevo cocido" },
          { label: "Heura", price: 1.5 },
          { label: "Salmón ahumado", price: 2.5 }
        ]
      },
      {
        key: "toppings",
        label: "Toppings",
        type: "multi",
        max: 4,
        options: [
          { label: "Tomate cherry" },
          { label: "Maíz" },
          { label: "Zanahoria" },
          { label: "Cebolla crujiente" },
          { label: "Aguacate", price: 1.5 },
          { label: "Queso feta", price: 1 }
        ]
      },
      {
        key: "salsa",
        label: "Salsa",
        type: "single",
        options: [
          { label: "Mostaza y miel" },
          { label: "César" },
          { label: "Yogur y lima" },
          { label: "Aceite y vinagre" }
        ]
      }
    ]
  },
  custom_wrap: {
    title: "Wrap a tu manera",
    lead: "Incluye 1 proteína, 1 base/relleno, hasta 3 toppings y 1 salsa.",
    included: ["Proteína", "Base/relleno", "3 toppings", "Salsa"],
    notesPlaceholder: "Tostado, sin picante, salsa aparte...",
    groups: [
      {
        key: "proteina",
        label: "Proteína",
        type: "single",
        options: [
          { label: "Pollo asado" },
          { label: "Atún" },
          { label: "Falafel" },
          { label: "Ternera grill", price: 2 },
          { label: "Heura", price: 1.5 }
        ]
      },
      {
        key: "relleno",
        label: "Base/relleno",
        type: "single",
        options: [
          { label: "Mezclum" },
          { label: "Arroz especiado" },
          { label: "Verduras grill" },
          { label: "Queso fundido", price: 0.8 }
        ]
      },
      {
        key: "toppings",
        label: "Toppings",
        type: "multi",
        max: 3,
        options: [
          { label: "Tomate" },
          { label: "Cebolla morada" },
          { label: "Maíz" },
          { label: "Jalapeños" },
          { label: "Aguacate", price: 1.5 }
        ]
      },
      {
        key: "salsa",
        label: "Salsa",
        type: "single",
        options: [
          { label: "Chipotle suave" },
          { label: "Yogur" },
          { label: "Mostaza y miel" },
          { label: "Sin salsa" }
        ]
      }
    ]
  },
  sandwiches: {
    title: "Elige tu bocadillo",
    lead: "Selecciona uno de los seis bocadillos disponibles.",
    included: ["Bocadillo"],
    groups: [
      {
        key: "bocadillo",
        label: "Bocadillo",
        type: "single",
        options: [
          { label: "Jamón serrano" },
          { label: "Tortilla francesa" },
          { label: "Atún con tomate" },
          { label: "Pollo braseado" },
          { label: "Lomo con queso" },
          { label: "Vegetal" }
        ]
      }
    ]
  },
  grill: {
    title: "Configura Matica Grill",
    lead: "Ajusta punto, guarnición y salsa.",
    included: ["Principal", "Guarnición básica", "Salsa"],
    notesPlaceholder: "Punto de la carne, sin salsa...",
    groups: [
      {
        key: "punto",
        label: "Punto",
        type: "single",
        options: [{ label: "Al punto" }, { label: "Muy hecho" }, { label: "Poco hecho" }]
      },
      {
        key: "guarnicion",
        label: "Guarnición",
        type: "single",
        options: [{ label: "Ensalada" }, { label: "Arroz" }, { label: "Patatas", price: 1 }]
      },
      {
        key: "salsa",
        label: "Salsa",
        type: "single",
        options: [{ label: "Chimichurri" }, { label: "Mostaza" }, { label: "Sin salsa" }]
      }
    ]
  },
  drinks: {
    title: "Bebida",
    lead: "Elige cómo quieres recibirla.",
    included: ["Bebida fría"],
    notesPlaceholder: "Con vaso, sin hielo...",
    groups: [
      {
        key: "temperatura",
        label: "Temperatura",
        type: "single",
        options: [{ label: "Fría" }, { label: "Natural" }]
      },
      {
        key: "extras",
        label: "Extras",
        type: "multi",
        max: 2,
        options: [{ label: "Vaso" }, { label: "Hielo" }, { label: "Limón" }]
      }
    ]
  },
  desserts: {
    title: "Postre",
    lead: "Ajustes rápidos para postres.",
    included: ["Postre individual"],
    notesPlaceholder: "Cuchara, para compartir...",
    groups: [
      {
        key: "servicio",
        label: "Servicio",
        type: "single",
        options: [{ label: "Con cuchara" }, { label: "Sin cubierto" }]
      },
      {
        key: "extras",
        label: "Extras",
        type: "multi",
        max: 2,
        options: [{ label: "Canela" }, { label: "Chocolate extra", price: 0.5 }]
      }
    ]
  }
};

const SANDWICH_CONFIG_SPEC: ConfigSpec = {
  title: "Elige tu bocadillo",
  lead: "Selecciona uno de los seis bocadillos disponibles.",
  included: ["Bocadillo"],
  groups: [
    {
      key: "bocadillo",
      label: "Bocadillo",
      type: "single",
      options: [
        { label: "Jamón serrano" },
        { label: "Tortilla francesa" },
        { label: "Atún con tomate" },
        { label: "Pollo braseado" },
        { label: "Lomo con queso" },
        { label: "Vegetal" }
      ]
    }
  ]
};

const GRILL_CONFIG_SPEC: ConfigSpec = {
  title: "Configura tu plato combinado",
  lead: "Elige 1 proteína, 2 guarniciones y bebida o postre.",
  included: ["Proteína", "2 guarniciones", "Bebida o postre"],
  notesPlaceholder: "Punto de la carne, sin salsa...",
  groups: [
    {
      key: "proteina",
      label: "Proteína",
      type: "single",
      options: [
        { label: "Pollo plancha" },
        { label: "Lomo de cerdo" },
        { label: "Filete de ternera", price: 1.5 },
        { label: "Hamburguesa" }
      ]
    },
    {
      key: "guarniciones",
      label: "Guarniciones",
      type: "multi",
      min: 2,
      max: 2,
      options: [
        { label: "Ensalada" },
        { label: "Arroz" },
        { label: "Patatas", price: 1 },
        { label: "Verduras grill" },
        { label: "Pasta fría" }
      ]
    },
    {
      key: "incluye",
      label: "Bebida o postre",
      type: "single",
      options: [
        { label: "Agua mineral" },
        { label: "Coca Cola" },
        { label: "Coca Cola Zero" },
        { label: "Yogur" },
        { label: "Fruta" }
      ]
    }
  ]
};

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function formatMetadataKey(key: string) {
  const labels: Record<string, string> = {
    first_course: "Primero",
    second_course: "Segundo",
    drink_or_dessert: "Incluye",
    plate: "Plato",
    display_name: "",
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

function getDefaultChoices(product: Product, menu: DailyMenu | null): Record<string, string> {
  if (product.product_type === "daily_menu") {
    return {
      first_course: menu?.first_courses[0] ?? "",
      second_course: menu?.second_courses[0] ?? "",
      drink_or_dessert: menu?.drinks[0] ?? menu?.desserts[0] ?? ""
    };
  }

  if (product.product_type === "half_menu") {
    return {
      plate: menu?.first_courses[0] ?? menu?.second_courses[0] ?? "",
      drink_or_dessert: menu?.drinks[0] ?? menu?.desserts[0] ?? ""
    };
  }

  return {};
}

function hasMenuChoices(product: Product, menu: DailyMenu | null) {
  if (product.product_type === "daily_menu") {
    return Boolean(menu?.first_courses.length && menu.second_courses.length && (menu.drinks.length || menu.desserts.length));
  }

  if (product.product_type === "half_menu") {
    return Boolean((menu?.first_courses.length || menu?.second_courses.length) && (menu?.drinks.length || menu?.desserts.length));
  }

  return true;
}

function optionGroup(menu: DailyMenu | null) {
  return [
    ...(menu?.drinks ?? []).map((value) => ({ label: `Bebida: ${value}`, value })),
    ...(menu?.desserts ?? []).map((value) => ({ label: `Postre: ${value}`, value }))
  ];
}

function getDisplayName(product: Product, kind: SectionKind) {
  if (kind === "custom_salad" || isCustomSaladProduct(product)) {
    return "Ensalada a tu manera";
  }

  if (kind === "custom_wrap" || isCustomWrapProduct(product)) {
    return "Wrap a tu manera";
  }

  return product.name;
}

function buildCartItem(
  product: Product,
  choices: Record<string, string>,
  displayName: string,
  supplementTotal = 0
): CartItem {
  const unitPrice = Number(product.base_price) + supplementTotal;

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

function getSupplementLabel(option: Option) {
  return option.price ? `${option.label} (+${formatCurrency(option.price)})` : option.label;
}

function getOptionPrice(spec: ConfigSpec, groupKey: string, optionLabel: string) {
  return spec.groups.find((group) => group.key === groupKey)?.options.find((option) => option.label === optionLabel)?.price ?? 0;
}

function getProductImageUrl(product: Product) {
  return product.image_url ?? (product as Product & { imageUrl?: string }).imageUrl ?? "";
}

function customLast(products: Product[], isCustomProduct: (product: Product) => boolean) {
  return [...products.filter((product) => !isCustomProduct(product)), ...products.filter(isCustomProduct)];
}

function singleConfiguratorProduct(products: Product[], preferredName: string) {
  const preferred = products.find((product) => normalize(product.name).includes(preferredName));

  return preferred ? [preferred] : products.slice(0, 1);
}

function isCustomSaladProduct(product: Product) {
  const name = normalize(product.name);

  return name.includes("disena tu ensalada") || name.includes("ensalada a tu manera");
}

function isCustomWrapProduct(product: Product) {
  const name = normalize(product.name);

  return name.includes("disena tu wrap") || name.includes("wrap a tu manera");
}

function isConfigurableProduct(product: Product, section: PublicSection) {
  return (
    isCustomSaladProduct(product) ||
    isCustomWrapProduct(product) ||
    section.kind === "grill" ||
    section.kind === "sandwiches" ||
    Boolean(section.configurable)
  );
}

function getConfigSpec(product: Product, section: PublicSection) {
  if (isCustomSaladProduct(product)) {
    return CONFIG_SPECS.custom_salad!;
  }

  if (isCustomWrapProduct(product)) {
    return CONFIG_SPECS.custom_wrap!;
  }

  if (section.kind === "grill") {
    return GRILL_CONFIG_SPEC;
  }

  if (section.kind === "sandwiches") {
    return SANDWICH_CONFIG_SPEC;
  }

  return (CONFIG_SPECS[section.kind] ?? CONFIG_SPECS.sandwiches)!;
}

export function BureauVeritasOrderApp({ companySlug = "bureau-veritas" }: { companySlug?: string }) {
  const [data, setData] = useState<PublicData | null>(null);
  const [step, setStep] = useState<PublicStep>("catalog");
  const [customer, setCustomer] = useState<CustomerForm>(EMPTY_CUSTOMER);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [notes, setNotes] = useState("");
  const [choices, setChoices] = useState<MenuChoiceState>({});
  const [configuring, setConfiguring] = useState<{ product: Product; section: PublicSection } | null>(null);
  const [subsidyAlreadyUsed, setSubsidyAlreadyUsed] = useState(false);
  const [submitState, setSubmitState] = useState<SubmitState>({ status: "idle" });
  const [customerLoaded, setCustomerLoaded] = useState(false);
  const [lastOrder, setLastOrder] = useState<{ id: string; total: number } | null>(null);
  const storageKey = `${STORAGE_KEY_PREFIX}:${companySlug}`;

  useEffect(() => {
    const stored = window.localStorage.getItem(storageKey);

    if (stored) {
      setCustomer({ ...EMPTY_CUSTOMER, ...JSON.parse(stored) });
    }

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
      window.localStorage.setItem(storageKey, JSON.stringify(customer));
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

  const publicSections = useMemo<PublicSection[]>(() => {
    if (!data) {
      return [];
    }

    const publicData = data;
    const categorySlugById = new Map(publicData.categories.map((category) => [category.id, category.slug]));
    const categoryProducts = (slug: string) =>
      publicData.products.filter((product) => categorySlugById.get(product.category_id) === slug);
    const bowlsAndSalads = categoryProducts("bowls-ensaladas");
    const wraps = categoryProducts("wraps-signature");

    function productsFor(kind: SectionKind) {
      switch (kind) {
        case "menus":
          return publicData.products.filter(
            (product) =>
              product.product_type === "daily_menu" ||
              product.product_type === "half_menu" ||
              ["menus", "menu-del-dia", "medio-menu"].includes(categorySlugById.get(product.category_id) ?? "")
          );
        case "daily_menu":
          return publicData.products.filter((product) => product.product_type === "daily_menu");
        case "half_menu":
          return publicData.products.filter((product) => product.product_type === "half_menu");
        case "signature_bowls":
          return customLast(bowlsAndSalads, isCustomSaladProduct);
        case "custom_salad":
          return bowlsAndSalads.filter((product) => normalize(product.name).includes("ensalada"));
        case "wraps_signature":
          return customLast(wraps, isCustomWrapProduct);
        case "custom_wrap":
          return wraps.filter((product) => normalize(product.name).includes("manera"));
        case "grill":
          return singleConfiguratorProduct(categoryProducts("matica-grill"), "plato combinado");
        case "sandwiches":
          return singleConfiguratorProduct(categoryProducts("bocadillos"), "bocadillo a elegir");
        case "drinks":
          return categoryProducts("bebidas").filter((product) => product.product_type !== "daily_menu");
        case "desserts":
          return categoryProducts("postres");
        case "extras":
          return categoryProducts("otros");
      }
    }

    return COMPANY_SECTION_DEFINITIONS.map((section) => ({
      ...section,
      products: productsFor(section.kind)
    })).filter((section) => section.products.length > 0);
  }, [data]);

  const totals = useMemo(() => calculateCartTotals(cart, subsidyAlreadyUsed), [cart, subsidyAlreadyUsed]);
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const hasSubsidizedItem = cart.some((item) => getSubsidyAmount(item.product_type) > 0);
  const companyName = data?.company.name ?? "tu empresa";
  const deliveryWindow = data?.company.delivery_window ?? DELIVERY_WINDOW;
  const canConfirmOrder =
    Boolean(customer.name.trim()) &&
    Boolean(customer.email.trim()) &&
    Boolean(customer.phone.trim()) &&
    Boolean(customer.company_branch_id) &&
    cart.length > 0;

  function updateCustomer(field: keyof CustomerForm, value: string) {
    setCustomer((current) => ({ ...current, [field]: value }));
  }

  function goToStep(nextStep: PublicStep) {
    setStep(nextStep);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function setProductChoice(product: Product, key: string, value: string) {
    setChoices((current) => ({
      ...current,
      [product.id]: {
        ...getDefaultChoices(product, data?.dailyMenu ?? null),
        ...(current[product.id] ?? {}),
        [key]: value
      }
    }));
  }

  function addProduct(product: Product, section: PublicSection, metadata?: Record<string, string>, supplementTotal = 0) {
    const productChoices =
      metadata ??
      ({
        ...getDefaultChoices(product, data?.dailyMenu ?? null),
        ...(choices[product.id] ?? {})
      } as Record<string, string>);
    const item = buildCartItem(product, productChoices, getDisplayName(product, section.kind), supplementTotal);

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

    if (!customer.name.trim() || !customer.email.trim() || !customer.phone.trim() || !customer.company_branch_id) {
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
    <main className="min-h-screen bg-matica-soft pb-16 text-matica-ink">
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
                <nav className="no-scrollbar min-w-0 flex-1 overflow-x-auto" aria-label="Categorías">
                  <div className="flex w-max gap-1.5 pr-1">
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
                  className="matica-focus flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-matica-green bg-white px-2.5 text-xs font-black text-matica-green shadow-sm sm:px-3"
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
            <div className="space-y-7">
              {publicSections.map((section) => (
                <section key={section.slug} id={section.slug} className="scroll-mt-24 space-y-3 sm:scroll-mt-28">
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-black">{section.title}</h2>
                      <p className="mt-1 text-sm font-semibold text-matica-ink/60">{section.description}</p>
                    </div>
                    {section.products.some((product) => isConfigurableProduct(product, section)) ? (
                      <span className="hidden rounded-lg bg-matica-mint px-3 py-1 text-xs font-black text-matica-green sm:inline">
                        Configurable
                      </span>
                    ) : null}
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {section.products.map((product) => (
                      <ProductCard
                        key={`${section.slug}-${product.id}`}
                        product={product}
                        section={section}
                        menu={data.dailyMenu}
                        choices={choices[product.id] ?? getDefaultChoices(product, data.dailyMenu)}
                        onChoiceChange={(key, value) => setProductChoice(product, key, value)}
                        onAdd={() =>
                          isConfigurableProduct(product, section)
                            ? setConfiguring({ product, section })
                            : addProduct(product, section)
                        }
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
          product={configuring.product}
          section={configuring.section}
          onClose={() => setConfiguring(null)}
          onAdd={(metadata, supplementTotal) => {
            addProduct(configuring.product, configuring.section, metadata, supplementTotal);
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
  type = "text"
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: string;
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
      />
    </label>
  );
}

function ProductCard({
  product,
  section,
  menu,
  choices,
  onChoiceChange,
  onAdd
}: {
  product: Product;
  section: PublicSection;
  menu: DailyMenu | null;
  choices: Record<string, string>;
  onChoiceChange: (key: string, value: string) => void;
  onAdd: () => void;
}) {
  const canAdd = !product.sold_out && hasMenuChoices(product, menu);
  const subsidy = getSubsidyAmount(product.product_type);
  const displayName = getDisplayName(product, section.kind);
  const configurable = isConfigurableProduct(product, section);
  const imageUrl = getProductImageUrl(product);
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <article className="overflow-hidden rounded-lg border border-matica-line bg-white shadow-sm">
      <div className="relative h-24 bg-matica-soft sm:h-32">
        {imageUrl && !imageFailed ? (
          <img
            className="h-full w-full object-cover"
            src={imageUrl}
            alt={displayName}
            onError={() => setImageFailed(true)}
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

      <div className="flex flex-col gap-2.5 p-2.5 sm:gap-3 sm:p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-black leading-5">{displayName}</h3>
          {product.description ? (
            <p className="mt-1 line-clamp-2 text-sm font-semibold leading-5 text-matica-ink/60">{product.description}</p>
          ) : null}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-base font-black">{formatCurrency(Number(product.customer_price))}</p>
          {subsidy > 0 ? (
            <p className="text-xs font-bold text-matica-ink/45 line-through">
              {formatCurrency(Number(product.base_price))}
            </p>
          ) : null}
        </div>
      </div>

      {product.product_type === "daily_menu" ? (
        <div className="grid gap-2">
          <ChoiceSelect
            label="Primer plato"
            value={choices.first_course ?? ""}
            options={menu?.first_courses.map((value) => ({ label: value, value })) ?? []}
            onChange={(value) => onChoiceChange("first_course", value)}
          />
          <ChoiceSelect
            label="Segundo plato"
            value={choices.second_course ?? ""}
            options={menu?.second_courses.map((value) => ({ label: value, value })) ?? []}
            onChange={(value) => onChoiceChange("second_course", value)}
          />
          <ChoiceSelect
            label="Bebida o postre"
            value={choices.drink_or_dessert ?? ""}
            options={optionGroup(menu)}
            onChange={(value) => onChoiceChange("drink_or_dessert", value)}
          />
        </div>
      ) : null}

      {product.product_type === "half_menu" ? (
        <div className="grid gap-2">
          <ChoiceSelect
            label="Plato"
            value={choices.plate ?? ""}
            options={[
              ...(menu?.first_courses ?? []).map((value) => ({ label: `Primero: ${value}`, value })),
              ...(menu?.second_courses ?? []).map((value) => ({ label: `Segundo: ${value}`, value }))
            ]}
            onChange={(value) => onChoiceChange("plate", value)}
          />
          <ChoiceSelect
            label="Bebida o postre"
            value={choices.drink_or_dessert ?? ""}
            options={optionGroup(menu)}
            onChange={(value) => onChoiceChange("drink_or_dessert", value)}
          />
        </div>
      ) : null}

      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
        {product.sold_out ? (
          <span className="rounded-lg bg-matica-ink/10 px-2 py-1.5 text-xs font-black text-matica-ink/60">Agotado</span>
        ) : subsidy > 0 ? (
          <span className="rounded-lg bg-matica-mint px-2 py-1.5 text-xs font-black text-matica-green">
            Subvención -{formatCurrency(subsidy)}
          </span>
        ) : configurable ? (
          <span className="flex items-center gap-1 text-xs font-bold text-matica-ink/50">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Personalizable
          </span>
        ) : (
          <span className="flex items-center gap-1 text-xs font-bold text-matica-ink/50">
            <Clock className="h-3.5 w-3.5" />
            Hoy
          </span>
        )}
        <button
          className="matica-focus flex min-h-9 items-center gap-1.5 rounded-lg bg-matica-green px-3 py-1.5 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-matica-ink/30"
          onClick={onAdd}
          disabled={!canAdd}
          type="button"
        >
          {configurable ? <SlidersHorizontal className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {configurable ? "Configurar" : "Añadir"}
        </button>
      </div>
      </div>
    </article>
  );
}

function ChoiceSelect({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: string;
  options: { label: string; value: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1">
      <span className="text-[11px] font-black uppercase text-matica-ink/45">{label}</span>
      <select
        className="matica-focus w-full rounded-lg border border-matica-line bg-white px-2.5 py-1.5 text-sm font-bold leading-tight"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.length ? null : <option value="">Menú pendiente</option>}
        {options.map((option) => (
          <option key={`${label}-${option.value}`} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ConfigModal({
  product,
  section,
  onClose,
  onAdd
}: {
  product: Product;
  section: PublicSection;
  onClose: () => void;
  onAdd: (metadata: Record<string, string>, supplementTotal: number) => void;
}) {
  const spec = getConfigSpec(product, section);
  const [singleValues, setSingleValues] = useState<Record<string, string>>(() =>
    Object.fromEntries((spec?.groups ?? []).filter((group) => group.type === "single").map((group) => [group.key, group.options[0]?.label ?? ""]))
  );
  const [multiValues, setMultiValues] = useState<Record<string, string[]>>({});
  const [configNotes, setConfigNotes] = useState("");

  const supplementTotal = spec.groups.reduce((sum, group) => {
    if (group.type === "single") {
      return sum + getOptionPrice(spec, group.key, singleValues[group.key] ?? "");
    }

    return (
      sum +
      (multiValues[group.key] ?? []).reduce((groupSum, optionLabel) => groupSum + getOptionPrice(spec, group.key, optionLabel), 0)
    );
  }, 0);
  const canSubmitConfig = spec.groups.every(
    (group) => group.type !== "multi" || !group.min || (multiValues[group.key] ?? []).length >= group.min
  );

  function toggleMulti(group: ConfigGroup, optionLabel: string) {
    setMultiValues((current) => {
      const selected = current[group.key] ?? [];

      if (selected.includes(optionLabel)) {
        return { ...current, [group.key]: selected.filter((value) => value !== optionLabel) };
      }

      if (group.max && selected.length >= group.max) {
        return current;
      }

      return { ...current, [group.key]: [...selected, optionLabel] };
    });
  }

  function submit() {
    if (!canSubmitConfig) {
      return;
    }

    const metadata: Record<string, string> = {
      display_name: getDisplayName(product, section.kind),
      categoria: section.title,
      _supplement_total: supplementTotal.toFixed(2)
    };

    for (const [key, value] of Object.entries(singleValues)) {
      metadata[key] = value;
    }

    for (const [key, value] of Object.entries(multiValues)) {
      metadata[key] = value.join(", ");
    }

    const supplements = spec.groups.flatMap((group) => {
      if (group.type === "single") {
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

    if (configNotes.trim()) {
      metadata.notas_configuracion = configNotes.trim();
    }

    onAdd(metadata, supplementTotal);
  }

  return (
    <div className="fixed inset-0 z-40 grid place-items-end bg-matica-ink/45 p-0 sm:place-items-center sm:p-4">
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-lg bg-white shadow-soft sm:max-w-2xl sm:rounded-lg">
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

        <div className="space-y-5 p-4">
          <div className="rounded-lg bg-matica-soft p-3">
            <p className="text-xs font-black uppercase text-matica-ink/45">Incluye</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {spec.included.map((item) => (
                <span key={item} className="rounded-lg bg-white px-3 py-1 text-sm font-bold text-matica-ink/70">
                  {item}
                </span>
              ))}
            </div>
          </div>

          {spec.groups.map((group) => (
            <fieldset key={group.key} className="space-y-2">
              <legend className="flex items-center gap-2 text-sm font-black uppercase text-matica-ink/55">
                {group.label}
                {group.type === "multi" && (group.min || group.max) ? (
                  <span className="text-xs font-bold normal-case text-matica-ink/45">
                    {group.min && group.max === group.min ? `elige ${group.min}` : group.max ? `máx. ${group.max}` : `mín. ${group.min}`}
                  </span>
                ) : null}
              </legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {group.options.map((option) => {
                  const checked =
                    group.type === "single"
                      ? singleValues[group.key] === option.label
                      : (multiValues[group.key] ?? []).includes(option.label);

                  return (
                    <label
                      key={`${group.key}-${option.label}`}
                      className={`flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm font-bold ${
                        checked ? "border-matica-green bg-matica-mint text-matica-green" : "border-matica-line bg-white text-matica-ink"
                      }`}
                    >
                      <span>{option.label}</span>
                      <span className="text-xs font-black">{option.price ? `+${formatCurrency(option.price)}` : "incluido"}</span>
                      <input
                        className="sr-only"
                        type={group.type === "single" ? "radio" : "checkbox"}
                        name={group.key}
                        checked={checked}
                        onChange={() =>
                          group.type === "single"
                            ? setSingleValues((current) => ({ ...current, [group.key]: option.label }))
                            : toggleMulti(group, option.label)
                        }
                      />
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ))}

          {spec.notesPlaceholder ? (
            <label className="block space-y-1">
              <span className="text-sm font-bold text-matica-ink/70">Notas de preparación</span>
              <textarea
                className="matica-focus min-h-20 w-full rounded-lg border border-matica-line px-3 py-3"
                value={configNotes}
                onChange={(event) => setConfigNotes(event.target.value)}
                placeholder={spec.notesPlaceholder}
              />
            </label>
          ) : null}
        </div>

        <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-matica-line bg-white p-4">
          <div>
            <p className="text-xs font-black uppercase text-matica-ink/45">Total producto</p>
            <p className="text-xl font-black">{formatCurrency(Number(product.base_price) + supplementTotal)}</p>
            {supplementTotal > 0 ? (
              <p className="text-xs font-bold text-matica-green">Suplementos: {formatCurrency(supplementTotal)}</p>
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
              <InputField label="Nombre" value={customer.name} onChange={(value) => updateCustomer("name", value)} placeholder="Nombre y apellidos" />
              <InputField
                label="Email corporativo"
                value={customer.email}
                onChange={(value) => updateCustomer("email", value)}
                placeholder="nombre@bureauveritas.com"
                type="email"
              />
              <InputField label="Teléfono" value={customer.phone} onChange={(value) => updateCustomer("phone", value)} placeholder="600 000 000" />
              <label className="space-y-1">
                <span className="text-sm font-bold text-matica-ink/70">Empresa</span>
                <select
                  className="matica-focus w-full rounded-lg border border-matica-line bg-white px-3 py-3"
                  value={customer.company_branch_id}
                  onChange={(event) => updateCustomer("company_branch_id", event.target.value)}
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
