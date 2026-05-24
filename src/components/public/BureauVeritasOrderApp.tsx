"use client";

import {
  CheckCircle2,
  Clock,
  Leaf,
  Loader2,
  Minus,
  Plus,
  ShoppingBag,
  Utensils
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { DELIVERY_WINDOW } from "@/lib/constants";
import { formatCurrency } from "@/lib/format";
import { calculateCartTotals, getSubsidyAmount } from "@/lib/pricing";
import type { CartItem, CustomerForm, DailyMenu, Product, PublicData } from "@/lib/types";

const STORAGE_KEY = "matica:bureau-veritas:customer";

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

type PublicSection = {
  slug: string;
  title: string;
  description: string;
  products: Product[];
};

function metadataLabel(metadata?: Record<string, string>) {
  if (!metadata) {
    return "";
  }

  return Object.entries(metadata)
    .filter(([, value]) => Boolean(value))
    .map(([key, value]) => {
      const label =
        key === "first_course"
          ? "Primero"
          : key === "second_course"
            ? "Segundo"
            : key === "plate"
              ? "Plato"
              : "Incluye";

      return `${label}: ${value}`;
    })
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

function buildCartItem(product: Product, choices: Record<string, string>): CartItem {
  return {
    key: `${product.id}:${JSON.stringify(choices)}`,
    product_id: product.id,
    name: product.name,
    quantity: 1,
    base_price: Number(product.base_price),
    customer_price: Number(product.customer_price),
    product_type: product.product_type,
    metadata: choices
  };
}

export function BureauVeritasOrderApp() {
  const [data, setData] = useState<PublicData | null>(null);
  const [customer, setCustomer] = useState<CustomerForm>(EMPTY_CUSTOMER);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [notes, setNotes] = useState("");
  const [choices, setChoices] = useState<MenuChoiceState>({});
  const [subsidyAlreadyUsed, setSubsidyAlreadyUsed] = useState(false);
  const [submitState, setSubmitState] = useState<SubmitState>({ status: "idle" });
  const [customerLoaded, setCustomerLoaded] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);

    if (stored) {
      setCustomer({ ...EMPTY_CUSTOMER, ...JSON.parse(stored) });
    }

    setCustomerLoaded(true);
  }, []);

  useEffect(() => {
    fetch("/api/public/bureau-veritas")
      .then((response) => response.json())
      .then((payload: PublicData) => {
        setData(payload);
      })
      .catch(() => {
        setSubmitState({
          status: "error",
          message: "No se pudo cargar la carta. Revisa la conexión e intenta de nuevo."
        });
      });
  }, []);

  useEffect(() => {
    if (customerLoaded) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(customer));
    }
  }, [customer, customerLoaded]);

  useEffect(() => {
    const email = customer.email.trim().toLowerCase();

    if (!email.includes("@")) {
      setSubsidyAlreadyUsed(false);
      return;
    }

    const timer = window.setTimeout(() => {
      fetch(`/api/subsidy-status?companySlug=bureau-veritas&email=${encodeURIComponent(email)}`)
        .then((response) => response.json())
        .then((payload: { used?: boolean }) => setSubsidyAlreadyUsed(Boolean(payload.used)))
        .catch(() => setSubsidyAlreadyUsed(false));
    }, 350);

    return () => window.clearTimeout(timer);
  }, [customer.email]);

  const publicSections = useMemo<PublicSection[]>(() => {
    if (!data) {
      return [];
    }

    return [
      {
        slug: "menu-del-dia",
        title: "Menú del día",
        description: "Primer plato, segundo plato y bebida o postre.",
        products: data.products.filter((product) => product.product_type === "daily_menu")
      },
      {
        slug: "medio-menu",
        title: "Medio menú",
        description: "Un plato a elegir con bebida o postre.",
        products: data.products.filter((product) => product.product_type === "half_menu")
      },
      {
        slug: "productos-rapidos",
        title: "Productos rápidos",
        description: "Opciones listas para completar el pedido.",
        products: data.products.filter(
          (product) => product.product_type !== "daily_menu" && product.product_type !== "half_menu"
        )
      }
    ];
  }, [data]);

  const totals = useMemo(() => calculateCartTotals(cart, subsidyAlreadyUsed), [cart, subsidyAlreadyUsed]);
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const hasSubsidizedItem = cart.some((item) => getSubsidyAmount(item.product_type) > 0);
  const canConfirmOrder =
    Boolean(customer.name.trim()) &&
    Boolean(customer.email.trim()) &&
    Boolean(customer.phone.trim()) &&
    Boolean(customer.company_branch_id) &&
    cart.length > 0;

  function updateCustomer(field: keyof CustomerForm, value: string) {
    setCustomer((current) => ({ ...current, [field]: value }));
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

  function addProduct(product: Product) {
    const productChoices = {
      ...getDefaultChoices(product, data?.dailyMenu ?? null),
      ...(choices[product.id] ?? {})
    };
    const item = buildCartItem(product, productChoices);

    setCart((current) => {
      const existing = current.find((cartItem) => cartItem.key === item.key);

      if (!existing) {
        return [...current, item];
      }

      return current.map((cartItem) =>
        cartItem.key === item.key ? { ...cartItem, quantity: cartItem.quantity + 1 } : cartItem
      );
    });
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
    setSubsidyAlreadyUsed(Boolean(payload.order?.prior_subsidy_used || payload.order?.subsidy_applied));
    setSubmitState({
      status: "success",
      message: `Pedido confirmado. Total: ${formatCurrency(Number(payload.order?.total ?? totals.total))}.`
    });
  }

  return (
    <main className="min-h-screen pb-28 text-matica-ink lg:pb-10">
      <header className="border-b border-matica-line bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-lg bg-matica-mint px-3 py-1 text-sm font-semibold text-matica-green">
              <Leaf className="h-4 w-4" />
              Matica Fresh Food
            </div>
            <h1 className="text-2xl font-black tracking-normal sm:text-4xl">
              Matica Fresh Food para Bureau Veritas
            </h1>
            <p className="mt-2 max-w-2xl text-base font-medium text-matica-ink/70">
              Haz tu pedido de 09:30 a 12:30. Entrega entre 13:00 y 13:30.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <div className="rounded-lg border border-matica-line bg-matica-soft px-4 py-3">
              <p className="text-xs font-bold uppercase text-matica-ink/50">Pedidos</p>
              <p className="font-black text-matica-green">09:30 - 12:30</p>
            </div>
            <div className="rounded-lg border border-matica-line bg-matica-soft px-4 py-3">
              <p className="text-xs font-bold uppercase text-matica-ink/50">Entrega</p>
              <p className="font-black text-matica-green">{DELIVERY_WINDOW}</p>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:px-8">
        <section className="space-y-5">
          <div className="flex items-start gap-3 rounded-lg border border-matica-green bg-white px-4 py-3 text-matica-green">
            <CheckCircle2 className="mt-0.5 h-5 w-5" />
            <p className="text-sm font-bold">
              Pedidos habilitados para el piloto. Completa tus datos y elige al menos un producto para confirmar.
            </p>
          </div>

          <section className="rounded-lg border border-matica-line bg-white p-4 shadow-soft">
            <h2 className="text-lg font-black">Tus datos</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="space-y-1">
                <span className="text-sm font-bold text-matica-ink/70">Nombre</span>
                <input
                  className="matica-focus w-full rounded-lg border border-matica-line px-3 py-3"
                  value={customer.name}
                  onChange={(event) => updateCustomer("name", event.target.value)}
                  placeholder="Nombre y apellidos"
                />
              </label>
              <label className="space-y-1">
                <span className="text-sm font-bold text-matica-ink/70">Correo corporativo</span>
                <input
                  className="matica-focus w-full rounded-lg border border-matica-line px-3 py-3"
                  type="email"
                  value={customer.email}
                  onChange={(event) => updateCustomer("email", event.target.value)}
                  placeholder="nombre@bureauveritas.com"
                />
              </label>
              <label className="space-y-1">
                <span className="text-sm font-bold text-matica-ink/70">Teléfono</span>
                <input
                  className="matica-focus w-full rounded-lg border border-matica-line px-3 py-3"
                  value={customer.phone}
                  onChange={(event) => updateCustomer("phone", event.target.value)}
                  placeholder="600 000 000"
                />
              </label>
              <label className="space-y-1">
                <span className="text-sm font-bold text-matica-ink/70">Empresa</span>
                <select
                  className="matica-focus w-full rounded-lg border border-matica-line bg-white px-3 py-3"
                  value={customer.company_branch_id}
                  onChange={(event) => updateCustomer("company_branch_id", event.target.value)}
                >
                  <option value="">Selecciona empresa</option>
                  {(data?.branches ?? []).map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          {data ? (
            <nav className="sticky top-0 z-20 -mx-4 overflow-x-auto border-y border-matica-line bg-matica-soft/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:rounded-lg lg:border lg:bg-white lg:px-3">
              <div className="flex min-w-max gap-2">
                {publicSections.map((section) => (
                  <a
                    key={section.slug}
                    className="matica-focus rounded-lg border border-matica-line bg-white px-4 py-2 text-sm font-black text-matica-ink transition hover:border-matica-green hover:text-matica-green"
                    href={`#${section.slug}`}
                  >
                    {section.title}
                  </a>
                ))}
              </div>
            </nav>
          ) : null}

          {!data ? (
            <div className="flex min-h-72 items-center justify-center rounded-lg border border-matica-line bg-white">
              <Loader2 className="h-7 w-7 animate-spin text-matica-green" />
            </div>
          ) : (
            <div className="space-y-6">
              {publicSections.map((section) => (
                <section key={section.slug} id={section.slug} className="scroll-mt-24 space-y-3">
                  <div>
                    <h2 className="text-xl font-black">{section.title}</h2>
                    <p className="mt-1 text-sm font-semibold text-matica-ink/60">{section.description}</p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {section.products.map((product) => (
                      <ProductCard
                        key={product.id}
                        product={product}
                        menu={data.dailyMenu}
                        choices={choices[product.id] ?? getDefaultChoices(product, data.dailyMenu)}
                        onChoiceChange={(key, value) => setProductChoice(product, key, value)}
                        onAdd={() => addProduct(product)}
                      />
                    ))}
                    {!section.products.length ? (
                      <div className="rounded-lg border border-dashed border-matica-line bg-white p-6 text-sm font-semibold text-matica-ink/50">
                        No hay productos disponibles en este momento.
                      </div>
                    ) : null}
                  </div>
                </section>
              ))}
            </div>
          )}
        </section>

        <aside id="cart" className="h-fit rounded-lg border border-matica-line bg-white p-4 shadow-soft lg:sticky lg:top-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-black">Carrito</h2>
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
                    <div>
                      <p className="font-black">{item.name}</p>
                      <p className="mt-1 text-xs font-semibold leading-5 text-matica-ink/55">{metadataLabel(item.metadata)}</p>
                    </div>
                    <p className="font-black">{formatCurrency(item.base_price * item.quantity)}</p>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button
                        className="matica-focus grid h-10 w-10 place-items-center rounded-lg border border-matica-line bg-white"
                        onClick={() => changeQuantity(item.key, -1)}
                        aria-label={`Quitar ${item.name}`}
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="w-8 text-center font-black">{item.quantity}</span>
                      <button
                        className="matica-focus grid h-10 w-10 place-items-center rounded-lg border border-matica-line bg-white"
                        onClick={() => changeQuantity(item.key, 1)}
                        aria-label={`Añadir ${item.name}`}
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

          <div className="mt-4 space-y-2 rounded-lg bg-matica-soft p-3">
            <div className="flex justify-between text-sm font-bold">
              <span>Subtotal</span>
              <span>{formatCurrency(totals.subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm font-bold text-matica-green">
              <span>Subvención Bureau Veritas</span>
              <span>-{formatCurrency(totals.subsidyTotal)}</span>
            </div>
            <div className="flex justify-between border-t border-matica-line pt-2 text-lg font-black">
              <span>Total</span>
              <span>{formatCurrency(totals.total)}</span>
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
          {submitState.status === "success" ? (
            <div className="mt-3 rounded-lg border border-matica-green bg-matica-mint p-3 text-sm font-bold text-matica-green">
              {submitState.message}
            </div>
          ) : null}

          <button
            className="matica-focus mt-4 flex min-h-14 w-full items-center justify-center gap-2 rounded-lg bg-matica-green px-4 py-3 text-base font-black text-white disabled:cursor-not-allowed disabled:bg-matica-ink/30"
            disabled={submitState.status === "loading" || !canConfirmOrder}
            onClick={submitOrder}
          >
            {submitState.status === "loading" ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
            Confirmar pedido
          </button>
        </aside>
      </div>

      <a
        href="#cart"
        className="matica-focus fixed inset-x-3 bottom-3 z-30 flex items-center justify-between rounded-lg bg-matica-ink px-4 py-3 text-white shadow-soft lg:hidden"
      >
        <span className="flex items-center gap-2 font-black">
          <ShoppingBag className="h-5 w-5" />
          Carrito · {cartCount}
        </span>
        <span className="font-black">{formatCurrency(totals.total)}</span>
      </a>
    </main>
  );
}

function ProductCard({
  product,
  menu,
  choices,
  onChoiceChange,
  onAdd
}: {
  product: Product;
  menu: DailyMenu | null;
  choices: Record<string, string>;
  onChoiceChange: (key: string, value: string) => void;
  onAdd: () => void;
}) {
  const canAdd = !product.sold_out && hasMenuChoices(product, menu);
  const subsidy = getSubsidyAmount(product.product_type);

  return (
    <article className="rounded-lg border border-matica-line bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-black">{product.name}</h3>
          {product.description ? (
            <p className="mt-1 text-sm font-semibold leading-5 text-matica-ink/60">{product.description}</p>
          ) : null}
        </div>
        <div className="text-right">
          <p className="text-lg font-black">{formatCurrency(Number(product.customer_price))}</p>
          {subsidy > 0 ? (
            <p className="text-xs font-bold text-matica-ink/45 line-through">
              {formatCurrency(Number(product.base_price))}
            </p>
          ) : null}
        </div>
      </div>

      {product.product_type === "daily_menu" ? (
        <div className="mt-4 grid gap-2">
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
        <div className="mt-4 grid gap-2">
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

      <div className="mt-4 flex items-center justify-between gap-3">
        {product.sold_out ? (
          <span className="rounded-lg bg-matica-ink/10 px-3 py-2 text-sm font-black text-matica-ink/60">Agotado</span>
        ) : subsidy > 0 ? (
          <span className="rounded-lg bg-matica-mint px-3 py-2 text-sm font-black text-matica-green">
            Bureau Veritas -{formatCurrency(subsidy)}
          </span>
        ) : (
          <span className="flex items-center gap-1 text-sm font-bold text-matica-ink/50">
            <Clock className="h-4 w-4" />
            Hoy
          </span>
        )}
        <button
          className="matica-focus flex min-h-11 items-center gap-2 rounded-lg bg-matica-green px-4 py-2 font-black text-white disabled:cursor-not-allowed disabled:bg-matica-ink/30"
          onClick={onAdd}
          disabled={!canAdd}
        >
          <Plus className="h-4 w-4" />
          Añadir
        </button>
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
      <span className="text-xs font-black uppercase text-matica-ink/45">{label}</span>
      <select
        className="matica-focus w-full rounded-lg border border-matica-line bg-white px-3 py-2 text-sm font-bold"
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
