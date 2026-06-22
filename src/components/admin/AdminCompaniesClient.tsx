"use client";

import { AlertCircle, Loader2, Save } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { AdminGate } from "./AdminGate";
import type { AdminCompany, CompanyDraft } from "@/lib/types";

export function AdminCompaniesClient() {
  return (
    <AdminGate title="Empresas" subtitle="Activa empresas, slugs, ventanas operativas y subvenciones.">
      {(pin, clearPin) => <CompaniesEditor pin={pin} clearPin={clearPin} />}
    </AdminGate>
  );
}

function getDraft(company: AdminCompany): CompanyDraft {
  const dailyRule = company.subsidy_rules?.find((rule) => rule.product_type === "daily_menu");
  const halfRule = company.subsidy_rules?.find((rule) => rule.product_type === "half_menu");

  return {
    id: company.id,
    name: company.name,
    slug: company.slug,
    active: company.active,
    order_window: company.order_window ?? "lunes a viernes de 09:30 a 12:40",
    delivery_window: company.delivery_window ?? "13:00 a 13:30",
    daily_menu_subsidy: Number(dailyRule?.subsidy_amount ?? 0),
    half_menu_subsidy: Number(halfRule?.subsidy_amount ?? 0),
    allow_pay_on_delivery: company.allow_pay_on_delivery ?? false,
    allow_card_payment: company.allow_card_payment ?? true,
    allow_bizum_payment: company.allow_bizum_payment ?? false,
    billing_type: company.billing_type ?? "employee"
  };
}

