"use client";

import { AlertCircle, Building2, CalendarDays, ClipboardList, Clock, Eye, FileSpreadsheet, Loader2, Package, Printer, RefreshCw, X, Utensils } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminGate } from "./AdminGate";
import { ReportsPanel } from "./ReportsPanel";
import { formatCurrency, formatTime } from "@/lib/format";
import { formatOrderDateTime, ORDER_STATUS_LABELS, orderItemOptionLines, orderReference } from "@/lib/order-ticket";
import { operationalPaymentLabel } from "@/lib/payment-display";
import type { AdminOrder, OrderStatus } from "@/lib/types";

const DAILY_COLUMNS: { key: string; statuses: OrderStatus[]; title: string }[] = [
  { key: "nuevo", statuses: ["nuevo"], title: "Nuevos" },
  { key: "preparando", statuses: ["preparando"], title: "En preparación" },
  { key: "listo", statuses: ["listo"], title: "Listos" },
  { key: "cancelado", statuses: ["cancelado"], title: "Cancelados" }
];

const ORDER_STATUS_OPTIONS: { status: OrderStatus; label: string }[] = [
  { status: "nuevo", label: "Nuevo" },
  { status: "preparando", label: "En preparación" },
  { status: "listo", label: "Listo" },
  { status: "entregado", label: "Entregado" },
  { status: "cancelado", label: "Cancelado" }
];

type OrdersView = "daily" | "history";

type HistoryFilters = {
  date_from: string;
  date_to: string;
  status: string;
  customer: string;
  branch: string;
  reference: string;
};

const STATUS_THEME: Record<OrderStatus, { card: string; panel: string; badge: string; count: string }> = {
  pendiente_pago: {
    card: "border-l-4 border-l-matica-green",
    panel: "border-matica-line bg-matica-soft",
    badge: "bg-matica-mint text-matica-green",
    count: "bg-matica-mint text-matica-green"
  },
  nuevo: {
    card: "border-l-4 border-l-matica-green",
    panel: "border-matica-line bg-matica-soft",
    badge: "bg-matica-mint text-matica-green",
    count: "bg-matica-mint text-matica-green"
  },
  preparando: {
    card: "border-l-4 border-l-amber-500",
    panel: "border-amber-200 bg-amber-50",
    badge: "bg-amber-100 text-amber-800",
    count: "bg-amber-100 text-amber-800"
  },
  listo: {
    card: "border-l-4 border-l-emerald-600",
    panel: "border-emerald-200 bg-emerald-50",
    badge: "bg-emerald-600 text-white",
    count: "bg-emerald-600 text-white"
  },
  entregado: {
    card: "border-l-4 border-l-slate-400",
    panel: "border-slate-200 bg-slate-50",
    badge: "bg-slate-200 text-slate-700",
    count: "bg-slate-200 text-slate-700"
  },
  cancelado: {
    card: "border-l-4 border-l-red-500",
    panel: "border-red-200 bg-red-50",
    badge: "bg-red-100 text-red-700",
    count: "bg-red-100 text-red-700"
  }
};

function todayInputValue() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Europe/Madrid",
    year: "numeric"
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";

  return `${get("year")}-${get("month")}-${get("day")}`;
}

