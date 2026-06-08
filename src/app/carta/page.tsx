import { ArrowLeft, Leaf, Mail, MessageCircle, Sparkles, Utensils } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { buildPublicCatalogSections, normalizeCatalogText } from "@/lib/catalog";
import { formatCurrency } from "@/lib/format";
import { getPublicCompanyData } from "@/lib/public-data";
import { resolvePublicProductImageUrl } from "@/lib/public-product-images";
import type { Product } from "@/lib/types";

export const metadata: Metadata = {
  title: "Carta Matica | Comida para empresas",
  description: "Carta pública de Matica Fresh Food para empresas: menús, bowls, wraps, ensaladas y opciones rápidas."
};

const WHATSAPP_URL = "https://wa.me/34674323152";
const EMAIL_URL = "mailto:pedidomatica@gmail.com?subject=Alta%20empresa%20Matica%20B2B";

type CommercialProductDefinition = {
  id: string;
  name: string;
  description: string;
  price: number;
  pricePrefix?: "desde";
  imageProductId: string;
  imageProductName?: string;
};

type CommercialProduct = CommercialProductDefinition & {
  image_url: string | null;
};

type CommercialSectionDefinition = {
  slug: string;
  title: string;
  description: string;
  products: CommercialProductDefinition[];
};

type CommercialSection = Omit<CommercialSectionDefinition, "products"> & {
  products: CommercialProduct[];
};

const PRODUCT_IDS = {
  dailyMenu: "e0cc5cbb-9170-4df3-a07a-8d8a76fa36d3",
  halfMenu: "fe6a9ab8-f7a4-4f29-9606-3a4213816eb5",
  saladSandwichMenu: "55cae0d1-1d44-4dcb-96fb-a1dc05c74511",
  caesarBowl: "508060cf-b36f-4ae5-92bd-989954034da3",
  mediterraneanBowl: "9e62560b-9633-4743-877c-3c387d044d3f",
  texMexBowl: "16eff41e-86d0-4d05-a19b-7fd977fcd4ee",
  greenBowl: "7c53ddc4-67cc-4a30-9f46-111ef6344c4a",
  customSalad: "f4542750-92e9-4a8d-aa9c-3a9f5d5fbebd",
  caesarWrap: "f42ace28-8bbb-48a2-b4af-18bf4fa74606",
  texMexWrap: "d8e39218-2a10-4f21-8b5f-b2089300c911",
  freshWrap: "3191e6e9-34ed-4468-8cfe-bb825e963c97",
  mediterraneanWrap: "4f0b8a09-ea54-44c1-b215-d914d204b7fd",
  customWrap: "b0c4026f-b520-4202-b206-320dc152607a",
  grill: "fa921f79-4917-48b6-a25f-20cf7f3a55ca",
  sandwich: "ef86e12e-9dc5-4646-b2f2-50977d21f2cc",
  drink: "d7d6e225-1156-4d66-9d4e-afad4147fb5e",
  dessert: "d93d5c58-2200-43d8-9c16-ed4b3d291006"
} as const;