function CompaniesEditor({ pin, clearPin }: { pin: string; clearPin: () => void }) {
  const [companies, setCompanies] = useState<AdminCompany[]>([]);
  const [drafts, setDrafts] = useState<Record<string, CompanyDraft>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [error, setError] = useState("");

  const loadCompanies = useCallback(async () => {
    setLoading(true);
    const response = await fetch("/api/admin/companies", {
      headers: { "x-admin-pin": pin }
    });
    const payload = await response.json();

    if (response.status === 401) {
      clearPin();
      return;
    }

    if (!response.ok) {
      setError(payload.error ?? "No se pudieron cargar las empresas.");
      setLoading(false);
      return;
    }

    const nextCompanies = (payload.companies ?? []) as AdminCompany[];
    setCompanies(nextCompanies);
    setDrafts(Object.fromEntries(nextCompanies.map((company) => [company.id, getDraft(company)])));
    setError("");
    setLoading(false);
  }, [clearPin, pin]);

  useEffect(() => {
    loadCompanies();
  }, [loadCompanies]);

  function updateDraft(companyId: string, field: keyof CompanyDraft, value: string | number | boolean | null) {
    setDrafts((current) => ({
      ...current,
      [companyId]: {
        ...current[companyId],
        [field]: value
      }
    }));
  }

  async function saveCompany(companyId: string) {
    const draft = drafts[companyId];
    setSavingId(companyId);
    setError("");

    const response = await fetch("/api/admin/companies", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-admin-pin": pin
      },
      body: JSON.stringify(draft)
    });
    const payload = await response.json();
    setSavingId("");

    if (!response.ok) {
      setError(payload.error ?? "No se pudo guardar la empresa.");
      return;
    }

    setCompanies((current) => current.map((company) => (company.id === companyId ? payload.company : company)));
    setDrafts((current) => ({ ...current, [companyId]: getDraft(payload.company as AdminCompany) }));
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 lg:px-8">
      {error ? (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
          <AlertCircle className="mt-0.5 h-5 w-5" />
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="grid min-h-72 place-items-center rounded-lg border border-matica-line bg-white">
          <Loader2 className="h-7 w-7 animate-spin text-matica-green" />
        </div>
      ) : (
        <div className="space-y-3">
          {companies.map((company) => {
            const draft = drafts[company.id];

            if (!draft) {
              return null;
            }

            return (
              <article key={company.id} className="rounded-lg border border-matica-line bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <h2 className="text-xl font-black">{company.name}</h2>
                    <p className="mt-1 text-sm font-semibold text-matica-ink/55">/{company.slug}</p>
                  </div>
                  <label className="flex min-h-11 items-center gap-2 rounded-lg border border-matica-line px-3 font-bold">
                    <input
                      type="checkbox"
                      checked={draft.active}
                      onChange={(event) => updateDraft(company.id, "active", event.target.checked)}
                    />
                    Activa
                  </label>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <Input label="Nombre" value={draft.name} onChange={(value) => updateDraft(company.id, "name", value)} />
                  <Input label="Slug" value={draft.slug} onChange={(value) => updateDraft(company.id, "slug", value)} />
                  <Input label="Horario pedido" value={draft.order_window ?? ""} onChange={(value) => updateDraft(company.id, "order_window", value)} />
                  <Input label="Horario entrega" value={draft.delivery_window ?? ""} onChange={(value) => updateDraft(company.id, "delivery_window", value)} />
                  <Input
                    label="Subvención menú"
                    type="number"
                    value={draft.daily_menu_subsidy}
                    onChange={(value) => updateDraft(company.id, "daily_menu_subsidy", Number(value))}
                  />
                  <Input
                    label="Subvención medio menú"
                    type="number"
                    value={draft.half_menu_subsidy}
                    onChange={(value) => updateDraft(company.id, "half_menu_subsidy", Number(value))}
                  />
                  <label className="space-y-1">
                    <span className="text-sm font-bold text-matica-ink/70">Tipo de facturación</span>
                    <select
                      className="matica-focus w-full rounded-lg border border-matica-line bg-white px-3 py-3 font-bold"
                      value={draft.billing_type}
                      onChange={(event) => updateDraft(company.id, "billing_type", event.target.value)}
                    >
                      <option value="employee">Paga empleado</option>
                      <option value="subsidized">Subvención empresa</option>
                      <option value="company">Paga empresa (100%)</option>
                    </select>
                  </label>
                </div>

                <div className="mt-4 rounded-lg border border-matica-line bg-matica-soft p-3">
                  <h3 className="text-sm font-black uppercase text-matica-ink/45">Metodos de pago</h3>
                  <div className="mt-3 grid gap-2 md:grid-cols-3">
                    <Toggle
                      label="Pago a la entrega interno"
                      checked={draft.allow_pay_on_delivery}
                      onChange={(value) => updateDraft(company.id, "allow_pay_on_delivery", value)}
                    />
                    <Toggle
                      label="Stripe / tarjeta"
                      checked={draft.allow_card_payment}
                      onChange={(value) => updateDraft(company.id, "allow_card_payment", value)}
                    />
                    <Toggle
                      label="Bizum por Stripe"
                      checked={draft.allow_bizum_payment}
                      onChange={(value) => updateDraft(company.id, "allow_bizum_payment", value)}
                    />
                  </div>
                  <p className="mt-2 text-xs font-bold text-matica-ink/50">
                    La forma de pago visible en la carta depende de esta configuración. Las nuevas empresas quedan preparadas para Stripe sin subvención.
                  </p>
                </div>

                <button
                  className="matica-focus mt-4 flex min-h-12 items-center justify-center gap-2 rounded-lg bg-matica-green px-4 font-black text-white disabled:cursor-wait disabled:bg-matica-ink/30"
                  disabled={savingId === company.id}
                  onClick={() => saveCompany(company.id)}
                >
                  {savingId === company.id ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
                  Guardar empresa
                </button>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Toggle({ checked, label, onChange }: { checked: boolean; label: string; onChange: (value: boolean) => void }) {
  return (
    <label className="flex min-h-11 items-center gap-2 rounded-lg border border-matica-line bg-white px-3 text-sm font-black">
      <input
        className="h-4 w-4 accent-matica-green"
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text"
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="space-y-1">
      <span className="text-sm font-bold text-matica-ink/70">{label}</span>
      <input
        className="matica-focus w-full rounded-lg border border-matica-line px-3 py-3"
        type={type}
        min={type === "number" ? 0 : undefined}
        step={type === "number" ? "0.01" : undefined}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
