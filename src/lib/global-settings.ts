import { getSupabaseServerClient } from "@/lib/supabase/server";
import { DEFAULT_GLOBAL_SCHEDULE, normalizeGlobalSchedule } from "@/lib/schedule";
import type { GlobalSchedule } from "@/lib/types";

type SupabaseLike = NonNullable<ReturnType<typeof getSupabaseServerClient>>;

export async function getGlobalSchedule(supabase?: SupabaseLike | null): Promise<GlobalSchedule> {
  const client = supabase ?? getSupabaseServerClient();

  if (!client) {
    return DEFAULT_GLOBAL_SCHEDULE;
  }

  const { data, error } = await client
    .from("app_settings")
    .select("*")
    .eq("id", "global")
    .maybeSingle();

  if (error || !data) {
    return DEFAULT_GLOBAL_SCHEDULE;
  }

  return normalizeGlobalSchedule(data as Partial<GlobalSchedule>);
}
