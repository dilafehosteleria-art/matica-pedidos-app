"use client";

import { AlertCircle, Loader2, Save } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { AdminGate } from "./AdminGate";
import { arrayToLines, linesToArray, toDateInputValue } from "@/lib/format";
import type { DailyMenu, DailyMenuCourse } from "@/lib/types";

type MenuForm = {
  date: string;
  first_courses: string;
  second_courses: string;
  excluded_second_courses: string[];
  drinks: string;
  desserts: string;
  active: boolean;
};

function courseName(course: DailyMenuCourse) {
  return typeof course === "string" ? course.trim() : course.name.trim();
}

function isExcludedSecondCourse(course: DailyMenuCourse) {
  return typeof course === "string"
    ? false
    : Boolean(course.excluded_from_half_menu) || course.category?.trim().toLowerCase() === "vacuno";
}

function encodeSecondCourses(names: string[], excludedNames: string[]): DailyMenuCourse[] {
  return names.map((name) => ({
    name,
    category: excludedNames.includes(name) ? "vacuno" : null,
    excluded_from_half_menu: excludedNames.includes(name)
  }));
}

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
    excluded_second_courses: [],
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
    const secondCourses = menu.second_courses ?? [];
    setForm({
      date: menu.date,
      first_courses: arrayToLines(menu.first_courses),
      second_courses: arrayToLines(secondCourses.map(courseName)),
      excluded_second_courses: secondCourses.filter(isExcludedSecondCourse).map(courseName),
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

    const firstCourses = linesToArray(form.first_courses);
    const secondCourses = linesToArray(form.second_courses);
    const excludedSecondCourses = form.excluded_second_courses.filter((name) => secondCourses.includes(name));

    if (firstCourses.length !== 4 || secondCourses.length !== 4) {
      setSaving(false);
      setError("Configura exactamente 4 primeros y 4 segundos.");
      return;
    }

    const response = await fetch("/api/admin/menu", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-admin-pin": pin
      },
      body: JSON.stringify({
        date: form.date,
        first_courses: firstCourses,
        second_courses: encodeSecondCourses(secondCourses, excludedSecondCourses),
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

  function toggleExcludedSecondCourse(name: string) {
    setForm((current) => {
      const secondCourses = linesToArray(current.second_courses);
      const currentExcluded = current.excluded_second_courses.filter((excludedName) => secondCourses.includes(excludedName));
      const excluded_second_courses = currentExcluded.includes(name)
        ? currentExcluded.filter((excludedName) => excludedName !== name)
        : [...currentExcluded, name];

      return { ...current, excluded_second_courses };
    });
  }

  const firstCourseCount = linesToArray(form.first_courses).length;
  const secondCourses = linesToArray(form.second_courses);
  const secondCourseCount = secondCourses.length;

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
              <TextAreaBlock
                label={`Primeros (${firstCourseCount}/4)`}
                value={form.first_courses}
                onChange={(value) => update("first_courses", value)}
              />
              <div className="space-y-3">
                <TextAreaBlock
                  label={`Segundos (${secondCourseCount}/4)`}
                  value={form.second_courses}
                  onChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      second_courses: value,
                      excluded_second_courses: current.excluded_second_courses.filter((name) => linesToArray(value).includes(name))
                    }))
                  }
                />
                <div className="rounded-lg border border-matica-line bg-matica-soft p-3">
                  <p className="text-sm font-black text-matica-ink">Vacuno / excluido de medio menú</p>
                  <div className="mt-2 space-y-2">
                    {secondCourses.length ? (
                      secondCourses.map((name) => (
                        <label key={name} className="flex items-start gap-2 text-sm font-bold text-matica-ink/75">
                          <input
                            className="mt-1"
                            type="checkbox"
                            checked={form.excluded_second_courses.includes(name)}
                            onChange={() => toggleExcludedSecondCourse(name)}
                          />
                          {name}
                        </label>
                      ))
                    ) : (
                      <p className="text-sm font-semibold text-matica-ink/55">Añade los segundos para marcar el vacuno.</p>
                    )}
                  </div>
                </div>
              </div>
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
