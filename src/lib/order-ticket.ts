import { formatCurrency } from "@/lib/format";
import type { AdminOrder, OrderItem, OrderStatus } from "@/lib/types";

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pendiente_pago: "Pendiente pago",
  nuevo: "Nuevo",
  preparando: "En preparación",
  listo: "Listo",
  entregado: "Entregado",
  cancelado: "Cancelado"
};

const METADATA_LABELS: Record<string, string> = {
  categoria: "Categoría",
  first_course: "Primer plato",
  second_course: "Segundo plato",
  side: "Guarnición",
  sides: "Guarniciones",
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

export type MetadataEntry = {
  key: string;
  label: string;
  value: string;
};

export function orderReference(orderId: string) {
  return orderId.slice(0, 8).toUpperCase();
}

export function formatOrderDateTime(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;

  return new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

export function metadataEntries(metadata?: Record<string, string> | null): MetadataEntry[] {
  if (!metadata) {
    return [];
  }

  return Object.entries(metadata)
    .filter(([key, value]) => Boolean(value) && !key.startsWith("_") && key !== "display_name")
    .map(([key, value]) => ({
      key,
      label: METADATA_LABELS[key] ?? key.replaceAll("_", " ").replace(/^\w/, (letter) => letter.toUpperCase()),
      value
    }));
}

export function formatMetadataInline(metadata?: Record<string, string> | null) {
  return metadataEntries(metadata)
    .map((entry) => `${entry.label}: ${entry.value}`)
    .join(" · ");
}

function companyName(order: AdminOrder) {
  return order.companies?.name ?? "Cliente principal";
}

function branchName(order: AdminOrder) {
  return order.company_branches?.name ?? "Sin empresa interna";
}

function itemLine(item: OrderItem) {
  return `${item.quantity} x ${item.name} · ${formatCurrency(Number(item.unit_price))} · ${formatCurrency(Number(item.total_price))}`;
}

export function buildOrderPlainText(order: AdminOrder) {
  const lines = [
    "MATICA FRESH FOOD",
    "SERVICIO DE ENTREGA PARA EMPRESAS",
    "",
    `Referencia: ${orderReference(order.id)}`,
    `Fecha/hora: ${formatOrderDateTime(order.created_at)}`,
    `Cliente principal: ${companyName(order)}`,
    `Empresa interna: ${branchName(order)}`,
    "",
    "DATOS CLIENTE",
    `Nombre: ${order.customer_name}`,
    `Teléfono: ${order.customer_phone}`,
    `Email: ${order.customer_email}`,
    "",
    "PRODUCTOS"
  ];

  for (const item of order.order_items) {
    lines.push(itemLine(item));
    for (const entry of metadataEntries(item.metadata)) {
      lines.push(`> ${entry.label}: ${entry.value}`);
    }
  }

  if (order.notes) {
    lines.push("", "OBSERVACIONES", order.notes);
  }

  lines.push(
    "",
    "TOTALES",
    `Subtotal: ${formatCurrency(Number(order.subtotal))}`,
    `Subvención: -${formatCurrency(Number(order.subsidy_total))}`,
    `Factura empresa: ${formatCurrency(Number(order.subsidy_total))}`,
    `Total empleado: ${formatCurrency(Number(order.total))}`,
    "",
    "ESTADO DE PAGO",
    "PAGO EN SITIO / PENDIENTE DE COBRO ONLINE",
    "",
    `Estado pedido: ${ORDER_STATUS_LABELS[order.status]}`,
    "",
    "Gracias por confiar en Matica."
  );

  return lines.join("\n");
}
