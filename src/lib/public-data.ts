import {
  BUREAU_VERITAS_BRANCHES,
  BUREAU_VERITAS_COMPANY,
  CATEGORIES,
  COMPANIES,
  DEFAULT_DAILY_MENU,
  PRODUCTS
} from "@/lib/constants";
import { mergeCatalogDefaults } from "@/lib/catalog";
import { ensureCustomSaladProduct } from "@/lib/catalog-maintenance";
import { toDateInputValue } from "@/lib/format";
import { getSupabaseAdminClient, getSupabaseServerClient } from "@/lib/supabase/server";
import type { DailyMenu, DailyMenuCourse, PublicCompany, PublicData } from "@/lib/types";

function normalizeCourse(course: DailyMenuCourse): DailyMenuCourse | null {
  if (typeof course === "string") {
    const name = course.trim();

    return name ? name : null;
  }

  const name = course.name?.trim();

  if (!name) {
    return null;
  }

  return {
    name,
    category: course.category?.trim() || null,
    excluded_from_half_menu: Boolean(course.excluded_from_half_menu)
  };
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
  if (slug !== BUREAU_VERITAS_COMPANY.slug) {
    return null;
  }

  return {
    company: BUREAU_VERITAS_COMPANY,
    branches: BUREAU_VERITAS_BRANCHES,
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
    .select("*")
    .eq("active", true)
    .order("name", { ascending: true });

  if (error || !data?.length) {
    return COMPANIES.filter((company) => company.active);
  }

  return data as PublicCompany[];
}

export async function getPublicCompanyData(slug: string): Promise<PublicData | null> {
  const fallback = seedCompanyData(slug);
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return fallback;
  }

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("*")
    .eq("slug", slug)
    .eq("active", true)
    .maybeSingle();

  if (companyError || !company) {
    return fallback;
  }

  const today = toDateInputValue();
  const adminSupabase = getSupabaseAdminClient();

  if (adminSupabase) {
    const customSaladError = await ensureCustomSaladProduct(adminSupabase);

    if (customSaladError) {
      console.warn("No se pudo asegurar la ensalada configurable:", customSaladError);
    }
  }

  const [branches, categories, products, todaysMenu] = await Promise.all([
    supabase
      .from("company_branches")
      .select("*")
      .eq("company_id", company.id)
      .eq("active", true)
      .order("name", { ascending: true }),
    supabase
      .from("categories")
      .select("*")
      .order("sort_order", { ascending: true }),
    supabase
      .from("products")
      .select("*")
      .order("sort_order", { ascending: true }),
    supabase
      .from("daily_menus")
      .select("*")
      .eq("date", today)
      .eq("active", true)
      .maybeSingle()
  ]);

  let dailyMenu = todaysMenu.data as DailyMenu | null;

  if (!dailyMenu) {
    const { data } = await supabase
      .from("daily_menus")
      .select("*")
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
    company,
    branches: branches.data ?? [],
    categories: catalog.categories.filter((category) => category.active),
    products: catalog.products.filter((product) => product.active),
    dailyMenu: normalizeMenu(dailyMenu) ?? fallback?.dailyMenu ?? null,
    source: "supabase"
  } satisfies PublicData;
}
