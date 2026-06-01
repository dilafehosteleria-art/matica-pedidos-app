"use client";

import { AlertCircle, Clock, Download, Loader2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminGate } from "./AdminGate";
import { formatCurrency, formatTime } from "@/lib/format";
import type { AdminOrder, OrderStatus } from "@/lib/types";

const COLUMNS: { status: OrderStatus; title: string }[] = [
  { status: "pendiente_pago", title: "Pendiente pago" },
  { status: "nuevo", title: "Nuevos" },
  { status: "preparando", title: "En preparación" },
  { status: "listo", title: "Listos" },
  { status: "entregado", title: "Entregados" },
  { status: "cancelado", title: "Cancelados" }
];

const STATUS_OPTIONS: { status: OrderStatus; label: string }[] = [
  { status: "pendiente_pago", label: "Pendiente pago" },
  { status: "nuevo", label: "Nuevo" },
  { status: "preparando", label: "En preparación" },
  { status: "listo", label: "Listo" },
  { status: "entregado", label: "Entregado" },
  { status: "cancelado", label: "Cancelado" }
];

const EMPTY_REPORT_FILTERS = {
  date_from: "",
  date_to: "",
  company_id: "",
  company_branch_id: "",
  status: "",
  exclude_cancelled: true
};

type ReportFilters = typeof EMPTY_REPORT_FILTERS;

type ReportOptionCompany = {
  id: string;
  name: string;
};

type ReportOptionBranch = {
  id: string;
  company_id: string;
  name: string;
};

type ReportSummary = {
  orderCount: number;
  subtotal: number;
  subsidyTotal: number;
  employeeTotal: number;
  companyInvoiceTotal: number;
};

type ReportSummaryRow = ReportSummary & {
  key: string;
  companyName: string;
  branchName: string;
};

type ReportSummaryResponse = {
  summary: ReportSummary;
  byBranch: ReportSummaryRow[];
  previewOrders: {
    id: string;
    created_at: string;
    customer_name: string;
    company_name: string;
    branch_name: string;
    status: OrderStatus;
    subtotal: number;
    subsidy_total: number;
    total: number;
  }[];
};

type ReportOptionsResponse = {
  companies: ReportOptionCompany[];
  branches: ReportOptionBranch[];
  defaults: {
    dateFrom: string;
    dateTo: string;
    excludeCancelled: boolean;
  };
  statuses: OrderStatus[];
};

