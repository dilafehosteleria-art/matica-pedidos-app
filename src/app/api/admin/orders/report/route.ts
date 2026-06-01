import { NextRequest, NextResponse } from "next/server";
import { assertAdmin } from "@/lib/admin";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { AdminOrder } from "@/lib/types";

export const dynamic = "force-dynamic";

const REPORT_HEADERS = [
  "Fecha",
  "Pedido",
  "Cliente principal",
  "Empresa interna",
  "Nombre",
  "Email",
  "Telefono",
  "Estado",
  "Producto",
  "Detalles",
  "Cantidad",
  "Precio unidad",
  "Subvencion linea",
  "Total linea",
  "Subtotal pedido",
  "Subvencion pedido",
  "Total pedido",
  "Observaciones"
];

function currentMonthLabel() {
  return new Date().toISOString().slice(0, 7);
}

function getReportMonth(request: NextRequest) {
  const requestedMonth = request.nextUrl.searchParams.get("month")?.trim();

  return requestedMonth && /^\d{4}-\d{2}$/.test(requestedMonth) ? requestedMonth : currentMonthLabel();
}

function getMonthRange(monthLabel: string) {
  const [year, month] = monthLabel.split("-").map(Number);
  const monthIndex = month - 1;

  return {
    start: new Date(Date.UTC(year, monthIndex, 1)).toISOString(),
    end: new Date(Date.UTC(year, monthIndex + 1, 1)).toISOString()
  };
}

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);

  return `"${text.replaceAll('"', '""')}"`;
}

function moneyCell(value: unknown) {
  const amount = Number(value ?? 0);

  return Number.isFinite(amount) ? amount.toFixed(2).replace(".", ",") : "0,00";
}

function formatMetadata(metadata?: Record<string, string> | null) {
  if (!metadata) {
    return "";
  }

  return Object.entries(metadata)
    .filter(([key, value]) => Boolean(value) && !key.startsWith("_") && key !== "display_name")
    .map(([key, value]) => `${key}: ${value}`)
    .join(" | ");
}

function csvRow(values: unknown[]) {
  return values.map(csvCell).join(";");
}

export async function GET(request: NextRequest) {
  const adminError = assertAdmin(request);

  if (adminError) {
    return adminError;
  }

  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return NextResponse.json({ error: "Configura Supabase para usar el panel." }, { status: 503 });
  }

  const monthLabel = getReportMonth(request);
  const { start, end } = getMonthRange(monthLabel);

  const { data, error } = await supabase
    .from("orders")
    .select("*,order_items(*),companies(name),company_branches(name)")
    .gte("created_at", start)
    .lt("created_at", end)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const orders = (data as AdminOrder[] | null) ?? [];
  const rows = orders.flatMap((order) => {
    const items = order.order_items.length ? order.order_items : [null];

    return items.map((item) =>
      csvRow([
        new Date(order.created_at).toLocaleString("es-ES", { timeZone: "Europe/Madrid" }),
        order.id,
        order.companies?.name ?? "",
        order.company_branches?.name ?? "",
        order.customer_name,
        order.customer_email,
        order.customer_phone,
        order.status,
        item?.name ?? "",
        formatMetadata(item?.metadata),
        item?.quantity ?? "",
        item ? moneyCell(item.unit_price) : "",
        item ? moneyCell(item.subsidy_amount) : "",
        item ? moneyCell(item.total_price) : "",
        moneyCell(order.subtotal),
        moneyCell(order.subsidy_total),
        moneyCell(order.total),
        order.notes ?? ""
      ])
    );
  });

  const csv = [csvRow(REPORT_HEADERS), ...rows].join("\r\n");

  return new NextResponse(`\uFEFF${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="pedidos-${monthLabel}.csv"`
    }
  });
}
