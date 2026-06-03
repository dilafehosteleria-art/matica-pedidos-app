import { CATEGORIES, PRODUCTS } from "@/lib/constants";
import type { Category, Product } from "@/lib/types";

export const CUSTOM_SALAD_PRODUCT_ID = "f4542750-92e9-4a8d-aa9c-3a9f5d5fbebd";
const DEFAULT_PRODUCT_IDS = new Set(PRODUCTS.map((product) => product.id));

const SIGNATURE_BOWL_PRODUCT_IDS = {
  caesar: "508060cf-b36f-4ae5-92bd-989954034da3",
  mediterranean: "9e62560b-9633-4743-877c-3c387d044d3f",
  texMex: "16eff41e-86d0-4d05-a19b-7fd977fcd4ee",
  green: "7c53ddc4-67cc-4a30-9f46-111ef6344c4a"
} as const;

export type SectionKind =
  | "menus"
  | "daily_menu"
  | "half_menu"
  | "signature_bowls"
  | "custom_salad"
  | "wraps_signature"
  | "custom_wrap"
  | "grill"
  | "sandwiches"
  | "drinks"
  | "desserts"
  | "extras";

export type PublicSection = {
  slug: string;
  title: string;
  tabLabel?: string;
  description: string;
  kind: SectionKind;
  products: Product[];
  configurable?: boolean;
};

type CatalogSectionDefinition = Omit<PublicSection, "products"> & {
  categorySlug: string;
};

export const CATALOG_SECTION_DEFINITIONS: CatalogSectionDefinition[] = [
  {
    slug: "menus",
    categorySlug: "menus",
    title: "Menús",
    tabLabel: "Menús",
    description: "Menú del día, medio menú y combinaciones rápidas.",
    kind: "menus"
  },
  {
    slug: "bowls-signature",
    categorySlug: "bowls-ensaladas",
    title: "Matica Signature Bowls y Ensaladas",
    tabLabel: "Bowls",
    description: "Cuatro recetas signature y la ensalada a tu manera al final.",
    kind: "signature_bowls"
  },
  {
    slug: "wraps-signature",
    categorySlug: "wraps-signature",
    title: "Wraps Signature",
    tabLabel: "Wraps",
    description: "Cuatro wraps Matica y el wrap a tu manera al final.",
    kind: "wraps_signature"
  },
  {
    slug: "matica-grill",
    categorySlug: "matica-grill",
    title: "Matica Grill",
    tabLabel: "Grill",
    description: "Plato combinado configurable con proteína, guarniciones y bebida o postre.",
    kind: "grill"
  },
  {
    slug: "bocadillos",
    categorySlug: "bocadillos",
    title: "Bocadillos",
    tabLabel: "Bocadillos",
    description: "Elige entre los bocadillos disponibles.",
    kind: "sandwiches"
  },
  {
    slug: "bebidas",
    categorySlug: "bebidas",
    title: "Bebidas",
    tabLabel: "Bebidas",
    description: "Aguas y refrescos.",
    kind: "drinks"
  },
  {
    slug: "postres",
    categorySlug: "postres",
    title: "Postres",
    tabLabel: "Postres",
    description: "Dulces y fruta para cerrar el menú.",
    kind: "desserts"
  },
  {
    slug: "otros",
    categorySlug: "otros",
    title: "Otros",
    tabLabel: "Otros",
    description: "Pequeños extras para completar el pedido.",
    kind: "extras"
  }
];

export function normalizeCatalogText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function getProductImageUrl(product: Product) {
  return product.image_url ?? "";
}

export function isCustomSaladProduct(product: Pick<Product, "name">) {
  const name = normalizeCatalogText(product.name);

  return name.includes("disena tu ensalada") || name.includes("ensalada a tu manera");
}

export function isCustomSaladCatalogProduct(product: Pick<Product, "name">) {
  const name = normalizeCatalogText(product.name);

  return (
    isCustomSaladProduct(product) ||
    name.includes("ensalada mediana") ||
    (name.includes("ensalada") && name.includes("manera"))
  );
}

export function isCustomSaladAliasProduct(product: Pick<Product, "id" | "name">) {
  return product.id !== CUSTOM_SALAD_PRODUCT_ID && !DEFAULT_PRODUCT_IDS.has(product.id) && isCustomSaladCatalogProduct(product);
}

export function isCustomWrapProduct(product: Product) {
  const name = normalizeCatalogText(product.name);

  return name.includes("disena tu wrap") || name.includes("wrap a tu manera");
}

export function isMenuSaladSandwichProduct(product: Product) {
  const name = normalizeCatalogText(product.name);

  return name.includes("ensalada pequena") && name.includes("bocadillo");
}

