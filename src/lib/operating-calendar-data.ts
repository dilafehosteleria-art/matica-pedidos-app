import type { SupabaseClient } from "@supabase/supabase-js";
import type { CalendarClosure, ScheduleException } from "@/lib/operating-calendar";

export type OperatingCalendarData = {
  closures: CalendarClosure[];
  exceptions: ScheduleException[];
  available: boolean;
};

type ScheduleExceptionRow = {
  id?: string;
  date?: string;
  channel?: string;
  company_id?: string | null;
  mode?: string;
  open_time?: string | null;
  close_time?: string | null;
  service_start_time?: string | null;
  service_end_time?: string | null;
  menu_guarantee_cutoff?: string | null;
};

function mapException(row: ScheduleExceptionRow): ScheduleException | null {
  if (
    typeof row.date !== "string" ||
    (row.channel !== "delivery" && row.channel !== "local") ||
    (row.mode !== "closed" && row.mode !== "custom_hours")
  ) {
    return null;
  }

  return {
    id: row.id,
    date: row.date,
    channel: row.channel,
    company_id: row.company_id ?? null,
    mode: row.mode,
    open_time: row.open_time ?? null,
    close_time: row.close_time ?? null,
    service_start: row.service_start_time ?? null,
    service_end: row.service_end_time ?? null,
    menu_guarantee_cutoff: row.menu_guarantee_cutoff ?? null
  };
}

export async function readOperatingCalendar(
  supabase: SupabaseClient,
  options: { companyId?: string | null; date?: string } = {}
): Promise<OperatingCalendarData> {
  let closureQuery = supabase
    .from("calendar_closures")
    .select("id,date,name,scope,source,closes_delivery,closes_local,enabled")
    .eq("enabled", true);
  let exceptionQuery = supabase
    .from("schedule_exceptions")
    .select("id,date,channel,company_id,mode,open_time,close_time,service_start_time,service_end_time,menu_guarantee_cutoff");

  if (options.date) {
    closureQuery = closureQuery.eq("date", options.date);
    exceptionQuery = exceptionQuery.eq("date", options.date);
  }

  const [closureResult, exceptionResult] = await Promise.all([closureQuery, exceptionQuery]);

  if (closureResult.error || exceptionResult.error) {
    return { closures: [], exceptions: [], available: false };
  }

  return {
    closures: (closureResult.data ?? []) as CalendarClosure[],
    exceptions: (exceptionResult.data ?? [])
      .filter((row) => {
        const companyId = (row as ScheduleExceptionRow).company_id ?? null;
        return companyId === null || companyId === (options.companyId ?? null);
      })
      .map((row) => mapException(row as ScheduleExceptionRow))
      .filter((row): row is ScheduleException => Boolean(row)),
    available: true
  };
}
