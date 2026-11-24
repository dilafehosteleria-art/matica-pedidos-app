"use client";

import { ChevronDown } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import type { DailyOrderCounts, DailyOrderSummary } from "@/lib/admin-daily-summary";

function summaryDateLabel(date: string) {
  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Madrid"
  }).format(new Date(`${date}T12:00:00Z`));
}

function PreviousStatusesNote({ counts }: { counts: DailyOrderCounts }) {
  if (!counts.ready && !counts.delivered) {
    return null;
  }

  return (
    <span className="mt-1 block text-xs font-semibold leading-4 text-matica-ink/60">
      Incluye {counts.ready} {counts.ready === 1 ? "listo" : "listos"} y {counts.delivered}{" "}
      {counts.delivered === 1 ? "entregado" : "entregados"}
    </span>
  );
}

function SummaryTableRow({
  title,
  counts,
  total = false
}: {
  title: string;
  counts: DailyOrderCounts;
  total?: boolean;
}) {
  return (
    <tr className={`border-b border-matica-line ${total ? "bg-matica-mint font-black" : "font-semibold"}`}>
      <th className="break-words px-3 py-3 text-left" scope="row">{title}</th>
      <td className="px-2 py-3 text-right tabular-nums">{counts.newOrders}</td>
      <td className="px-2 py-3 text-right tabular-nums">{counts.preparing}</td>
      <td className="px-2 py-3 text-right tabular-nums">{counts.local}</td>
      <td className="px-2 py-3 text-right tabular-nums text-red-700">{counts.cancelled}</td>
      <td className="px-3 py-3 text-right align-top font-black tabular-nums text-matica-green">
        {counts.total}
        <PreviousStatusesNote counts={counts} />
      </td>
    </tr>
  );
}

function SummaryMobileRow({
  title,
  counts,
  total = false
}: {
  title: string;
  counts: DailyOrderCounts;
  total?: boolean;
}) {
  return (
    <div className={`border-b border-matica-line px-3 py-3 ${total ? "bg-matica-mint" : ""}`}>
      <h4 className="break-words text-sm font-black">{title}</h4>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-matica-ink/65">Nuevos</dt>
          <dd className="font-black tabular-nums">{counts.newOrders}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-matica-ink/65">En preparación</dt>
          <dd className="font-black tabular-nums">{counts.preparing}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-matica-ink/65">Local y recogida</dt>
          <dd className="font-black tabular-nums">{counts.local}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-matica-ink/65">Cancelados</dt>
          <dd className="font-black tabular-nums text-red-700">{counts.cancelled}</dd>
        </div>
        <div className="col-span-2 flex items-start justify-between gap-3 border-t border-matica-line pt-2 text-sm">
          <dt className="font-bold">Total válido</dt>
          <dd className="text-right font-black tabular-nums text-matica-green">
            {counts.total}
            <PreviousStatusesNote counts={counts} />
          </dd>
        </div>
      </dl>
    </div>
  );
}

export function DailyOrdersSummary({
  summary,
  loading,
  visible,
  children
}: {
  summary: DailyOrderSummary | null;
  loading: boolean;
  visible: boolean;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();

  return (
    <section className="mb-4 rounded-lg border border-matica-line bg-white p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
        {visible ? (
          <button
            className="matica-focus flex min-h-16 items-center gap-3 rounded-lg bg-matica-mint px-3 py-2 text-left disabled:cursor-default lg:w-72 lg:flex-none"
            aria-expanded={Boolean(summary && expanded)}
            aria-controls={summary ? detailsId : undefined}
            disabled={!summary}
            onClick={() => setExpanded((current) => !current)}
            type="button"
          >
            <span className="text-3xl font-black tabular-nums text-matica-green">{summary ? summary.totals.total : "—"}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-black text-matica-ink">Pedidos de hoy</span>
              <span className="mt-0.5 block text-xs font-semibold text-matica-green">
                {summary ? (expanded ? "Ocultar resumen" : "Ver resumen del día") : loading ? "Cargando resumen…" : "Resumen no disponible"}
              </span>
            </span>
            {summary ? <ChevronDown className={`h-5 w-5 flex-none ${expanded ? "rotate-180" : ""}`} aria-hidden="true" /> : null}
          </button>
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {children}
        </div>
      </div>

      {visible && summary ? (
        <div id={detailsId} hidden={!expanded} className="mt-4 border-t border-matica-line pt-4">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-black">Resumen del día</h3>
            <p className="text-xs font-semibold text-matica-ink/60">{summaryDateLabel(summary.date)}</p>
          </div>

          <table className="hidden w-full table-fixed text-sm md:table" aria-label="Pedidos del día por empresa y estado">
            <thead>
              <tr className="text-xs font-semibold text-matica-ink/65">
                <th className="w-[26%] px-3 pb-3 text-left" scope="col">Empresa</th>
                <th className="px-2 pb-3 text-right" scope="col">Nuevos<span className="mt-1 block font-normal">reparto</span></th>
                <th className="px-2 pb-3 text-right" scope="col">En preparación<span className="mt-1 block font-normal">reparto</span></th>
                <th className="px-2 pb-3 text-right" scope="col">Comer en el local<span className="mt-1 block font-normal">incl. recogida</span></th>
                <th className="px-2 pb-3 text-right" scope="col">Cancelados</th>
                <th className="px-3 pb-3 text-right" scope="col">Total válido</th>
              </tr>
            </thead>
            <tbody>
              <SummaryTableRow title="Total del día" counts={summary.totals} total />
              {summary.companies.map((company) => (
                <SummaryTableRow key={company.companyId} title={company.companyName} counts={company} />
              ))}
            </tbody>
          </table>

          <div className="md:hidden">
            <SummaryMobileRow title="Total del día" counts={summary.totals} total />
            {summary.companies.map((company) => (
              <SummaryMobileRow key={company.companyId} title={company.companyName} counts={company} />
            ))}
          </div>

          {!summary.companies.length ? (
            <p className="py-4 text-center text-sm font-semibold text-matica-ink/60">Todavía no hay pedidos confirmados hoy.</p>
          ) : null}
          <p className="mt-3 text-xs font-semibold leading-5 text-matica-ink/60">
            Total válido sin cancelados. Nuevos y En preparación corresponden a reparto; Comer en el local incluye recogida.
          </p>
        </div>
      ) : null}
    </section>
  );
}
