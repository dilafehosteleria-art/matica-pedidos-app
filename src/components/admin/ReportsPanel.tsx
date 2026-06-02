"use client";

import { AlertCircle, Download, Loader2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatCurrency } from "@/lib/format";
import type { OrderStatus } from "@/lib/types";

const STATUS_OPTIONS: { status: OrderStatus; label: string }[] = [
  { status: "pendiente_pago", label: "Pendiente pago" },
  { status: "nuevo", label: "Nuevo" },
  { status: "preparando", label: "En preparación" },
  { status: "listo", label: "Listo" },
  { status: "entregado", label: "Entregado" },
  { status: "cancelado", label: "Cancelado" }
];

type BillingType = "all" | "subsidized" | "non_subsidized";

const BILLING_TYPE_OPTIONS: { value: BillingType; label: string }[] = [
  { value: "all", label: "Todos los pedidos" },
  { value: "subsidized", label: "Solo pedidos subvencionados" },
  { value: "non_subsidized", label: "Solo pedidos no subvencionados" }
];

const EMPTY_REPORT_FILTERS = {
  date_from: "",
  date_to: "",
  company_id: "",
  company_branch_id: "",
  status: "",
  billing_type: "all" as BillingType,
  exclude_cancelled: true
};

type ReportFilters = typeof EMPTY_REPORT_FILTERS;

type ReportOptionCompany = {
  id: string;
  name: string;
  slug?: string;
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
  menuCount: number;
  halfMenuCount: number;
  subsidizedAmountTotal: number;
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
    billingType: BillingType;
    excludeCancelled: boolean;
  };
  statuses: OrderStatus[];
};

type ReportsPanelProps = {
  endpoint: string;
  authHeaders: Record<string, string>;
  onUnauthorized: () => void;
  showCompanyFilter?: boolean;
  intro?: string;
};

