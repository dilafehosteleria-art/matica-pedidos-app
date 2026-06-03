import { deflateRawSync } from "node:zlib";
import { NextRequest, NextResponse } from "next/server";
import { operationalPaymentLabel, paymentMethodLabel, paymentStatusLabel } from "@/lib/payment-display";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { AdminOrder, CompanyBranch, OrderStatus, Company } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TIME_ZONE = "Europe/Madrid";
const VALID_STATUSES: OrderStatus[] = ["pendiente_pago", "nuevo", "preparando", "listo", "entregado", "cancelado"];

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

const BILLING_TYPES = ["all", "subsidized", "non_subsidized"] as const;

type BillingType = (typeof BILLING_TYPES)[number];

type ReportFilters = {
  dateFrom: string;
  dateTo: string;
  companyId: string;
  branchId: string;
  status: string;
  billingType: BillingType;
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
  company_branches?: { id?: string; name: string } | null;
};

type ReportLine = {
  order: ReportOrder;
  item: ReportOrder["order_items"][number] | null;
  lineSubtotal: number;
  lineSubsidy: number;
  lineTotal: number;
  billingType: "Subvencionado" | "No subvencionado";
  menuCount: number;
  halfMenuCount: number;
};

type ReportAuth =
  | { kind: "admin" }
  | { kind: "client"; company: Company };

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
    billingType: BILLING_TYPES.includes(billingType as BillingType) ? (billingType as BillingType) : "all",
    excludeCancelled: params.get("exclude_cancelled") !== "false"
  };
}

function defaultBillingType(company?: Pick<Company, "slug" | "name"> | null): BillingType {
  const slug = company?.slug?.trim().toLowerCase() ?? "";
  const name = company?.name?.trim().toLowerCase() ?? "";

  return slug === "bureau-veritas" || name === "bureau veritas" ? "subsidized" : "all";
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
  if (!metadata) {
    return "";
  }

  return Object.entries(metadata)
    .filter(([key, value]) => Boolean(value) && !key.startsWith("_") && key !== "display_name")
    .map(([key, value]) => `${key}: ${value}`)
    .join(" | ");
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

      if (billingType === "subsidized" && !isSubsidized) {
        return [];
      }

      if (billingType === "non_subsidized" && isSubsidized) {
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
          billingType: isSubsidized ? "Subvencionado" : "No subvencionado",
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
    summary.employeeTotal = addMoney(summary.employeeTotal, line.lineTotal);
    summary.companyInvoiceTotal = addMoney(summary.companyInvoiceTotal, line.lineSubsidy);
    summary.menuCount += line.menuCount;
    summary.halfMenuCount += line.halfMenuCount;
    summary.subsidizedAmountTotal = addMoney(summary.subsidizedAmountTotal, line.lineSubsidy > 0 ? line.lineSubtotal : 0);

    row.subtotal = addMoney(row.subtotal, line.lineSubtotal);
    row.subsidyTotal = addMoney(row.subsidyTotal, line.lineSubsidy);
    row.employeeTotal = addMoney(row.employeeTotal, line.lineTotal);
    row.companyInvoiceTotal = addMoney(row.companyInvoiceTotal, line.lineSubsidy);
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
      line.lineTotal,
      line.lineSubsidy,
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
  let query = supabase
    .from("orders")
    .select("*,order_items(*),companies(id,name),company_branches(id,name)")
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

  const { data, error } = await query;

  return {
    orders: ((data as ReportOrder[] | null) ?? []).map((order) => ({
      ...order,
      order_items: [...(order.order_items ?? [])].sort((a, b) => a.name.localeCompare(b.name, "es"))
    })),
    error
  };
}

export async function GET(request: NextRequest) {
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

  const mode = request.nextUrl.searchParams.get("mode") ?? "xlsx";

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

  const lines = buildReportLines(orders, filters.billingType);
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
        total: Number(order.total)
      }))
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
