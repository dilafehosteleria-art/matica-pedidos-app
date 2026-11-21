import { NextRequest, NextResponse } from "next/server";
import { assertAdmin } from "@/lib/admin";
import { getGlobalSchedule } from "@/lib/global-settings";
import { validateLocalOrderingSettings } from "@/lib/local-ordering";
import { deliveryWindowLabel, orderWindowLabel } from "@/lib/schedule";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import type { GlobalSchedule } from "@/lib/types";

export const dynamic = "force-dynamic";

type AdminClient = NonNullable<ReturnType<typeof getSupabaseAdminClient>>;
type JsonObject = Record<string, unknown>;
type ScheduleChannel = "delivery" | "local";

const LOCAL_COMPANY_SLUG = "bureau-veritas";
const LOCAL_FIELDS = [
  "id",
  "local_ordering_enabled",
  "local_order_days",
  "local_ordering_open_time",
  "local_ordering_close_time",
  "local_ordering_guarantee_cutoff",
  "local_orders_closed_on",
  "local_only_days"
].join(",");

function isObject(value: unknown): value is JsonObject {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

function normalizedTime(value: unknown) {
  if (typeof value !== "string") return null;
  const match = /^(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,6})?)?$/.exec(value.trim());
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59 || Number(match[3] ?? 0) > 59) return null;
  return `${match[1]}:${match[2]}`;
}

function normalizedDays(value: unknown, allowEmpty = false) {
  if (!Array.isArray(value)) return null;
  const days = value.map(Number);
  if (
    (!allowEmpty && days.length === 0) ||
    days.some((day) => !Number.isInteger(day) || day < 1 || day > 7) ||
    new Set(days).size !== days.length
  ) return null;
  return [...days].sort((a, b) => a - b);
}

