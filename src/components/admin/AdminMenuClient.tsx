"use client";

import { AlertCircle, Loader2, Save } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { AdminGate } from "./AdminGate";
import { arrayToLines, linesToArray, toDateInputValue } from "@/lib/format";
import type { DailyMenu } from "@/lib/types";

type MenuForm = {
  date: string;
  first_courses: string;
  second_courses: string;
  drinks: string;
  desserts: string;
  active: boolean;
};

export function AdminMenuClient() {
  return (
    <AdminGate title="Menú del día" subtitle="Primeros, segundos, bebidas y postres para la carta pública.">
      {(pin, clearPin) => <MenuEditor pin={pin} clearPin={clearPin} />}
    </AdminGate>
  );
}

function MenuEditor({ pin, clearPin }: { pin: string; clearPin: () => void }) {
  const [form, setForm] = useState<MenuForm>({
    date: toDateInputValue(),
    first_courses: "",
    second_courses: "",
    drinks: "",
    desserts: "",
    active: true
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadMenu = useCallback(async () => {
    setLoading(true);
    const response = await fetch(`/api/admin/menu?date=${form.date}`, {
      headers: { "x-admin-pin": pin }
    });
    const payload = await response.json();

    if (response.status === 401) {
      clearPin();
      return;
    }

    if (!response.ok) {
      setError(payload.error ?? "No se pudo cargar el menú.");
      setLoading(false);
      return;
    }

    const menu = payload.menu as DailyMenu;
    setForm({
      date: menu.date,
      first_courses: arrayToLines(menu.first_courses),
      second_courses: arrayToLines(menu.second_courses),
      drinks: arrayToLines(menu.drinks),
      desserts: arrayToLines(menu.desserts),
      active: menu.active
    });
    setError("");
    setLoading(false);
  }, [clearPin, form.date, pin]);

  useEffect(() => {
    loadMenu();
  }, [loadMenu]);

  async function saveMenu() {
    setSaving(true);
    setMessage("");
    setError("");

    const response = await fetch("/api/admin/menu", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-admin-pin": pin
      },
      body: JSON.stringify({
        date: form.date,
        first_courses: linesToArray(form.first_courses),
        second_courses: linesToArray(form.second_courses),
        drinks: linesToArray(form.drinks),
        desserts: linesToArray(form.desserts),
        active: form.active
      })
    });
    const payload = await response.json();
    setSaving(false);

    if (!response.ok) {
      setError(payload.error ?? "No se pudo guardar el menú.");
      return;
    }

    setMessage("Menú guardado.");
  }

  function update(field: keyof MenuForm, value: string | boolean) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-5 sm:px-6 lg:px-8">
      <div className="rounded-lg border border-matica-line bg-white p-4 shadow-soft">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <label className="space-y-1">
            <span className="text-sm font-bold text-matica-ink/70">Fecha</span>
            <input
              className="matica-focus min-h-11 rounded-lg border border-matica-line px-3"
              type="date"
              value={form.date}
              onChange={(event) => update("date", event.target.value)}
            />
          </label>
          <label className="flex min-h-11 items-center gap-2 rounded-lg border border-matica-line px-3 font-bold">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(event) => update("active", event.target.checked)}
            />
            Activo
          </label>
        </div>

        {loading ? (
          <div className="grid min-h-72 place-items-center">
            <Loader2 className="h-7 w-7 animate-spin text-matica-green" />
          </div>
        ) : (
          <>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <TextAreaBlock label="Primeros" value={form.first_courses} onChange={(value) => update("first_courses", value)} />
              <TextAreaBlock label="Segundos" value={form.second_courses} onChange={(value) => update("second_courses", value)} />
              <TextAreaBlock label="Bebidas" value={form.drinks} onChange={(value) => update("drinks", value)} />
              <TextAreaBlock label="Postres" value={form.desserts} onChange={(value) => update("desserts", value)} />
            </div>

            {error ? (
              <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">
                <AlertCircle className="mt-0.5 h-5 w-5" />
                {error}
              </div>
            ) : null}
            {message ? (
              <div className="mt-4 rounded-lg border border-matica-green bg-matica-mint p-3 text-sm font-bold text-matica-green">
                {message}
              </div>
            ) : null}

            <button
              className="matica-focus mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-matica-green px-4 font-black text-white disabled:cursor-wait disabled:bg-matica-ink/30 sm:w-auto"
              disabled={saving}
              onClick={saveMenu}
            >
              {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
              Guardar menú
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function TextAreaBlock({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1">
      <span className="text-sm font-bold text-matica-ink/70">{label}</span>
      <textarea
        className="matica-focus min-h-52 w-full rounded-lg border border-matica-line px-3 py-3"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Un elemento por línea"
      />
    </label>
  );
}
