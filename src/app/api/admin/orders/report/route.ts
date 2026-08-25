import { deflateRawSync } from "node:zlib";
import { NextRequest, NextResponse } from "next/server";
import { operationalPaymentLabel, paymentMethodLabel, paymentStatusLabel } from "@/lib/payment-display";
import { formatOrderMetadataForReport } from "@/lib/order-metadata";
import { orderCompanyInvoiceTotal, orderEmployeeTotal } from "@/lib/order-ticket";
import { isBillableOrder } from "@/lib/order-validity";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { AdminOrder, CompanyBranch, OrderStatus, Company } from "@/lib/types";
import { buildStyledWorksheetXml } from "@/lib/xlsx-worksheet";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TIME_ZONE = "Europe/Madrid";
const VALID_STATUSES: OrderStatus[] = ["nuevo", "preparando", "listo", "entregado"];

const DETAIL_HEADERS = [
  "Fecha",
  "Pedido",
  "Cliente principal",
  "Empresa interna",
  "Nombre",
  "Email",
  "Telefono",
  "Estado",
  "Metodo de pago",
  "Estado de pago",
  "Tipo facturación",
  "Producto",
  "Detalles",
  "Cantidad",
  "Precio unidad",
  "Subvencion linea",
  "Total linea",
  "Subtotal facturable",
  "Subvención facturable",
  "Total cobrar empleado",
  "Total facturar empresa",
  "Observaciones"
];

const SUMMARY_HEADERS = [
  "Cliente principal",
  "Empresa interna",
  "Numero pedidos",
  "Nº menus",
  "Nº medios menus",
  "Subtotal acumulado",
  "Subvencion acumulada",
  "Importe subvencionado total",
  "Total cobrar empleado",
  "Total facturar empresa"
];

const BILLING_TYPES = ["all", "subsidized", "non_subsidized", "company_billed", "employee_billed"] as const;

type BillingType = (typeof BILLING_TYPES)[number];

type ReportFilters = {
  dateFrom: string;
  dateTo: string;
  companyId: string;
  branchId: string;
  status: string;
  paymentMethod: string;
  paymentStatus: string;
  billingType: BillingType;
  onlyCompanyBillable: boolean;
  excludeCancelled: boolean;
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

type ReportOrder = AdminOrder & {
  companies?: { id?: string; name: string } | null;
  company_branches?: {
    id?: string;
    name: string;
    fiscal_name?: string | null;
    tax_id?: string | null;
    fiscal_address?: string | null;
    fiscal_city?: string | null;
    fiscal_postal_code?: string | null;
  } | null;
};

const REPORT_ORDER_SELECT_WITH_FISCAL_DATA =
  "*,order_items(*),companies(id,name),company_branches(id,name,fiscal_name,tax_id,fiscal_address,fiscal_city,fiscal_postal_code)";
const REPORT_ORDER_SELECT_LEGACY =
  "*,order_items(*),companies(id,name),company_branches(id,name)";

function isMissingFiscalBranchColumnError(error: { message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? "";
  return [
    "fiscal_name",
    "tax_id",
    "fiscal_address",
    "fiscal_city",
    "fiscal_postal_code"
  ].some((column) => message.includes(column));
}

type ReportLine = {
  order: ReportOrder;
  item: ReportOrder["order_items"][number] | null;
  lineSubtotal: number;
  lineSubsidy: number;
  lineTotal: number;
  lineEmployeeTotal: number;
  lineCompanyInvoiceTotal: number;
  billingType: "Subvencionado" | "Paga empresa" | "Paga empleado";
  menuCount: number;
  halfMenuCount: number;
};

type ReportAuth =
  | { kind: "admin" }
  | { kind: "client"; company: Company };

type DynamicSheet = {
  name: string;
  rows: unknown[][];
  moneyColumns?: number[];
  percentColumns?: number[];
  headerRows?: number[];
  totalRows?: number[];
  widths?: number[];
  merges?: string[];
};

type InvoiceInput = {
  invoiceDate: string;
  invoiceNumber: string;
};

const INVOICE_VAT_RATE = 0.1;
const SHORT_REPORT_DEFAULT_TYPES = ["1/2 MENU", "MENU DEL DIA"];

function currentMadridDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: TIME_ZONE,
    year: "numeric"
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";

  return `${get("year")}-${get("month")}-${get("day")}`;
}

function defaultDateRange() {
  const today = currentMadridDate();
  const [year, month] = today.split("-").map(Number);
  const firstDay = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);

  return { dateFrom: firstDay, dateTo: lastDay };
}

function isDateInput(value: string | null) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function getTimeZoneOffsetMs(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone,
    year: "numeric"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const asUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second)
  );

  return asUtc - date.getTime();
}

function addDays(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);

  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function madridDateToUtcIso(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  const utcGuess = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  const offset = getTimeZoneOffsetMs(utcGuess, TIME_ZONE);

  return new Date(utcGuess.getTime() - offset).toISOString();
}

function readFilters(request: NextRequest): ReportFilters {
  const defaults = defaultDateRange();
  const params = request.nextUrl.searchParams;
  const dateFrom = params.get("date_from");
  const dateTo = params.get("date_to");
  const status = params.get("status")?.trim() ?? "";
  const billingType = params.get("billing_type")?.trim() ?? "";

  return {
    dateFrom: isDateInput(dateFrom) ? dateFrom! : defaults.dateFrom,
    dateTo: isDateInput(dateTo) ? dateTo! : defaults.dateTo,
    companyId: params.get("company_id")?.trim() ?? "",
    branchId: params.get("company_branch_id")?.trim() ?? "",
    status: VALID_STATUSES.includes(status as OrderStatus) ? status : "",
    paymentMethod: params.get("payment_method")?.trim() ?? "",
    paymentStatus: params.get("payment_status")?.trim() ?? "",
    billingType: BILLING_TYPES.includes(billingType as BillingType) ? (billingType as BillingType) : "all",
    onlyCompanyBillable: params.get("only_company_billable") === "true",
    excludeCancelled: params.get("exclude_cancelled") !== "false"
  };
}

