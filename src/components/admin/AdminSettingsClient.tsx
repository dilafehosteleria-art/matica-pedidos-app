"use client";

import {
  AlertCircle, CalendarDays, CheckCircle2, Clock3, Loader2, Pencil, RefreshCw, Save,
  Trash2, Truck, Utensils
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { AdminGate } from "./AdminGate";
import { DEFAULT_GLOBAL_SCHEDULE, activeDaysLabel, deliveryWindowLabel, orderWindowLabel } from "@/lib/schedule";
import type { GlobalSchedule } from "@/lib/types";

const DAYS = [
  [1, "Lunes"], [2, "Martes"], [3, "Miércoles"], [4, "Jueves"],
  [5, "Viernes"], [6, "Sábado"], [7, "Domingo"]
] as const;

type LocalSchedule = {
  local_ordering_enabled: boolean;
  local_order_days: number[];
  local_ordering_open_time: string;
  local_ordering_close_time: string;
  local_ordering_guarantee_cutoff: string;
  local_orders_closed_on: string | null;
  local_only_days: number[];
};

type AdminException = {
  id: string;
  date: string;
  channel: "delivery" | "local";
  mode: "closed" | "custom_hours";
  open_time: string | null;
  close_time: string | null;
  service_start_time: string | null;
  service_end_time: string | null;
  menu_guarantee_cutoff: string | null;
  reason: string | null;
};

type Closure = {
  id: string;
  date: string;
  name: string;
  scope: "national" | "regional" | "local" | "special";
  source: "official" | "manual";
  closes_delivery: boolean;
  closes_local: boolean;
};

type CalendarSyncStatus = {
  year: number;
  complete: boolean;
  official_count: number;
  last_checked_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
};

type ExceptionDraft = {
  id?: string;
  date: string;
  channel: "delivery" | "local" | "both";
  mode: "closed" | "custom_hours";
  open_time: string;
  close_time: string;
  service_start_time: string;
  service_end_time: string;
  menu_guarantee_cutoff: string;
  reason: string;
};

type SettingsResponse = {
  schedule: GlobalSchedule;
  localSchedule: LocalSchedule | null;
  localCompanyId: string | null;
  exceptions: AdminException[];
  holidays: Closure[];
  holidayCoverage: { timezone: string; years: number[]; officialYears?: number[] };
  holidaySync: CalendarSyncStatus[];
  error?: string;
};

const DEFAULT_LOCAL: LocalSchedule = {
  local_ordering_enabled: true,
  local_order_days: [1, 2, 3, 4, 5],
  local_ordering_open_time: "09:30",
  local_ordering_close_time: "15:00",
  local_ordering_guarantee_cutoff: "13:30",
  local_orders_closed_on: null,
  local_only_days: [5]
};

function today() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(new Date());
}

function time(value: string | null | undefined, fallback: string) {
  const result = value?.slice(0, 5) ?? "";
  return /^\d{2}:\d{2}$/.test(result) ? result : fallback;
}

function initialException(schedule = DEFAULT_GLOBAL_SCHEDULE): ExceptionDraft {
  return {
    date: today(), channel: "delivery", mode: "custom_hours",
    open_time: schedule.order_open_time, close_time: schedule.order_close_time,
    service_start_time: schedule.delivery_start_time, service_end_time: schedule.delivery_end_time,
    menu_guarantee_cutoff: "13:30", reason: ""
  };
}

function formattedDate(date: string) {
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: "UTC", weekday: "short", day: "2-digit", month: "short", year: "numeric"
  }).format(new Date(`${date}T00:00:00Z`));
}

function formattedDateTime(value: string | null | undefined) {
  if (!value) return "aún no se ha comprobado";
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
  }).format(new Date(value));
}

const SCOPE_LABEL = {
  national: "Nacional", regional: "Comunidad de Madrid", local: "Madrid capital", special: "Día especial"
};

