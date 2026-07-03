"use client";

import {
  AlertCircle,
  BarChart3,
  CalendarDays,
  ChevronDown,
  Loader2,
  Minus,
  Package,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Users
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminGate } from "./AdminGate";
import { formatCurrency } from "@/lib/format";

type PeriodPreset = "today" | "yesterday" | "this_week" | "this_month" | "last_30_days" | "custom";
type ChartMetric = "orders" | "grossRevenue" | "averageTicket";
type RankingTab = "products" | "firstCourses" | "secondCourses" | "drinks";

type DashboardKpiValue = {
  value: number;
  previousValue: number | null;
  changePercent: number | null;
  trend: "positive" | "negative" | "neutral";
  comparisonLabel: string | null;
};

type DashboardResponse = {
  filters: {
    from: string;
    to: string;
    clientId: string;
    companyId: string;
    compare: boolean;
  };
  options: {
    companies: { id: string; name: string; slug: string; active: boolean }[];
    branches: { id: string; company_id: string; name: string; active: boolean }[];
  };
  period: { from: string; to: string };
  comparisonPeriod: { from: string; to: string } | null;
  kpis: Record<
    | "grossRevenue"
    | "orders"
    | "averageTicket"
    | "newCustomers"
    | "companyInvoice"
    | "employeeCollected"
    | "subsidyTotal",
    DashboardKpiValue
  >;
  evolution: {
    date: string;
    comparisonDate: string | null;
    orders: number;
    ordersComparison: number | null;
    grossRevenue: number;
    grossRevenueComparison: number | null;
    averageTicket: number;
    averageTicketComparison: number | null;
  }[];
  rankings: Record<RankingTab, { key: string; name: string; units: number; revenue: number; percentage?: number }[]>;
  clients: {
    key: string;
    name: string;
    parentName?: string;
    orderCount: number;
    grossRevenue: number;
    companyInvoice: number;
    employeeTotal: number;
    averageTicket: number;
    uniqueCustomers: number;
  }[];
};

type DashboardFilters = {
  preset: PeriodPreset;
  from: string;
  to: string;
  clientId: string;
  companyId: string;
  compare: boolean;
};

const PERIOD_OPTIONS: { value: PeriodPreset; label: string }[] = [
  { value: "today", label: "Hoy" },
  { value: "yesterday", label: "Ayer" },
  { value: "this_week", label: "Esta semana" },
  { value: "this_month", label: "Este mes" },
  { value: "last_30_days", label: "Últimos 30 días" },
  { value: "custom", label: "Personalizado" }
];

const KPI_CARDS: { key: keyof DashboardResponse["kpis"]; label: string; format: "money" | "number" }[] = [
  { key: "grossRevenue", label: "Facturación bruta", format: "money" },
  { key: "orders", label: "Pedidos", format: "number" },
  { key: "averageTicket", label: "Ticket medio", format: "money" },
  { key: "newCustomers", label: "Clientes nuevos", format: "number" },
  { key: "companyInvoice", label: "Factura empresa", format: "money" },
  { key: "employeeCollected", label: "Cobrado a empleados", format: "money" },
  { key: "subsidyTotal", label: "Subvención total", format: "money" }
];

const CHART_METRICS: { key: ChartMetric; label: string; format: "money" | "number" }[] = [
  { key: "orders", label: "Pedidos", format: "number" },
  { key: "grossRevenue", label: "Facturación", format: "money" },
  { key: "averageTicket", label: "Ticket medio", format: "money" }
];

const RANKING_TABS: { key: RankingTab; label: string }[] = [
  { key: "products", label: "Productos" },
  { key: "firstCourses", label: "Primeros" },
  { key: "secondCourses", label: "Segundos" },
  { key: "drinks", label: "Bebidas" }
];

function madridToday() {
  return new Intl.DateTimeFormat("sv-SE", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Europe/Madrid",
    year: "numeric"
  }).format(new Date());
}