function defaultBillingType(
  company?: Pick<Company, "billing_type" | "allow_pay_on_delivery" | "allow_card_payment"> | null
): BillingType {
  if (company?.allow_pay_on_delivery && company.allow_card_payment) {
    return "all";
  }

  return company?.billing_type === "subsidized"
    ? "subsidized"
    : company?.billing_type === "company"
      ? "company_billed"
      : "all";
}

function reportPinEnvName(slug: string) {
  return `${slug.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").toUpperCase()}_REPORT_PIN`;
}

async function authorizeReportRequest(
  request: NextRequest,
  supabase: NonNullable<ReturnType<typeof getSupabaseServerClient>>
): Promise<{ auth: ReportAuth } | { error: NextResponse }> {
  const requestedAdminPin = request.headers.get("x-admin-pin") ?? "";

  if (requestedAdminPin) {
    const configuredAdminPin = process.env.ADMIN_PIN;

    if (!configuredAdminPin) {
      return {
        error: NextResponse.json({ error: "ADMIN_PIN no está configurado en el entorno." }, { status: 500 })
      };
    }

    if (requestedAdminPin === configuredAdminPin) {
      return { auth: { kind: "admin" } };
    }
  }

  const clientSlug = request.nextUrl.searchParams.get("client_slug")?.trim() ?? "";
  const requestedClientPin = request.headers.get("x-client-report-pin") ?? "";

  if (!clientSlug || !requestedClientPin) {
    return { error: NextResponse.json({ error: "PIN no válido." }, { status: 401 }) };
  }

  const envName = reportPinEnvName(clientSlug);
  const configuredClientPin = process.env[envName];

  if (!configuredClientPin) {
    return {
      error: NextResponse.json({ error: `${envName} no está configurado en el entorno.` }, { status: 500 })
    };
  }

  if (configuredClientPin === process.env.ADMIN_PIN) {
    return {
      error: NextResponse.json({ error: `${envName} debe ser distinto de ADMIN_PIN.` }, { status: 500 })
    };
  }

  if (requestedClientPin !== configuredClientPin) {
    return { error: NextResponse.json({ error: "Clave de informes no válida." }, { status: 401 }) };
  }

  const { data, error } = await supabase
    .from("companies")
    .select("*")
    .eq("slug", clientSlug)
    .eq("active", true)
    .limit(1)
    .single();

  if (error || !data) {
    return { error: NextResponse.json({ error: "Cliente no disponible para informes." }, { status: 401 }) };
  }

  return { auth: { kind: "client", company: data as Company } };
}

function roundMoney(value: number) {
  return Number(value.toFixed(2));
}

function addMoney(a: number, b: number) {
  return roundMoney(a + Number(b ?? 0));
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("es-ES", { timeZone: TIME_ZONE });
}