export function AdminSettingsClient() {
  return (
    <AdminGate
      title="Configuración"
      subtitle="Delivery, servicio en local, excepciones y festivos, cada uno con su propia lógica."
    >
      {(pin, clearPin) => <SettingsEditor pin={pin} clearPin={clearPin} />}
    </AdminGate>
  );
}

function SettingsEditor({ pin, clearPin }: { pin: string; clearPin: () => void }) {
  const [schedule, setSchedule] = useState<GlobalSchedule>(DEFAULT_GLOBAL_SCHEDULE);
  const [local, setLocal] = useState<LocalSchedule>(DEFAULT_LOCAL);
  const [localCompanyId, setLocalCompanyId] = useState<string | null>(null);
  const [exceptions, setExceptions] = useState<AdminException[]>([]);
  const [closures, setClosures] = useState<Closure[]>([]);
  const [holidaySync, setHolidaySync] = useState<CalendarSyncStatus[]>([]);
  const [coverage, setCoverage] = useState({ timezone: "Europe/Madrid", years: [] as number[], officialYears: [] as number[] });
  const [exception, setException] = useState<ExceptionDraft>(() => initialException());
  const [special, setSpecial] = useState({ date: today(), name: "", closes_delivery: true, closes_local: true });
  const [year, setYear] = useState(Number(today().slice(0, 4)));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch("/api/admin/settings", { headers: { "x-admin-pin": pin } });
    const data = await response.json() as SettingsResponse;
    if (response.status === 401) return clearPin();
    if (!response.ok) {
      setError(data.error ?? "No se pudo cargar la configuración.");
      return setLoading(false);
    }
    setSchedule(data.schedule);
    setLocal(data.localSchedule ?? DEFAULT_LOCAL);
    setLocalCompanyId(data.localCompanyId);
    setExceptions(data.exceptions ?? []);
    setClosures(data.holidays ?? []);
    setHolidaySync(data.holidaySync ?? []);
    setCoverage({
      ...data.holidayCoverage,
      officialYears: data.holidayCoverage.officialYears ?? data.holidayCoverage.years
    });
    setException((current) => current.id ? current : initialException(data.schedule));
    const currentYear = Number(today().slice(0, 4));
    setYear(data.holidayCoverage.years.includes(currentYear) ? currentYear : data.holidayCoverage.years.at(-1) ?? currentYear);
    setError("");
    setLoading(false);
  }, [clearPin, pin]);

  useEffect(() => { void load(); }, [load]);

  async function send(method: "PATCH" | "POST" | "DELETE", body: unknown) {
    setError(""); setSuccess("");
    const response = await fetch("/api/admin/settings", {
      method,
      headers: { "Content-Type": "application/json", "x-admin-pin": pin },
      body: JSON.stringify(body)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "No se pudo guardar la configuración.");
    return data;
  }

  async function run(key: string, action: () => Promise<void>) {
    setSaving(key);
    try { await action(); } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo completar la operación.");
    } finally { setSaving(""); }
  }

  function saveDelivery() {
    void run("delivery", async () => {
      const data = await send("PATCH", { section: "delivery", schedule });
      setSchedule(data.schedule); setSuccess("Horario habitual del delivery actualizado.");
    });
  }

  function saveLocal() {
    void run("local", async () => {
      const data = await send("PATCH", { section: "local", localSchedule: local });
      setLocal(data.localSchedule); setSuccess("Horario de Comer aquí y Recoger actualizado.");
    });
  }

  function exceptionFor(channel: "delivery" | "local") {
    return {
      id: exception.id, date: exception.date, channel, mode: exception.mode,
      open_time: exception.mode === "custom_hours" ? exception.open_time : null,
      close_time: exception.mode === "custom_hours" ? exception.close_time : null,
      service_start_time: exception.mode === "custom_hours" && channel === "delivery" ? exception.service_start_time : null,
      service_end_time: exception.mode === "custom_hours" && channel === "delivery" ? exception.service_end_time : null,
      menu_guarantee_cutoff: exception.mode === "custom_hours" && channel === "local" ? exception.menu_guarantee_cutoff : null,
      reason: exception.reason
    };
  }

  function saveException() {
    void run("exception", async () => {
      const payload = exception.channel === "both"
        ? { ...exceptionFor("delivery"), id: undefined, channel: "both" }
        : exceptionFor(exception.channel);
      await send("POST", { resource: "exception", exception: payload });
      setException(initialException(schedule)); await load();
      setSuccess("Excepción guardada. Solo afecta a esa fecha y servicio.");
    });
  }

  function saveSpecial() {
    void run("special", async () => {
      await send("POST", { resource: "special_day", holiday: special });
      setSpecial({ date: today(), name: "", closes_delivery: true, closes_local: true });
      await load(); setSuccess("Cierre especial añadido al calendario.");
    });
  }

  function syncHolidays() {
    void run("holiday-sync", async () => {
      await send("POST", { resource: "sync_official_holidays" });
      await load();
      setSuccess("Calendario oficial comprobado y actualizado.");
    });
  }

  function remove(resource: "exception" | "special_day", id: string) {
    void run(id, async () => {
      await send("DELETE", { resource, id }); await load();
      setSuccess(resource === "exception" ? "Excepción eliminada." : "Cierre especial eliminado.");
    });
  }

  function edit(item: AdminException) {
    setException({
      id: item.id, date: item.date, channel: item.channel, mode: item.mode,
      open_time: time(item.open_time, item.channel === "delivery" ? schedule.order_open_time : local.local_ordering_open_time),
      close_time: time(item.close_time, item.channel === "delivery" ? schedule.order_close_time : local.local_ordering_close_time),
      service_start_time: time(item.service_start_time, schedule.delivery_start_time),
      service_end_time: time(item.service_end_time, schedule.delivery_end_time),
      menu_guarantee_cutoff: time(item.menu_guarantee_cutoff, local.local_ordering_guarantee_cutoff),
      reason: item.reason ?? ""
    });
    document.getElementById("exceptions")?.scrollIntoView({ behavior: "smooth" });
  }

  const upcoming = useMemo(() => exceptions.filter((item) => item.date >= today()), [exceptions]);
  const yearClosures = useMemo(() => closures.filter((item) => item.date.startsWith(`${year}-`)), [closures, year]);
  const currentYear = Number(today().slice(0, 4));
  const nextYear = currentYear + 1;
  const currentSync = holidaySync.find((item) => item.year === currentYear);
  const nextSync = holidaySync.find((item) => item.year === nextYear);
  const lastChecked = holidaySync
    .map((item) => item.last_checked_at)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);
  if (loading) return <Loading />;

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-5 sm:px-6 lg:px-8">
      {error ? <Notice tone="error">{error}</Notice> : null}
      {success ? <Notice tone="success">{success}</Notice> : null}

      <Card>
        <Heading number="1" icon={<Truck />} title="Delivery habitual">Cuándo se aceptan pedidos con reparto y en qué franja se entregan en las empresas.</Heading>
        <Toggle checked={schedule.active} label="Delivery activo" hint="Interruptor de emergencia: apagado bloquea también las aperturas puntuales." onChange={(active) => setSchedule((value) => ({ ...value, active }))} />
        <Days label="Días habituales con delivery" selected={schedule.active_days} onChange={(active_days) => setSchedule((value) => ({ ...value, active_days }))} />
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Time label="Aceptar pedidos desde" value={schedule.order_open_time} onChange={(order_open_time) => setSchedule((value) => ({ ...value, order_open_time }))} />
          <Time label="Hora límite para pedir" value={schedule.order_close_time} onChange={(order_close_time) => setSchedule((value) => ({ ...value, order_close_time }))} />
          <Time label="El reparto comienza a las" value={schedule.delivery_start_time} onChange={(delivery_start_time) => setSchedule((value) => ({ ...value, delivery_start_time }))} />
          <Time label="El reparto termina a las" value={schedule.delivery_end_time} onChange={(delivery_end_time) => setSchedule((value) => ({ ...value, delivery_end_time }))} />
        </div>
        <Summary><b>Se puede pedir:</b> {orderWindowLabel(schedule)}<br /><b>Se entrega:</b> {deliveryWindowLabel(schedule)}</Summary>
        <SaveButton busy={saving === "delivery"} onClick={saveDelivery}>Guardar delivery habitual</SaveButton>
      </Card>

      <Card id="local">
        <Heading number="2" icon={<Utensils />} title="Comer o recoger en Matica · Bureau Veritas">Una sola configuración para Comer aquí y Recoger, completamente independiente del delivery.</Heading>
        {!localCompanyId ? <Notice tone="error">No se encontró Bureau Veritas en la base de datos.</Notice> : null}
        <Toggle checked={local.local_ordering_enabled} label="Comer o recoger activo" hint="Apaga o enciende simultáneamente las dos modalidades locales." onChange={(local_ordering_enabled) => setLocal((value) => ({ ...value, local_ordering_enabled }))} />
        <Days label="Días habituales para comer o recoger" selected={local.local_order_days} onChange={(local_order_days) => setLocal((value) => ({ ...value, local_order_days, local_only_days: value.local_only_days.filter((day) => local_order_days.includes(day)) }))} />
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <Time label="Local abierto desde" value={local.local_ordering_open_time} onChange={(local_ordering_open_time) => setLocal((value) => ({ ...value, local_ordering_open_time }))} />
          <Time label="Platos garantizados hasta" value={local.local_ordering_guarantee_cutoff} onChange={(local_ordering_guarantee_cutoff) => setLocal((value) => ({ ...value, local_ordering_guarantee_cutoff }))} />
          <Time label="Local abierto hasta" value={local.local_ordering_close_time} onChange={(local_ordering_close_time) => setLocal((value) => ({ ...value, local_ordering_close_time }))} />
        </div>
        <Days label="Días de Bureau Veritas sin delivery" hint="Mantienen Comer aquí y Recoger, pero ocultan Entrega en la empresa. El viernes está configurado así." selected={local.local_only_days} allowed={local.local_order_days} allowEmpty onChange={(local_only_days) => setLocal((value) => ({ ...value, local_only_days }))} />
        <Summary><b>Local:</b> {activeDaysLabel(local.local_order_days)} de {local.local_ordering_open_time} a {local.local_ordering_close_time}<br /><b>Platos garantizados:</b> hasta las {local.local_ordering_guarantee_cutoff}</Summary>
        <SaveButton busy={saving === "local"} disabled={!localCompanyId} onClick={saveLocal}>Guardar horario local</SaveButton>
      </Card>

      <Card id="exceptions">
        <Heading number="3" icon={<Clock3 />} title="Excepciones por fecha">Abre con un horario especial o cierra un servicio en un día concreto sin tocar su horario habitual.</Heading>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <Field label="Fecha"><input type="date" value={exception.date} onChange={(event) => setException((value) => ({ ...value, date: event.target.value }))} /></Field>
          <Field label="Servicio afectado"><select value={exception.channel} onChange={(event) => setException((value) => ({ ...value, channel: event.target.value as ExceptionDraft["channel"] }))}><option value="delivery">Delivery</option><option value="local">Comer o recoger</option><option value="both" disabled={exception.mode === "custom_hours" || Boolean(exception.id)}>Ambos (solo al crear un cierre)</option></select></Field>
          <Field label="Qué ocurrirá"><select value={exception.mode} onChange={(event) => { const mode = event.target.value as ExceptionDraft["mode"]; setException((value) => ({ ...value, mode, channel: mode === "custom_hours" && value.channel === "both" ? "delivery" : value.channel })); }}><option value="custom_hours">Abrir con horario especial</option><option value="closed">Cerrar todo el día</option></select></Field>
        </div>
        {exception.mode === "custom_hours" ? <div className={`mt-3 grid gap-3 ${exception.channel === "delivery" ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
          <Time label="Aceptar desde" value={exception.open_time} onChange={(open_time) => setException((value) => ({ ...value, open_time }))} />
          <Time label="Aceptar hasta" value={exception.close_time} onChange={(close_time) => setException((value) => ({ ...value, close_time }))} />
          {exception.channel === "delivery" ? <><Time label="Reparto desde" value={exception.service_start_time} onChange={(service_start_time) => setException((value) => ({ ...value, service_start_time }))} /><Time label="Reparto hasta" value={exception.service_end_time} onChange={(service_end_time) => setException((value) => ({ ...value, service_end_time }))} /></> : <Time label="Platos garantizados hasta" value={exception.menu_guarantee_cutoff} onChange={(menu_guarantee_cutoff) => setException((value) => ({ ...value, menu_guarantee_cutoff }))} />}
        </div> : null}
        <div className="mt-3"><Field label="Motivo interno (opcional)"><input maxLength={160} placeholder="Apertura especial, puente, evento…" value={exception.reason} onChange={(event) => setException((value) => ({ ...value, reason: event.target.value }))} /></Field></div>
        <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs font-bold text-amber-900">Una apertura puntual puede abrir un sábado o festivo, pero únicamente el servicio elegido. El interruptor maestro sigue teniendo prioridad.</p>
        <div className="flex gap-2"><SaveButton busy={saving === "exception"} onClick={saveException}>{exception.id ? "Guardar cambios" : "Guardar excepción"}</SaveButton>{exception.id ? <button type="button" className="mt-5 rounded-lg border border-matica-line px-4 font-black" onClick={() => setException(initialException(schedule))}>Cancelar</button> : null}</div>
        <h3 className="mt-7 border-t border-matica-line pt-5 font-black">Próximas excepciones</h3>
        {upcoming.length ? upcoming.map((item) => <Row key={item.id}><div><b>{formattedDate(item.date)}</b> <Badge>{item.channel === "delivery" ? "Delivery" : "Comer o recoger"}</Badge> <Badge red={item.mode === "closed"}>{item.mode === "closed" ? "Cerrado" : `${time(item.open_time, "--:--")}–${time(item.close_time, "--:--")}`}</Badge>{item.reason ? <p>{item.reason}</p> : null}</div><div className="flex gap-2"><IconButton label="Editar" onClick={() => edit(item)}><Pencil /></IconButton><IconButton danger label="Eliminar" onClick={() => remove("exception", item.id)}><Trash2 /></IconButton></div></Row>) : <Empty>No hay excepciones futuras.</Empty>}
      </Card>

      <Card>
        <Heading number="4" icon={<CalendarDays />} title="Festivos y días especiales">Los festivos oficiales de Madrid cierran delivery y local por defecto. Para trabajar uno, crea una apertura puntual arriba.</Heading>
        <div className="mt-5 rounded-lg bg-matica-soft p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div><b>Actualización automática semanal · cargado hasta {coverage.officialYears.at(-1) ?? "—"}</b><p>Nacional, Comunidad de Madrid y Madrid capital · {coverage.timezone}</p><p className="mt-1 text-xs font-semibold text-matica-ink/55">Última comprobación: {formattedDateTime(lastChecked)}</p></div>
            <button type="button" className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-matica-green bg-white px-4 font-black text-matica-green disabled:opacity-50" disabled={saving === "holiday-sync"} onClick={syncHolidays}>{saving === "holiday-sync" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}Actualizar ahora</button>
          </div>
          {!currentSync?.complete ? <p className="mt-3 rounded-lg bg-red-100 p-3 text-xs font-bold text-red-800">Atención: falta validar el calendario oficial de {currentYear}. La app conservará el último calendario bueno y seguirá reintentándolo.</p> : nextSync?.complete ? <p className="mt-3 rounded-lg bg-emerald-100 p-3 text-xs font-bold text-emerald-800">El calendario de {nextYear} ya está completo: {nextSync.official_count} festivos verificados.</p> : <p className="mt-3 rounded-lg bg-amber-100 p-3 text-xs font-bold text-amber-900">El calendario de {nextYear} aún no está publicado o completo. Se volverá a comprobar automáticamente cada semana.</p>}
        </div>
        <div className="mt-4 flex justify-end"><select aria-label="Año del calendario" className="rounded-lg border border-matica-line bg-white px-3 py-2 font-black" value={year} onChange={(event) => setYear(Number(event.target.value))}>{coverage.years.map((item) => <option key={item}>{item}</option>)}</select></div>
        <div className="mt-4 space-y-2">{yearClosures.length ? yearClosures.map((item) => <Row key={item.id}><div><b>{formattedDate(item.date)}</b> · {item.name} <Badge>{SCOPE_LABEL[item.scope]}</Badge><p>Cierra {item.closes_delivery && item.closes_local ? "delivery y local" : item.closes_delivery ? "delivery" : "local"}.</p></div>{item.source === "manual" ? <IconButton danger label="Eliminar cierre especial" onClick={() => remove("special_day", item.id)}><Trash2 /></IconButton> : <Badge>Oficial</Badge>}</Row>) : <Empty>No hay cierres cargados para este año.</Empty>}</div>
        <h3 className="mt-7 border-t border-matica-line pt-5 font-black">Añadir cierre especial</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2"><Field label="Fecha"><input type="date" value={special.date} onChange={(event) => setSpecial((value) => ({ ...value, date: event.target.value }))} /></Field><Field label="Nombre"><input maxLength={160} placeholder="Cierre por puente" value={special.name} onChange={(event) => setSpecial((value) => ({ ...value, name: event.target.value }))} /></Field></div>
        <div className="mt-3 flex flex-wrap gap-2"><Check label="Cierra delivery" checked={special.closes_delivery} onChange={(closes_delivery) => setSpecial((value) => ({ ...value, closes_delivery }))} /><Check label="Cierra comer o recoger" checked={special.closes_local} onChange={(closes_local) => setSpecial((value) => ({ ...value, closes_local }))} /></div>
        <SaveButton busy={saving === "special"} onClick={saveSpecial}>Añadir cierre especial</SaveButton>
      </Card>
    </div>
  );
}

function Card({ id, children }: { id?: string; children: ReactNode }) { return <section id={id} className="scroll-mt-4 rounded-lg border border-matica-line bg-white p-5 shadow-sm">{children}</section>; }
function Heading({ number, icon, title, children }: { number: string; icon: ReactNode; title: string; children: ReactNode }) { return <div className="flex gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-matica-green font-black text-white">{number}</span><div><div className="flex items-center gap-2 text-matica-green [&_svg]:h-5 [&_svg]:w-5"><>{icon}</><h2 className="text-xl font-black">{title}</h2></div><p className="mt-1 text-sm font-semibold text-matica-ink/60">{children}</p></div></div>; }
function Notice({ tone, children }: { tone: "error" | "success"; children: ReactNode }) { const Icon = tone === "error" ? AlertCircle : CheckCircle2; return <div className={`flex gap-2 rounded-lg border p-4 text-sm font-bold ${tone === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}><Icon className="h-5 w-5" />{children}</div>; }
function Toggle({ checked, label, hint, onChange }: { checked: boolean; label: string; hint: string; onChange: (value: boolean) => void }) { return <label className="mt-5 flex cursor-pointer gap-3 rounded-lg border border-matica-line p-3"><input className="mt-1" type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><span><b>{label}</b><small className="block text-matica-ink/55">{hint}</small></span></label>; }
function Days({ label, hint, selected, allowed, allowEmpty = false, onChange }: { label: string; hint?: string; selected: number[]; allowed?: number[]; allowEmpty?: boolean; onChange: (value: number[]) => void }) { return <fieldset className="mt-5"><legend className="text-sm font-black">{label}</legend>{hint ? <p className="text-xs font-semibold text-matica-ink/55">{hint}</p> : null}<div className="mt-2 grid gap-2 sm:grid-cols-4">{DAYS.map(([value, name]) => { const disabled = Boolean(allowed && !allowed.includes(value)); return <label key={value} className={`flex min-h-11 items-center gap-2 rounded-lg border border-matica-line px-3 font-bold ${disabled ? "opacity-35" : ""}`}><input type="checkbox" disabled={disabled} checked={selected.includes(value)} onChange={() => { const next = selected.includes(value) ? selected.filter((day) => day !== value) : [...selected, value].sort(); if (allowEmpty || next.length) onChange(next); }} />{name}</label>; })}</div></fieldset>; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="space-y-1"><span className="text-sm font-bold text-matica-ink/70">{label}</span><span className="block [&>input]:w-full [&>input]:rounded-lg [&>input]:border [&>input]:border-matica-line [&>input]:px-3 [&>input]:py-3 [&>select]:w-full [&>select]:rounded-lg [&>select]:border [&>select]:border-matica-line [&>select]:px-3 [&>select]:py-3">{children}</span></label>; }
function Time({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <Field label={label}><input type="time" value={value} onChange={(event) => onChange(event.target.value)} /></Field>; }
function Summary({ children }: { children: ReactNode }) { return <div className="mt-5 rounded-lg bg-matica-soft p-4 text-sm text-matica-ink/70">{children}</div>; }
function SaveButton({ busy, disabled = false, onClick, children }: { busy: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) { return <button type="button" className="mt-5 flex min-h-12 items-center gap-2 rounded-lg bg-matica-green px-5 font-black text-white disabled:bg-matica-ink/30" disabled={busy || disabled} onClick={onClick}>{busy ? <Loader2 className="animate-spin" /> : <Save />}{children}</button>; }
function Badge({ red = false, children }: { red?: boolean; children: ReactNode }) { return <span className={`inline-block rounded-full px-2 py-1 text-xs font-black ${red ? "bg-red-100 text-red-700" : "bg-matica-soft text-matica-ink/65"}`}>{children}</span>; }
function Row({ children }: { children: ReactNode }) { return <div className="mt-2 flex flex-col gap-3 rounded-lg border border-matica-line p-3 text-sm sm:flex-row sm:items-center sm:justify-between [&_p]:mt-1 [&_p]:text-xs [&_p]:font-semibold [&_p]:text-matica-ink/55">{children}</div>; }
function IconButton({ label, danger = false, onClick, children }: { label: string; danger?: boolean; onClick: () => void; children: ReactNode }) { return <button type="button" aria-label={label} title={label} className={`grid h-10 w-10 place-items-center rounded-lg border [&_svg]:h-4 [&_svg]:w-4 ${danger ? "border-red-200 text-red-700" : "border-matica-line text-matica-green"}`} onClick={onClick}>{children}</button>; }
function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) { return <label className="flex min-h-11 items-center gap-2 rounded-lg border border-matica-line px-3 font-bold"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />{label}</label>; }
function Empty({ children }: { children: ReactNode }) { return <p className="mt-3 rounded-lg border border-dashed border-matica-line p-4 text-sm font-semibold text-matica-ink/50">{children}</p>; }
function Loading() { return <div className="mx-auto grid min-h-72 max-w-5xl place-items-center rounded-lg border border-matica-line bg-white"><Loader2 className="h-7 w-7 animate-spin text-matica-green" /></div>; }
