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
      <section className="mx-auto grid min-h-screen max-w-6xl items-center gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_420px] lg:px-8">
        <div>
          <div className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-black text-matica-green shadow-sm">
            <Leaf className="h-5 w-5" />
            Matica Fresh Food
          </div>
          <h1 className="mt-5 max-w-2xl text-4xl font-black tracking-normal sm:text-5xl">
            Pedidos corporativos frescos, simples y listos a mediodía.
          </h1>
          <p className="mt-4 max-w-xl text-lg font-semibold leading-7 text-matica-ink/68">
            Pedidos de lunes a jueves de 09:30 a 12:30. Entregas entre 13:00 y 13:30.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-matica-line bg-white p-4">
              <p className="text-xs font-black uppercase text-matica-ink/45">Pedido</p>
              <p className="mt-1 font-black text-matica-green">09:30 a 12:30</p>
            </div>
            <div className="rounded-lg border border-matica-line bg-white p-4">
              <p className="text-xs font-black uppercase text-matica-ink/45">Entrega</p>
              <p className="mt-1 font-black text-matica-green">13:00 a 13:30</p>
            </div>
          </div>
        </div>

        <form className="rounded-lg border border-matica-line bg-white p-5 shadow-soft" onSubmit={submit}>
          <div className="grid h-12 w-12 place-items-center rounded-lg bg-matica-mint text-matica-green">
            <ShoppingBag className="h-6 w-6" />
          </div>
          <h2 className="mt-4 text-2xl font-black">Empieza tu pedido</h2>
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
            className="matica-focus mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-matica-line bg-white px-4 text-sm font-black text-matica-ink hover:border-matica-green hover:text-matica-green"
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