function minutes(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

async function readBody(request: NextRequest) {
  try {
    const body = (await request.json()) as unknown;
    return isObject(body) ? body : null;
  } catch {
    return null;
  }
}

function validateDeliverySchedule(value: unknown) {
  if (!isObject(value) || typeof value.active !== "boolean") {
    return { valid: false as const, message: "La configuración de delivery no es válida." };
  }
  const activeDays = normalizedDays(value.active_days);
  const orderOpenTime = normalizedTime(value.order_open_time);
  const orderCloseTime = normalizedTime(value.order_close_time);
  const deliveryStartTime = normalizedTime(value.delivery_start_time);
  const deliveryEndTime = normalizedTime(value.delivery_end_time);
  if (!activeDays) return { valid: false as const, message: "Selecciona al menos un día habitual de delivery." };
  if (!orderOpenTime || !orderCloseTime || !deliveryStartTime || !deliveryEndTime) {
    return { valid: false as const, message: "Revisa las horas de pedidos y de reparto." };
  }
  if (minutes(orderOpenTime) >= minutes(orderCloseTime)) {
    return { valid: false as const, message: "La apertura debe ser anterior al cierre de pedidos, sin cruzar medianoche." };
  }
  if (minutes(deliveryStartTime) >= minutes(deliveryEndTime)) {
    return { valid: false as const, message: "El inicio del reparto debe ser anterior al final, sin cruzar medianoche." };
  }
  return {
    valid: true as const,
    schedule: {
      id: "global",
      active: value.active,
      active_days: activeDays,
      order_open_time: orderOpenTime,
      order_close_time: orderCloseTime,
      delivery_start_time: deliveryStartTime,
      delivery_end_time: deliveryEndTime
    } satisfies GlobalSchedule
  };
}

function localScheduleFromCompany(company: JsonObject | null) {
  if (!company) return null;
  return {
    local_ordering_enabled: company.local_ordering_enabled === true,
    local_order_days: normalizedDays(company.local_order_days) ?? [1, 2, 3, 4, 5],
    local_ordering_open_time: normalizedTime(company.local_ordering_open_time) ?? "09:30",
    local_ordering_close_time: normalizedTime(company.local_ordering_close_time) ?? "15:00",
    local_ordering_guarantee_cutoff: normalizedTime(company.local_ordering_guarantee_cutoff) ?? "13:30",
    local_orders_closed_on: validDate(company.local_orders_closed_on) ? company.local_orders_closed_on : null,
    local_only_days: normalizedDays(company.local_only_days, true) ?? []
  };
}

function validateLocalSchedule(value: unknown, currentCompany: JsonObject) {
  if (!isObject(value)) return { valid: false as const, message: "La configuración de comer o recoger no es válida." };
  const current = localScheduleFromCompany(currentCompany);
  if (!current) return { valid: false as const, message: "No se encontró la configuración de Bureau Veritas." };
  const result = validateLocalOrderingSettings({
    local_ordering_enabled: value.local_ordering_enabled ?? value.active,
    local_order_days: value.local_order_days ?? value.active_days,
    local_ordering_open_time: value.local_ordering_open_time ?? value.open_time,
    local_ordering_close_time: value.local_ordering_close_time ?? value.close_time,
    local_ordering_guarantee_cutoff: value.local_ordering_guarantee_cutoff ?? value.guarantee_cutoff,
    // The former one-day switch is represented by schedule_exceptions now.
    // Never keep a hidden legacy closure when the unified local schedule is saved.
    local_orders_closed_on: null,
    local_only_days: value.local_only_days ?? current.local_only_days
  });
  return result.valid
    ? { valid: true as const, settings: result.settings }
    : { valid: false as const, message: result.message };
}

function holidayCoverage(holidays: JsonObject[]) {
  const official = holidays.filter((holiday) => holiday.source === "official" && holiday.enabled !== false);
  const officialYears = Array.from(new Set(official
    .map((holiday) => typeof holiday.date === "string" ? Number(holiday.date.slice(0, 4)) : Number.NaN)
    .filter(Number.isInteger))).sort((a, b) => a - b);
  const years = Array.from(new Set(holidays
    .map((holiday) => typeof holiday.date === "string" ? Number(holiday.date.slice(0, 4)) : Number.NaN)
    .filter(Number.isInteger))).sort((a, b) => a - b);
  const scopes = Array.from(new Set(official
    .map((holiday) => holiday.scope)
    .filter((scope): scope is string => typeof scope === "string"))).sort();
  return { timezone: "Europe/Madrid", years, officialYears, scopes, expectedScopes: ["national", "regional", "local"] };
}

async function getLocalCompany(supabase: AdminClient) {
  return supabase.from("companies").select(LOCAL_FIELDS).eq("slug", LOCAL_COMPANY_SLUG).maybeSingle();
}

async function saveDeliverySchedule(supabase: AdminClient, value: unknown) {
  const validation = validateDeliverySchedule(value);
  if (!validation.valid) return NextResponse.json({ error: validation.message }, { status: 400 });
  const { data, error } = await supabase
    .from("app_settings")
    .upsert({ ...validation.schedule, updated_at: new Date().toISOString() })
    .select("*")
    .single();
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "No se pudo guardar el horario de delivery." }, { status: 400 });
  }
  const { error: companiesError } = await supabase
    .from("companies")
    .update({
      order_window: orderWindowLabel(validation.schedule),
      delivery_window: deliveryWindowLabel(validation.schedule)
    })
    .not("id", "is", null);
  if (companiesError) return NextResponse.json({ error: companiesError.message }, { status: 400 });
  return NextResponse.json({ schedule: { ...validation.schedule, updated_at: data.updated_at } });
}

