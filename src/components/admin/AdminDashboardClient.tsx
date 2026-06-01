"use client";

import { AlertCircle, Building2, CalendarDays, ClipboardList, Clock, FileSpreadsheet, Loader2, Package, RefreshCw, Utensils } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminGate } from "./AdminGate";
import { ReportsPanel } from "./ReportsPanel";
import { formatCurrency, formatTime } from "@/lib/format";
import type { AdminOrder, OrderStatus } from "@/lib/types";

const DAILY_COLUMNS: { key: string; statuses: OrderStatus[]; title: string }[] = [
  { key: "nuevo", statuses: ["nuevo", "pendiente_pago"], title: "Nuevos" },
  { key: "preparando", statuses: ["preparando"], title: "En preparación" },
  { key: "listo", statuses: ["listo"], title: "Listos" },
  { key: "entregado", statuses: ["entregado"], title: "Entregados" },
  { key: "cancelado", statuses: ["cancelado"], title: "Cancelados" }
];

const ORDER_STATUS_OPTIONS: { status: OrderStatus; label: string }[] = [
  { status: "nuevo", label: "Nuevo" },
  { status: "preparando", label: "En preparación" },
  { status: "listo", label: "Listo" },
  { status: "entregado", label: "Entregado" },
  { status: "cancelado", label: "Cancelado" }
];

const DASHBOARD_LINKS = [
  {
    href: "/admin/pedidos",
    title: "Pedidos",
    description: "Operativa diaria, estados y preparación.",
    icon: ClipboardList
  },
  {
    href: "/admin/informes",
    title: "Informes",
    description: "Facturación, resumen y Excel por rango.",
    icon: FileSpreadsheet
  },
  {
    href: "/admin/companies",
    title: "Empresas",
    description: "Clientes principales y empresas internas.",
    icon: Building2
  },
  {
    href: "/admin/menu",
    title: "Menú del día",
    description: "Platos diarios y exclusiones de medio menú.",
    icon: Utensils
  },
  {
    href: "/admin/products",
    title: "Productos",
    description: "Carta, precios, imágenes y disponibilidad.",
    icon: Package
  }
];

function formatMetadataKey(key: string) {
  const labels: Record<string, string> = {
    categoria: "Categoría",
    first_course: "Primero",
    second_course: "Segundo",
    side: "Guarnición",
    sides: "Guarnición",
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
    drink: "Bebida",
    dessert: "Postre",
    bread: "Pan",
    suplementos: "Suplementos"
  };

  return labels[key] ?? key.replaceAll("_", " ").replace(/^\w/, (letter) => letter.toUpperCase());
}

function formatMetadata(metadata?: Record<string, string>) {
  if (!metadata) {
    return "";
  }

  return Object.entries(metadata)
    .filter(([key, value]) => Boolean(value) && !key.startsWith("_") && key !== "display_name")
    .map(([key, value]) => `${formatMetadataKey(key)}: ${value}`)
    .join(" · ");
}

export function AdminDashboardClient() {
  return (
    <AdminGate title="Panel de administración" subtitle="Accesos separados para operar, facturar y mantener la carta.">
      {() => <AdminHome />}
    </AdminGate>
  );
}

export function AdminOrdersClient() {
  return (
    <AdminGate title="Pedidos" subtitle="Operativa diaria por estado, con refresco automático.">
      {(pin, clearPin) => <OrdersBoard pin={pin} clearPin={clearPin} />}
    </AdminGate>
  );
}

export function AdminReportsClient() {
  return (
    <AdminGate title="Informes" subtitle="Facturación por rango de fechas, cliente y empresa interna.">
      {(pin, clearPin) => <AdminReportsContent pin={pin} clearPin={clearPin} />}
    </AdminGate>
  );
}

function AdminReportsContent({ pin, clearPin }: { pin: string; clearPin: () => void }) {
  const headers = useMemo(() => ({ "x-admin-pin": pin }), [pin]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
      <ReportsPanel endpoint="/api/admin/orders/report" authHeaders={headers} onUnauthorized={clearPin} />
    </div>
  );
}