export function getCatalogDisplayName(product: Product, kind: SectionKind) {
  if (kind === "custom_salad" || isCustomSaladProduct(product)) {
    return "Diseña tu ensalada";
  }

  if (kind === "custom_wrap" || isCustomWrapProduct(product)) {
    return "Diseña tu wrap";
  }

  if (kind === "grill") {
    return "Platos combinados Matica";
  }

  if (kind === "sandwiches") {
    return "Escoge tu bocadillo";
  }

  if (kind === "drinks") {
    return "Escoge tu bebida";
  }

  if (kind === "desserts") {
    return "Escoge tu postre";
  }

  return product.name;
}

export function mergeCatalogDefaults(categories: Category[], products: Product[]) {
  const categoriesById = new Map(CATEGORIES.map((category) => [category.id, category]));
  const productsById = new Map(PRODUCTS.map((product) => [product.id, product]));
  const dbProductIds = new Set(products.map((product) => product.id));
  const customSaladAlias = products.find(isCustomSaladAliasProduct);

  for (const category of categories) {
    const defaultCategory = categoriesById.get(category.id);

    categoriesById.set(category.id, defaultCategory ? { ...category, slug: defaultCategory.slug } : category);
  }

  for (const product of products) {
    const defaultProduct = productsById.get(product.id);
    const forceActive = product.id === CUSTOM_SALAD_PRODUCT_ID || isCustomSaladAliasProduct(product);

    productsById.set(
      product.id,
      defaultProduct
        ? {
            ...product,
            active: forceActive ? true : product.active,
            category_id: defaultProduct.category_id,
            sort_order: defaultProduct.sort_order
          }
        : {
            ...product,
            active: forceActive ? true : product.active
          }
    );
  }

  if (!dbProductIds.has(CUSTOM_SALAD_PRODUCT_ID) && customSaladAlias) {
    productsById.delete(CUSTOM_SALAD_PRODUCT_ID);
  }

  return {
    categories: Array.from(categoriesById.values()).sort((a, b) => a.sort_order - b.sort_order),
    products: Array.from(productsById.values()).sort((a, b) => a.sort_order - b.sort_order)
  };
}

export function getVisibleCatalogCategories(categories: Category[]) {
  const categoriesBySlug = new Map(categories.map((category) => [category.slug, category]));

  return CATALOG_SECTION_DEFINITIONS.map((section, index) => {
    const category = categoriesBySlug.get(section.categorySlug);

    if (!category) {
      return null;
    }

    return {
      ...category,
      name: section.title,
      sort_order: (index + 1) * 10
    };
  }).filter((category): category is Category => Boolean(category));
}

function cloneCatalogProduct(
  product: Product | undefined,
  overrides: Partial<Pick<Product, "name" | "description" | "base_price" | "customer_price" | "product_type">>
) {
  if (!product) {
    return undefined;
  }

  return {
    ...product,
    name: overrides.name ?? product.name,
    description: product.description?.trim() ? product.description : overrides.description ?? product.description,
    base_price: Number.isFinite(Number(product.base_price)) ? Number(product.base_price) : Number(overrides.base_price ?? 0),
    customer_price: Number.isFinite(Number(product.customer_price))
      ? Number(product.customer_price)
      : Number(overrides.customer_price ?? overrides.base_price ?? 0),
    product_type: overrides.product_type ?? product.product_type
  };
}

function pickCatalogProduct(products: Product[], matcher: (product: Product) => boolean): Product | undefined {
  return products.find(matcher);
}

function compactProducts(products: Array<Product | undefined>) {
  return products.filter((product): product is Product => Boolean(product));
}

function nameIncludes(value: string) {
  return (product: Product) => normalizeCatalogText(product.name).includes(value);
}

function nameIncludesAny(values: string[]) {
  return (product: Product) => {
    const normalizedName = normalizeCatalogText(product.name);

    return values.some((value) => normalizedName.includes(value));
  };
}

function pickProductByIdOrName(products: Product[], id: string, matcher: (product: Product) => boolean) {
  return pickCatalogProduct(products, (product) => product.id === id) ?? pickCatalogProduct(products, matcher);
}

function pickCustomSaladProduct(products: Product[]) {
  const canonicalProduct = products.find((product) => product.id === CUSTOM_SALAD_PRODUCT_ID);
  const aliasProducts = products.filter(isCustomSaladAliasProduct);

  return (
    canonicalProduct ??
    aliasProducts.find((product) => Boolean(product.image_url)) ??
    aliasProducts[0]
  );
}