function validateException(value: unknown, localCompanyId: string | null) {
  if (!isObject(value)) return { valid: false as const, message: "La excepción no es válida." };
  const channel = value.channel;
  const mode = value.mode;
  const date = value.date;
  const reason = typeof value.reason === "string" ? value.reason.trim().slice(0, 160) : "";
  if ((channel !== "delivery" && channel !== "local") || (mode !== "closed" && mode !== "custom_hours")) {
    return { valid: false as const, message: "Selecciona el canal y si ese día cierra o usa un horario especial." };
  }
  if (!validDate(date)) return { valid: false as const, message: "Indica una fecha válida para la excepción." };
  if (channel === "local" && !localCompanyId) {
    return { valid: false as const, message: "No se encontró Bureau Veritas para crear la excepción local." };
  }
  const base = {
    date,
    channel: channel as ScheduleChannel,
    mode,
    company_id: channel === "local" ? localCompanyId : null,
    reason: reason || null,
    updated_at: new Date().toISOString()
  };
  if (mode === "closed") {
    return {
      valid: true as const,
      exception: {
        ...base,
        open_time: null,
        close_time: null,
        service_start_time: null,
        service_end_time: null,
        menu_guarantee_cutoff: null
      }
    };
  }
  const openTime = normalizedTime(value.open_time);
  const closeTime = normalizedTime(value.close_time);
  if (!openTime || !closeTime || minutes(openTime) >= minutes(closeTime)) {
    return { valid: false as const, message: "La apertura especial debe ser anterior al cierre, sin cruzar medianoche." };
  }
  if (channel === "delivery") {
    const hasServiceStart = value.service_start_time !== null && value.service_start_time !== undefined && value.service_start_time !== "";
    const hasServiceEnd = value.service_end_time !== null && value.service_end_time !== undefined && value.service_end_time !== "";
    const serviceStartTime = hasServiceStart ? normalizedTime(value.service_start_time) : null;
    const serviceEndTime = hasServiceEnd ? normalizedTime(value.service_end_time) : null;
    if ((hasServiceStart && !serviceStartTime) || (hasServiceEnd && !serviceEndTime)) {
      return { valid: false as const, message: "La franja de reparto especial no tiene horas válidas." };
    }
    if ((serviceStartTime === null) !== (serviceEndTime === null)) {
      return { valid: false as const, message: "Indica tanto el inicio como el fin del reparto especial." };
    }
    if (serviceStartTime && serviceEndTime && minutes(serviceStartTime) >= minutes(serviceEndTime)) {
      return { valid: false as const, message: "El inicio del reparto especial debe ser anterior al final." };
    }
    return {
      valid: true as const,
      exception: {
        ...base,
        open_time: openTime,
        close_time: closeTime,
        service_start_time: serviceStartTime,
        service_end_time: serviceEndTime,
        menu_guarantee_cutoff: null
      }
    };
  }
  const menuCutoff = value.menu_guarantee_cutoff == null ? null : normalizedTime(value.menu_guarantee_cutoff);
  if (value.menu_guarantee_cutoff != null && !menuCutoff) {
    return { valid: false as const, message: "El corte de garantía del menú no tiene una hora válida." };
  }
  if (menuCutoff && (minutes(menuCutoff) <= minutes(openTime) || minutes(menuCutoff) >= minutes(closeTime))) {
    return { valid: false as const, message: "El corte de garantía debe quedar dentro del horario local especial." };
  }
  return {
    valid: true as const,
    exception: {
      ...base,
      open_time: openTime,
      close_time: closeTime,
      service_start_time: null,
      service_end_time: null,
      menu_guarantee_cutoff: menuCutoff
    }
  };
}

function validateSpecialDay(value: unknown) {
  if (!isObject(value)) return { valid: false as const, message: "El día especial no es válido." };
  const date = value.date;
  const name = typeof value.name === "string" ? value.name.trim().slice(0, 160) : "";
  const closesDelivery = value.closes_delivery ?? true;
  const closesLocal = value.closes_local ?? true;
  if (!validDate(date) || !name) return { valid: false as const, message: "Indica la fecha y el nombre del día especial." };
  if (typeof closesDelivery !== "boolean" || typeof closesLocal !== "boolean" || (!closesDelivery && !closesLocal)) {
    return { valid: false as const, message: "Selecciona si el cierre afecta al delivery, al local o a ambos." };
  }
  return {
    valid: true as const,
    holiday: {
      date,
      name,
      scope: "special",
      source: "manual",
      source_url: null,
      closes_delivery: closesDelivery,
      closes_local: closesLocal,
      enabled: value.enabled !== false,
      updated_at: new Date().toISOString()
    }
  };
}

