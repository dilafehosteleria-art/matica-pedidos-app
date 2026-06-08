"use client";

import { Building2, Leaf, Mail, MessageCircle, Phone, ShoppingBag, Sparkles, Utensils } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { formatCurrency } from "@/lib/format";
import { resolvePublicProductImageUrl } from "@/lib/public-product-images";
import type { Product, PublicCompany } from "@/lib/types";

type LandingProduct = Pick<Product, "id" | "name" | "description" | "base_price" | "image_url">;

const WHATSAPP_URL = "https://wa.me/34674323152";
const EMAIL_URL = "mailto:pedidomatica@gmail.com?subject=Alta%20empresa%20Matica%20B2B";

export function CompanyLanding({
  companies,
  featuredProducts = []
}: {
  companies: PublicCompany[];
  featuredProducts?: LandingProduct[];
}) {
  const router = useRouter();
  const activeCompanies = useMemo(() => companies.filter((company) => company.active), [companies]);
  const [companySlug, setCompanySlug] = useState(activeCompanies[0]?.slug ?? "");
  const previewProducts = featuredProducts.slice(0, 4);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (companySlug) {
      router.push(`/empresa/${companySlug}`);
    }
  }

  return (
    <main className="min-h-screen bg-matica-soft text-matica-ink">
      <section className="relative overflow-hidden border-b border-matica-line bg-white">
        <div className="absolute inset-x-0 top-0 h-56 bg-matica-mint/70" aria-hidden="true" />
        <div className="relative mx-auto grid min-h-[720px] max-w-7xl content-start gap-7 px-4 py-6 sm:px-6 sm:py-10 lg:grid-cols-[minmax(0,1fr)_410px] lg:items-center lg:gap-10 lg:px-8">
          <div className="order-2 lg:order-1">
            <div className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-black text-matica-green shadow-sm">
              <Leaf className="h-5 w-5" />
              Matica Fresh Food para empresas
            </div>
            <h1 className="mt-4 max-w-3xl text-4xl font-black leading-[1.04] tracking-normal sm:text-6xl">
              Comida fresca para tu empresa, lista cada mediodía
            </h1>
            <div className="mt-4 max-w-2xl space-y-3 text-lg font-bold leading-8 text-matica-ink/72 sm:text-xl">
              <p>Nuestra app de comida para empresas y oficinas.</p>
              <p>Menú del día, buffet de ensaladas, bowls, wraps, bocadillos y mucho más.</p>
              <p>Preparado cada mañana y entregado directamente en tu empresa.</p>
            </div>

            <div className="mt-5 rounded-lg border border-matica-green/20 bg-matica-mint px-4 py-3 text-sm font-black leading-6 text-matica-green shadow-sm sm:text-base">
              Pedidos de lunes a viernes de 09:30 a 12:30 · Entrega en tu empresa de 13:00 a 13:30
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Link
                className="matica-focus inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-matica-green bg-white px-5 font-black text-matica-green shadow-sm transition hover:bg-matica-mint"
                href="/carta"
              >
                <Utensils className="h-5 w-5" />
                Ver nuestra carta
              </Link>
              <a
                className="matica-focus inline-flex min-h-12 items-center justify-center gap-2 rounded-lg px-5 font-black text-matica-ink/68 transition hover:text-matica-green"
                href={EMAIL_URL}
              >
                <Mail className="h-5 w-5" />
                Solicitar información
              </a>
            </div>

            <div className="mt-6 flex flex-wrap gap-2 text-sm font-black text-matica-ink/62">
              <span className="rounded-full bg-white px-3 py-2 shadow-sm">Menú del día</span>
              <span className="rounded-full bg-white px-3 py-2 shadow-sm">Bowls y ensaladas</span>
              <span className="rounded-full bg-white px-3 py-2 shadow-sm">Entrega en tu empresa</span>
            </div>

            {previewProducts.length ? (
              <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {previewProducts.map((product, index) => (
                  <ProductPreview key={product.id} eagerImage={index === 0} product={product} />
                ))}
              </div>
            ) : (
              <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {["Menús", "Bowls", "Wraps", "Ensaladas"].map((label) => (
                  <div key={label} className="grid aspect-[4/3] place-items-center rounded-lg bg-matica-mint text-sm font-black text-matica-green shadow-sm">
                    {label}
                  </div>
                ))}
              </div>
            )}
          </div>

          <form className="order-1 rounded-lg border border-matica-line bg-white p-4 shadow-soft sm:p-5 lg:order-2" onSubmit={submit}>
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

          </form>
        </div>
      </section>

      <section className="bg-matica-soft px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-6 rounded-lg border border-matica-line bg-white p-5 shadow-sm sm:p-7 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-lg bg-matica-mint px-3 py-1 text-sm font-black text-matica-green">
                <Sparkles className="h-4 w-4" />
                Servicio B2B
              </div>
              <h2 className="mt-4 text-3xl font-black leading-tight sm:text-4xl">
                ¿Quieres ofrecer este servicio en tu empresa?
              </h2>
              <p className="mt-3 max-w-3xl text-base font-semibold leading-7 text-matica-ink/65 sm:text-lg">
                Contacta con nosotros y activaremos tu empresa para que tus empleados puedan realizar sus pedidos de comida diaria de forma rápida y cómoda.
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2 rounded-lg bg-matica-soft p-4 text-sm font-bold text-matica-ink/70">
                <p className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-matica-green" />
                  911 54 87 72
                </p>
                <p className="flex items-center gap-2">
                  <MessageCircle className="h-4 w-4 text-matica-green" />
                  674 32 31 52
                </p>
                <p className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-matica-green" />
                  pedidomatica@gmail.com
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                <a
                  className="matica-focus inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-matica-green px-4 font-black text-white"
                  href={WHATSAPP_URL}
                  rel="noreferrer"
                  target="_blank"
                >
                  <MessageCircle className="h-5 w-5" />
                  Contactar por WhatsApp
                </a>
                <a
                  className="matica-focus inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-matica-line bg-white px-4 font-black text-matica-ink hover:border-matica-green hover:text-matica-green"
                  href={EMAIL_URL}
                >
                  <Mail className="h-5 w-5" />
                  Enviar email
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function ProductPreview({ product, eagerImage = false }: { product: LandingProduct; eagerImage?: boolean }) {
  const imageUrl = resolvePublicProductImageUrl(product);

  return (
    <article className="overflow-hidden rounded-lg border border-white/70 bg-white shadow-sm">
      <div className="aspect-[4/3] bg-matica-soft">
        {imageUrl ? (
          <img
            className="h-full w-full object-cover object-center"
            src={imageUrl}
            alt={product.name}
            decoding="async"
            fetchPriority={eagerImage ? "high" : "auto"}
            loading={eagerImage ? "eager" : "lazy"}
            sizes="(max-width: 640px) 50vw, 25vw"
          />
        ) : (
          <div className="grid h-full place-items-center bg-gradient-to-br from-matica-mint via-white to-matica-soft text-matica-green">
            <Utensils className="h-7 w-7" />
          </div>
        )}
      </div>
      <div className="p-3">
        <h3 className="line-clamp-2 text-sm font-black leading-4">{product.name}</h3>
        <p className="mt-1 text-sm font-black text-matica-green">{formatCurrency(Number(product.base_price))}</p>
      </div>
    </article>
  );
}
