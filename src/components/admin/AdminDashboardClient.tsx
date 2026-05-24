"use client";

import { AlertCircle, Clock, Loader2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminGate } from "./AdminGate";
import { formatCurrency, formatTime } from "@/lib/format";
import type { AdminOrder, OrderStatus } from "@/lib/types";

const COLUMNS: { status: OrderStatus; title: string }[] = [
  { status: "nuevo", title: "Nuevos" },
  { status: "preparando", title: "En preparación" },
  { status: "listo", title: "Listos" },
  { status: "entregado", title: "Entregados" },
  { status: "cancelado", title: "Cancelados" }
];

const STATUS_OPTIONS: { status: OrderStatus; label: string }[] = [
  { status: "nuevo", label: "Nuevo" },
  { status: "preparando", label: "En preparación" },
  { status: "listo", label: "Listo" },
  { status: "entregado", label: "Entregado" },
  { status: "cancelado", label: "Cancelado" }
];

export function AdminDashboardClient() {
  return (
    <AdminGate title="Panel de pedidos" subtitle="Pedidos Bureau Veritas ordenados por hora.">
      {(pin, clearPin) => <OrdersBoard pin={pin} clearPin={clearPin} />}
    </AdminGate>
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
    return COLUMNS.reduce<Record<OrderStatus, AdminOrder[]>>(
      (acc, column) => {
        acc[column.status] = orders.filter((order) => order.status === column.status);
        return acc;
      },
      { nuevo: [], preparando: [], listo: [], entregado: [], cancelado: [] }
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
        >
          <RefreshCw className="h-4 w-4" />
          Actualizar
        </button>
      </div>

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
        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-5">
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
  const branchName = order.company_branches?.name ?? "Bureau Veritas";

  return (
    <article className="rounded-lg border border-matica-line bg-matica-soft p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-black">{order.customer_name}</h3>
          <p className="text-xs font-bold text-matica-green">{branchName}</p>
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
                {Object.values(item.metadata).filter(Boolean).join(" · ")}
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