export async function GET(request: NextRequest) {
  const adminError = await assertAdmin(request);
  if (adminError) return adminError;
  const supabase = getSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ error: "Configura Supabase para usar el panel." }, { status: 503 });
  const [schedule, companyResult, exceptionsResult, holidaysResult] = await Promise.all([
    getGlobalSchedule(supabase),
    getLocalCompany(supabase),
    supabase.from("schedule_exceptions").select("*").order("date", { ascending: true }).order("channel", { ascending: true }),
    supabase.from("calendar_closures").select("*").order("date", { ascending: true })
  ]);
  if (companyResult.error) return NextResponse.json({ error: companyResult.error.message }, { status: 400 });
  if (exceptionsResult.error) return NextResponse.json({ error: exceptionsResult.error.message }, { status: 400 });
  if (holidaysResult.error) return NextResponse.json({ error: holidaysResult.error.message }, { status: 400 });
  const company = isObject(companyResult.data) ? companyResult.data : null;
  const exceptions = (exceptionsResult.data ?? []) as JsonObject[];
  const holidays = (holidaysResult.data ?? []) as JsonObject[];
  return NextResponse.json({
    schedule,
    localSchedule: localScheduleFromCompany(company),
    localCompanyId: typeof company?.id === "string" ? company.id : null,
    exceptions,
    holidays,
    holidayCoverage: holidayCoverage(holidays)
  });
}

export async function PATCH(request: NextRequest) {
  const adminError = await assertAdmin(request);
  if (adminError) return adminError;
  const supabase = getSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ error: "Configura Supabase para usar el panel." }, { status: 503 });
  const body = await readBody(request);
  if (!body) return NextResponse.json({ error: "La configuración no tiene un formato válido." }, { status: 400 });
  if (body.section === undefined) return saveDeliverySchedule(supabase, body);
  if (body.section === "delivery") return saveDeliverySchedule(supabase, body.schedule);
  if (body.section !== "local") return NextResponse.json({ error: "Selecciona una sección de configuración válida." }, { status: 400 });
  const { data: company, error: companyError } = await getLocalCompany(supabase);
  if (companyError || !isObject(company) || typeof company.id !== "string") {
    return NextResponse.json(
      { error: companyError?.message ?? "No se encontró Bureau Veritas para guardar el horario local." },
      { status: 400 }
    );
  }
  const validation = validateLocalSchedule(body.localSchedule, company);
  if (!validation.valid) return NextResponse.json({ error: validation.message }, { status: 400 });
  const { data, error } = await supabase
    .from("companies")
    .update(validation.settings)
    .eq("id", company.id)
    .select(LOCAL_FIELDS)
    .single();
  if (error || !isObject(data)) {
    return NextResponse.json({ error: error?.message ?? "No se pudo guardar el horario local." }, { status: 400 });
  }
  return NextResponse.json({ localSchedule: localScheduleFromCompany(data), localCompanyId: company.id });
}

