import { NextResponse } from "next/server";
import {
  BUREAU_VERITAS_BRANCHES,
  BUREAU_VERITAS_COMPANY,
  CATEGORIES,
  DEFAULT_DAILY_MENU,
  PRODUCTS
} from "@/lib/constants";
import { toDateInputValue } from "@/lib/format";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { DailyMenu, PublicData } from "@/lib/types";

export const dynamic = "force-dynamic";

function seedData(): PublicData {
  return {
    company: BUREAU_VERITAS_COMPANY,
    branches: BUREAU_VERITAS_BRANCHES,
    categories: CATEGORIES,
    products: PRODUCTS,
    dailyMenu: {
      ...DEFAULT_DAILY_MENU,
      date: toDateInputValue()
    },
    source: "seed"
  };
}

function normalizeMenu(menu: DailyMenu | null): DailyMenu | null {
  if (!menu) {
    return null;
  }

  return {
    ...menu,
    first_courses: menu.first_courses ?? [],
    second_courses: menu.second_courses ?? [],
    drinks: menu.drinks ?? [],
    desserts: menu.desserts ?? []
  };
}

export async function GET() {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return NextResponse.json(seedData());
  }

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("*")
    .eq("slug", "bureau-veritas")
    .eq("active", true)
    .maybeSingle();

  if (companyError || !company) {
    return NextResponse.json(seedData());
  }

  const today = toDateInputValue();

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
      .eq("active", true)
      .order("sort_order", { ascending: true }),
    supabase
      .from("products")
      .select("*")
      .eq("active", true)
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
    return NextResponse.json(seedData());
  }

  return NextResponse.json({
    company,
    branches: branches.data ?? [],
    categories: categories.data ?? [],
    products: products.data ?? [],
    dailyMenu: normalizeMenu(dailyMenu),
    source: "supabase"
  } satisfies PublicData);
}
