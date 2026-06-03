import { ArrowLeft, Leaf, Mail, MessageCircle, Sparkles, Utensils } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";
import { buildPublicCatalogSections, normalizeCatalogText } from "@/lib/catalog";
import { formatCurrency } from "@/lib/format";
import { getPublicCompanyData } from "@/lib/public-data";
import type { Product } from "@/lib/types";

export const metadata: Metadata = {
  title: "Carta Matica | Comida para empresas",
  description: "Carta pública de Matica Fresh Food para empresas: menús, bowls, wraps y ensaladas."
};

type CommercialProduct = Pick<Product, "id" | "name" | "description" | "base_price" | "image_url" | "product_type">;

type CommercialSection = {
  slug: string;
  title: string;
  description: string;
  products: CommercialProduct[];
};

const WHATSAPP_URL =
  "https://wa.me/34674323152?text=Hola,%20quiero%20informaci%C3%B3n%20sobre%20el%20servicio%20de%20pedidos%20para%20empresas";
const EMAIL_URL = "mailto:pedidomatica@gmail.com?subject=Alta%20empresa%20Matica%20B2B";

export default async function PublicMenuPage() {
  const data = await getPublicCompanyData("bureau-veritas");
  const publicSections = data ? buildPublicCatalogSections(data.categories, data.products) : [];
  const sections = buildCommercialSections(publicSections);

  return (
    <main className="min-h-screen bg-matica-soft text-matica-ink">
      <header className="border-b border-matica-line bg-white">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
          <Link className="matica-focus inline-flex items-center gap-2 text-sm font-black text-matica-green" href="/">
            <ArrowLeft className="h-4 w-4" />
            Volver
          </Link>
          <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-end">
            <div>
              <div className="inline-flex items-center gap-2 rounded-lg bg-matica-mint px-3 py-1 text-sm font-black text-matica-green">
                <Leaf className="h-4 w-4" />
                Carta pública
              </div>
              <h1 className="mt-4 max-w-4xl text-4xl font-black leading-[1.04] sm:text-6xl">
                Comida fresca para disfrutar en la oficina
              </h1>
              <p className="mt-4 max-w-2xl text-base font-semibold leading-7 text-matica-ink/65 sm:text-lg">
                Consulta la oferta de Matica para empresas. Esta página es informativa: no muestra subvenciones, precios especiales ni botones de compra.
              </p>
            </div>
            <div className="rounded-lg border border-matica-line bg-matica-soft p-4">
              <p className="text-sm font-black uppercase text-matica-green">Alta de empresa</p>
              <p className="mt-1 text-sm font-semibold leading-5 text-matica-ink/62">
                Si quieres activar pedidos online para tu equipo, contacta con Matica.
              </p>
              <div className="mt-3 grid gap-2">
                <a
                  className="matica-focus inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-matica-green px-4 text-sm font-black text-white"
                  href={WHATSAPP_URL}
                  rel="noreferrer"
                  target="_blank"
                >
                  <MessageCircle className="h-4 w-4" />
                  Contactar por WhatsApp
                </a>
                <a
                  className="matica-focus inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-matica-line bg-white px-4 text-sm font-black text-matica-ink hover:border-matica-green hover:text-matica-green"
                  href={EMAIL_URL}
                >
                  <Mail className="h-4 w-4" />
                  Enviar email
                </a>
              </div>
            </div>
          </div>

          <nav className="mt-6 overflow-x-auto pb-1" aria-label="Categorías de la carta">
            <div className="flex w-max gap-2">
              {sections.map((section) => (
                <a
                  key={section.slug}
                  className="matica-focus rounded-full border border-matica-line bg-white px-4 py-2 text-sm font-black text-matica-ink hover:border-matica-green hover:text-matica-green"
                  href={`#${section.slug}`}
                >
                  {section.title}
                </a>
              ))}
            </div>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        <div className="space-y-10 sm:space-y-12">
          {sections.map((section, index) => (
            <section
              key={section.slug}
              id={section.slug}
              className={`scroll-mt-6 space-y-4 ${index > 0 ? "border-t border-matica-line/70 pt-10" : ""}`}
            >
              <div>
                <h2 className="text-3xl font-black leading-tight sm:text-5xl">{section.title}</h2>
                <p className="mt-2 max-w-2xl text-base font-semibold leading-6 text-matica-ink/60 sm:text-lg">
                  {section.description}
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {section.products.map((product) => (
                  <PublicMenuCard key={`${section.slug}-${product.id}-${product.name}`} product={product} />
                ))}
              </div>
            </section>
          ))}

          {!sections.length ? (
            <div className="rounded-lg border border-matica-line bg-white p-6 text-center shadow-sm">
              <Utensils className="mx-auto h-8 w-8 text-matica-green" />
              <h2 className="mt-3 text-2xl font-black">Carta no disponible</h2>
              <p className="mt-1 text-sm font-semibold text-matica-ink/60">
                Ahora mismo no se pudo cargar la carta pública.
              </p>
            </div>
          ) : null}
        </div>

        <section className="mt-12 rounded-lg border border-matica-line bg-white p-5 shadow-sm sm:p-7">
          <div className="inline-flex items-center gap-2 rounded-lg bg-matica-mint px-3 py-1 text-sm font-black text-matica-green">
            <Sparkles className="h-4 w-4" />
            Servicio para empresas
          </div>
          <h2 className="mt-4 text-3xl font-black leading-tight">¿Quieres ofrecer este servicio en tu empresa?</h2>
          <p className="mt-2 max-w-3xl text-base font-semibold leading-7 text-matica-ink/65">
            Damos de alta empresas para que sus empleados puedan realizar pedidos online de forma rápida y sencilla.
          </p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <a
              className="matica-focus inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-matica-green px-5 font-black text-white"
              href={WHATSAPP_URL}
              rel="noreferrer"
              target="_blank"
            >
              <MessageCircle className="h-5 w-5" />
              Contactar por WhatsApp
            </a>
            <a
              className="matica-focus inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-matica-line bg-white px-5 font-black text-matica-ink hover:border-matica-green hover:text-matica-green"
              href={EMAIL_URL}
            >
              <Mail className="h-5 w-5" />
              Enviar email
            </a>
          </div>
        </section>
      </div>
    </main>
  );
}

