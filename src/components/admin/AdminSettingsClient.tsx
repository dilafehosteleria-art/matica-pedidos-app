"use client";

import { AlertCircle, CheckCircle2, Clock3, Loader2, Save } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { AdminGate } from "./AdminGate";
import { DEFAULT_GLOBAL_SCHEDULE, deliveryWindowLabel, orderWindowLabel } from "@/lib/schedule";
import type { GlobalSchedule } from "@/lib/types";

const DAYS = [
  { value: 1, label: "Lunes" },
  { value: 2, label: "Martes" },
  { value: 3, label: "Miércoles" },
  { value: 4, label: "Jueves" },
  { value: 5, label: "Viernes" },
  { value: 6, label: "Sábado" },
  { value: 7, label: "Domingo" }
];

export function AdminSettingsClient() {
  return (
    <AdminGate title="Configuración" subtitle="Gestiona el horario global de pedidos y entrega.">
      {(pin, clearPin) => <SettingsEditor pin={pin} clearPin={clearPin} />}
    </AdminGate>
  );
}

function SettingsEditor({ pin, clearPin }: { pin: string; clearPin: () => void }) {
  const [schedule, setSchedule] = useState<GlobalSchedule>(DEFAULT_GLOBAL_SCHEDULE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadSettings = useCallback(async () => {
    setLoading(true);
    const response = await fetch("/api/admin/settings", { headers: { "x-admin-pin": pin } });
    const payload = await response.json();

    if (response.status === 401) {
      clearPin();
      return;
    }

    if (!response.ok) {
      setError(payload.error ?? "No se pudo cargar la configuración.");
    } else {
      setSchedule(payload.schedule as GlobalSchedule);
      setError("");
    }

    setLoading(false);
  }, [clearPin, pin]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  function update<K extends keyof GlobalSchedule>(field: K, value: GlobalSchedule[K]) {
    setSchedule((current) => ({ ...current, [field]: value }));
    setSuccess("");
  }

  function toggleDay(day: number) {
    const activeDays = schedule.active_days.includes(day)
      ? schedule.active_days.filter((candidate) => candidate !== day)
      : [...schedule.active_days, day].sort();

    update("active_days", activeDays);
  }

  async function save() {
    setSaving(true);
    setError("");
    setSuccess("");
    const response = await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-admin-pin": pin
      },
      body: JSON.stringify(schedule)
    });
    const payload = await response.json();
    setSaving(false);

    if (!response.ok) {
      setError(payload.error ?? "No se pudo guardar la configuración.");
      return;
    }

    setSchedule(payload.schedule as GlobalSchedule);
    setSuccess("Horario global actualizado.");
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-5 sm:px-6 lg:px-8">
      {error ? <Notice tone="error" text={error} /> : null}
      {success ? <Notice tone="success" text={success} /> : null}

      {loading ? (
        <div className="grid min-h-72 place-items-center rounded-lg border border-matica-line bg-white">
          <Loader2 className="h-7 w-7 animate-spin text-matica-green" />
        </div>
      ) : (
        <section className="rounded-lg border border-matica-line bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-matica-green">
                <Clock3 className="h-5 w-5" />
                <h2 className="text-xl font-black">Horario de pedidos</h2>
              </div>
              <p className="mt-2 text-sm font-semibold text-matica-ink/60">
                Se aplica a todas las empresas tanto en frontend como al confirmar el pedido.
              </p>
            </div>
            <label className="flex min-h-11 items-center gap-2 rounded-lg border border-matica-line px-3 font-black">
              <input
                type="checkbox"
                checked={schedule.active}
                onChange={(event) => update("active", event.target.checked)}
              />
              Pedidos activos
            </label>
          </div>

          <fieldset className="mt-5">
            <legend className="text-sm font-black text-matica-ink/70">Días activos</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-4">
              {DAYS.map((day) => (
                <label key={day.value} className="flex min-h-11 items-center gap-2 rounded-lg border border-matica-line px-3 font-bold">
                  <input
                    type="checkbox"
                    checked={schedule.active_days.includes(day.value)}
                    onChange={() => toggleDay(day.value)}
                  />
                  {day.label}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <TimeInput label="Apertura de pedidos" value={schedule.order_open_time} onChange={(value) => update("order_open_time", value)} />
            <TimeInput label="Cierre de pedidos" value={schedule.order_close_time} onChange={(value) => update("order_close_time", value)} />
            <TimeInput label="Inicio de entrega" value={schedule.delivery_start_time} onChange={(value) => update("delivery_start_time", value)} />
            <TimeInput label="Fin de entrega" value={schedule.delivery_end_time} onChange={(value) => update("delivery_end_time", value)} />
          </div>

          <div className="mt-5 rounded-lg bg-matica-soft p-4 text-sm font-bold text-matica-ink/70">
            <p>Pedidos: {orderWindowLabel(schedule)}</p>
            <p className="mt-1">Entrega: {deliveryWindowLabel(schedule)}</p>
          </div>

          <button
            className="matica-focus mt-5 flex min-h-12 items-center justify-center gap-2 rounded-lg bg-matica-green px-5 font-black text-white disabled:bg-matica-ink/30"
            disabled={saving}
            onClick={save}
            type="button"
          >
            {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
            Guardar configuración
          </button>
        </section>
      )}
    </div>
  );
}

function Notice({ tone, text }: { tone: "error" | "success"; text: string }) {
  const Icon = tone === "error" ? AlertCircle : CheckCircle2;

  return (
    <div className={`mb-4 flex gap-2 rounded-lg border p-4 text-sm font-bold ${
      tone === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-800"
    }`}>
      <Icon className="h-5 w-5 shrink-0" />
      {text}
    </div>
  );
}

function TimeInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="space-y-1">
      <span className="text-sm font-bold text-matica-ink/70">{label}</span>
      <input
        className="matica-focus w-full rounded-lg border border-matica-line px-3 py-3"
        type="time"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