export function buildPublicCatalogSections(categories: Category[], products: Product[]): PublicSection[] {
  const allProducts = products;
  const categorySlugById = new Map(categories.map((category) => [category.id, category.slug]));
  const categoryProducts = (slug: string) => allProducts.filter((product) => categorySlugById.get(product.category_id) === slug);
  const menus = categoryProducts("menus");
  const bowlsAndSalads = categoryProducts("bowls-ensaladas");
  const wraps = categoryProducts("wraps-signature");
  const grill = categoryProducts("matica-grill");
  const sandwiches = categoryProducts("bocadillos");
  const drinks = categoryProducts("bebidas").filter((product) => product.product_type !== "daily_menu");
  const desserts = categoryProducts("postres");
  const extras = categoryProducts("otros");
  const pick = (catalogProducts: Product[], matcher: (product: Product) => boolean) => pickCatalogProduct(catalogProducts, matcher);

  function productsFor(kind: SectionKind): Product[] {
    switch (kind) {
      case "menus":
        return compactProducts([
          cloneCatalogProduct(pick(allProducts, (product) => product.product_type === "daily_menu"), {
            name: "Menú del día",
            description: "Primer plato, segundo plato, guarnición, bebida o postre y pan opcional.",
            base_price: 13,
            customer_price: 9,
            product_type: "daily_menu"
          }),
          cloneCatalogProduct(pick(allProducts, (product) => product.product_type === "half_menu"), {
            name: "Medio menú",
            description: "Plato único, guarnición si eliges segundo, bebida o postre y pan opcional.",
            base_price: 10,
            customer_price: 6.5,
            product_type: "half_menu"
          }),
          cloneCatalogProduct(pick(menus, isMenuSaladSandwichProduct), {
            name: "Menú ensalada pequeña + bocadillo",
            description: "Ensalada pequeña 750ML configurable y bocadillo a elegir.",
            base_price: 10,
            customer_price: 10,
            product_type: "standard"
          })
        ]);
      case "daily_menu":
        return allProducts.filter((product) => product.product_type === "daily_menu");
      case "half_menu":
        return allProducts.filter((product) => product.product_type === "half_menu");
      case "signature_bowls":
        return compactProducts([
          cloneCatalogProduct(
            pickProductByIdOrName(bowlsAndSalads, SIGNATURE_BOWL_PRODUCT_IDS.caesar, nameIncludesAny(["caesar", "cesar"])),
            {
              name: "Caesar Crunch Chicken Bowl",
              description:
                "Mézclum fresco y fusilli al dente con pollo crispy, tomate, huevo, lascas de parmesano y cebolla crujiente, acompañado de nuestra salsa César parmesana.",
              base_price: 9.9,
              customer_price: 9.9,
              product_type: "standard"
            }
          ),
          cloneCatalogProduct(
            pickProductByIdOrName(bowlsAndSalads, SIGNATURE_BOWL_PRODUCT_IDS.mediterranean, nameIncludesAny(["mediterranean", "mediterraneo"])),
            {
              name: "Mediterranean Fresh Bowl",
              description:
                "Quinoa y espinaca fresca con atún, pepino, aceitunas, queso fresco y garbanzos, con nuestra vinagreta balsámica prémium.",
              base_price: 9.9,
              customer_price: 9.9,
              product_type: "standard"
            }
          ),
          cloneCatalogProduct(
            pickProductByIdOrName(bowlsAndSalads, SIGNATURE_BOWL_PRODUCT_IDS.texMex, nameIncludesAny(["tex-mex", "tex mex", "texmex"])),
            {
              name: "Tex-Mex Protein Bowl",
              description:
                "Arroz jazmín y mézclum fresco con cerdo asado, maíz, cebolla, pimientos y huevo, con nuestra salsa de mostaza miel.",
              base_price: 9.9,
              customer_price: 9.9,
              product_type: "standard"
            }
          ),
          cloneCatalogProduct(
            pickProductByIdOrName(bowlsAndSalads, SIGNATURE_BOWL_PRODUCT_IDS.green, nameIncludes("green")),
            {
              name: "Green Fresh Bowl",
              description:
                "Espinaca fresca y arroz integral con pollo a la plancha, pepino, zanahoria, frutos secos y queso fresco, acompañado de nuestra salsa yogur-limón.",
              base_price: 9.9,
              customer_price: 9.9,
              product_type: "standard"
            }
          ),
          cloneCatalogProduct(
            pickCustomSaladProduct(bowlsAndSalads),
            {
              name: "Diseña tu ensalada",
              description: "Elige una base, 3 toppings y una proteína. Termínala con la salsa que más te guste.",
              base_price: 7.5,
              customer_price: 7.5,
              product_type: "standard"
            }
          )
        ]);
      case "custom_salad":
        return bowlsAndSalads.filter((product) => normalizeCatalogText(product.name).includes("ensalada"));
      case "wraps_signature":
        return compactProducts([
          cloneCatalogProduct(pick(wraps, nameIncludes("caesar")), {
            name: "Wrap Caesar Crunch",
            description: "Pollo crispy, mézclum, tomate, parmesano y salsa César parmesana en tortilla wrap.",
            base_price: 8.9,
            customer_price: 8.9,
            product_type: "standard"
          }),
          cloneCatalogProduct(pick(wraps, nameIncludes("tex-mex")), {
            name: "Wrap Tex-Mex Pork",
            description:
              "Wrap con cerdo asado, arroz jazmín, maíz, pimiento, cebolla y salsa chipotle suave. Una opción sabrosa, contundente y con toque Tex-Mex.",
            base_price: 8.9,
            customer_price: 8.9,
            product_type: "standard"
          }),
          cloneCatalogProduct(pick(wraps, nameIncludes("fresh")), {
            name: "Wrap Fresh Chicken",
            description:
              "Wrap con pollo a la plancha, espinaca fresca, pepino, zanahoria, queso fresco y salsa yogur-limón. Ligero, fresco y equilibrado.",
            base_price: 8.9,
            customer_price: 8.9,
            product_type: "standard"
          }),
          cloneCatalogProduct(pick(wraps, nameIncludes("mediterranean")), {
            name: "Wrap Mediterranean Tuna",
            description:
              "Wrap con atún, mézclum fresco, pepino, aceitunas, queso fresco y salsa yogur-limón. Fresco, mediterráneo y muy fácil de comer.",
            base_price: 8.9,
            customer_price: 8.9,
            product_type: "standard"
          }),
          cloneCatalogProduct(
            pick(wraps, (product) => isCustomWrapProduct(product) || normalizeCatalogText(product.name).includes("a tu manera")),
            {
              name: "Diseña tu wrap",
              description:
                "Diseña tu wrap con tus ingredientes favoritos. Elige 2 bases, 1 proteína, 5 toppings y 2 salsas de tu preferencia.",
              base_price: 7.5,
              customer_price: 7.5,
              product_type: "standard"
            }
          )
        ]);
      case "custom_wrap":
        return wraps.filter((product) => normalizeCatalogText(product.name).includes("manera"));
      case "grill":
        return compactProducts([
          cloneCatalogProduct(pick(grill, (product) => normalizeCatalogText(product.name).includes("plato")), {
            name: "Platos combinados Matica",
            description:
              "Escoge entre pollo a la plancha, lomo de cerdo o filete de ternera + 1 huevo frito + 2 guarniciones + postre o bebida + pan.",
            base_price: 10,
            customer_price: 10,
            product_type: "standard"
          })
        ]);
      case "sandwiches":
        return compactProducts([
          cloneCatalogProduct(pick(sandwiches, nameIncludes("bocadillo")), {
            name: "Escoge tu bocadillo",
            description: "Elige entre los bocadillos disponibles.",
            base_price: 6,
            customer_price: 6,
            product_type: "standard"
          })
        ]);
      case "drinks":
        return compactProducts([
          cloneCatalogProduct(pick(drinks, (product) => product.product_type === "drink" || normalizeCatalogText(product.name).includes("agua")), {
            name: "Escoge tu bebida",
            description: "Coca Cola, Coca Cola Zero, Lipton, Fanta, agua mineral o agua con gas.",
            base_price: 1.5,
            customer_price: 1.5,
            product_type: "drink"
          })
        ]);
      case "desserts":
        return compactProducts([
          cloneCatalogProduct(pick(desserts, (product) => product.product_type === "dessert" || normalizeCatalogText(product.name).includes("flan")), {
            name: "Escoge tu postre",
            description: "Flan, yogur, natillas, fruta, flan de queso o cookie.",
            base_price: 1,
            customer_price: 1,
            product_type: "dessert"
          })
        ]);
      case "extras":
        return compactProducts([
          cloneCatalogProduct(pick(extras, nameIncludes("cubiertos")), {
            name: "Cubiertos",
            description: "Set de cubiertos para tu pedido.",
            base_price: 0.2,
            customer_price: 0.2,
            product_type: "other"
          })
        ]);
    }
  }

  return CATALOG_SECTION_DEFINITIONS.map(({ categorySlug: _categorySlug, ...section }) => ({
    ...section,
    products: productsFor(section.kind)
  })).filter((section) => section.products.length > 0);
}
