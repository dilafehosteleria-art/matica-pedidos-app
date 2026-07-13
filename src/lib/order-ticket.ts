import { formatCurrency } from "./format.ts";
import { buildOrderItemOptionLines } from "./order-metadata.ts";
import { operationalPaymentLabel } from "./payment-display.ts";
import type { AdminOrder, OrderItem, OrderStatus } from "./types.ts";

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
  wrap_base: "Base",
  wrap_protein: "Proteína",
  wrap_toppings: "Toppings",
  wrap_sauces: "Salsas",
  main_protein: "Proteína principal",
  drink: "Bebida",
  dessert: "Postre",
  bread: "Pan",
  cutlery: "Cubiertos",
  suplementos: "Suplementos"
};

export type MetadataEntry = {
  key: string;
  label: string;
  value: string;
  values?: string[];
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

export function thermalTicketText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/\u20ac/g, "EUR")
    .replace(/[^\x20-\x7E\r\n]/g, "");
}

export function formatThermalCurrency(value: number) {
  return thermalTicketText(formatCurrency(value));
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

export function metadataEntryValues(entry: Pick<MetadataEntry, "value" | "values">) {
  if (entry.values?.length) {
    return entry.values;
  }

  return entry.value
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);
}

export function orderItemOptionLines(metadata?: Record<string, string> | null): MetadataEntry[] {
  return buildOrderItemOptionLines(metadata);
}

function companyName(order: AdminOrder) {
  return order.companies?.name ?? "Cliente principal";
}

function companyAddress(order: AdminOrder) {
  return order.companies?.delivery_address?.trim() ?? "";
}

function branchName(order: AdminOrder) {
  return order.company_branches?.name ?? "Sin empresa interna";
}

function itemLine(item: OrderItem) {
  return `${item.quantity} x ${item.name}`;
}

function thermalItemLine(item: OrderItem) {
  return `${item.quantity}x ${thermalTicketText(item.name)} - ${formatThermalCurrency(Number(item.total_price))}`;
}

export function orderEmployeeTotal(order: Pick<AdminOrder, "employee_total" | "total">) {
  return Number(order.employee_total ?? order.total);
}

export function orderCompanyInvoiceTotal(order: Pick<AdminOrder, "company_invoice_total" | "subsidy_total">) {
  return Number(order.company_invoice_total ?? order.subsidy_total);
}

export function thermalPaymentLabel(
  order: Pick<AdminOrder, "payment_method" | "payment_status" | "employee_total" | "company_invoice_total">
) {
  if (Number(order.employee_total ?? 0) === 0 && Number(order.company_invoice_total ?? 0) > 0) {
    return "Pago a cargo de empresa";
  }

  if (order.payment_method === "stripe_card" || order.payment_method === "stripe_bizum") {
    return order.payment_status === "paid" ? "Pago online" : operationalPaymentLabel(order);
  }

  return "Pago a la entrega";
}

export function formatCompanyDisplayName(value: string) {
  const normalized = value.trim().replace(/\s+/g, " ");

  if (!normalized || normalized !== normalized.toUpperCase() || normalized.length <= 4) {
    return normalized;
  }

  return normalized
    .toLowerCase()
    .split(" ")
    .map((word) => {
      if (word.length <= 2) {
        return word.toUpperCase();
      }

      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

export function buildOrderPlainText(order: AdminOrder) {
  const lines = [
    "MATICA FRESH FOOD",
    "SERVICIO DE ENTREGA PARA EMPRESAS",
    "",
    `Referencia: ${orderReference(order.id)}`,
    `Fecha/hora: ${formatOrderDateTime(order.created_at)}`,
    "",
    "CLIENTE PRINCIPAL",
    companyName(order),
    "",
    "EMPRESA",
    formatCompanyDisplayName(branchName(order)),
    ...(companyAddress(order) ? ["", "DIRECCIÓN DE ENTREGA", companyAddress(order)] : []),
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
      lines.push("", entry.label.toUpperCase());
      for (const value of metadataEntryValues(entry)) {
        lines.push(`> ${value}`);
      }
    }
    lines.push("");
  }

  if (order.notes) {
    lines.push("", "OBSERVACIONES", order.notes);
  }

  lines.push(
    "",
    "TOTALES",
    `Subtotal: ${formatCurrency(Number(order.subtotal))}`,
    `Subvención: -${formatCurrency(Number(order.subsidy_total))}`,
    `Factura empresa: ${formatCurrency(orderCompanyInvoiceTotal(order))}`,
    `Total empleado: ${formatCurrency(orderEmployeeTotal(order))}`,
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

export function buildThermalOrderPlainText(order: AdminOrder) {
  const lines = [
    thermalTicketText(companyName(order)).toUpperCase(),
    "------------------------------",
    `REF: ${orderReference(order.id)}`,
    `FECHA: ${thermalTicketText(formatOrderDateTime(order.created_at))}`,
    `CLIENTE: ${thermalTicketText(order.customer_name)}`,
    "",
    "EMPRESA",
    `> ${thermalTicketText(formatCompanyDisplayName(branchName(order)))}`,
    ...(companyAddress(order) ? ["", "DIRECCION", `> ${thermalTicketText(companyAddress(order))}`] : []),
    "------------------------------",
    "PRODUCTOS"
  ];

  for (const item of order.order_items) {
    lines.push(thermalItemLine(item));
    for (const entry of orderItemOptionLines(item.metadata)) {
      lines.push(thermalTicketText(entry.label).toUpperCase());
      for (const value of metadataEntryValues(entry)) {
        const thermalValue = entry.key === "cutlery" ? thermalTicketText(value).toUpperCase() : thermalTicketText(value);

        lines.push(`> ${thermalValue}`);
      }
    }
    lines.push("");
  }

  if (order.notes) {
    lines.push("------------------------------", `OBSERVACIONES: ${thermalTicketText(order.notes)}`);
  }

  lines.push(
    "------------------------------",
    `Subtotal: ${formatThermalCurrency(Number(order.subtotal))}`,
    `Subvencion: -${formatThermalCurrency(Number(order.subsidy_total))}`,
    `Factura empresa: ${formatThermalCurrency(orderCompanyInvoiceTotal(order))}`,
    `Total empleado: ${formatThermalCurrency(orderEmployeeTotal(order))}`,
    "------------------------------",
    "ESTADO DE PAGO:",
    thermalTicketText(thermalPaymentLabel(order)).toUpperCase(),
    `ESTADO PEDIDO: ${thermalTicketText(ORDER_STATUS_LABELS[order.status])}`,
    "------------------------------",
    "Gracias por confiar en Matica."
  );

  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}