function formatMetadata(metadata?: Record<string, string> | null) {
  return formatOrderMetadataForReport(metadata);
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function menuCounters(item: ReportLine["item"], quantity: number, lineSubsidy: number) {
  const normalizedName = normalizeText(`${item?.name ?? ""} ${item?.metadata?.display_name ?? ""}`);
  const isHalfMenu = normalizedName.includes("medio") && normalizedName.includes("menu");
  const isDailyMenu =
    normalizedName.includes("menu") &&
    normalizedName.includes("dia") &&
    !isHalfMenu &&
    !normalizedName.includes("ensalada");

  if (!isDailyMenu && !isHalfMenu && lineSubsidy > 0) {
    return {
      menuCount: Math.abs(lineSubsidy - 3.5) < 0.01 ? 0 : quantity,
      halfMenuCount: Math.abs(lineSubsidy - 3.5) < 0.01 ? quantity : 0
    };
  }

  return {
    menuCount: isDailyMenu ? quantity : 0,
    halfMenuCount: isHalfMenu ? quantity : 0
  };
}

function buildReportLines(orders: ReportOrder[], billingType: BillingType): ReportLine[] {
  return orders.flatMap((order) => {
    const items = order.order_items.length ? order.order_items : [null];

    return items.flatMap((item): ReportLine[] => {
      const quantity = item ? Number(item.quantity) : 1;
      const lineSubsidy = item ? Number(item.subsidy_amount) : Number(order.subsidy_total);
      const lineTotal = item ? Number(item.total_price) : Number(order.total);
      const lineSubtotal = item ? roundMoney(Number(item.unit_price) * quantity) : Number(order.subtotal);
      const isSubsidized = lineSubsidy > 0;
      const companyPaysAll = orderCompanyInvoiceTotal(order) >= Number(order.subtotal) - 0.01 && orderEmployeeTotal(order) === 0;
      const lineEmployeeTotal = companyPaysAll ? 0 : lineTotal;
      const lineCompanyInvoiceTotal = companyPaysAll ? lineSubtotal : lineSubsidy;
      const lineBillingType = companyPaysAll ? "Paga empresa" : isSubsidized ? "Subvencionado" : "Paga empleado";

      if (billingType === "subsidized" && !isSubsidized) {
        return [];
      }

      if (billingType === "non_subsidized" && isSubsidized) {
        return [];
      }

      if (billingType === "company_billed" && lineCompanyInvoiceTotal <= 0) {
        return [];
      }

      if (billingType === "employee_billed" && lineEmployeeTotal <= 0) {
        return [];
      }

      const counters = menuCounters(item, quantity, lineSubsidy);

      return [
        {
          order,
          item,
          lineSubtotal,
          lineSubsidy,
          lineTotal,
          lineEmployeeTotal,
          lineCompanyInvoiceTotal,
          billingType: lineBillingType,
          ...counters
        }
      ];
    });
  });
}

function summarizeLines(lines: ReportLine[]): { summary: ReportSummary; byBranch: ReportSummaryRow[] } {
  const orderIds = new Set<string>();
  const summary: ReportSummary = {
    orderCount: 0,
    subtotal: 0,
    subsidyTotal: 0,
    employeeTotal: 0,
    companyInvoiceTotal: 0,
    menuCount: 0,
    halfMenuCount: 0,
    subsidizedAmountTotal: 0
  };
  const byBranch = new Map<string, ReportSummaryRow & { orderIds: Set<string> }>();

  for (const line of lines) {
    const order = line.order;
    const companyName = order.companies?.name ?? "Sin cliente principal";
    const branchName = order.company_branches?.name ?? "Sin empresa interna";
    const key = `${companyName}::${branchName}`;
    const row =
      byBranch.get(key) ??
      {
        key,
        companyName,
        branchName,
        orderCount: 0,
        subtotal: 0,
        subsidyTotal: 0,
        employeeTotal: 0,
        companyInvoiceTotal: 0,
        menuCount: 0,
        halfMenuCount: 0,
        subsidizedAmountTotal: 0,
        orderIds: new Set<string>()
      };

    orderIds.add(order.id);
    row.orderIds.add(order.id);

    summary.subtotal = addMoney(summary.subtotal, line.lineSubtotal);
    summary.subsidyTotal = addMoney(summary.subsidyTotal, line.lineSubsidy);
    summary.employeeTotal = addMoney(summary.employeeTotal, line.lineEmployeeTotal);
    summary.companyInvoiceTotal = addMoney(summary.companyInvoiceTotal, line.lineCompanyInvoiceTotal);
    summary.menuCount += line.menuCount;
    summary.halfMenuCount += line.halfMenuCount;
    summary.subsidizedAmountTotal = addMoney(summary.subsidizedAmountTotal, line.lineSubsidy > 0 ? line.lineSubtotal : 0);

    row.subtotal = addMoney(row.subtotal, line.lineSubtotal);
    row.subsidyTotal = addMoney(row.subsidyTotal, line.lineSubsidy);
    row.employeeTotal = addMoney(row.employeeTotal, line.lineEmployeeTotal);
    row.companyInvoiceTotal = addMoney(row.companyInvoiceTotal, line.lineCompanyInvoiceTotal);
    row.menuCount += line.menuCount;
    row.halfMenuCount += line.halfMenuCount;
    row.subsidizedAmountTotal = addMoney(row.subsidizedAmountTotal, line.lineSubsidy > 0 ? line.lineSubtotal : 0);
    byBranch.set(key, row);
  }

  summary.orderCount = orderIds.size;

  return {
    summary,
    byBranch: Array.from(byBranch.values())
      .map(({ orderIds: branchOrderIds, ...row }) => ({
        ...row,
        orderCount: branchOrderIds.size
      }))
      .sort((a, b) => a.branchName.localeCompare(b.branchName, "es"))
  };
}

function detailRows(lines: ReportLine[]) {
  return lines.map((line) => {
    const order = line.order;

    return [
      formatDateTime(order.created_at),
      order.id,
      order.companies?.name ?? "",
      order.company_branches?.name ?? "",
      order.customer_name,
      order.customer_email,
      order.customer_phone,
      order.status,
      paymentMethodLabel(order.payment_method),
      order.payment_method === "pay_on_delivery" ? operationalPaymentLabel(order) : paymentStatusLabel(order.payment_status),
      line.billingType,
      line.item?.name ?? "",
      formatMetadata(line.item?.metadata),
      line.item?.quantity ?? "",
      line.item ? Number(line.item.unit_price) : "",
      line.lineSubsidy,
      line.lineTotal,
      line.lineSubtotal,
      line.lineSubsidy,
      line.lineEmployeeTotal,
      line.lineCompanyInvoiceTotal,
      order.notes ?? ""
    ];
  });
}

function summaryRows(rows: ReportSummaryRow[]) {
  return rows.map((row) => [
    row.companyName,
    row.branchName,
    row.orderCount,
    row.menuCount,
    row.halfMenuCount,
    row.subtotal,
    row.subsidyTotal,
    row.subsidizedAmountTotal,
    row.employeeTotal,
    row.companyInvoiceTotal
  ]);
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function columnName(index: number) {
  let column = "";
  let value = index + 1;

  while (value > 0) {
    const remainder = (value - 1) % 26;
    column = String.fromCharCode(65 + remainder) + column;
    value = Math.floor((value - 1) / 26);
  }

  return column;
}

function worksheetXml(rows: unknown[][], moneyColumns: number[] = []) {
  const moneyColumnSet = new Set(moneyColumns);
  const body = rows
    .map((row, rowIndex) => {
      const cells = row
        .map((value, columnIndex) => {
          const cellRef = `${columnName(columnIndex)}${rowIndex + 1}`;

          if (typeof value === "number" && Number.isFinite(value)) {
            const style = moneyColumnSet.has(columnIndex) ? ' s="1"' : "";

            return `<c r="${cellRef}"${style}><v>${value}</v></c>`;
          }

          return `<c r="${cellRef}" t="inlineStr"><is><t>${escapeXml(String(value ?? ""))}</t></is></c>`;
        })
        .join("");

      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${body}</sheetData>
</worksheet>`;
}

function crc32(buffer: Buffer) {
  let crc = -1;

  for (const byte of buffer) {
    crc ^= byte;
    for (let index = 0; index < 8; index += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }

  return (crc ^ -1) >>> 0;
}

function dosDateTime(date = new Date()) {
  const time =
    ((date.getHours() & 0x1f) << 11) |
    ((date.getMinutes() & 0x3f) << 5) |
    (Math.floor(date.getSeconds() / 2) & 0x1f);
  const day =
    (((date.getFullYear() - 1980) & 0x7f) << 9) |
    (((date.getMonth() + 1) & 0x0f) << 5) |
    (date.getDate() & 0x1f);

  return { day, time };
}

function createZip(files: { name: string; content: string | Buffer }[]) {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  const { day, time } = dosDateTime();

  for (const file of files) {
    const name = Buffer.from(file.name);
    const content = Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content);
    const compressed = deflateRawSync(content);
    const crc = crc32(content);
    const localHeader = Buffer.alloc(30);

    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt16LE(time, 10);
    localHeader.writeUInt16LE(day, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(content.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localHeader.writeUInt16LE(0, 28);
    localParts.push(localHeader, name, compressed);

    const centralHeader = Buffer.alloc(46);

    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt16LE(time, 12);
    centralHeader.writeUInt16LE(day, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(content.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, name);
    offset += localHeader.length + name.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);

  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, end]);
}

function workbookXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Detalle pedidos" sheetId="1" r:id="rId1"/>
    <sheet name="Resumen por empresa" sheetId="2" r:id="rId2"/>
  </sheets>
</workbook>`;
}

function workbookRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
}

function rootRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;
}

function contentTypesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;
}

function stylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00 €"/></numFmts>
  <fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>
  <fills count="1"><fill><patternFill patternType="none"/></fill></fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="2">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

function createWorkbook(lines: ReportLine[], byBranch: ReportSummaryRow[]) {
  const detail = [DETAIL_HEADERS, ...detailRows(lines)];
  const summary = [SUMMARY_HEADERS, ...summaryRows(byBranch)];

  return createZip([
    { name: "[Content_Types].xml", content: contentTypesXml() },
    { name: "_rels/.rels", content: rootRelsXml() },
    { name: "xl/workbook.xml", content: workbookXml() },
    { name: "xl/_rels/workbook.xml.rels", content: workbookRelsXml() },
    { name: "xl/styles.xml", content: stylesXml() },
    { name: "xl/worksheets/sheet1.xml", content: worksheetXml(detail, [14, 15, 16, 17, 18, 19, 20]) },
    { name: "xl/worksheets/sheet2.xml", content: worksheetXml(summary, [5, 6, 7, 8, 9]) }
  ]);
}

function dynamicStylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0.00 €"/><numFmt numFmtId="165" formatCode="0.00%"/></numFmts>
  <fonts count="3">
    <font><sz val="11"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><name val="Calibri"/></font>
    <font><b/><sz val="14"/><name val="Calibri"/></font>
  </fonts>
  <fills count="4">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFFFF00"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFA6A6A6"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border><left style="thin"><color rgb="FF000000"/></left><right style="thin"><color rgb="FF000000"/></right><top style="thin"><color rgb="FF000000"/></top><bottom style="thin"><color rgb="FF000000"/></bottom><diagonal/></border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="11">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyFont="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"><alignment vertical="center"/></xf>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyNumberFormat="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="164" fontId="1" fillId="2" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyFont="1" applyNumberFormat="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyFont="1"><alignment vertical="center"/></xf>
    <xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyFont="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="164" fontId="1" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyFont="1" applyNumberFormat="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyFont="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyNumberFormat="1"><alignment horizontal="center" vertical="center"/></xf>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

function escapeXmlAttribute(value: string) {
  return escapeXml(value).replaceAll("\n", " ");
}

function styleIdForCell(rowIndex: number, columnIndex: number, sheet: DynamicSheet) {
  const isInvoiceSheet = sheet.name !== "Resumen por empresa" && sheet.name !== "Detalle pedidos";

  if (isInvoiceSheet && sheet.headerRows?.includes(rowIndex)) {
    return 7;
  }

  if (isInvoiceSheet && rowIndex === 34) {
    return sheet.moneyColumns?.includes(columnIndex) ? 8 : 9;
  }

  if (sheet.headerRows?.includes(rowIndex)) {
    return 2;
  }

  if (sheet.totalRows?.includes(rowIndex)) {
    return sheet.moneyColumns?.includes(columnIndex) ? 5 : 6;
  }

  if (sheet.percentColumns?.includes(columnIndex)) {
    return 10;
  }

  return sheet.moneyColumns?.includes(columnIndex) ? 4 : 3;
}

function styledWorksheetXml(sheet: DynamicSheet) {
  const widths = sheet.widths?.length
    ? `<cols>${sheet.widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join("")}</cols>`
    : "";
  const merges = sheet.merges?.length
    ? `<mergeCells count="${sheet.merges.length}">${sheet.merges.map((ref) => `<mergeCell ref="${escapeXmlAttribute(ref)}"/>`).join("")}</mergeCells>`
    : "";
  const body = sheet.rows
    .map((row, rowIndex) => {
      const cells = row
        .map((value, columnIndex) => {
          const cellRef = `${columnName(columnIndex)}${rowIndex + 1}`;
          const style = ` s="${styleIdForCell(rowIndex, columnIndex, sheet)}"`;

          if (typeof value === "number" && Number.isFinite(value)) {
            return `<c r="${cellRef}"${style}><v>${value}</v></c>`;
          }

          return `<c r="${cellRef}"${style} t="inlineStr"><is><t>${escapeXml(String(value ?? ""))}</t></is></c>`;
        })
        .join("");

      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join("");

  return buildStyledWorksheetXml({ columnsXml: widths, rowsXml: body, mergesXml: merges });
}

function dynamicWorkbookXml(sheets: DynamicSheet[]) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    ${sheets.map((sheet, index) => `<sheet name="${escapeXmlAttribute(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("")}
  </sheets>
</workbook>`;
}

function dynamicWorkbookRelsXml(sheets: DynamicSheet[]) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join("")}
  <Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
}

function dynamicContentTypesXml(sheets: DynamicSheet[]) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  ${sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;
}

function createDynamicWorkbook(sheets: DynamicSheet[]) {
  return createZip([
    { name: "[Content_Types].xml", content: dynamicContentTypesXml(sheets) },
    { name: "_rels/.rels", content: rootRelsXml() },
    { name: "xl/workbook.xml", content: dynamicWorkbookXml(sheets) },
    { name: "xl/_rels/workbook.xml.rels", content: dynamicWorkbookRelsXml(sheets) },
    { name: "xl/styles.xml", content: dynamicStylesXml() },
    ...sheets.map((sheet, index) => ({
      name: `xl/worksheets/sheet${index + 1}.xml`,
      content: styledWorksheetXml(sheet)
    }))
  ]);
}

function productReportType(line: ReportLine) {
  if (line.halfMenuCount > 0 || Math.abs(line.lineSubsidy - 3.5) < 0.01) {
    return "1/2 MENU";
  }

  if (line.menuCount > 0 || Math.abs(line.lineSubsidy - 4) < 0.01) {
    return "MENU DEL DIA";
  }

  return (line.item?.metadata?.display_name || line.item?.name || "OTROS").toUpperCase();
}

function createShortReportWorkbook(lines: ReportLine[]) {
  const branchRows = new Map<string, { branch: string; rows: Map<string, { quantity: number; amount: number }> }>();

  for (const line of lines.filter((candidate) => candidate.lineCompanyInvoiceTotal > 0)) {
    const branch = line.order.company_branches?.name ?? "Sin empresa interna";
    const type = productReportType(line);
    const key = branch;
    const currentBranch = branchRows.get(key) ?? { branch, rows: new Map<string, { quantity: number; amount: number }>() };
    const currentType = currentBranch.rows.get(type) ?? { quantity: 0, amount: 0 };

    currentType.quantity += Number(line.item?.quantity ?? 1);
    currentType.amount = addMoney(currentType.amount, line.lineCompanyInvoiceTotal);
    currentBranch.rows.set(type, currentType);
    branchRows.set(key, currentBranch);
  }

  const summaryRowsData: unknown[][] = [];
  const summaryMerges: string[] = [];

  for (const branch of Array.from(branchRows.values()).sort((a, b) => a.branch.localeCompare(b.branch, "es"))) {
    const total = Array.from(branch.rows.values()).reduce((sum, row) => addMoney(sum, row.amount), 0);
    const extraTypes = Array.from(branch.rows.keys())
      .filter((type) => !SHORT_REPORT_DEFAULT_TYPES.includes(type))
      .sort((a, b) => a.localeCompare(b, "es"));
    const sortedTypes = [...SHORT_REPORT_DEFAULT_TYPES, ...extraTypes];
    const firstSheetRow = summaryRowsData.length + 2;

    sortedTypes.forEach((type, index) => {
      const row = branch.rows.get(type) ?? { quantity: 0, amount: 0 };
      summaryRowsData.push([branch.branch, type, row.quantity, row.amount, index === 0 ? total : ""]);
    });

    const lastSheetRow = summaryRowsData.length + 1;

    if (lastSheetRow > firstSheetRow) {
      summaryMerges.push(`A${firstSheetRow}:A${lastSheetRow}`, `E${firstSheetRow}:E${lastSheetRow}`);
    }
  }

  const detailRowsData = lines
    .filter((line) => line.lineCompanyInvoiceTotal > 0)
    .sort((a, b) => {
      const branchCompare = (a.order.company_branches?.name ?? "").localeCompare(b.order.company_branches?.name ?? "", "es");
      if (branchCompare) return branchCompare;
      const productCompare = productReportType(a).localeCompare(productReportType(b), "es");
      if (productCompare) return productCompare;
      const dateCompare = a.order.created_at.localeCompare(b.order.created_at);
      if (dateCompare) return dateCompare;
      return a.order.customer_name.localeCompare(b.order.customer_name, "es");
    })
    .map((line) => [
      formatDateTime(line.order.created_at),
      line.order.id,
      line.order.company_branches?.name ?? "",
      line.order.customer_name,
      line.order.customer_email,
      line.item?.name ?? "",
      line.item?.quantity ?? "",
      line.item ? Number(line.item.unit_price) : "",
      line.lineCompanyInvoiceTotal
    ]);

  return createDynamicWorkbook([
    {
      name: "Resumen por empresa",
      rows: [["SOCIEDAD", "TIPO DE MENU", "CANTIDAD", "IMPORTE", "TOTAL FACTURA"], ...summaryRowsData],
      moneyColumns: [3, 4],
      headerRows: [0],
      widths: [34, 22, 12, 14, 16],
      merges: summaryMerges
    },
    {
      name: "Detalle pedidos",
      rows: [
        ["Fecha", "Pedido", "Empresa interna", "Nombre del empleado", "Email", "Producto", "Cantidad", "Precio unidad", "Subvención facturable"],
        ...detailRowsData
      ],
      moneyColumns: [7, 8],
      headerRows: [0],
      widths: [20, 38, 34, 26, 34, 30, 12, 14, 20]
    }
  ]);
}

function sanitizeSheetName(value: string, fallback: string) {
  const normalized = value.replace(/[\[\]\*\/\\\?:]/g, " ").replace(/\s+/g, " ").trim();

  return (normalized || fallback).slice(0, 31);
}

function invoiceConcept(filters: ReportFilters) {
  return filters.dateFrom === filters.dateTo
    ? `Pedidos/comidas del ${filters.dateFrom}`
    : `Pedidos/comidas del ${filters.dateFrom} al ${filters.dateTo}`;
}

function createInvoicesWorkbook(lines: ReportLine[], filters: ReportFilters, input: InvoiceInput) {
  const byBranch = new Map<string, { branch: NonNullable<ReportOrder["company_branches"]>; amount: number }>();

  for (const line of lines.filter((candidate) => candidate.lineCompanyInvoiceTotal > 0)) {
    const branch = line.order.company_branches;

    if (!branch?.id) {
      continue;
    }

    const current = byBranch.get(branch.id) ?? { branch, amount: 0 };
    current.amount = addMoney(current.amount, line.lineCompanyInvoiceTotal);
    byBranch.set(branch.id, current);
  }

  const sheets: DynamicSheet[] = Array.from(byBranch.values())
    .filter((entry) => entry.amount > 0)
    .sort((a, b) => a.branch.name.localeCompare(b.branch.name, "es"))
    .map((entry, index) => {
      const base = roundMoney(entry.amount);
      const vat = roundMoney(base * INVOICE_VAT_RATE);
      const total = roundMoney(base + vat);
      const branch = entry.branch;
      const fiscalName = branch.fiscal_name?.trim() || branch.name;
      const rows: unknown[][] = [
        ["MATICA FRESH FOOD", "", "", "FACTURA"],
        ["", "", "Número", input.invoiceNumber],
        ["", "", "Fecha", input.invoiceDate],
        [],
        ["FACTURAR A"],
        ["Razón social", fiscalName],
        ["CIF/NIF", branch.tax_id ?? ""],
        ["Dirección", branch.fiscal_address ?? ""],
        ["Población", branch.fiscal_city ?? ""],
        ["Código postal", branch.fiscal_postal_code ?? ""],
        [],
        ["Concepto", "Unidades", "Base imponible", "Importe"],
        [invoiceConcept(filters), 1, base, base],
        [],
        ["", "", "Base imponible", base],
        ["", "", `IVA ${Math.round(INVOICE_VAT_RATE * 100)}%`, vat],
        ["", "", "TOTAL FACTURA", total]
      ];

      return {
        name: sanitizeSheetName(branch.name, `Factura ${index + 1}`),
        rows,
        moneyColumns: [2, 3],
        headerRows: [0, 4, 11],
        totalRows: [14, 15, 16],
        widths: [28, 14, 18, 18]
      };
    });

  return createDynamicWorkbook(sheets.length ? sheets : [{
    name: "Sin facturas",
    rows: [["No hay sociedades con importe facturable a empresa mayor que 0."]],
    headerRows: [0],
    widths: [70]
  }]);
}

function invoiceDateLabel(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const monthName = [
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre"
  ][month - 1] ?? "";

  return `${day} de ${monthName} de ${year}`;
}

function invoicePeriodSuffix(filters: ReportFilters) {
  const [year, month] = filters.dateFrom.split("-").map(Number);
  const monthCode = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"][month - 1] ?? "PER";

  return `${monthCode}-${year}`;
}

function invoiceArticle(type: string, filters: ReportFilters) {
  const suffix = invoicePeriodSuffix(filters);

  if (type === "1/2 MENU") {
    return `MEDIOS MENUS ${suffix}`;
  }

  if (type === "MENU DEL DIA") {
    return `MENUS DIARIOS ${suffix}`;
  }

  return `${type} ${suffix}`;
}

function fiscalCityLine(branch: NonNullable<ReportOrder["company_branches"]>) {
  const city = branch.fiscal_city?.trim() ?? "";
  const postalCode = branch.fiscal_postal_code?.trim() ?? "";
  const line = [postalCode, city].filter(Boolean).join(", ");

  return line ? `${line}.` : "";
}

function createTemplateInvoicesWorkbook(lines: ReportLine[], filters: ReportFilters, input: InvoiceInput) {
  type InvoiceGroup = { amount: number; quantity: number; type: string };
  const byBranch = new Map<string, { branch: NonNullable<ReportOrder["company_branches"]>; groups: Map<string, InvoiceGroup> }>();

  for (const line of lines.filter((candidate) => candidate.lineCompanyInvoiceTotal > 0)) {
    const branch = line.order.company_branches;

    if (!branch?.id) {
      continue;
    }

    const current = byBranch.get(branch.id) ?? { branch, groups: new Map<string, InvoiceGroup>() };
    const type = productReportType(line);
    const group = current.groups.get(type) ?? { amount: 0, quantity: 0, type };

    group.amount = addMoney(group.amount, line.lineCompanyInvoiceTotal);
    group.quantity += Number(line.item?.quantity ?? 1);
    current.groups.set(type, group);
    byBranch.set(branch.id, current);
  }

  const sheets: DynamicSheet[] = Array.from(byBranch.values())
    .filter((entry) => Array.from(entry.groups.values()).some((group) => group.amount > 0))
    .sort((a, b) => a.branch.name.localeCompare(b.branch.name, "es"))
    .map((entry, index) => {
      const totalWithVat = roundMoney(Array.from(entry.groups.values()).reduce((sum, group) => addMoney(sum, group.amount), 0));
      const taxableBase = roundMoney(totalWithVat / (1 + INVOICE_VAT_RATE));
      const vat = roundMoney(totalWithVat - taxableBase);
      const branch = entry.branch;
      const fiscalName = branch.fiscal_name?.trim() || branch.name;
      let allocatedTaxableBase = 0;
      const invoiceGroups = Array.from(entry.groups.values())
        .filter((group) => group.amount > 0)
        .sort((a, b) => a.type.localeCompare(b.type, "es"));
      const detailRows = invoiceGroups
        .map((group, detailIndex) => {
          const unitPrice = group.quantity > 0 ? roundMoney(group.amount / group.quantity) : group.amount;
          const lineTaxableBase = detailIndex === invoiceGroups.length - 1
            ? roundMoney(taxableBase - allocatedTaxableBase)
            : roundMoney(group.amount / (1 + INVOICE_VAT_RATE));

          allocatedTaxableBase = addMoney(allocatedTaxableBase, lineTaxableBase);

          return ["", detailIndex + 1, invoiceArticle(group.type, filters), "", group.quantity, unitPrice, lineTaxableBase, INVOICE_VAT_RATE, group.amount];
        });
      const emptyDetailRows = Array.from({ length: Math.max(0, 14 - detailRows.length) }, () => ["", "", "", "", "", "", 0, "", 0]);
      const rows: unknown[][] = [
        ["", "", "", "", "", "", "", "", ""],
        ["", "", "", "", "", "", "", "", ""],
        ["", "FACTURA", "", "", "DILAFE HOSTELERIA, S.L.", "", "", "", ""],
        ["", "", "", "", "Ave. De la Industria 37", "", "", "", ""],
        ["", "Numero:", input.invoiceNumber, "", "28108, Alcobendas, Madrid", "", "", "", ""],
        ["", "Fecha:", invoiceDateLabel(input.invoiceDate), "", "", "", "", "NIF", ""],
        ["", "", "", "", "", "", "", "", ""],
        ["", "Cliente:", fiscalName, "", "", "Comentarios", "", "", ""],
        ["", "Domicilio:", branch.fiscal_address ?? "", "", "", "", "", "", ""],
        ["", "Ciudad:", fiscalCityLine(branch), "", "", "", "", "", ""],
        ["", "N.I.F.:", branch.tax_id ?? "", "", "", "", "", "", ""],
        ["", "", "", "", "", "", "", "", ""],
        ["", "Codigo", "Articulo", "", "Unidades", "Precio Un.", "Subtotal", "% IVA", "Total con IVA"],
        ...detailRows,
        ...emptyDetailRows,
        ["", "Forma de pago", "", "Subtotal", "", "", "", "", totalWithVat],
        ["", "Trasnferencia bancaria a la CCC ES30 0182 1832 01 0201674299.", "", "Descuento", "", "", "", "", 0],
        ["", "", "", "Base Imponible", "", "", "", "", taxableBase],
        ["", "", "", "I.V.A.", "", "", `${Math.round(INVOICE_VAT_RATE * 100)},00%`, "", ""],
        ["", "", "", "", 0, 0, vat, "", vat],
        ["", "", "", "Recargo Equivalencia", "", "", "", "", 0],
        ["", "", "", "", "", "", "", "", ""],
        ["", "", "", "TOTAL FACTURA", "", "", "", totalWithVat, ""],
        ["", "", "", "", "", "", "", "", ""],
        ["", "", "", "", "", "", "", "", ""]
      ];

      return {
        name: sanitizeSheetName(branch.name, `Factura ${index + 1}`),
        rows,
        moneyColumns: [5, 6, 7, 8],
        percentColumns: [7],
        headerRows: [12],
        totalRows: [27, 28, 29, 31, 34],
        widths: [10.5, 10.5, 28, 10.5, 12, 12, 12, 12, 14]
      };
    });

  return createDynamicWorkbook(sheets.length ? sheets : [{
    name: "Sin facturas",
    rows: [["No hay sociedades con importe facturable a empresa mayor que 0."]],
    headerRows: [0],
    widths: [70]
  }]);
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "informe";
}

async function getReportOptions(supabase: NonNullable<ReturnType<typeof getSupabaseServerClient>>, companyId = "") {
  let companiesQuery = supabase.from("companies").select("*").order("name", { ascending: true });
  let branchesQuery = supabase.from("company_branches").select("*").order("name", { ascending: true });

  if (companyId) {
    companiesQuery = companiesQuery.eq("id", companyId);
    branchesQuery = branchesQuery.eq("company_id", companyId);
  }

  const [companies, branches] = await Promise.all([
    companiesQuery,
    branchesQuery
  ]);

  if (companies.error || branches.error) {
    return {
      error: companies.error?.message ?? branches.error?.message ?? "No se pudieron cargar los filtros."
    };
  }

  return {
    companies: (companies.data ?? []) as Company[],
    branches: (branches.data ?? []) as CompanyBranch[]
  };
}

async function getReportOrders(supabase: NonNullable<ReturnType<typeof getSupabaseServerClient>>, filters: ReportFilters) {
  const start = madridDateToUtcIso(filters.dateFrom);
  const end = madridDateToUtcIso(addDays(filters.dateTo, 1));

  const buildQuery = (selectFields: string) => {
    let query = supabase
      .from("orders")
      .select(selectFields)
      .gte("created_at", start)
      .lt("created_at", end)
      .order("created_at", { ascending: true });

    if (filters.companyId) {
      query = query.eq("company_id", filters.companyId);
    }

    if (filters.branchId) {
      query = query.eq("company_branch_id", filters.branchId);
    }

    if (filters.status) {
      query = query.eq("status", filters.status);
    } else if (filters.excludeCancelled) {
      query = query.neq("status", "cancelado");
    }

    if (filters.paymentMethod) {
      query = query.eq("payment_method", filters.paymentMethod);
    }

    if (filters.paymentStatus) {
      query = query.eq("payment_status", filters.paymentStatus);
    }

    return query;
  };

  let { data, error } = await buildQuery(REPORT_ORDER_SELECT_WITH_FISCAL_DATA);

  if (error && isMissingFiscalBranchColumnError(error)) {
    const legacyResult = await buildQuery(REPORT_ORDER_SELECT_LEGACY);
    data = legacyResult.data;
    error = legacyResult.error;
  }

  return {
    orders: ((data as ReportOrder[] | null) ?? [])
      .filter(isBillableOrder)
      .map((order) => ({
        ...order,
        order_items: [...(order.order_items ?? [])].sort((a, b) => a.name.localeCompare(b.name, "es"))
      })),
    error
  };
}

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get("mode") ?? "xlsx";
  const adminOnlyModes = new Set(["short_xlsx", "invoices_xlsx"]);

  if (adminOnlyModes.has(mode)) {
    const configuredAdminPin = process.env.ADMIN_PIN;
    const requestedAdminPin = request.headers.get("x-admin-pin") ?? "";

    if (!configuredAdminPin || requestedAdminPin !== configuredAdminPin) {
      return NextResponse.json({ error: "No autorizado." }, { status: 401 });
    }
  }

  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return NextResponse.json({ error: "Configura Supabase para usar el panel." }, { status: 503 });
  }

  const authorization = await authorizeReportRequest(request, supabase);

  if ("error" in authorization) {
    return authorization.error;
  }

  const auth = authorization.auth;
  const restrictedCompanyId = auth.kind === "client" ? auth.company.id : "";

  if (auth.kind !== "admin" && adminOnlyModes.has(mode)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  if (mode === "options") {
    const options = await getReportOptions(supabase, restrictedCompanyId);

    if ("error" in options) {
      return NextResponse.json({ error: options.error }, { status: 400 });
    }

    return NextResponse.json({
      ...options,
      defaults: {
        ...defaultDateRange(),
        billingType: defaultBillingType(auth.kind === "client" ? auth.company : null),
        excludeCancelled: true
      },
      statuses: VALID_STATUSES
    });
  }

  const hasBillingTypeParam = request.nextUrl.searchParams.has("billing_type");
  const filters = readFilters(request);

  if (auth.kind === "client") {
    filters.companyId = restrictedCompanyId;
    filters.billingType = hasBillingTypeParam ? filters.billingType : defaultBillingType(auth.company);
  }
  const { orders, error } = await getReportOrders(supabase, filters);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const lines = buildReportLines(orders, filters.billingType)
    .filter((line) => !filters.onlyCompanyBillable || line.lineCompanyInvoiceTotal > 0);
  const { summary, byBranch } = summarizeLines(lines);

  if (mode === "summary") {
    return NextResponse.json({
      filters,
      summary,
      byBranch,
      previewOrders: Array.from(new Map(lines.map((line) => [line.order.id, line.order])).values()).slice(0, 12).map((order) => ({
        id: order.id,
        created_at: order.created_at,
        customer_name: order.customer_name,
        company_name: order.companies?.name ?? "",
        branch_name: order.company_branches?.name ?? "",
        status: order.status,
        subtotal: Number(order.subtotal),
        subsidy_total: Number(order.subsidy_total),
        employee_total: orderEmployeeTotal(order),
        company_invoice_total: orderCompanyInvoiceTotal(order),
        total: Number(order.total)
      }))
    });
  }

  if (mode === "short_xlsx") {
    const filename = `informe-abreviado-${filters.dateFrom}_${filters.dateTo}.xlsx`;
    const workbook = createShortReportWorkbook(lines);

    return new NextResponse(workbook, {
      headers: {
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      }
    });
  }

  if (mode === "invoices_xlsx") {
    const invoiceDate = request.nextUrl.searchParams.get("invoice_date")?.trim() ?? "";
    const invoiceNumber = request.nextUrl.searchParams.get("invoice_number")?.trim() ?? "";

    if (!isDateInput(invoiceDate) || !invoiceNumber) {
      return NextResponse.json({ error: "Fecha y numero de factura son obligatorios." }, { status: 400 });
    }

    const filename = `facturas-${filters.dateFrom}_${filters.dateTo}.xlsx`;
    const workbook = createTemplateInvoicesWorkbook(lines, filters, { invoiceDate, invoiceNumber });

    return new NextResponse(workbook, {
      headers: {
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      }
    });
  }

  let companyName = auth.kind === "client" ? auth.company.name : "todos-clientes";

  if (auth.kind === "admin" && filters.companyId) {
    const options = await getReportOptions(supabase);
    companyName = !("error" in options) ? options.companies.find((company) => company.id === filters.companyId)?.name ?? "cliente" : "cliente";
  }

  const filename = `informe-${slugify(companyName)}-${filters.dateFrom}_${filters.dateTo}.xlsx`;
  const workbook = createWorkbook(lines, byBranch);

  return new NextResponse(workbook, {
    headers: {
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    }
  });
}