function formatMetadataKey(key: string) {
  const labels: Record<string, string> = {
    categoria: "Categoría",
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

function buildReportParams(filters: ReportFilters, mode: "summary" | "xlsx") {
  const params = new URLSearchParams({
    mode,
    date_from: filters.date_from,
    date_to: filters.date_to,
    exclude_cancelled: String(filters.exclude_cancelled)
  });

  if (filters.company_id) {
    params.set("company_id", filters.company_id);
  }

  if (filters.company_branch_id) {
    params.set("company_branch_id", filters.company_branch_id);
  }

  if (filters.status) {
    params.set("status", filters.status);
  }

  return params;
}

function filenameFromDisposition(disposition: string | null) {
  const match = disposition?.match(/filename="?([^"]+)"?/);

  return match?.[1] ?? `informe-${new Date().toISOString().slice(0, 10)}.xlsx`;
}

export function AdminDashboardClient() {
  return (
    <AdminGate title="Panel de pedidos" subtitle="Pedidos por empresa ordenados por hora.">
      {(pin, clearPin) => <OrdersBoard pin={pin} clearPin={clearPin} />}
    </AdminGate>
  );
}

function OrdersBoard({ pin, clearPin }: { pin: string; clearPin: () => void }) {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatingId, setUpdatingId] = useState("");
  const [reportOptions, setReportOptions] = useState<ReportOptionsResponse>({ companies: [], branches: [], defaults: { dateFrom: "", dateTo: "", excludeCancelled: true }, statuses: [] });
  const [reportFilters, setReportFilters] = useState<ReportFilters>(EMPTY_REPORT_FILTERS);
  const [reportSummary, setReportSummary] = useState<ReportSummaryResponse | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportDownloading, setReportDownloading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const loadReportOptions = useCallback(async () => {
    const response = await fetch("/api/admin/orders/report?mode=options", {
      headers: { "x-admin-pin": pin }
    });
    const payload = await response.json();

    if (response.status === 401) {
      clearPin();
      return;
    }

    if (!response.ok) {
      setError(payload.error ?? "No se pudieron cargar los filtros de informes.");
      return;
    }

    setReportOptions(payload);
    setReportFilters((current) => ({
      ...current,
      date_from: current.date_from || payload.defaults?.dateFrom || "",
      date_to: current.date_to || payload.defaults?.dateTo || "",
      exclude_cancelled: payload.defaults?.excludeCancelled ?? true
    }));
  }, [clearPin, pin]);

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
    loadReportOptions();
    const timer = window.setInterval(loadOrders, 5000);

    return () => window.clearInterval(timer);
  }, [loadOrders, loadReportOptions]);

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

  function updateReportFilter<Key extends keyof ReportFilters>(key: Key, value: ReportFilters[Key]) {
    setReportFilters((current) => {
      const next = { ...current, [key]: value };

      if (key === "company_id") {
        next.company_branch_id = "";
      }

      return next;
    });
    setReportSummary(null);
  }

  async function previewReport() {
    setReportLoading(true);
    const response = await fetch(`/api/admin/orders/report?${buildReportParams(reportFilters, "summary").toString()}`, {
      headers: { "x-admin-pin": pin }
    });

    if (response.status === 401) {
      setReportLoading(false);
      clearPin();
      return;
    }

    const payload = await response.json();

    if (!response.ok) {
      setError(payload.error ?? "No se pudo generar el resumen del informe.");
      setReportLoading(false);
      return;
    }

    setReportSummary(payload);
    setError("");
    setReportLoading(false);
  }

  async function downloadReport() {
    setReportDownloading(true);
    const response = await fetch(`/api/admin/orders/report?${buildReportParams(reportFilters, "xlsx").toString()}`, {
      headers: { "x-admin-pin": pin }
    });

    if (response.status === 401) {
      setReportDownloading(false);
      clearPin();
      return;
    }

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setError(payload.error ?? "No se pudo descargar el informe.");
      setReportDownloading(false);
      return;
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = filenameFromDisposition(response.headers.get("Content-Disposition"));
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
    setReportDownloading(false);
  }

  const reportBranches = reportOptions.branches.filter((branch) => !reportFilters.company_id || branch.company_id === reportFilters.company_id);
  const reportCanRun = Boolean(reportFilters.date_from && reportFilters.date_to);
  const grouped = useMemo(() => {
    return COLUMNS.reduce<Record<OrderStatus, AdminOrder[]>>(
      (acc, column) => {
        acc[column.status] = orders.filter((order) => order.status === column.status);
        return acc;
      },
      { pendiente_pago: [], nuevo: [], preparando: [], listo: [], entregado: [], cancelado: [] }
    );
  }, [orders]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
      <div className="mb-4 flex flex-col gap-3 rounded-lg border border-matica-line bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-sm font-bold text-matica-ink/60">
          <RefreshCw className="h-4 w-4 text-matica-green" />
          Refresco automático cada 5 segundos
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

      <section className="mb-4 rounded-lg border border-matica-line bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-2xl font-black text-matica-ink">Informes</h2>
            <p className="mt-1 max-w-3xl text-sm font-semibold leading-6 text-matica-ink/60">
              Filtra los pedidos por rango, cliente, empresa interna y estado antes de descargar el Excel de facturación.
            </p>
          </div>
          <span className="w-fit rounded-lg bg-matica-mint px-3 py-1 text-xs font-black uppercase text-matica-green">
            Excel .xlsx
          </span>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <label className="space-y-1">
            <span className="text-xs font-black uppercase text-matica-ink/45">Fecha desde</span>
            <input
              className="matica-focus min-h-11 w-full rounded-lg border border-matica-line bg-white px-3 text-sm font-bold text-matica-ink"
              type="date"
              value={reportFilters.date_from}
              onChange={(event) => updateReportFilter("date_from", event.target.value)}
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-black uppercase text-matica-ink/45">Fecha hasta</span>
            <input
              className="matica-focus min-h-11 w-full rounded-lg border border-matica-line bg-white px-3 text-sm font-bold text-matica-ink"
              type="date"
              value={reportFilters.date_to}
              onChange={(event) => updateReportFilter("date_to", event.target.value)}
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-black uppercase text-matica-ink/45">Cliente principal</span>
            <select
              className="matica-focus min-h-11 w-full rounded-lg border border-matica-line bg-white px-3 text-sm font-bold text-matica-ink"
              value={reportFilters.company_id}
              onChange={(event) => updateReportFilter("company_id", event.target.value)}
            >
              <option value="">Todos los clientes</option>
              {reportOptions.companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-black uppercase text-matica-ink/45">Empresa interna</span>
            <select
              className="matica-focus min-h-11 w-full rounded-lg border border-matica-line bg-white px-3 text-sm font-bold text-matica-ink"
              value={reportFilters.company_branch_id}
              onChange={(event) => updateReportFilter("company_branch_id", event.target.value)}
            >
              <option value="">Todas las empresas internas</option>
              {reportBranches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-black uppercase text-matica-ink/45">Estado del pedido</span>
            <select
              className="matica-focus min-h-11 w-full rounded-lg border border-matica-line bg-white px-3 text-sm font-bold text-matica-ink"
              value={reportFilters.status}
              onChange={(event) => updateReportFilter("status", event.target.value)}
            >
              <option value="">Todos los estados</option>
              {STATUS_OPTIONS.map((option) => (
                <option key={option.status} value={option.status}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex items-center gap-2 text-sm font-bold text-matica-ink/65">
            <input
              className="h-4 w-4 accent-matica-green"
              type="checkbox"
              checked={reportFilters.exclude_cancelled}
              onChange={(event) => updateReportFilter("exclude_cancelled", event.target.checked)}
              disabled={Boolean(reportFilters.status)}
            />
            Excluir cancelados para facturación
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              className="matica-focus flex min-h-11 items-center justify-center gap-2 rounded-lg border border-matica-line bg-white px-4 font-black text-matica-ink disabled:cursor-not-allowed disabled:opacity-60"
              onClick={previewReport}
              disabled={!reportCanRun || reportLoading}
              type="button"
            >
              {reportLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4 text-matica-green" />}
              Ver resumen
            </button>
            <button
              className="matica-focus flex min-h-11 items-center justify-center gap-2 rounded-lg bg-matica-green px-4 font-black text-white disabled:cursor-not-allowed disabled:opacity-60"
              onClick={downloadReport}
              disabled={!reportCanRun || reportDownloading}
              type="button"
            >
              {reportDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Descargar Excel
            </button>
          </div>
        </div>

        {reportFilters.status ? (
          <p className="mt-2 text-xs font-bold text-matica-ink/45">
            Al filtrar por estado se respeta exactamente el estado elegido, incluidos los cancelados si se seleccionan.
          </p>
        ) : null}

        {reportSummary ? (
          <div className="mt-5 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div className="rounded-lg bg-matica-soft p-3">
                <p className="text-xs font-black uppercase text-matica-ink/45">Pedidos</p>
                <p className="mt-1 text-2xl font-black">{reportSummary.summary.orderCount}</p>
              </div>
              <div className="rounded-lg bg-matica-soft p-3">
                <p className="text-xs font-black uppercase text-matica-ink/45">Subtotal</p>
                <p className="mt-1 text-xl font-black">{formatCurrency(reportSummary.summary.subtotal)}</p>
              </div>
              <div className="rounded-lg bg-matica-soft p-3">
                <p className="text-xs font-black uppercase text-matica-ink/45">Subvención</p>
                <p className="mt-1 text-xl font-black text-matica-green">{formatCurrency(reportSummary.summary.subsidyTotal)}</p>
              </div>
              <div className="rounded-lg bg-matica-soft p-3">
                <p className="text-xs font-black uppercase text-matica-ink/45">Cobra empleado</p>
                <p className="mt-1 text-xl font-black">{formatCurrency(reportSummary.summary.employeeTotal)}</p>
              </div>
              <div className="rounded-lg bg-matica-soft p-3">
                <p className="text-xs font-black uppercase text-matica-ink/45">Factura empresa</p>
                <p className="mt-1 text-xl font-black">{formatCurrency(reportSummary.summary.companyInvoiceTotal)}</p>
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border border-matica-line">
              <table className="min-w-full divide-y divide-matica-line text-sm">
                <thead className="bg-matica-soft text-left text-xs font-black uppercase text-matica-ink/45">
                  <tr>
                    <th className="px-3 py-2">Cliente principal</th>
                    <th className="px-3 py-2">Empresa interna</th>
                    <th className="px-3 py-2 text-right">Pedidos</th>
                    <th className="px-3 py-2 text-right">Subtotal</th>
                    <th className="px-3 py-2 text-right">Subvención</th>
                    <th className="px-3 py-2 text-right">Cobra empleado</th>
                    <th className="px-3 py-2 text-right">Factura empresa</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-matica-line bg-white">
                  {reportSummary.byBranch.map((row) => (
                    <tr key={row.key}>
                      <td className="px-3 py-2 font-bold">{row.companyName}</td>
                      <td className="px-3 py-2 font-bold text-matica-green">{row.branchName}</td>
                      <td className="px-3 py-2 text-right font-bold">{row.orderCount}</td>
                      <td className="px-3 py-2 text-right font-semibold">{formatCurrency(row.subtotal)}</td>
                      <td className="px-3 py-2 text-right font-semibold">{formatCurrency(row.subsidyTotal)}</td>
                      <td className="px-3 py-2 text-right font-semibold">{formatCurrency(row.employeeTotal)}</td>
                      <td className="px-3 py-2 text-right font-semibold">{formatCurrency(row.companyInvoiceTotal)}</td>
                    </tr>
                  ))}
                  {!reportSummary.byBranch.length ? (
                    <tr>
                      <td className="px-3 py-6 text-center font-bold text-matica-ink/45" colSpan={7}>
                        No hay pedidos con estos filtros.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </section>

      {lastRefresh ? (
        <p className="mb-4 text-sm font-semibold text-matica-ink/55">Última actualización: {formatTime(lastRefresh)}</p>
      ) : null}

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
        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-6">
          {COLUMNS.map((column) => (
            <section key={column.status} className="rounded-lg border border-matica-line bg-white p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-lg font-black">{column.title}</h2>
                <span className="rounded-lg bg-matica-mint px-2 py-1 text-sm font-black text-matica-green">
                  {grouped[column.status].length}
                </span>
              </div>
              <div className="space-y-3">
                {grouped[column.status].map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    updating={updatingId === order.id}
                    onStatusChange={(status) => updateStatus(order.id, status)}
                  />
                ))}
                {!grouped[column.status].length ? (
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
        <div className="flex justify-between border-t border-matica-line pt-1 text-base font-black">
          <span>Total</span>
          <span>{formatCurrency(Number(order.total))}</span>
        </div>
      </div>

      <label className="mt-3 block space-y-1">
        <span className="text-xs font-black uppercase text-matica-ink/45">Estado</span>
        <select
          className="matica-focus w-full rounded-lg border border-matica-line bg-white px-3 py-3 text-sm font-black disabled:cursor-wait disabled:bg-matica-ink/10"
          value={order.status}
          disabled={updating}
          onChange={(event) => onStatusChange(event.target.value as OrderStatus)}
        >
          {STATUS_OPTIONS.map((option) => (
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
