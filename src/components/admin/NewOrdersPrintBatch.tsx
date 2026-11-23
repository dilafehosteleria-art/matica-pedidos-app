"use client";

import { Printer } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { toDateInputValue } from "@/lib/format";
import { isLocalOrder, orderReference } from "@/lib/order-ticket";
import { isConfirmedPayment } from "@/lib/order-validity";
import type { AdminOrder } from "@/lib/types";
import { ThermalTicket } from "./ThermalTicket";

type PrintedOrders = { day: string; ids: string[] };
type PrintMode = "separate" | "combined";
type PrintRun = { day: string; jobs: AdminOrder[][]; index: number };
const modeKey = "matica:admin:print-mode";

type PrintBatchProps = {
  orders: AdminOrder[];
  pin: string;
  onUpdated: () => Promise<void>;
  onUnauthorized: () => void;
};

const storageKey = "matica:admin:printed-orders";
const buttonClass = "matica-focus inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-black disabled:cursor-not-allowed disabled:opacity-50";
let cached: PrintedOrders | null = null;

// The kitchen tab retains only IDs whose physical printing the operator confirmed.
function readPrinted(day: string): string[] {
  if (cached?.day === day) return cached.ids;
  let ids: string[] = [];
  try {
    const raw = window.sessionStorage.getItem(storageKey);
    if (raw) {
      const stored = JSON.parse(raw) as PrintedOrders;
      if (stored?.day === day && Array.isArray(stored.ids) && stored.ids.every((id) => typeof id === "string")) {
        ids = stored.ids;
      } else {
        window.sessionStorage.removeItem(storageKey);
      }
    }
  } catch {
    // Keep the same workflow in memory when browser storage is unavailable.
  }
  cached = { day, ids };
  return ids;
}

function savePrinted(day: string, ids: string[]) {
  cached = { day, ids };
  try {
    if (ids.length) window.sessionStorage.setItem(storageKey, JSON.stringify(cached));
    else window.sessionStorage.removeItem(storageKey);
  } catch {
    // cached still contains this tab's latest confirmed IDs.
  }
  window.dispatchEvent(new Event(storageKey));
}

function confirmPrinted(day: string, ids: string[], question: string) {
  if (day === toDateInputValue() && window.confirm(question)) {
    savePrinted(day, Array.from(new Set([...readPrinted(day), ...ids])));
  }
}

// Some browsers return from print() while the system dialog is still open.
function printAndWaitForClose(onClose: () => void) {
  function cleanup() {
    window.removeEventListener("afterprint", finish);
    window.removeEventListener("pointerdown", finish);
    window.removeEventListener("keydown", finish);
  }
  function finish() {
    cleanup();
    window.setTimeout(onClose, 0);
  }
  window.addEventListener("afterprint", finish);
  // A few mobile print dialogs omit afterprint. The next interaction is on the page again.
  window.addEventListener("pointerdown", finish);
  window.addEventListener("keydown", finish);
  try {
    window.print();
  } catch (error) {
    cleanup();
    throw error;
  }
}

export function printIndividualKitchenTicket(order: AdminOrder, daily = true) {
  const day = toDateInputValue();
  if (!daily || order.status !== "nuevo" || isLocalOrder(order) || !isConfirmedPayment(order) ||
      toDateInputValue(new Date(order.created_at)) !== day) {
    window.print();
    return;
  }
  printAndWaitForClose(() => confirmPrinted(day, [order.id], `¿Se ha impreso correctamente la comanda ${orderReference(order.id)}?`));
}