function addDays(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);

  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function monthEnd(date: string) {
  const [year, month] = date.split("-").map(Number);

  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

function presetPeriod(preset: PeriodPreset) {
  const today = madridToday();

  if (preset === "today") {
    return { from: today, to: today };
  }

  if (preset === "yesterday") {
    const yesterday = addDays(today, -1);

    return { from: yesterday, to: yesterday };
  }

  if (preset === "this_week") {
    const date = new Date(`${today}T00:00:00.000Z`);
    const day = date.getUTCDay() || 7;
    const from = addDays(today, 1 - day);

    return { from, to: addDays(from, 6) };
  }

  if (preset === "this_month") {
    const [year, month] = today.split("-");

    return { from: `${year}-${month}-01`, to: monthEnd(today) };
  }

  return { from: addDays(today, -29), to: today };
}

function initialFilters(): DashboardFilters {
  const period = presetPeriod("last_30_days");

  return {
    preset: "last_30_days",
    ...period,
    clientId: "",
    companyId: "",
    compare: false
  };
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short"
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function formatValue(value: number, format: "money" | "number") {
  return format === "money" ? formatCurrency(value) : new Intl.NumberFormat("es-ES").format(value);
}

function trendTheme(trend: DashboardKpiValue["trend"]) {
  if (trend === "positive") {
    return "text-emerald-700 bg-emerald-50";
  }

  if (trend === "negative") {
    return "text-red-700 bg-red-50";
  }

  return "text-matica-ink/55 bg-matica-soft";
}

function trendIcon(trend: DashboardKpiValue["trend"]) {
  if (trend === "positive") {
    return <TrendingUp className="h-4 w-4" />;
  }

  if (trend === "negative") {
    return <TrendingDown className="h-4 w-4" />;
  }

  return <Minus className="h-4 w-4" />;
}

function dashboardUrl(filters: DashboardFilters) {
  const params = new URLSearchParams({
    from: filters.from,
    to: filters.to,
    compare: String(filters.compare)
  });

  if (filters.clientId) {
    params.set("client_id", filters.clientId);
  }

  if (filters.companyId) {
    params.set("company_id", filters.companyId);
  }

  return `/api/admin/dashboard?${params.toString()}`;
}

export function AdminBusinessDashboardClient() {
  return (
    <AdminGate title="Dashboard de negocio" subtitle="Métricas globales internas de Matica B2B.">
      {(pin, clearPin) => <BusinessDashboardContent pin={pin} clearPin={clearPin} />}
    </AdminGate>
  );
}

function BusinessDashboardContent({ pin, clearPin }: { pin: string; clearPin: () => void }) {
  const [filters, setFilters] = useState<DashboardFilters>(() => initialFilters());
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [chartMetric, setChartMetric] = useState<ChartMetric>("grossRevenue");
  const [rankingTab, setRankingTab] = useState<RankingTab>("products");

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    const response = await fetch(dashboardUrl(filters), {
      headers: { "x-admin-pin": pin }
    });
    const payload = await response.json().catch(() => ({}));

    if (response.status === 401) {
      clearPin();
      return;
    }

    if (!response.ok) {
      setError(payload.error ?? "No se pudo cargar el dashboard.");
      setLoading(false);
      return;
    }

    setData(payload);
    setError("");
    setLoading(false);
  }, [clearPin, filters, pin]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const branches = useMemo(
    () => data?.options.branches.filter((branch) => !filters.clientId || branch.company_id === filters.clientId) ?? [],
    [data?.options.branches, filters.clientId]
  );

  function updatePreset(preset: PeriodPreset) {
    if (preset === "custom") {
      setFilters((current) => ({ ...current, preset }));
      return;
    }

    setFilters((current) => ({ ...current, preset, ...presetPeriod(preset) }));
  }

  function updateClient(clientId: string) {
    setFilters((current) => ({ ...current, clientId, companyId: "" }));
  }

  const selectedCompanyName = data?.options.companies.find((company) => company.id === filters.clientId)?.name ?? "";
  const rankingRows = data?.rankings[rankingTab] ?? [];

  return (
    <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
      <section className="rounded-lg border border-matica-line bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-black uppercase text-matica-green">
              <BarChart3 className="h-4 w-4" />
              Vista administradora
            </div>
            <h2 className="mt-1 text-2xl font-black text-matica-ink">Dashboard</h2>
          </div>
          <button
            className="matica-focus inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-matica-line bg-white px-4 text-sm font-black text-matica-ink disabled:cursor-wait disabled:opacity-60"
            onClick={loadDashboard}
            disabled={loading}
            type="button"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4 text-matica-green" />}
            Actualizar
          </button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="space-y-1">
            <span className="text-xs font-black uppercase text-matica-ink/45">Periodo</span>
            <span className="relative block">
              <select
                className="matica-focus min-h-11 w-full appearance-none rounded-lg border border-matica-line bg-white px-3 pr-9 text-sm font-bold text-matica-ink"
                value={filters.preset}
                onChange={(event) => updatePreset(event.target.value as PeriodPreset)}
                disabled={loading}
              >
                {PERIOD_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-matica-ink/45" />
            </span>
          </label>

          {filters.preset === "custom" ? (
            <>
              <DateInput
                label="Fecha desde"
                value={filters.from}
                onChange={(from) => setFilters((current) => ({ ...current, from }))}
                disabled={loading}
              />
              <DateInput
                label="Fecha hasta"
                value={filters.to}
                onChange={(to) => setFilters((current) => ({ ...current, to }))}
                disabled={loading}
              />
            </>
          ) : (
            <div className="rounded-lg bg-matica-soft px-3 py-2 md:col-span-1 xl:col-span-2">
              <p className="text-xs font-black uppercase text-matica-ink/45">Rango activo</p>
              <p className="mt-1 text-sm font-black text-matica-ink">
                {filters.from} a {filters.to}
              </p>
            </div>
          )}

          <label className="space-y-1">
            <span className="text-xs font-black uppercase text-matica-ink/45">Cliente principal</span>
            <select
              className="matica-focus min-h-11 w-full rounded-lg border border-matica-line bg-white px-3 text-sm font-bold text-matica-ink"
              value={filters.clientId}
              onChange={(event) => updateClient(event.target.value)}
              disabled={loading}
            >
              <option value="">Todos los clientes</option>
              {(data?.options.companies ?? []).map((company) => (
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
              value={filters.companyId}
              onChange={(event) => setFilters((current) => ({ ...current, companyId: event.target.value }))}
              disabled={loading}
            >
              <option value="">Todas las empresas internas</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex min-h-11 items-center gap-2 rounded-lg border border-matica-line bg-white px-3 text-sm font-black text-matica-ink">
            <input
              className="h-4 w-4 accent-matica-green"
              type="checkbox"
              checked={filters.compare}
              onChange={(event) => setFilters((current) => ({ ...current, compare: event.target.checked }))}
              disabled={loading}
            />
            Comparar con periodo anterior
          </label>
        </div>
      </section>

      {error ? (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
          <AlertCircle className="mt-0.5 h-5 w-5" />
          {error}
        </div>
      ) : null}

      {loading && !data ? (
        <div className="mt-4 grid min-h-72 place-items-center rounded-lg border border-matica-line bg-white">
          <Loader2 className="h-7 w-7 animate-spin text-matica-green" />
        </div>
      ) : null}

      {data ? (
        <div className="mt-4 space-y-4">
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {KPI_CARDS.map((card) => (
              <KpiCard key={card.key} label={card.label} metric={data.kpis[card.key]} format={card.format} />
            ))}
          </section>

          <section className="rounded-lg border border-matica-line bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-black text-matica-ink">Evolución diaria</h2>
                <p className="mt-1 text-sm font-semibold text-matica-ink/55">
                  {data.period.from} a {data.period.to}
                  {data.comparisonPeriod ? ` · comparado con ${data.comparisonPeriod.from} a ${data.comparisonPeriod.to}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {CHART_METRICS.map((metric) => (
                  <button
                    key={metric.key}
                    className={`matica-focus min-h-10 rounded-lg px-3 text-sm font-black ${
                      chartMetric === metric.key ? "bg-matica-green text-white" : "border border-matica-line bg-white text-matica-ink"
                    }`}
                    onClick={() => setChartMetric(metric.key)}
                    type="button"
                  >
                    {metric.label}
                  </button>
                ))}
              </div>
            </div>
            <EvolutionChart data={data} metric={chartMetric} />
          </section>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.9fr)]">
            <section className="rounded-lg border border-matica-line bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-xl font-black text-matica-ink">Más vendidos</h2>
                  <p className="mt-1 text-sm font-semibold text-matica-ink/55">Ranking por unidades del periodo seleccionado.</p>
                </div>
                <Package className="h-6 w-6 text-matica-green" />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {RANKING_TABS.map((tab) => (
                  <button
                    key={tab.key}
                    className={`matica-focus min-h-10 rounded-lg px-3 text-sm font-black ${
                      rankingTab === tab.key ? "bg-matica-green text-white" : "border border-matica-line bg-white text-matica-ink"
                    }`}
                    onClick={() => setRankingTab(tab.key)}
                    type="button"
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <RankingTable rows={rankingRows} showPercentage={rankingTab === "firstCourses" || rankingTab === "secondCourses"} />
            </section>

            <section className="rounded-lg border border-matica-line bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-black text-matica-ink">{selectedCompanyName ? "Resumen por empresa" : "Resumen por cliente"}</h2>
                  <p className="mt-1 text-sm font-semibold text-matica-ink/55">
                    Ordenado por facturación bruta descendente.
                  </p>
                </div>
                <Users className="h-6 w-6 text-matica-green" />
              </div>
              <ClientSummary rows={data.clients} />
            </section>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DateInput({
  disabled = false,
  label,
  value,
  onChange
}: {
  disabled?: boolean;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1">
      <span className="text-xs font-black uppercase text-matica-ink/45">{label}</span>
      <input
        className="matica-focus min-h-11 w-full rounded-lg border border-matica-line bg-white px-3 text-sm font-bold text-matica-ink"
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
      />
    </label>
  );
}

function KpiCard({ label, metric, format }: { label: string; metric: DashboardKpiValue; format: "money" | "number" }) {
  return (
    <article className="rounded-lg border border-matica-line bg-white p-4 shadow-sm">
      <p className="text-xs font-black uppercase text-matica-ink/45">{label}</p>
      <p className="mt-2 text-2xl font-black text-matica-ink">{formatValue(metric.value, format)}</p>
      {metric.previousValue !== null ? (
        <div className="mt-3 space-y-2">
          <p className="text-xs font-bold text-matica-ink/50">Anterior: {formatValue(metric.previousValue, format)}</p>
          <div className={`inline-flex min-h-8 items-center gap-1 rounded-lg px-2 text-xs font-black ${trendTheme(metric.trend)}`}>
            {trendIcon(metric.trend)}
            {metric.comparisonLabel ?? `${metric.changePercent}%`}
          </div>
        </div>
      ) : (
        <p className="mt-3 text-xs font-bold text-matica-ink/45">Comparación desactivada</p>
      )}
    </article>
  );
}

function EvolutionChart({ data, metric }: { data: DashboardResponse; metric: ChartMetric }) {
  const metricConfig = CHART_METRICS.find((item) => item.key === metric) ?? CHART_METRICS[0];
  const values = data.evolution.map((point) => Number(point[metric]));
  const comparisonKey = `${metric}Comparison` as const;
  const comparisonValues = data.evolution.map((point) => Number(point[comparisonKey] ?? 0));
  const max = Math.max(1, ...values, ...comparisonValues);
  const width = 720;
  const height = 260;
  const left = 44;
  const right = 16;
  const top = 22;
  const bottom = 42;
  const innerWidth = width - left - right;
  const innerHeight = height - top - bottom;
  const hasData = values.some((value) => value > 0) || comparisonValues.some((value) => value > 0);

  function pointAt(value: number, index: number) {
    const x = left + (data.evolution.length <= 1 ? innerWidth / 2 : (index / (data.evolution.length - 1)) * innerWidth);
    const y = top + innerHeight - (value / max) * innerHeight;

    return `${x},${y}`;
  }

  const currentPolyline = values.map(pointAt).join(" ");
  const comparisonPolyline = comparisonValues.map(pointAt).join(" ");

  if (!hasData) {
    return (
      <div className="mt-4 grid min-h-64 place-items-center rounded-lg border border-dashed border-matica-line bg-matica-soft p-6 text-center">
        <div>
          <CalendarDays className="mx-auto h-8 w-8 text-matica-green" />
          <p className="mt-2 text-sm font-black text-matica-ink">No hay pedidos en este periodo.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 overflow-x-auto">
      <svg className="min-w-[720px]" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Evolución de ${metricConfig.label}`}>
        {[0, 0.25, 0.5, 0.75, 1].map((step) => {
          const y = top + innerHeight - step * innerHeight;
          const label = formatValue(max * step, metricConfig.format);

          return (
            <g key={step}>
              <line x1={left} x2={width - right} y1={y} y2={y} stroke="#dce6db" strokeDasharray="4 4" />
              <text x={left - 8} y={y + 4} textAnchor="end" className="fill-matica-ink/45 text-[10px] font-bold">
                {label}
              </text>
            </g>
          );
        })}
        {data.comparisonPeriod ? (
          <polyline fill="none" stroke="#f4b65d" strokeDasharray="8 5" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" points={comparisonPolyline} />
        ) : null}
        <polyline fill="none" stroke="#145c3a" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" points={currentPolyline} />
        {data.evolution.map((point, index) => {
          const [x, y] = pointAt(values[index], index).split(",").map(Number);
          const comparisonValue = point[comparisonKey];

          return (
            <g key={point.date}>
              <circle cx={x} cy={y} r="4.5" fill="#145c3a">
                <title>
                  {formatDate(point.date)} · {metricConfig.label}: {formatValue(values[index], metricConfig.format)}
                  {comparisonValue !== null
                    ? ` · Anterior ${formatDate(point.comparisonDate ?? point.date)}: ${formatValue(Number(comparisonValue), metricConfig.format)}`
                    : ""}
                </title>
              </circle>
              {(index === 0 || index === data.evolution.length - 1 || index % Math.ceil(data.evolution.length / 6) === 0) ? (
                <text x={x} y={height - 16} textAnchor="middle" className="fill-matica-ink/50 text-[11px] font-bold">
                  {formatDate(point.date)}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      {data.comparisonPeriod ? (
        <div className="mt-2 flex flex-wrap gap-3 text-xs font-black">
          <span className="inline-flex items-center gap-2 text-matica-green">
            <span className="h-1.5 w-8 rounded-full bg-matica-green" />
            Periodo actual
          </span>
          <span className="inline-flex items-center gap-2 text-matica-amber">
            <span className="h-1.5 w-8 rounded-full bg-matica-amber" />
            Periodo anterior
          </span>
        </div>
      ) : null}
    </div>
  );
}

function RankingTable({
  rows,
  showPercentage
}: {
  rows: DashboardResponse["rankings"][RankingTab];
  showPercentage: boolean;
}) {
  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-matica-line">
      <table className="min-w-full divide-y divide-matica-line text-sm">
        <thead className="bg-matica-soft text-left text-xs font-black uppercase text-matica-ink/45">
          <tr>
            <th className="px-3 py-2">#</th>
            <th className="px-3 py-2">Nombre</th>
            <th className="px-3 py-2 text-right">Unidades</th>
            {showPercentage ? <th className="px-3 py-2 text-right">%</th> : <th className="px-3 py-2 text-right">Importe</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-matica-line bg-white">
          {rows.map((row, index) => (
            <tr key={row.key}>
              <td className="px-3 py-2 font-black text-matica-green">{index + 1}</td>
              <td className="px-3 py-2 font-bold text-matica-ink">{row.name}</td>
              <td className="px-3 py-2 text-right font-black">{row.units}</td>
              <td className="px-3 py-2 text-right font-bold">{showPercentage ? `${row.percentage ?? 0}%` : formatCurrency(row.revenue)}</td>
            </tr>
          ))}
          {!rows.length ? (
            <tr>
              <td className="px-3 py-6 text-center font-bold text-matica-ink/45" colSpan={4}>
                Sin datos para este ranking.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function ClientSummary({ rows }: { rows: DashboardResponse["clients"] }) {
  return (
    <div className="mt-4 space-y-3">
      {rows.map((row) => (
        <article key={row.key} className="rounded-lg border border-matica-line bg-matica-soft p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-black text-matica-ink">{row.name}</h3>
              {row.parentName ? <p className="text-xs font-bold text-matica-ink/45">{row.parentName}</p> : null}
            </div>
            <span className="rounded-lg bg-white px-2 py-1 text-xs font-black text-matica-green">{row.orderCount} pedidos</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <MiniMetric label="Facturación" value={formatCurrency(row.grossRevenue)} />
            <MiniMetric label="Factura empresa" value={formatCurrency(row.companyInvoice)} />
            <MiniMetric label="Total empleado" value={formatCurrency(row.employeeTotal)} />
            <MiniMetric label="Ticket medio" value={formatCurrency(row.averageTicket)} />
            <MiniMetric label="Clientes únicos" value={String(row.uniqueCustomers)} />
          </div>
        </article>
      ))}
      {!rows.length ? (
        <div className="rounded-lg border border-dashed border-matica-line bg-matica-soft p-5 text-center text-sm font-bold text-matica-ink/45">
          Sin datos para el periodo.
        </div>
      ) : null}
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white p-2">
      <p className="text-[11px] font-black uppercase text-matica-ink/40">{label}</p>
      <p className="mt-1 font-black text-matica-ink">{value}</p>
    </div>
  );
}
