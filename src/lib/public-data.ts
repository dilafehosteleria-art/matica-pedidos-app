import {
  BUREAU_VERITAS_BRANCHES,
  BUREAU_VERITAS_COMPANY,
  CATEGORIES,
  COMPANIES,
  DEFAULT_DAILY_MENU,
  ICF_BRANCHES,
  ICF_COMPANY,
  PRODUCTS
} from "@/lib/constants";
import { mergeCatalogDefaults } from "@/lib/catalog";
import { toDateInputValue } from "@/lib/format";
import { publicStripePaymentsEnabled } from "@/lib/payment";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { DailyMenu, DailyMenuCourse, Product, PublicCompany, PublicData } from "@/lib/types";

export const LANDING_FEATURED_PRODUCT_IDS = [
  "e0cc5cbb-9170-4df3-a07a-8d8a76fa36d3",
  "fe6a9ab8-f7a4-4f29-9606-3a4213816eb5",
  "55cae0d1-1d44-4dcb-96fb-a1dc05c74511",
  "508060cf-b36f-4ae5-92bd-989954034da3"
];

const COMPANY_PUBLIC_FIELDS = "id,name,slug,active,order_window,delivery_window";
const COMPANY_FIELDS = "*,subsidy_rules(product_type,subsidy_amount,active)";
const BRANCH_FIELDS = "id,company_id,name,active";
const CATEGORY_FIELDS = "id,name,slug,sort_order,active";
const PRODUCT_FIELDS = "id,category_id,name,description,base_price,customer_price,image_url,active,sold_out,sort_order,product_type,created_at";
const DAILY_MENU_FIELDS = "id,date,first_courses,second_courses,drinks,desserts,active,created_at";

function normalizeCourse(course: DailyMenuCourse): DailyMenuCourse | null {
  if (typeof course === "string") {
    const name = course.trim();

    return name ? name : null;
  }

  const name = course.name?.trim();

  if (!name) {
    return null;
  }

  return { name };
}

function normalizeMenu(menu: DailyMenu | null): DailyMenu | null {
  if (!menu) {
    return null;
  }

  return {
    ...menu,
    first_courses: menu.first_courses ?? [],
    second_courses: (menu.second_courses ?? []).map(normalizeCourse).filter((course): course is DailyMenuCourse => Boolean(course)),
    drinks: menu.drinks ?? [],
    desserts: menu.desserts ?? []
  };
}

export function seedCompanyData(slug = "bureau-veritas"): PublicData | null {
  const company = slug === BUREAU_VERITAS_COMPANY.slug
    ? BUREAU_VERITAS_COMPANY
    : slug === ICF_COMPANY.slug
      ? ICF_COMPANY
      : null;

  if (!company) {
    return null;
  }

  return {
    company: {
      ...company,
      stripe_payments_enabled: publicStripePaymentsEnabled()
    },
    branches: company.slug === ICF_COMPANY.slug ? ICF_BRANCHES : BUREAU_VERITAS_BRANCHES,
    categories: [...CATEGORIES].sort((a, b) => a.sort_order - b.sort_order),
    products: [...PRODUCTS].sort((a, b) => a.sort_order - b.sort_order),
    dailyMenu: {
      ...DEFAULT_DAILY_MENU,
      date: toDateInputValue()
    },
    source: "seed"
  };
}

export async function getPublicCompanies(): Promise<PublicCompany[]> {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return COMPANIES.filter((company) => company.active);
  }

  const { data, error } = await supabase
    .from("companies")
    .select(COMPANY_PUBLIC_FIELDS)
    .eq("active", true)
    .order("name", { ascending: true });

  if (error || !data?.length) {
    return COMPANIES.filter((company) => company.active);
  }

  return data as PublicCompany[];
}

function orderFeaturedProducts(products: Product[], productIds: string[]) {
  const productsById = new Map(products.map((product) => [product.id, product]));

  return productIds.flatMap((productId) => {
    const product = productsById.get(productId);

    return product && product.active && !product.sold_out ? [product] : [];
  });
}

export async function getPublicFeaturedProducts(
  productIds = LANDING_FEATURED_PRODUCT_IDS
): Promise<Product[]> {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return orderFeaturedProducts(PRODUCTS, productIds);
  }

  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_FIELDS)
    .in("id", productIds)
    .eq("active", true)
    .eq("sold_out", false);

  if (error || !data?.length) {
    return orderFeaturedProducts(PRODUCTS, productIds);
  }

  return orderFeaturedProducts(data as Product[], productIds);
}

export async function getPublicCompanyData(slug: string): Promise<PublicData | null> {
  const fallback = seedCompanyData(slug);
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return fallback;
  }

  const today = toDateInputValue();
  const companyQuery = supabase
    .from("companies")
    .select(COMPANY_FIELDS)
    .eq("slug", slug)
    .eq("active", true)
    .maybeSingle();
  const categoriesQuery = supabase
    .from("categories")
    .select(CATEGORY_FIELDS)
    .order("sort_order", { ascending: true });
  const productsQuery = supabase
    .from("products")
    .select(PRODUCT_FIELDS)
    .order("sort_order", { ascending: true });
  const todaysMenuQuery = supabase
    .from("daily_menus")
    .select(DAILY_MENU_FIELDS)
    .eq("date", today)
    .eq("active", true)
    .maybeSingle();

  const [companyResult, categories, products, todaysMenu] = await Promise.all([
    companyQuery,
    categoriesQuery,
    productsQuery,
    todaysMenuQuery
  ]);
  const { data: company, error: companyError } = companyResult;

  if (companyError || !company) {
    return fallback;
  }

  const branches = await supabase
    .from("company_branches")
    .select(BRANCH_FIELDS)
    .eq("company_id", company.id)
    .eq("active", true)
    .order("name", { ascending: true });

  let dailyMenu = todaysMenu.data as DailyMenu | null;

  if (!dailyMenu) {
    const { data } = await supabase
      .from("daily_menus")
      .select(DAILY_MENU_FIELDS)
      .eq("active", true)
      .order("date", { ascending: false })
      .limit(1)
      .maybeSingle();

    dailyMenu = data as DailyMenu | null;
  }

  if (branches.error || categories.error || products.error) {
    return fallback;
  }

  const catalog = mergeCatalogDefaults(categories.data ?? [], products.data ?? []);

  return {
    company: {
      ...company,
      stripe_payments_enabled: publicStripePaymentsEnabled()
    },
    branches: branches.data ?? [],
    categories: catalog.categories.filter((category) => category.active),
    products: catalog.products.filter((product) => product.active),
    dailyMenu: normalizeMenu(dailyMenu) ?? fallback?.dailyMenu ?? null,
    source: "supabase"
  } satisfies PublicData;
}
