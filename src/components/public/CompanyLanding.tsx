"use client";

import { Building2, Leaf, Mail, ShoppingBag } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import type { PublicCompany } from "@/lib/types";

export function CompanyLanding({ companies }: { companies: PublicCompany[] }) {
  const router = useRouter();
  const activeCompanies = useMemo(() => companies.filter((company) => company.active), [companies]);
  const [companySlug, setCompanySlug] = useState(activeCompanies[0]?.slug ?? "");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (companySlug) {
      router.push(`/empresa/${companySlug}`);
    }
  }

  return (
    <main className="min-h-screen bg-matica-soft text-matica-ink">
      <section className="mx-auto grid min-h-screen max-w-6xl content-start gap-6 px-4 py-6 sm:px-6 sm:py-10 lg:grid-cols-[minmax(0,1fr)_400px] lg:items-center lg:gap-10 lg:px-8">
        <div>
          <div className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-black text-matica-green shadow-sm">
            <Leaf className="h-5 w-5" />
            Matica Fresh Food
          </div>
          <h1 className="mt-4 max-w-2xl text-3xl font-black leading-tight tracking-normal sm:text-5xl">
            Pedidos corporativos frescos, simples y listos a mediodía.
          </h1>
          <p className="mt-3 max-w-xl text-base font-semibold leading-7 text-matica-ink/68 sm:text-lg">
            Pedidos de lunes a jueves de 09:30 a 12:30. Entregas entre 13:00 y 13:30.
          </p>
        </div>

        <form className="rounded-lg border border-matica-line bg-white p-4 shadow-soft sm:p-5" onSubmit={submit}>
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-matica-mint text-matica-green sm:h-12 sm:w-12">
            <ShoppingBag className="h-5 w-5 sm:h-6 sm:w-6" />
          </div>
          <h2 className="mt-3 text-xl font-black sm:text-2xl">Empieza tu pedido</h2>
          <p className="mt-1 text-sm font-semibold text-matica-ink/60">
            Selecciona tu empresa para ver la carta disponible.
          </p>

          <label className="mt-5 block space-y-1">
            <span className="text-sm font-bold text-matica-ink/70">Empresa</span>
            <select
              className="matica-focus w-full rounded-lg border border-matica-line bg-white px-3 py-3 font-bold"
              value={companySlug}
              onChange={(event) => setCompanySlug(event.target.value)}
              disabled={!activeCompanies.length}
            >
              {activeCompanies.map((company) => (
                <option key={company.id} value={company.slug}>
                  {company.name}
                </option>
              ))}
            </select>
          </label>

          <button
            className="matica-focus mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-matica-green px-4 font-black text-white disabled:cursor-not-allowed disabled:bg-matica-ink/30"
            disabled={!companySlug}
            type="submit"
          >
            <Building2 className="h-5 w-5" />
            Empezar pedido
          </button>

          <a
            className="matica-focus mt-3 flex min-h-9 w-full items-center justify-center gap-2 rounded-lg px-4 text-sm font-bold text-matica-ink/60 hover:text-matica-green"
            href="mailto:hola@matica.es?subject=Alta%20empresa%20Matica%20B2B"
          >
            <Mail className="h-4 w-4" />
            Da de alta tu empresa
          </a>
        </form>
      </section>
    </main>
  );
}