const COMMERCIAL_SECTIONS: CommercialSectionDefinition[] = [
  {
    slug: "menus",
    title: "Menús",
    description: "Formatos completos y rápidos para comer bien en la oficina.",
    products: [
      {
        id: "public-daily-menu",
        imageProductId: PRODUCT_IDS.dailyMenu,
        name: "Menú del día",
        description: "Primer plato, segundo plato y bebida o postre.",
        price: 13
      },
      {
        id: "public-half-menu",
        imageProductId: PRODUCT_IDS.halfMenu,
        name: "Medio menú",
        description: "Un plato y bebida o postre.",
        price: 10
      },
      {
        id: "public-salad-sandwich-menu",
        imageProductId: PRODUCT_IDS.saladSandwichMenu,
        name: "Menú ensalada pequeña + bocadillo",
        description: "Ensalada pequeña 750ML configurable y bocadillo a elegir.",
        price: 10
      }
    ]
  },
  {
    slug: "bowls-signature",
    title: "Bowls Signature",
    description: "Recetas frescas, completas y listas para disfrutar a mediodía.",
    products: [
      {
        id: "public-caesar-bowl",
        imageProductId: PRODUCT_IDS.caesarBowl,
        name: "Caesar Crunch Chicken Bowl",
        description:
          "Mézclum fresco y fusilli al dente con pollo crispy, tomate, huevo, lascas de parmesano y cebolla crujiente, con salsa César parmesana.",
        price: 9.9
      },
      {
        id: "public-mediterranean-bowl",
        imageProductId: PRODUCT_IDS.mediterraneanBowl,
        name: "Mediterranean Fresh Bowl",
        description: "Quinoa y espinaca fresca con atún, pepino, aceitunas, queso fresco y garbanzos, con vinagreta balsámica.",
        price: 9.9
      },
      {
        id: "public-tex-mex-bowl",
        imageProductId: PRODUCT_IDS.texMexBowl,
        name: "Tex-Mex Protein Bowl",
        description: "Arroz jazmín y mézclum fresco con cerdo asado, maíz, cebolla, pimientos y huevo, con salsa de mostaza y miel.",
        price: 9.9
      },
      {
        id: "public-green-bowl",
        imageProductId: PRODUCT_IDS.greenBowl,
        name: "Green Fresh Bowl",
        description:
          "Espinaca fresca y arroz integral con pollo a la plancha, pepino, zanahoria, frutos secos y queso fresco, con salsa yogur-limón.",
        price: 9.9
      },
      {
        id: "public-custom-salad",
        imageProductId: PRODUCT_IDS.customSalad,
        name: "Diseña tu ensalada",
        description: "Elige tamaño, base, proteína, toppings y aliño.",
        price: 7.5,
        pricePrefix: "desde"
      }
    ]
  },
  {
    slug: "wraps-signature",
    title: "Wraps Signature",
    description: "Wraps sabrosos y fáciles de comer, pensados para el ritmo de oficina.",
    products: [
      {
        id: "public-caesar-wrap",
        imageProductId: PRODUCT_IDS.caesarWrap,
        name: "Wrap Caesar Crunch",
        description: "Pollo crispy, mézclum, tomate, parmesano y salsa César.",
        price: 8.9
      },
      {
        id: "public-tex-mex-wrap",
        imageProductId: PRODUCT_IDS.texMexWrap,
        name: "Wrap Tex-Mex Pork",
        description: "Cerdo especiado, arroz, maíz y salsa chipotle suave.",
        price: 8.9
      },
      {
        id: "public-fresh-wrap",
        imageProductId: PRODUCT_IDS.freshWrap,
        name: "Wrap Fresh Chicken",
        description: "Pollo, mézclum, tomate, zanahoria y salsa de yogur.",
        price: 8.9
      },
      {
        id: "public-mediterranean-wrap",
        imageProductId: PRODUCT_IDS.mediterraneanWrap,
        name: "Wrap Mediterranean Tuna",
        description: "Atún, queso fresco, pepino, aceitunas y salsa yogur-limón.",
        price: 8.9
      },
      {
        id: "public-custom-wrap",
        imageProductId: PRODUCT_IDS.customWrap,
        name: "Diseña tu wrap",
        description: "Elige base, proteína, relleno, toppings y salsa.",
        price: 8.9,
        pricePrefix: "desde"
      }
    ]
  },
  {
    slug: "matica-grill",
    title: "Matica Grill",
    description: "Platos combinados con proteína, guarniciones y acompañamiento.",
    products: [
      {
        id: "public-grill",
        imageProductId: PRODUCT_IDS.grill,
        name: "Platos combinados Matica",
        description:
          "Escoge entre pollo a la plancha, lomo de cerdo o filete de ternera + 1 huevo frito + 2 guarniciones + bebida o postre + pan.",
        price: 10
      }
    ]
  },
  {
    slug: "bocadillos",
    title: "Bocadillos",
    description: "Opciones sencillas y rápidas con pan crujiente.",
    products: [
      {
        id: "public-sandwich",
        imageProductId: PRODUCT_IDS.sandwich,
        name: "Escoge tu bocadillo",
        description: "Pan crujiente con relleno a elegir.",
        price: 5.5,
        pricePrefix: "desde"
      }
    ]
  },
  {
    slug: "bebidas",
    title: "Bebidas",
    description: "Bebidas frías para completar la comida.",
    products: [
      {
        id: "public-drink",
        imageProductId: PRODUCT_IDS.drink,
        imageProductName: "Escoge tu bebida",
        name: "Escoge tu bebida",
        description: "Agua, refrescos y bebidas frías.",
        price: 1.5,
        pricePrefix: "desde"
      }
    ]
  },
  {
    slug: "postres",
    title: "Postres",
    description: "Postres y fruta para cerrar la comida.",
    products: [
      {
        id: "public-dessert",
        imageProductId: PRODUCT_IDS.dessert,
        imageProductName: "Escoge tu postre",
        name: "Escoge tu postre",
        description: "Flan, yogur, natillas, fruta, flan de queso o cookie.",
        price: 1,
        pricePrefix: "desde"
      }
    ]
  }
];

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
                Consulta la oferta de Matica para empresas. Solo imagen, nombre, descripción y precio público, sin datos internos ni compra online.
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
                  <PublicMenuCard key={product.id} product={product} />
                ))}
              </div>
            </section>
          ))}
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

function buildCommercialSections(publicSections: { products: Product[] }[]): CommercialSection[] {
  const products = publicSections.flatMap((section) => section.products);
  const imageById = new Map(products.map((product) => [product.id, resolvePublicProductImageUrl(product)]));
  const imageByName = new Map(products.map((product) => [normalizeCatalogText(product.name), resolvePublicProductImageUrl(product)]));

  return COMMERCIAL_SECTIONS.map((section) => ({
    ...section,
    products: section.products.map((product) => ({
      ...product,
      image_url:
        imageById.get(product.imageProductId) ??
        (product.imageProductName ? imageByName.get(normalizeCatalogText(product.imageProductName)) : undefined) ??
        imageByName.get(normalizeCatalogText(product.name)) ??
        null
    }))
  }));
}

function PublicMenuCard({ product }: { product: CommercialProduct }) {
  const price = `${product.pricePrefix ? `${product.pricePrefix} ` : ""}${formatCurrency(product.price)}`;

  return (
    <article className="overflow-hidden rounded-lg border border-matica-line bg-white shadow-sm">
      <div className="aspect-[4/3] bg-matica-soft">
        {product.image_url ? (
          <img
            className="h-full w-full object-cover object-center"
            src={product.image_url}
            alt={product.name}
            decoding="async"
            loading="lazy"
            sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
          />
        ) : (
          <div className="grid h-full place-items-center bg-gradient-to-br from-matica-mint via-white to-matica-soft text-matica-green">
            <Utensils className="h-8 w-8" />
          </div>
        )}
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg font-black leading-6">{product.name}</h3>
          <p className="shrink-0 text-base font-black text-matica-green">{price}</p>
        </div>
        <p className="mt-2 text-sm font-semibold leading-5 text-matica-ink/62">{product.description}</p>
      </div>
    </article>
  );
}