function buildReportParams(filters: ReportFilters, mode: "summary" | "xlsx") {
  const params = new URLSearchParams({
    mode,
    date_from: filters.date_from,
    date_to: filters.date_to,
    billing_type: filters.billing_type,
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

function reportUrl(endpoint: string, params: URLSearchParams) {
  const url = new URL(endpoint, window.location.origin);

  params.forEach((value, key) => {
    url.searchParams.set(key, value);
  });

  return `${url.pathname}${url.search}`;
}

function filenameFromDisposition(disposition: string | null) {
  const match = disposition?.match(/filename="?([^"]+)"?/);

  return match?.[1] ?? `informe-${new Date().toISOString().slice(0, 10)}.xlsx`;
}

function isBureauVeritasCompany(company?: ReportOptionCompany | null) {
  const slug = company?.slug?.trim().toLowerCase() ?? "";
  const name = company?.name?.trim().toLowerCase() ?? "";

  return slug === "bureau-veritas" || name === "bureau veritas";
}

function billingSummaryLabels(type: BillingType) {
  if (type === "subsidized") {
    return {
      orders: "Pedidos subvencionados",
      subtotal: "Subtotal subvencionables"
    };
  }

  if (type === "non_subsidized") {
    return {
      orders: "Pedidos no subvencionados",
      subtotal: "Subtotal no subvencionado"
    };
  }

  return {
    orders: "Pedidos",
    subtotal: "Subtotal"
  };
}

export function ReportsPanel({
  endpoint,
  authHeaders,
  onUnauthorized,
  showCompanyFilter = true,
  intro = "Filtra los pedidos por rango, cliente, empresa interna y estado antes de descargar el Excel de facturación."
}: ReportsPanelProps) {
  const [reportOptions, setReportOptions] = useState<ReportOptionsResponse>({
    companies: [],
    branches: [],
    defaults: { dateFrom: "", dateTo: "", billingType: "all", excludeCancelled: true },
    statuses: []
  });
  const [reportFilters, setReportFilters] = useState<ReportFilters>(EMPTY_REPORT_FILTERS);
  const [reportSummary, setReportSummary] = useState<ReportSummaryResponse | null>(null);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportDownloading, setReportDownloading] = useState(false);
  const [error, setError] = useState("");

  const loadReportOptions = useCallback(async () => {
    setLoadingOptions(true);
    const response = await fetch(reportUrl(endpoint, new URLSearchParams({ mode: "options" })), {
      headers: authHeaders
    });
    const payload = await response.json();

    if (response.status === 401) {
      onUnauthorized();
      return;
    }

    if (!response.ok) {
      setError(payload.error ?? "No se pudieron cargar los filtros de informes.");
      setLoadingOptions(false);
      return;
    }

    setReportOptions(payload);
    setReportFilters((current) => ({
      ...current,
      date_from: current.date_from || payload.defaults?.dateFrom || "",
      date_to: current.date_to || payload.defaults?.dateTo || "",
      company_id: showCompanyFilter ? current.company_id : payload.companies?.[0]?.id ?? "",
      billing_type:
        current.billing_type === EMPTY_REPORT_FILTERS.billing_type
          ? payload.defaults?.billingType || current.billing_type
          : current.billing_type,
      exclude_cancelled: payload.defaults?.excludeCancelled ?? true
    }));
    setError("");
    setLoadingOptions(false);
  }, [authHeaders, endpoint, onUnauthorized, showCompanyFilter]);

  useEffect(() => {
    loadReportOptions();
  }, [loadReportOptions]);

  function updateReportFilter<Key extends keyof ReportFilters>(key: Key, value: ReportFilters[Key]) {
    setReportFilters((current) => {
      const next = { ...current, [key]: value };

      if (key === "company_id") {
        const selectedCompanyId = typeof value === "string" ? value : "";
        next.company_branch_id = "";
        next.billing_type = isBureauVeritasCompany(reportOptions.companies.find((company) => company.id === selectedCompanyId)) ? "subsidized" : "all";
      }

      return next;
    });
    setReportSummary(null);
  }

  async function previewReport() {
    setReportLoading(true);
    const response = await fetch(reportUrl(endpoint, buildReportParams(reportFilters, "summary")), {
      headers: authHeaders
    });

    if (response.status === 401) {
      setReportLoading(false);
      onUnauthorized();
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
    const response = await fetch(reportUrl(endpoint, buildReportParams(reportFilters, "xlsx")), {
      headers: authHeaders
    });

    if (response.status === 401) {
      setReportDownloading(false);
      onUnauthorized();
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

  const reportBranches = useMemo(
    () => reportOptions.branches.filter((branch) => !reportFilters.company_id || branch.company_id === reportFilters.company_id),
    [reportFilters.company_id, reportOptions.branches]
  );
  const reportCanRun = Boolean(reportFilters.date_from && reportFilters.date_to);
  const selectedCompany = reportOptions.companies.find((company) => company.id === reportFilters.company_id) ?? reportOptions.companies[0];
  const summaryLabels = billingSummaryLabels(reportFilters.billing_type);

  return (
    <section className="rounded-lg border border-matica-line bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-black text-matica-ink">Informes</h2>
          <p className="mt-1 max-w-3xl text-sm font-semibold leading-6 text-matica-ink/60">{intro}</p>
        </div>
        <span className="w-fit rounded-lg bg-matica-mint px-3 py-1 text-xs font-black uppercase text-matica-green">
          Excel .xlsx
        </span>
      </div>

      {error ? (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
          <AlertCircle className="mt-0.5 h-5 w-5" />
          {error}
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <label className="space-y-1">
          <span className="text-xs font-black uppercase text-matica-ink/45">Fecha desde</span>
          <input
            className="matica-focus min-h-11 w-full rounded-lg border border-matica-line bg-white px-3 text-sm font-bold text-matica-ink"
            type="date"
            value={reportFilters.date_from}
            onChange={(event) => updateReportFilter("date_from", event.target.value)}
            disabled={loadingOptions}
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-black uppercase text-matica-ink/45">Fecha hasta</span>
          <input
            className="matica-focus min-h-11 w-full rounded-lg border border-matica-line bg-white px-3 text-sm font-bold text-matica-ink"
            type="date"
            value={reportFilters.date_to}
            onChange={(event) => updateReportFilter("date_to", event.target.value)}
            disabled={loadingOptions}
          />
        </label>
        {showCompanyFilter ? (
          <label className="space-y-1">
            <span className="text-xs font-black uppercase text-matica-ink/45">Cliente principal</span>
            <select
              className="matica-focus min-h-11 w-full rounded-lg border border-matica-line bg-white px-3 text-sm font-bold text-matica-ink"
              value={reportFilters.company_id}
              onChange={(event) => updateReportFilter("company_id", event.target.value)}
              disabled={loadingOptions}
            >
              <option value="">Todos los clientes</option>
              {reportOptions.companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <div className="space-y-1">
            <span className="text-xs font-black uppercase text-matica-ink/45">Cliente principal</span>
            <div className="flex min-h-11 items-center rounded-lg border border-matica-line bg-matica-soft px-3 text-sm font-black text-matica-ink">
              {selectedCompany?.name ?? "Cliente"}
            </div>
          </div>
        )}
        <label className="space-y-1">
          <span className="text-xs font-black uppercase text-matica-ink/45">Empresa interna</span>
          <select
            className="matica-focus min-h-11 w-full rounded-lg border border-matica-line bg-white px-3 text-sm font-bold text-matica-ink"
            value={reportFilters.company_branch_id}
            onChange={(event) => updateReportFilter("company_branch_id", event.target.value)}
            disabled={loadingOptions}
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
            disabled={loadingOptions}
          >
            <option value="">Todos los estados</option>
            {STATUS_OPTIONS.map((option) => (
              <option key={option.status} value={option.status}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs font-black uppercase text-matica-ink/45">Tipo de facturación</span>
          <select
            className="matica-focus min-h-11 w-full rounded-lg border border-matica-line bg-white px-3 text-sm font-bold text-matica-ink"
            value={reportFilters.billing_type}
            onChange={(event) => updateReportFilter("billing_type", event.target.value as BillingType)}
            disabled={loadingOptions}
          >
            {BILLING_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
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
            disabled={Boolean(reportFilters.status) || loadingOptions}
          />
          Excluir cancelados para facturación
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            className="matica-focus flex min-h-11 items-center justify-center gap-2 rounded-lg border border-matica-line bg-white px-4 font-black text-matica-ink disabled:cursor-not-allowed disabled:opacity-60"
            onClick={previewReport}
            disabled={!reportCanRun || reportLoading || loadingOptions}
            type="button"
          >
            {reportLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4 text-matica-green" />}
            Ver resumen
          </button>
          <button
            className="matica-focus flex min-h-11 items-center justify-center gap-2 rounded-lg bg-matica-green px-4 font-black text-white disabled:cursor-not-allowed disabled:opacity-60"
            onClick={downloadReport}
            disabled={!reportCanRun || reportDownloading || loadingOptions}
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
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryMetric label={summaryLabels.orders} value={String(reportSummary.summary.orderCount)} />
            <SummaryMetric label={summaryLabels.subtotal} value={formatCurrency(reportSummary.summary.subtotal)} />
            <SummaryMetric label="Total subvención empresa" value={formatCurrency(reportSummary.summary.subsidyTotal)} highlight />
            <SummaryMetric label="Total a cobrar empleados" value={formatCurrency(reportSummary.summary.employeeTotal)} />
          </div>

          <div className="overflow-x-auto rounded-lg border border-matica-line">
            <table className="min-w-full divide-y divide-matica-line text-sm">
              <thead className="bg-matica-soft text-left text-xs font-black uppercase text-matica-ink/45">
                <tr>
                  <th className="px-3 py-2">Cliente principal</th>
                  <th className="px-3 py-2">Empresa interna</th>
                  <th className="px-3 py-2 text-right">Pedidos</th>
                  <th className="px-3 py-2 text-right">Nº menús</th>
                  <th className="px-3 py-2 text-right">Nº medios menús</th>
                  <th className="px-3 py-2 text-right">Subtotal</th>
                  <th className="px-3 py-2 text-right">Subvención</th>
                  <th className="px-3 py-2 text-right">Importe subvencionado</th>
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
                    <td className="px-3 py-2 text-right font-semibold">{row.menuCount}</td>
                    <td className="px-3 py-2 text-right font-semibold">{row.halfMenuCount}</td>
                    <td className="px-3 py-2 text-right font-semibold">{formatCurrency(row.subtotal)}</td>
                    <td className="px-3 py-2 text-right font-semibold">{formatCurrency(row.subsidyTotal)}</td>
                    <td className="px-3 py-2 text-right font-semibold">{formatCurrency(row.subsidizedAmountTotal)}</td>
                    <td className="px-3 py-2 text-right font-semibold">{formatCurrency(row.employeeTotal)}</td>
                    <td className="px-3 py-2 text-right font-semibold">{formatCurrency(row.companyInvoiceTotal)}</td>
                  </tr>
                ))}
                {!reportSummary.byBranch.length ? (
                  <tr>
                    <td className="px-3 py-6 text-center font-bold text-matica-ink/45" colSpan={10}>
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
  );
}

function SummaryMetric({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-lg bg-matica-soft p-3">
      <p className="text-xs font-black uppercase text-matica-ink/45">{label}</p>
      <p className={`mt-1 text-xl font-black ${highlight ? "text-matica-green" : "text-matica-ink"}`}>{value}</p>
    </div>
  );
}