function emptyHistoryFilters(): HistoryFilters {
  const today = todayInputValue();
  const [year, month] = today.split("-");

  return {
    date_from: `${year}-${month}-01`,
    date_to: today,
    status: "",
    customer: "",
    branch: "",
    reference: ""
  };
}

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
  const [view, setView] = useState<OrdersView>("daily");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatingId, setUpdatingId] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<AdminOrder | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [historyFilters, setHistoryFilters] = useState<HistoryFilters>(() => emptyHistoryFilters());
  const [historyOrders, setHistoryOrders] = useState<AdminOrder[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historySearched, setHistorySearched] = useState(false);

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

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    const params = new URLSearchParams({ mode: "history" });

    Object.entries(historyFilters).forEach(([key, value]) => {
      if (value.trim()) {
        params.set(key, value.trim());
      }
    });

    const response = await fetch(`/api/admin/orders?${params.toString()}`, {
      headers: { "x-admin-pin": pin }
    });
    const payload = await response.json();
    setHistoryLoading(false);

    if (response.status === 401) {
      clearPin();
      return;
    }

    if (!response.ok) {
      setError(payload.error ?? "No se pudo cargar el histórico.");
      setHistorySearched(false);
      return;
    }

    setHistoryOrders(payload.orders ?? []);
    setHistorySearched(true);
    setError("");
  }, [clearPin, historyFilters, pin]);

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
    setHistoryOrders((current) => current.map((order) => (order.id === orderId ? payload.order : order)));
    setSelectedOrder((current) => (current?.id === orderId ? payload.order : current));
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

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          className={`matica-focus min-h-11 rounded-lg px-4 text-sm font-black ${
            view === "daily" ? "bg-matica-green text-white" : "border border-matica-line bg-white text-matica-ink"
          }`}
          onClick={() => setView("daily")}
          type="button"
        >
          Operativa diaria
        </button>
        <button
          className={`matica-focus min-h-11 rounded-lg px-4 text-sm font-black ${
            view === "history" ? "bg-matica-green text-white" : "border border-matica-line bg-white text-matica-ink"
          }`}
          onClick={() => setView("history")}
          type="button"
        >
          Histórico
        </button>
      </div>

      {view === "daily" && loading ? (
        <div className="grid min-h-72 place-items-center rounded-lg border border-matica-line bg-white">
          <Loader2 className="h-7 w-7 animate-spin text-matica-green" />
        </div>
      ) : null}

      {view === "daily" && !loading ? (
        <div className="space-y-5">
          {DAILY_COLUMNS.map((column) => (
            <section key={column.key} className="rounded-lg border border-matica-line bg-white p-3 sm:p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-lg font-black">{column.title}</h2>
                <span className={`rounded-lg px-2 py-1 text-sm font-black ${STATUS_THEME[column.statuses[0]].count}`}>
                  {grouped[column.key]?.length ?? 0}
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {(grouped[column.key] ?? []).map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    updating={updatingId === order.id}
                    onStatusChange={(status) => updateStatus(order.id, status)}
                    onOpen={() => setSelectedOrder(order)}
                  />
                ))}
                {!grouped[column.key]?.length ? (
                  <div className="col-span-full rounded-lg border border-dashed border-matica-line bg-matica-soft p-5 text-center text-sm font-bold text-matica-ink/45">
                    Sin pedidos
                  </div>
                ) : null}
              </div>
            </section>
          ))}
        </div>
      ) : null}

      {view === "history" ? (
        <section className="rounded-lg border border-matica-line bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-black text-matica-ink">Histórico de pedidos</h2>
            <p className="text-sm font-semibold text-matica-ink/55">
              Busca entregados y pedidos antiguos sin llenar la pantalla operativa diaria.
            </p>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            <HistoryInput
              label="Fecha desde"
              type="date"
              value={historyFilters.date_from}
              onChange={(value) => setHistoryFilters((current) => ({ ...current, date_from: value }))}
            />
            <HistoryInput
              label="Fecha hasta"
              type="date"
              value={historyFilters.date_to}
              onChange={(value) => setHistoryFilters((current) => ({ ...current, date_to: value }))}
            />
            <label className="space-y-1">
              <span className="text-xs font-black uppercase text-matica-ink/45">Estado</span>
              <select
                className="matica-focus w-full rounded-lg border border-matica-line bg-white px-3 py-3 text-sm font-bold"
                value={historyFilters.status}
                onChange={(event) => setHistoryFilters((current) => ({ ...current, status: event.target.value }))}
              >
                <option value="">Todos</option>
                {ORDER_STATUS_OPTIONS.map((option) => (
                  <option key={option.status} value={option.status}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <HistoryInput
              label="Cliente"
              value={historyFilters.customer}
              onChange={(value) => setHistoryFilters((current) => ({ ...current, customer: value }))}
            />
            <HistoryInput
              label="Empresa interna"
              value={historyFilters.branch}
              onChange={(value) => setHistoryFilters((current) => ({ ...current, branch: value }))}
            />
            <HistoryInput
              label="Referencia"
              value={historyFilters.reference}
              onChange={(value) => setHistoryFilters((current) => ({ ...current, reference: value }))}
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              className="matica-focus inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-matica-green px-4 text-sm font-black text-white disabled:cursor-wait disabled:opacity-60"
              onClick={loadHistory}
              disabled={historyLoading}
              type="button"
            >
              {historyLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Buscar
            </button>
            <button
              className="matica-focus min-h-11 rounded-lg border border-matica-line bg-white px-4 text-sm font-black text-matica-ink"
              onClick={() => {
                setHistoryFilters(emptyHistoryFilters());
                setHistoryOrders([]);
                setHistorySearched(false);
              }}
              type="button"
            >
              Limpiar
            </button>
          </div>

          <div className="mt-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-black">Resultados</h3>
              <span className="rounded-lg bg-matica-mint px-2 py-1 text-sm font-black text-matica-green">
                {historyOrders.length}
              </span>
            </div>
            {historySearched && !historyOrders.length && !historyLoading ? (
              <div className="rounded-lg border border-dashed border-matica-line bg-matica-soft p-5 text-center text-sm font-bold text-matica-ink/45">
                No hay pedidos con esos filtros.
              </div>
            ) : null}
            {historyOrders.length ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {historyOrders.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    updating={updatingId === order.id}
                    onStatusChange={(status) => updateStatus(order.id, status)}
                    onOpen={() => setSelectedOrder(order)}
                  />
                ))}
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {selectedOrder ? (
        <OrderDetailModal
          order={selectedOrder}
          updating={updatingId === selectedOrder.id}
          onClose={() => setSelectedOrder(null)}
          onStatusChange={(status) => updateStatus(selectedOrder.id, status)}
        />
      ) : null}
    </div>
  );
}

function HistoryInput({
  label,
  onChange,
  type = "text",
  value
}: {
  label: string;
  onChange: (value: string) => void;
  type?: "date" | "text";
  value: string;
}) {
  return (
    <label className="space-y-1">
      <span className="text-xs font-black uppercase text-matica-ink/45">{label}</span>
      <input
        className="matica-focus w-full rounded-lg border border-matica-line bg-white px-3 py-3 text-sm font-bold"
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function OrderCard({
  order,
  updating,
  onStatusChange,
  onOpen
}: {
  order: AdminOrder;
  updating: boolean;
  onStatusChange: (status: OrderStatus) => void;
  onOpen: () => void;
}) {
  const branchName = order.company_branches?.name ?? "Sin empresa interna";
  const theme = STATUS_THEME[order.status] ?? STATUS_THEME.nuevo;

  return (
    <article className={`rounded-lg border border-matica-line bg-white p-3 shadow-sm ${theme.card}`}>
      <div className={`rounded-lg border border-dashed p-3 ${theme.panel}`}>
        <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-wide text-matica-ink/45">REF #{orderReference(order.id)}</p>
          <h3 className="mt-1 text-lg font-black leading-tight text-matica-ink">{order.customer_name}</h3>
          <p className="mt-1 truncate text-sm font-black text-matica-green">{branchName}</p>
        </div>
        <span className="flex shrink-0 items-center gap-1 rounded-lg bg-white px-2 py-1 text-sm font-black text-matica-ink">
          <Clock className="h-4 w-4 text-matica-green" />
          {formatTime(order.created_at)}
        </span>
      </div>

      <div className="mt-3 space-y-1 text-sm font-bold leading-5 text-matica-ink/70">
        <p>{order.customer_phone}</p>
        <p className="break-all">{order.customer_email}</p>
        <p className="font-black text-matica-ink">{operationalPaymentLabel(order)}</p>
      </div>

      <div className="my-3 border-t border-dashed border-matica-line" />

      <div className="space-y-3 font-mono text-[13px] leading-5 text-matica-ink">
        {order.order_items.map((item) => {
          const entries = orderItemOptionLines(item.metadata);

          return (
            <div key={item.id}>
              <div className="flex justify-between gap-3 font-black">
                <span className="min-w-0">
                  {item.quantity}x {item.name}
                </span>
                <span className="shrink-0">{formatCurrency(Number(item.total_price))}</span>
              </div>
              {entries.length ? (
                <div className="mt-1 space-y-0.5">
                  {entries.map((entry) => (
                    <p key={`${item.id}-${entry.key}`} className="pl-3 font-bold text-matica-ink/70">
                      &gt; {entry.label}: {entry.value}
                    </p>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
        </div>

      {order.notes ? (
        <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-2 text-sm font-black leading-5 text-amber-950">
          <p className="text-[11px] uppercase tracking-wide">Observaciones</p>
          <p className="mt-1">{order.notes}</p>
        </div>
      ) : null}

        <div className="my-3 border-t border-dashed border-matica-line" />

        <div className="space-y-1 text-sm font-black">
          <div className="flex justify-between gap-3">
            <span>Total empleado</span>
            <span>{formatCurrency(Number(order.total))}</span>
          </div>
          <div className="flex justify-between gap-3 text-matica-green">
            <span>Factura empresa</span>
            <span>{formatCurrency(Number(order.subsidy_total))}</span>
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <span className={`rounded-lg px-2 py-1 text-xs font-black ${theme.badge}`}>
          {ORDER_STATUS_LABELS[order.status]}
        </span>
        <button
          className="matica-focus inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-matica-green px-3 text-sm font-black text-white"
          onClick={onOpen}
          type="button"
        >
          <Eye className="h-4 w-4" />
          Ver pedido
        </button>
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

function OrderDetailModal({
  order,
  updating,
  onClose,
  onStatusChange
}: {
  order: AdminOrder;
  updating: boolean;
  onClose: () => void;
  onStatusChange: (status: OrderStatus) => void;
}) {
  const companyName = order.companies?.name ?? "Cliente principal";
  const branchName = order.company_branches?.name ?? "Sin empresa interna";

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-matica-ink/55 px-3 py-5 print:static print:bg-white print:p-0">
      <div className="mx-auto max-w-5xl rounded-lg bg-white shadow-2xl print:max-w-none print:rounded-none print:shadow-none">
        <div className="flex items-start justify-between gap-3 border-b border-matica-line p-4 print:hidden">
          <div>
            <p className="text-xs font-black uppercase text-matica-green">Pedido #{orderReference(order.id)}</p>
            <h2 className="text-2xl font-black text-matica-ink">{order.customer_name}</h2>
            <p className="mt-1 text-sm font-semibold text-matica-ink/55">{formatOrderDateTime(order.created_at)}</p>
          </div>
          <button
            className="matica-focus grid h-11 w-11 place-items-center rounded-lg border border-matica-line bg-white text-matica-ink"
            onClick={onClose}
            type="button"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-5 p-4 lg:grid-cols-[1fr_320px] print:block print:p-0">
          <div className="space-y-4 print:hidden">
            <section className="rounded-lg border border-matica-line p-4">
              <h3 className="text-lg font-black">Datos del pedido</h3>
              <div className="mt-3 grid gap-3 text-sm font-semibold text-matica-ink/70 sm:grid-cols-2">
                <InfoRow label="Referencia" value={orderReference(order.id)} />
                <InfoRow label="Fecha y hora" value={formatOrderDateTime(order.created_at)} />
                <InfoRow label="Cliente principal" value={companyName} />
                <InfoRow label="Empresa interna" value={branchName} />
                <InfoRow label="Nombre" value={order.customer_name} />
                <InfoRow label="Teléfono" value={order.customer_phone} />
                <InfoRow label="Email" value={order.customer_email} />
                <InfoRow label="Estado pago" value={operationalPaymentLabel(order)} />
              </div>
            </section>

            <section className="rounded-lg border border-matica-line p-4">
              <h3 className="text-lg font-black">Productos</h3>
              <div className="mt-3 space-y-3">
                {order.order_items.map((item) => (
                  <div key={item.id} className="rounded-lg bg-matica-soft p-3">
                    <div className="flex justify-between gap-3 text-sm font-black">
                      <span>
                        {item.quantity}x {item.name}
                      </span>
                      <span>{formatCurrency(Number(item.total_price))}</span>
                    </div>
                    {orderItemOptionLines(item.metadata).length ? (
                      <div className="mt-2 space-y-1 text-sm font-semibold text-matica-ink/65">
                        {orderItemOptionLines(item.metadata).map((entry) => (
                          <p key={`${item.id}-${entry.key}`}>
                            <span className="font-black">{entry.label}:</span> {entry.value}
                          </p>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>

            {order.notes ? (
              <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-950">
                <h3 className="text-lg font-black">Observaciones</h3>
                <p className="mt-2 text-sm font-bold leading-6">{order.notes}</p>
              </section>
            ) : null}
          </div>

          <aside className="space-y-4 print:hidden">
            <section className="rounded-lg border border-matica-line p-4">
              <h3 className="text-lg font-black">Importes</h3>
              <div className="mt-3 space-y-2 text-sm font-bold">
                <TotalRow label="Subtotal" value={Number(order.subtotal)} />
                <TotalRow label="Subvención" value={-Number(order.subsidy_total)} highlight />
                <TotalRow label="Factura empresa" value={Number(order.subsidy_total)} />
                <TotalRow label="Total empleado" value={Number(order.total)} strong />
              </div>
            </section>

            <section className="rounded-lg border border-matica-line p-4">
              <label className="block space-y-1">
                <span className="text-xs font-black uppercase text-matica-ink/45">Estado actual</span>
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
            </section>

            <div className="flex flex-col gap-2">
              <button
                className="matica-focus flex min-h-12 items-center justify-center gap-2 rounded-lg bg-matica-green px-4 font-black text-white"
                onClick={() => window.print()}
                type="button"
              >
                <Printer className="h-5 w-5" />
                Imprimir ticket
              </button>
              <button
                className="matica-focus flex min-h-12 items-center justify-center rounded-lg border border-matica-line bg-white px-4 font-black text-matica-ink"
                onClick={onClose}
                type="button"
              >
                Cerrar
              </button>
            </div>
          </aside>

          <ThermalTicket order={order} />
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-black uppercase text-matica-ink/45">{label}</p>
      <p className="break-words font-black text-matica-ink">{value}</p>
    </div>
  );
}

function TotalRow({ label, value, highlight = false, strong = false }: { label: string; value: number; highlight?: boolean; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${strong ? "border-t border-matica-line pt-2 text-base font-black" : ""} ${highlight ? "text-matica-green" : ""}`}>
      <span>{label}</span>
      <span>{formatCurrency(value)}</span>
    </div>
  );
}

function ThermalTicket({ order }: { order: AdminOrder }) {
  const companyName = order.companies?.name ?? "Cliente principal";
  const branchName = order.company_branches?.name ?? "Sin empresa interna";

  return (
    <section className="hidden print:block thermal-ticket">
      <header className="ticket-center">
        <h1>MATICA FRESH FOOD</h1>
        <p>SERVICIO DE ENTREGA PARA EMPRESAS</p>
      </header>
      <div className="ticket-separator" />
      <p>REF: {orderReference(order.id)}</p>
      <p>FECHA: {formatOrderDateTime(order.created_at)}</p>
      <p>CLIENTE: {order.customer_name}</p>
      <p>TEL: {order.customer_phone}</p>
      <p>EMAIL: {order.customer_email}</p>
      <p>EMPRESA: {branchName}</p>
      <p>CLIENTE PRINCIPAL: {companyName}</p>
      <div className="ticket-separator" />
      <div className="ticket-grid ticket-head">
        <span>QTY</span>
        <span>PRODUCT</span>
        <span>UNIT</span>
        <span>TOTAL</span>
      </div>
      {order.order_items.map((item) => (
        <div key={item.id} className="ticket-item">
          <div className="ticket-grid">
            <span>{item.quantity}</span>
            <span>{item.name}</span>
            <span>{formatCurrency(Number(item.unit_price))}</span>
            <span>{formatCurrency(Number(item.total_price))}</span>
          </div>
          {orderItemOptionLines(item.metadata).map((entry) => (
            <p key={`${item.id}-${entry.key}`} className="ticket-option">
              &gt; {entry.label}: {entry.value}
            </p>
          ))}
        </div>
      ))}
      {order.notes ? (
        <>
          <div className="ticket-separator" />
          <p className="ticket-note">OBSERVACIONES: {order.notes}</p>
        </>
      ) : null}
      <div className="ticket-separator" />
      <div className="ticket-total"><span>Subtotal</span><span>{formatCurrency(Number(order.subtotal))}</span></div>
      <div className="ticket-total"><span>Subvención</span><span>-{formatCurrency(Number(order.subsidy_total))}</span></div>
      <div className="ticket-total"><span>Factura empresa</span><span>{formatCurrency(Number(order.subsidy_total))}</span></div>
      <div className="ticket-total ticket-total-strong"><span>Total empleado</span><span>{formatCurrency(Number(order.total))}</span></div>
      <div className="ticket-separator" />
      <p>ESTADO DE PAGO:</p>
      <p>{operationalPaymentLabel(order).toUpperCase()}</p>
      <p>ESTADO PEDIDO: {ORDER_STATUS_LABELS[order.status]}</p>
      <div className="ticket-separator" />
      <p className="ticket-center">Gracias por confiar en Matica.</p>
    </section>
  );
}