function AdminHome() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="rounded-lg border border-matica-line bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-lg bg-matica-mint text-matica-green">
            <CalendarDays className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-matica-ink">Elige una sección</h2>
            <p className="mt-1 max-w-3xl text-sm font-semibold leading-6 text-matica-ink/60">
              Pedidos e informes quedan separados para evitar mezclar la operativa diaria con la facturación.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {DASHBOARD_LINKS.map((item) => {
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              className="matica-focus rounded-lg border border-matica-line bg-white p-5 shadow-sm transition hover:border-matica-green hover:-translate-y-0.5"
              href={item.href}
            >
              <div className="grid h-11 w-11 place-items-center rounded-lg bg-matica-mint text-matica-green">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-xl font-black text-matica-ink">{item.title}</h3>
              <p className="mt-1 text-sm font-semibold leading-6 text-matica-ink/60">{item.description}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function OrdersBoard({ pin, clearPin }: { pin: string; clearPin: () => void }) {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatingId, setUpdatingId] = useState("");
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const loadOrders = useCallback(async () => {
    const response = await fetch("/api/admin/orders", {
      headers: { "x-admin-pin": pin }
    });
    const payload = await response.json();

    if (response.status === 401) {
      clearPin();
      return;
    }

    if (!response.ok) {
      setError(payload.error ?? "No se pudieron cargar los pedidos.");
      setLoading(false);
      return;
    }

    setOrders(payload.orders ?? []);
    setError("");
    setLoading(false);
    setLastRefresh(new Date());
  }, [clearPin, pin]);

  useEffect(() => {
    loadOrders();
    const timer = window.setInterval(loadOrders, 5000);

    return () => window.clearInterval(timer);
  }, [loadOrders]);

  async function updateStatus(orderId: string, status: OrderStatus) {
    setUpdatingId(orderId);
    const response = await fetch(`/api/admin/orders/${orderId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-admin-pin": pin
      },
      body: JSON.stringify({ status })
    });
    const payload = await response.json();
    setUpdatingId("");

    if (!response.ok) {
      setError(payload.error ?? "No se pudo actualizar el pedido.");
      return;
    }

    setOrders((current) => current.map((order) => (order.id === orderId ? payload.order : order)));
  }

  const grouped = useMemo(() => {
    return DAILY_COLUMNS.reduce<Record<string, AdminOrder[]>>((acc, column) => {
      acc[column.key] = orders.filter((order) => column.statuses.includes(order.status));
      return acc;
    }, {});
  }, [orders]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
      <div className="mb-4 flex flex-col gap-3 rounded-lg border border-matica-line bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-bold text-matica-ink/60">
            <RefreshCw className="h-4 w-4 text-matica-green" />
            Refresco automático cada 5 segundos
          </div>
          {lastRefresh ? (
            <p className="mt-1 text-sm font-semibold text-matica-ink/55">Última actualización: {formatTime(lastRefresh)}</p>
          ) : null}
        </div>
        <button
          className="matica-focus flex min-h-11 items-center justify-center gap-2 rounded-lg bg-matica-green px-4 font-black text-white"
          onClick={loadOrders}
          type="button"
        >
          <RefreshCw className="h-4 w-4" />
          Actualizar
        </button>
      </div>

      {error ? (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
          <AlertCircle className="mt-0.5 h-5 w-5" />
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="grid min-h-72 place-items-center rounded-lg border border-matica-line bg-white">
          <Loader2 className="h-7 w-7 animate-spin text-matica-green" />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-5">
          {DAILY_COLUMNS.map((column) => (
            <section key={column.key} className="rounded-lg border border-matica-line bg-white p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-lg font-black">{column.title}</h2>
                <span className="rounded-lg bg-matica-mint px-2 py-1 text-sm font-black text-matica-green">
                  {grouped[column.key]?.length ?? 0}
                </span>
              </div>
              <div className="space-y-3">
                {(grouped[column.key] ?? []).map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    updating={updatingId === order.id}
                    onStatusChange={(status) => updateStatus(order.id, status)}
                  />
                ))}
                {!grouped[column.key]?.length ? (
                  <div className="rounded-lg border border-dashed border-matica-line bg-matica-soft p-5 text-center text-sm font-bold text-matica-ink/45">
                    Sin pedidos
                  </div>
                ) : null}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function OrderCard({
  order,
  updating,
  onStatusChange
}: {
  order: AdminOrder;
  updating: boolean;
  onStatusChange: (status: OrderStatus) => void;
}) {
  const companyName = order.companies?.name ?? "Cliente principal";
  const branchName = order.company_branches?.name ?? "Sin empresa interna";

  return (
    <article className="rounded-lg border border-matica-line bg-matica-soft p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-black">{order.customer_name}</h3>
          <p className="text-xs font-bold text-matica-green">Empresa interna: {branchName}</p>
          <p className="text-xs font-semibold text-matica-ink/45">Cliente principal: {companyName}</p>
        </div>
        <span className="flex items-center gap-1 rounded-lg bg-white px-2 py-1 text-sm font-black">
          <Clock className="h-4 w-4 text-matica-green" />
          {formatTime(order.created_at)}
        </span>
      </div>

      <div className="mt-3 space-y-1 text-sm font-semibold text-matica-ink/70">
        <p>{order.customer_phone}</p>
        <p className="break-all">{order.customer_email}</p>
      </div>

      <div className="mt-3 space-y-2">
        {order.order_items.map((item) => (
          <div key={item.id} className="rounded-lg bg-white p-2">
            <div className="flex justify-between gap-2 text-sm font-black">
              <span>
                {item.quantity}x {item.name}
              </span>
              <span>{formatCurrency(Number(item.total_price))}</span>
            </div>
            {item.metadata ? (
              <p className="mt-1 text-xs font-semibold leading-5 text-matica-ink/55">
                {formatMetadata(item.metadata)}
              </p>
            ) : null}
          </div>
        ))}
      </div>

      {order.notes ? (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2 text-sm font-bold text-amber-900">
          {order.notes}
        </div>
      ) : null}

      <div className="mt-3 space-y-1 rounded-lg bg-white p-2 text-sm font-bold">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>{formatCurrency(Number(order.subtotal))}</span>
        </div>
        <div className="flex justify-between text-matica-green">
          <span>Subvención</span>
          <span>-{formatCurrency(Number(order.subsidy_total))}</span>
        </div>
        <div className="flex justify-between">
          <span>Factura empresa</span>
          <span>{formatCurrency(Number(order.subsidy_total))}</span>
        </div>
        <div className="flex justify-between border-t border-matica-line pt-1 text-base font-black">
          <span>Total empleado</span>
          <span>{formatCurrency(Number(order.total))}</span>
        </div>
      </div>

      <label className="mt-3 block space-y-1">
        <span className="text-xs font-black uppercase text-matica-ink/45">Estado</span>
        <select
          className="matica-focus w-full rounded-lg border border-matica-line bg-white px-3 py-3 text-sm font-black disabled:cursor-wait disabled:bg-matica-ink/10"
          value={order.status === "pendiente_pago" ? "nuevo" : order.status}
          disabled={updating}
          onChange={(event) => onStatusChange(event.target.value as OrderStatus)}
        >
          {ORDER_STATUS_OPTIONS.map((option) => (
            <option key={option.status} value={option.status}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      {updating ? <p className="mt-2 text-xs font-bold text-matica-ink/50">Actualizando estado...</p> : null}
    </article>
  );
}
