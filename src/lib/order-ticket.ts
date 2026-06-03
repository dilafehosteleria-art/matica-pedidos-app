import { formatCurrency } from "@/lib/format";
import { operationalPaymentLabel } from "@/lib/payment-display";
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

function hasValue(metadata: Record<string, string>, key: string) {
  return Boolean(metadata[key]?.trim());
}

function appendEntry(entries: MetadataEntry[], metadata: Record<string, string>, key: string, label = METADATA_LABELS[key]) {
  const value = metadata[key]?.trim();

  if (value) {
    entries.push({
      key,
      label: label ?? key.replaceAll("_", " ").replace(/^\w/, (letter) => letter.toUpperCase()),
      value
    });
  }
}

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

export function orderItemOptionLines(metadata?: Record<string, string> | null): MetadataEntry[] {
  if (!metadata) {
    return [];
  }

  const entries: MetadataEntry[] = [];
  const usedKeys = new Set<string>(["bread", "categoria", "display_name"]);
  const side = metadata.side?.trim();

  if (hasValue(metadata, "first_course")) {
    appendEntry(entries, metadata, "first_course", "Primero");
    usedKeys.add("first_course");
  }

  if (hasValue(metadata, "second_course")) {
    entries.push({
      key: "second_course",
      label: "Segundo",
      value: side ? `${metadata.second_course.trim()} · Guarnición: ${side}` : metadata.second_course.trim()
    });
    usedKeys.add("second_course");
    usedKeys.add("side");
  }

  if (hasValue(metadata, "plate")) {
    entries.push({
      key: "plate",
      label: "Plato único",
      value: side ? `${metadata.plate.trim()} · Guarnición: ${side}` : metadata.plate.trim()
    });
    usedKeys.add("plate");
    usedKeys.add("side");
  }

  if (hasValue(metadata, "salad_size")) {
    appendEntry(entries, metadata, "salad_size", "Tamaño");
    usedKeys.add("salad_size");
  }

  if (hasValue(metadata, "salad_base")) {
    appendEntry(entries, metadata, "salad_base", "Bases");
    usedKeys.add("salad_base");
  }

  if (hasValue(metadata, "filling")) {
    appendEntry(entries, metadata, "filling", "Base");
    usedKeys.add("filling");
  }

  if (hasValue(metadata, "toppings")) {
    appendEntry(entries, metadata, "toppings", "Toppings");
    usedKeys.add("toppings");
  }

  if (hasValue(metadata, "protein")) {
    appendEntry(entries, metadata, "protein", "Proteína");
    usedKeys.add("protein");
  }

  if (hasValue(metadata, "main_protein")) {
    appendEntry(entries, metadata, "main_protein", "Proteína principal");
    usedKeys.add("main_protein");
  }

  if (hasValue(metadata, "sides")) {
    appendEntry(entries, metadata, "sides", "Guarniciones");
    usedKeys.add("sides");
  }

  if (hasValue(metadata, "sauce")) {
    appendEntry(entries, metadata, "sauce", "Salsa");
    usedKeys.add("sauce");
  }

  if (hasValue(metadata, "dressing")) {
    appendEntry(entries, metadata, "dressing", "Aliño");
    usedKeys.add("dressing");
  }

  if (hasValue(metadata, "drink_or_dessert")) {
    appendEntry(entries, metadata, "drink_or_dessert", "Bebida o postre");
    usedKeys.add("drink_or_dessert");
  }

  if (hasValue(metadata, "drink")) {
    appendEntry(entries, metadata, "drink", "Bebida");
    usedKeys.add("drink");
  }

  if (hasValue(metadata, "dessert")) {
    appendEntry(entries, metadata, "dessert", "Postre");
    usedKeys.add("dessert");
  }

  if (hasValue(metadata, "sandwich")) {
    appendEntry(entries, metadata, "sandwich", "Bocadillo");
    usedKeys.add("sandwich");
  }

  for (const entry of metadataEntries(metadata)) {
    if (!usedKeys.has(entry.key) && !entry.key.startsWith("_")) {
      entries.push(entry);
      usedKeys.add(entry.key);
    }
  }

  if (hasValue(metadata, "bread")) {
    appendEntry(entries, metadata, "bread", "Pan");
  }

  return entries;
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
    for (const entry of orderItemOptionLines(item.metadata)) {
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
    operationalPaymentLabel(order).toUpperCase(),
    "",
    `Estado pedido: ${ORDER_STATUS_LABELS[order.status]}`,
    "",
    "Gracias por confiar en Matica."
  );

  return lines.join("\n");
}
