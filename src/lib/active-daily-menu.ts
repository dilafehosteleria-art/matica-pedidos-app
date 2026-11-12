import type { getSupabaseServerClient } from "@/lib/supabase/server";
import type { DailyMenu } from "@/lib/types";

const DAILY_MENU_FIELDS = "id,date,first_courses,second_courses,drinks,desserts,active,created_at";

export async function readActiveDailyMenu(
  supabase: NonNullable<ReturnType<typeof getSupabaseServerClient>>,
  date: string
) {
  const { data, error } = await supabase
    .from("daily_menus")
    .select(DAILY_MENU_FIELDS)
    .eq("date", date)
    .eq("active", true)
    .maybeSingle();

  return { data: data as DailyMenu | null, error };
}
