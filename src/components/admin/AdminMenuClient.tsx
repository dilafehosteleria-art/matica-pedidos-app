"use client";

import { AlertCircle, Loader2, Save } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { AdminGate } from "./AdminGate";
import { arrayToLines, linesToArray, toDateInputValue } from "@/lib/format";
import type { DailyMenu, DailyMenuCourse } from "@/lib/types";

type MenuForm = {
  date: string;
  first_courses: string[];
  second_courses: string[];
  excluded_second_course_index: number | null;
  drinks: string;
  desserts: string;
  active: boolean;
};

const COURSE_FIELD_COUNT = 4;

function courseName(course: DailyMenuCourse) {
  return typeof course === "string" ? course.trim() : course.name.trim();
}

function isExcludedSecondCourse(course: DailyMenuCourse) {
  return typeof course === "string"
    ? false
    : Boolean(course.excluded_from_half_menu) || course.category?.trim().toLowerCase() === "vacuno";
}

function courseFields(courses: string[], count = COURSE_FIELD_COUNT) {
  return Array.from({ length: count }, (_value, index) => courses[index] ?? "");
}

function cleanCourseFields(courses: string[]) {
  return courses.map((course) => course.trim());
}

function encodeSecondCourses(names: string[], excludedIndex: number | null): DailyMenuCourse[] {
  return names.map((name, index) => ({
    name,
    category: excludedIndex === index ? "vacuno" : null,
    excluded_from_half_menu: excludedIndex === index
  }));
}

export function AdminMenuClient() {
  return (
    <AdminGate title="Menú del día" subtitle="Edita los platos que verán las empresas en la app pública.">
      {(pin, clearPin) => <MenuEditor pin={pin} clearPin={clearPin} />}
    </AdminGate>
  );
}