export async function POST(request: NextRequest) {
  const adminError = await assertAdmin(request);
  if (adminError) return adminError;
  const supabase = getSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ error: "Configura Supabase para usar el panel." }, { status: 503 });
  const body = await readBody(request);
  if (!body) return NextResponse.json({ error: "La solicitud no tiene un formato válido." }, { status: 400 });
  if (body.resource === "exception") {
    const requestedException = isObject(body.exception) ? body.exception : null;
    const requestedChannel = requestedException?.channel;
    let localCompanyId: string | null = null;
    if (requestedChannel === "local" || requestedChannel === "both") {
      const { data: company, error: companyError } = await getLocalCompany(supabase);
      if (companyError || !isObject(company) || typeof company.id !== "string") {
        return NextResponse.json({ error: companyError?.message ?? "No se encontró Bureau Veritas." }, { status: 400 });
      }
      localCompanyId = company.id;
    }
    const requestedId = typeof requestedException?.id === "string" ? requestedException.id : null;
    if (requestedChannel === "both") {
      if (requestedId || requestedException?.mode !== "closed") {
        return NextResponse.json({ error: "Ambos servicios solo se pueden cerrar juntos al crear una excepción nueva." }, { status: 400 });
      }
      const deliveryValidation = validateException({ ...requestedException, channel: "delivery" }, localCompanyId);
      const localValidation = validateException({ ...requestedException, channel: "local" }, localCompanyId);
      if (!deliveryValidation.valid || !localValidation.valid) {
        return NextResponse.json(
          { error: !deliveryValidation.valid ? deliveryValidation.message : !localValidation.valid ? localValidation.message : "La excepción no es válida." },
          { status: 400 }
        );
      }
      const { data, error } = await supabase
        .from("schedule_exceptions")
        .insert([deliveryValidation.exception, localValidation.exception])
        .select("*");
      if (error || !data) {
        return NextResponse.json(
          { error: error?.code === "23505" ? "Ya existe una excepción para alguno de esos servicios en esa fecha." : error?.message ?? "No se pudo guardar el cierre." },
          { status: 400 }
        );
      }
      return NextResponse.json({ exceptions: data }, { status: 201 });
    }
    const validation = validateException(body.exception, localCompanyId);
    if (!validation.valid) return NextResponse.json({ error: validation.message }, { status: 400 });
    const exceptionRecord: Record<string, unknown> = validation.exception;
    const query = requestedId
      ? supabase.from("schedule_exceptions").update(exceptionRecord).eq("id", requestedId)
      : supabase.from("schedule_exceptions").insert(exceptionRecord);
    const { data, error } = await query.select("*").single();
    if (error || !data) {
      return NextResponse.json(
        { error: error?.code === "23505" ? "Ya existe una excepción para ese canal y fecha." : error?.message ?? "No se pudo guardar la excepción." },
        { status: 400 }
      );
    }
    return NextResponse.json({ exception: data }, { status: requestedId ? 200 : 201 });
  }
  if (body.resource === "special_day") {
    const validation = validateSpecialDay(body.holiday);
    if (!validation.valid) return NextResponse.json({ error: validation.message }, { status: 400 });
    const requestedId = isObject(body.holiday) && typeof body.holiday.id === "string" ? body.holiday.id : null;
    const query = requestedId
      ? supabase.from("calendar_closures").update(validation.holiday).eq("id", requestedId).eq("source", "manual")
      : supabase.from("calendar_closures").insert(validation.holiday);
    const { data, error } = await query.select("*").single();
    if (error || !data) {
      return NextResponse.json(
        { error: error?.code === "23505" ? "Ese día ya figura en el calendario de cierres." : error?.message ?? "No se pudo guardar el día especial." },
        { status: 400 }
      );
    }
    return NextResponse.json({ holiday: data }, { status: requestedId ? 200 : 201 });
  }
  return NextResponse.json({ error: "Selecciona un recurso válido." }, { status: 400 });
}

export async function DELETE(request: NextRequest) {
  const adminError = await assertAdmin(request);
  if (adminError) return adminError;
  const supabase = getSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ error: "Configura Supabase para usar el panel." }, { status: 503 });
  const body = await readBody(request);
  const id = typeof body?.id === "string" ? body.id.trim() : "";
  if (!body || !id) return NextResponse.json({ error: "Indica el elemento que quieres eliminar." }, { status: 400 });
  if (body.resource === "exception") {
    const { data, error } = await supabase.from("schedule_exceptions").delete().eq("id", id).select("id").maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!data) return NextResponse.json({ error: "La excepción ya no existe." }, { status: 404 });
    return NextResponse.json({ deleted: true, id });
  }
  if (body.resource === "special_day") {
    const { data: holiday, error: readError } = await supabase
      .from("calendar_closures")
      .select("id,source")
      .eq("id", id)
      .maybeSingle();
    if (readError) return NextResponse.json({ error: readError.message }, { status: 400 });
    if (!holiday) return NextResponse.json({ error: "El cierre ya no existe." }, { status: 404 });
    if (holiday.source !== "manual") {
      return NextResponse.json(
        { error: "Los festivos oficiales no se eliminan; crea una apertura puntual para esa fecha si excepcionalmente se trabaja." },
        { status: 403 }
      );
    }
    const { error } = await supabase.from("calendar_closures").delete().eq("id", id).eq("source", "manual");
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ deleted: true, id });
  }
  return NextResponse.json({ error: "Selecciona un recurso válido." }, { status: 400 });
}