function buildCommercialSections(publicSections: { slug: string; products: Product[] }[]): CommercialSection[] {
  const sectionProducts = (slug: string) => publicSections.find((section) => section.slug === slug)?.products ?? [];
  const menus = sectionProducts("menus");
  const grill = sectionProducts("matica-grill");
  const bowls = sectionProducts("bowls-signature");
  const wraps = sectionProducts("wraps-signature");
  const dailyMenus = menus.filter((product) => product.product_type === "daily_menu" || product.product_type === "half_menu");
  const menuSalad = menus.filter((product) => normalizeCatalogText(product.name).includes("ensalada"));
  const customSalad = bowls.find((product) => normalizeCatalogText(product.name).includes("disena"));
  const signatureBowls = bowls.filter((product) => product.id !== customSalad?.id);

  return [
    {
      slug: "menu-del-dia",
      title: "Menú del día",
      description: "Opciones completas para comer bien a mediodía, con plato principal y bebida o postre.",
      products: dailyMenus
    },
    {
      slug: "menu-ejecutivo",
      title: "Menú Ejecutivo",
      description: "Platos combinados y formatos prácticos para jornadas de oficina.",
      products: [...grill, ...menuSalad]
    },
    {
      slug: "bowls-signature",
      title: "Bowls Signature",
      description: "Recetas Matica equilibradas, frescas y listas para tomar.",
      products: signatureBowls
    },
    {
      slug: "disena-tu-bowl",
      title: "Diseña tu bowl",
      description: "Elige base, proteína, toppings y aliño para montar una opción fresca a tu gusto.",
      products: customSalad
        ? [
            {
              ...customSalad,
              name: "Diseña tu bowl",
              description: "Elige base, proteína, toppings y aliño para crear tu bowl o ensalada a medida."
            }
          ]
        : []
    },
    {
      slug: "wraps",
      title: "Wraps",
      description: "Wraps completos, fáciles de comer y pensados para el ritmo de la oficina.",
      products: wraps
    },
    {
      slug: "ensaladas-personalizadas",
      title: "Ensaladas personalizadas",
      description: "Combina bases, proteína, toppings y salsa para una ensalada fresca a tu manera.",
      products: customSalad ? [customSalad] : []
    }
  ].filter((section) => section.products.length > 0);
}

function PublicMenuCard({ product }: { product: CommercialProduct }) {
  return (
    <article className="overflow-hidden rounded-lg border border-matica-line bg-white shadow-sm">
      <div className="aspect-[4/3] bg-matica-soft">
        {product.image_url ? (
          <img className="h-full w-full object-cover object-center" src={product.image_url} alt={product.name} />
        ) : (
          <div className="grid h-full place-items-center bg-gradient-to-br from-matica-mint via-white to-matica-soft text-matica-green">
            <Utensils className="h-8 w-8" />
          </div>
        )}
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg font-black leading-6">{product.name}</h3>
          <p className="shrink-0 text-base font-black text-matica-green">{formatCurrency(Number(product.base_price))}</p>
        </div>
        {product.description ? (
          <p className="mt-2 line-clamp-3 text-sm font-semibold leading-5 text-matica-ink/62">
            {product.description}
          </p>
        ) : null}
      </div>
    </article>
  );
}