function MenuEditor({ pin, clearPin }: { pin: string; clearPin: () => void }) {
  const [form, setForm] = useState<MenuForm>({
    date: toDateInputValue(),
    first_courses: courseFields([]),
    second_courses: courseFields([]),
    excluded_second_course_index: null,
    drinks: "",
    desserts: "",
    active: true
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [editingFixedOptions, setEditingFixedOptions] = useState(false);

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
    const excludedSecondCourseIndex = secondCourses.findIndex(isExcludedSecondCourse);

    setForm({
      date: menu.date,
      first_courses: courseFields(menu.first_courses ?? []),
      second_courses: courseFields(secondCourses.map(courseName)),
      excluded_second_course_index: excludedSecondCourseIndex >= 0 ? excludedSecondCourseIndex : null,
      drinks: arrayToLines(menu.drinks),
      desserts: arrayToLines(menu.desserts),
      active: menu.active
    });
    setError("");
    setMessage("");
    setEditingFixedOptions(false);
    setLoading(false);
  }, [clearPin, form.date, pin]);

  useEffect(() => {
    loadMenu();
  }, [loadMenu]);

  async function saveMenu() {
    setSaving(true);
    setMessage("");
    setError("");

    const firstCourses = cleanCourseFields(form.first_courses);
    const secondCourses = cleanCourseFields(form.second_courses);

    if (firstCourses.some((course) => !course) || secondCourses.some((course) => !course)) {
      setSaving(false);
      setError("Completa los 4 primeros platos y los 4 segundos platos.");
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
        second_courses: encodeSecondCourses(secondCourses, form.excluded_second_course_index),
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

    const menu = payload.menu as DailyMenu;
    const savedSecondCourses = menu.second_courses ?? [];
    const excludedSecondCourseIndex = savedSecondCourses.findIndex(isExcludedSecondCourse);

    setForm({
      date: menu.date,
      first_courses: courseFields(menu.first_courses ?? []),
      second_courses: courseFields(savedSecondCourses.map(courseName)),
      excluded_second_course_index: excludedSecondCourseIndex >= 0 ? excludedSecondCourseIndex : null,
      drinks: arrayToLines(menu.drinks),
      desserts: arrayToLines(menu.desserts),
      active: menu.active
    });
    setEditingFixedOptions(false);
    setMessage("Menú guardado. Los cambios ya están disponibles en la app pública para esta fecha.");
  }

  function update(field: keyof Pick<MenuForm, "date" | "active" | "excluded_second_course_index">, value: string | boolean | number | null) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function updateCourse(type: "first_courses" | "second_courses", index: number, value: string) {
    setForm((current) => ({
      ...current,
      [type]: current[type].map((course, courseIndex) => (courseIndex === index ? value : course))
    }));
  }

  const firstCoursesComplete = cleanCourseFields(form.first_courses).filter(Boolean).length;
  const secondCoursesComplete = cleanCourseFields(form.second_courses).filter(Boolean).length;

  return (
    <div className="mx-auto max-w-5xl px-4 py-5 sm:px-6 lg:px-8">
      <div className="rounded-lg border border-matica-line bg-white p-4 shadow-soft sm:p-5">
        <div className="grid gap-4">
          <label className="space-y-1">
            <span className="text-sm font-bold text-matica-ink/70">Fecha</span>
            <input
              className="matica-focus min-h-11 w-full rounded-lg border border-matica-line px-3 font-bold sm:max-w-xs"
              type="date"
              value={form.date}
              onChange={(event) => update("date", event.target.value)}
            />
          </label>

          <label className="flex min-h-11 w-full items-center gap-2 rounded-lg border border-matica-line px-3 font-bold sm:w-max">
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
            <section className="mt-6 space-y-3">
              <SectionHeader
                title="Primeros platos"
                description="Edita los 4 primeros que verá el cliente en Menú del día y Medio menú."
                meta={`${firstCoursesComplete}/4 completos`}
              />
              <div className="grid gap-3 md:grid-cols-2">
                {form.first_courses.map((course, index) => (
                  <CourseField
                    key={`first-${index}`}
                    label={`Primer plato ${index + 1}`}
                    value={course}
                    onChange={(value) => updateCourse("first_courses", index, value)}
                  />
                ))}
              </div>
            </section>

            <section className="mt-7 space-y-3">
              <SectionHeader
                title="Segundos platos"
                description="Edita los 4 segundos. Después marca cuál no entra en medio menú."
                meta={`${secondCoursesComplete}/4 completos`}
              />
              <div className="grid gap-3 md:grid-cols-2">
                {form.second_courses.map((course, index) => (
                  <CourseField
                    key={`second-${index}`}
                    label={`Segundo plato ${index + 1}`}
                    value={course}
                    onChange={(value) => updateCourse("second_courses", index, value)}
                  />
                ))}
              </div>
            </section>

            <section className="mt-7 rounded-lg border border-matica-line bg-matica-soft p-4">
              <SectionHeader
                title="Marcar segundo excluido de medio menú"
                description="Selecciona el segundo de vacuno o el plato que no debe aparecer como plato único en Medio menú."
              />
              <div className="mt-3 grid gap-2">
                <label className="flex items-center gap-3 rounded-lg border border-matica-line bg-white px-3 py-3 text-sm font-bold text-matica-ink">
                  <input
                    type="radio"
                    name="excluded-second-course"
                    checked={form.excluded_second_course_index === null}
                    onChange={() => update("excluded_second_course_index", null)}
                  />
                  Ninguno
                </label>
                {form.second_courses.map((course, index) => {
                  const trimmedCourse = course.trim();

                  return (
                    <label
                      key={`excluded-${index}`}
                      className="flex items-start gap-3 rounded-lg border border-matica-line bg-white px-3 py-3 text-sm font-bold text-matica-ink"
                    >
                      <input
                        className="mt-1"
                        type="radio"
                        name="excluded-second-course"
                        checked={form.excluded_second_course_index === index}
                        disabled={!trimmedCourse}
                        onChange={() => update("excluded_second_course_index", index)}
                      />
                      <span>
                        <span className="block">{trimmedCourse || `Segundo plato ${index + 1}`}</span>
                        <span className="block text-xs font-semibold text-matica-ink/55">
                          Este segundo no entra en medio menú
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </section>

            <section className="mt-7 space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <SectionHeader
                  title="Bebidas fijas"
                  description="Estas opciones se mantienen cada día y no hace falta editarlas para cambiar el menú."
                />
                <button
                  className="matica-focus min-h-10 rounded-lg border border-matica-line bg-white px-4 text-sm font-black text-matica-ink hover:border-matica-green hover:text-matica-green"
                  type="button"
                  onClick={() => setEditingFixedOptions((current) => !current)}
                >
                  {editingFixedOptions ? "Ocultar edición" : "Editar bebidas/postres"}
                </button>
              </div>
              <FixedOptionsBlock
                title="Bebidas fijas"
                value={form.drinks}
                editing={editingFixedOptions}
                onChange={(value) => setForm((current) => ({ ...current, drinks: value }))}
              />
            </section>

            <section className="mt-5 space-y-3">
              <SectionHeader
                title="Postres fijos"
                description="Se muestran como opciones incluidas junto a las bebidas."
              />
              <FixedOptionsBlock
                title="Postres fijos"
                value={form.desserts}
                editing={editingFixedOptions}
                onChange={(value) => setForm((current) => ({ ...current, desserts: value }))}
              />
            </section>

            {error ? (
              <div className="mt-5 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                {error}
              </div>
            ) : null}
            {message ? (
              <div className="mt-5 rounded-lg border border-matica-green bg-matica-mint p-3 text-sm font-bold text-matica-green">
                {message}
              </div>
            ) : null}

            <button
              className="matica-focus mt-6 flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-matica-green px-4 font-black text-white disabled:cursor-wait disabled:bg-matica-ink/30 sm:w-auto"
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

function SectionHeader({
  title,
  description,
  meta
}: {
  title: string;
  description?: string;
  meta?: string;
}) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h2 className="text-xl font-black text-matica-ink">{title}</h2>
        {description ? <p className="mt-1 text-sm font-semibold leading-5 text-matica-ink/58">{description}</p> : null}
      </div>
      {meta ? <p className="text-sm font-black text-matica-green">{meta}</p> : null}
    </div>
  );
}

function CourseField({
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
      <input
        className="matica-focus min-h-11 w-full rounded-lg border border-matica-line bg-white px-3 font-semibold"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={label}
      />
    </label>
  );
}

function FixedOptionsBlock({
  title,
  value,
  editing,
  onChange
}: {
  title: string;
  value: string;
  editing: boolean;
  onChange: (value: string) => void;
}) {
  const options = linesToArray(value);

  return (
    <div className="rounded-lg border border-matica-line bg-white p-3">
      <div className="flex flex-wrap gap-2">
        {options.length ? (
          options.map((option) => (
            <span key={option} className="rounded-full bg-matica-mint px-3 py-1 text-sm font-black text-matica-green">
              {option}
            </span>
          ))
        ) : (
          <p className="text-sm font-semibold text-matica-ink/55">No hay opciones guardadas.</p>
        )}
      </div>

      {editing ? (
        <label className="mt-3 block space-y-1">
          <span className="text-sm font-bold text-matica-ink/70">{title}</span>
          <textarea
            className="matica-focus min-h-32 w-full rounded-lg border border-matica-line px-3 py-3"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="Un elemento por línea"
          />
        </label>
      ) : null}
    </div>
  );
}
