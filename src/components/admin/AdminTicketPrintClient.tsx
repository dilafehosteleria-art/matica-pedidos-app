"use client";

import { Loader2, Printer } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ADMIN_PIN_KEY } from "./AdminGate";
import { ThermalTicket } from "./ThermalTicket";
import type { AdminOrder } from "@/lib/types";

type AdminTicketPrintClientProps = {
  orderId: string;
};

type LoadState =
  | { status: "loading" }
  | { status: "missing-pin" }
  | { status: "error"; message: string }
  | { status: "ready"; order: AdminOrder };

export function AdminTicketPrintClient({ orderId }: AdminTicketPrintClientProps) {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    const pin = window.localStorage.getItem(ADMIN_PIN_KEY) ?? "";

    if (!pin) {
      setState({ status: "missing-pin" });
      return;
    }

    let active = true;

    async function loadOrder() {
      try {
        const response = await fetch(`/api/admin/orders/${orderId}`, {
          headers: {
            "x-admin-pin": pin
          }
        });
        const payload = (await response.json()) as { error?: string; order?: AdminOrder };

        if (!active) {
          return;
        }

        if (!response.ok || !payload.order) {
          setState({ status: "error", message: payload.error ?? "No se pudo cargar el pedido." });
          return;
        }

        setState({ status: "ready", order: payload.order });
      } catch {
        if (active) {
          setState({ status: "error", message: "No se pudo cargar el pedido." });
        }
      }
    }

    void loadOrder();

    return () => {
      active = false;
    };
  }, [orderId]);

  return (
    <main className="ticket-print-page">
      <style>{ticketPrintStyles}</style>
      <div className="ticket-screen-actions">
        <button className="ticket-print-button" onClick={() => window.print()} type="button">
          <Printer aria-hidden="true" size={18} />
          Imprimir
        </button>
        <Link className="ticket-back-link" href="/admin/pedidos">
          Volver a pedidos
        </Link>
      </div>

      {state.status === "loading" ? (
        <div className="ticket-print-message">
          <Loader2 aria-hidden="true" size={20} />
          Cargando ticket
        </div>
      ) : null}

      {state.status === "missing-pin" ? (
        <div className="ticket-print-message">
          Abre primero el panel de pedidos e introduce el PIN admin.
        </div>
      ) : null}

      {state.status === "error" ? (
        <div className="ticket-print-message">{state.message}</div>
      ) : null}

      {state.status === "ready" ? <ThermalTicket className="ticket-print-ticket" order={state.order} /> : null}
    </main>
  );
}

const ticketPrintStyles = `
  .ticket-print-page {
    min-height: 100vh;
    margin: 0;
    padding: 16px;
    background: #f3f4f6;
    color: #000;
    font-family: Arial, sans-serif;
  }

  .ticket-screen-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: center;
    margin: 0 auto 16px;
    max-width: 320px;
  }

  .ticket-print-button,
  .ticket-back-link {
    align-items: center;
    background: #111827;
    border: 0;
    border-radius: 6px;
    color: #fff;
    cursor: pointer;
    display: inline-flex;
    font-size: 14px;
    font-weight: 700;
    gap: 8px;
    min-height: 40px;
    padding: 0 14px;
    text-decoration: none;
  }

  .ticket-back-link {
    background: #fff;
    border: 1px solid #d1d5db;
    color: #111827;
  }

  .ticket-print-message {
    align-items: center;
    background: #fff;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    display: flex;
    gap: 8px;
    justify-content: center;
    margin: 0 auto;
    max-width: 320px;
    padding: 16px;
  }

  .ticket-print-ticket {
    background: #fff;
    box-sizing: border-box;
    color: #000;
    font-family: "Courier New", Courier, monospace;
    font-size: 16px;
    font-weight: 700;
    line-height: 1.35;
    margin: 0 auto;
    padding: 0;
    /* Prueba temporal para impresoras termicas de 80 mm. */
    max-width: 72mm;
    width: 72mm;
  }

  .ticket-print-ticket h1,
  .ticket-print-ticket p {
    margin: 0;
  }

  .ticket-print-ticket h1 {
    font-size: 20px;
    line-height: 1.2;
  }

  .ticket-center {
    text-align: center;
  }

  .ticket-primary-client {
    overflow-wrap: anywhere;
    word-break: normal;
  }

  .ticket-separator {
    border-top: 1px dashed #000;
    margin: 10px 0;
  }

  .ticket-highlight,
  .ticket-section-title,
  .ticket-field-label,
  .ticket-option-label,
  .ticket-payment-status {
    font-weight: 900;
    text-transform: uppercase;
  }

  .ticket-field-block,
  .ticket-option-block {
    margin-top: 10px;
  }

  .ticket-field-value,
  .ticket-option {
    margin-top: 2px;
    overflow-wrap: anywhere;
    word-break: normal;
  }

  .ticket-item {
    margin-top: 12px;
  }

  .ticket-item-main,
  .ticket-total {
    display: flex;
    gap: 6px;
    justify-content: space-between;
  }

  .ticket-item-name {
    flex: 1 1 auto;
    overflow-wrap: anywhere;
  }

  .ticket-item-price {
    flex: 0 0 auto;
  }

  .ticket-total {
    margin-top: 3px;
  }

  .ticket-total-strong {
    border-top: 1px solid #000;
    margin-top: 6px;
    padding-top: 5px;
    text-transform: uppercase;
  }

  .ticket-note {
    overflow-wrap: anywhere;
  }

  @media print {
    @page {
      size: 58mm auto;
      margin: 2mm;
    }

    html,
    body {
      width: 58mm;
      margin: 0;
      padding: 0;
      background: #fff;
    }

    .ticket-print-page {
      min-height: auto;
      margin: 0;
      padding: 0;
      background: #fff;
      visibility: visible;
    }

    .ticket-screen-actions,
    .ticket-print-message {
      display: none !important;
    }

    .ticket-print-ticket,
    .ticket-print-ticket * {
      visibility: visible;
    }

    .ticket-print-ticket {
      box-shadow: none;
      margin: 0;
      /* Prueba temporal para impresoras termicas de 80 mm. */
      max-width: 72mm;
      width: 72mm;
    }
  }
`;