export function NewOrdersPrintBatch({ orders, pin, onUpdated, onUnauthorized }: PrintBatchProps) {
  const day = toDateInputValue();
  const [confirmed, setConfirmed] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<PrintMode>("separate");
  const [run, setRun] = useState<PrintRun | null>(null);
  const [printing, setPrinting] = useState<AdminOrder[]>([]);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const update = () => setConfirmed(readPrinted(day));
    update();
    setReady(true);
    window.addEventListener(storageKey, update);
    return () => window.removeEventListener(storageKey, update);
  }, [day]);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(modeKey) === "combined") setMode("combined");
    } catch {
      // This station can still choose a mode with storage disabled.
    }
  }, []);

  function chooseMode(next: PrintMode) {
    setMode(next);
    try {
      window.localStorage.setItem(modeKey, next);
    } catch {
      // The selection applies for the current visit.
    }
  }

  const confirmedIds = new Set(confirmed);
  const unprinted = orders.filter((order) => !confirmedIds.has(order.id));

  const activeRun = run?.day === day ? run : null;
  const currentJob = activeRun?.jobs[activeRun.index];

  function openJob(next: PrintRun) {
    const job = [...next.jobs[next.index]];
    flushSync(() => {
      setMessage("");
      setRun(next);
      setPrinting(job);
    });
    try {
      printAndWaitForClose(() => setPrinting((previous) => previous === job ? [] : previous));
    } catch {
      setRun(null);
      setPrinting([]);
      setMessage("No se pudo abrir la impresión. Las comandas pendientes siguen disponibles.");
    }
  }

  function printNew() {
    if (!unprinted.length) return;
    // A separate call to print for each receipt lets the driver cut at the end of each job.
    const jobs = mode === "separate" ? unprinted.map((order) => [order]) : [unprinted];
    openJob({ day, jobs, index: 0 });
  }

  function confirmCurrentJob() {
    if (!activeRun || !currentJob || activeRun.day !== toDateInputValue()) return;
    const printedIds = new Set(readPrinted(day));
    currentJob.forEach((order) => printedIds.add(order.id));
    savePrinted(day, [...printedIds]);

    const newIds = new Set(orders.map((order) => order.id));
    const nextIndex = activeRun.jobs.findIndex((job, index) =>
      index > activeRun.index && job.some((order) => newIds.has(order.id) && !printedIds.has(order.id))
    );
    if (nextIndex !== -1) {
      openJob({ ...activeRun, index: nextIndex });
      return;
    }
    setRun(null);
    setPrinting([]);
    setMessage("Impresión confirmada. Ya puedes pasar las comandas impresas a preparación.");
  }

  function stopRun() {
    setRun(null);
    setPrinting([]);
    setMessage("Tanda detenida. Las comandas sin confirmar se podrán volver a imprimir.");
  }

  async function preparePrinted() {
    const ids = readPrinted(toDateInputValue());
    if (!ids.length || sending || day !== toDateInputValue()) return;
    setSending(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/orders/prepare-printed", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-pin": pin },
        body: JSON.stringify({ orderIds: ids })
      });
      if (response.status === 401) {
        onUnauthorized();
        return;
      }
      const result = await response.json();
      if (!response.ok) {
        setMessage(result.error ?? "No se pudo pasar el lote a preparación. Puedes volver a intentarlo.");
        return;
      }
      const processed = new Set(ids);
      if (day === toDateInputValue()) savePrinted(day, readPrinted(day).filter((id) => !processed.has(id)));
      setMessage(`En preparación: ${result.updatedIds.length}.${result.skipped ? ` Omitidas: ${result.skipped} (ya no estaban disponibles en Nuevos).` : ""}`);
      try {
        await onUpdated();
      } catch {
        setMessage("Lote procesado. Actualiza el panel para ver los cambios.");
      }
    } catch {
      setMessage("No se pudo confirmar el resultado. Puedes reintentar este mismo lote.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-2 print:hidden">
      <div className="flex flex-wrap items-center gap-2">
        {activeRun && currentJob ? (
          <>
            <p className="w-full text-sm font-bold" role="status">
              {currentJob.length === 1
                ? `Comanda ${activeRun.index + 1} de ${activeRun.jobs.length} · Ref. ${orderReference(currentJob[0].id)}`
                : `Lote de ${currentJob.length} comandas`}
            </p>
            <button type="button" className={`${buttonClass} bg-matica-green text-white`} onClick={confirmCurrentJob}>
              {activeRun.index + 1 < activeRun.jobs.length ? "Ha salido · Imprimir siguiente" : "Confirmar impresión"}
            </button>
            <button type="button" className={`${buttonClass} border border-matica-line`} onClick={() => openJob(activeRun)}>
              Reimprimir
            </button>
            <button type="button" className={buttonClass} onClick={stopRun}>Detener tanda</button>
          </>
        ) : (
          <>
            <button type="button" disabled={!ready || !unprinted.length || sending} className={`${buttonClass} bg-matica-green text-white`} onClick={printNew}>
              <Printer size={16} aria-hidden="true" />
              Imprimir todas las comandas nuevas ({unprinted.length})
            </button>
            <label className="flex items-center gap-2 text-sm font-semibold text-matica-ink">
              Impresión
              <select
                className="matica-focus rounded border border-matica-line bg-white px-2 py-2"
                value={mode}
                onChange={(event) => chooseMode(event.target.value as PrintMode)}
              >
                <option value="separate">Una comanda por trabajo</option>
                <option value="combined">Todo en un trabajo</option>
              </select>
            </label>
          </>
        )}
        {!activeRun && confirmed.length > 0 ? (
          <button type="button" disabled={sending} className={`${buttonClass} border border-matica-green text-matica-green`} onClick={preparePrinted}>
            Pasar impresas a En preparación ({confirmed.length})
          </button>
        ) : null}
      </div>
      {message ? <p role="status" className="text-sm font-semibold">{message}</p> : null}
      {printing.length > 0 ? createPortal(
        <div className="order-batch-print">
          {printing.map((order) => <ThermalTicket key={order.id} order={order} />)}
        </div>, document.body
      ) : null}
    </div>
  );
}
