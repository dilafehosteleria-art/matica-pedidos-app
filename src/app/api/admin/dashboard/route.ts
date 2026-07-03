import { NextRequest, NextResponse } from "next/server";
import { assertAdmin } from "@/lib/admin";
import {
  addDays,
  buildBusinessDashboardStats,
  currentMadridDate,
  dashboardOptions,
  isDateInput,
  madridDateToUtcIso,
  previousPeriod
} from "@/lib/business-dashboard";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Company, CompanyBranch } from "@/lib/types";

export const dynamic = "force-dynamic";

function defaultPeriod() {
  const today = currentMadridDate();

  return {
    from: addDays(today, -29),
    to: today
  };
}

function readPeriod(request: NextRequest) {
  const defaults = defaultPeriod();
  const params = request.nextUrl.searchParams;
  const from = params.get("from");
  const to = params.get("to");

  return {
    from: isDateInput(from) ? from! : defaults.from,
    to: isDateInput(to) ? to! : defaults.to
  };
}

export async function GET(request: NextRequest) {
  const adminError = assertAdmin(request);

  if (adminError) {
    return adminError;
  }

  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return NextResponse.json({ error: "Configura Supabase para usar el dashboard." }, { status: 503 });
  }

  const params = request.nextUrl.searchParams;
  const period = readPeriod(request);
  const normalizedPeriod = period.from <= period.to ? period : { from: period.to, to: period.from };
  const compare = params.get("compare") === "true";
  const comparisonPeriod = compare ? previousPeriod(normalizedPeriod) : null;
  const clientId = params.get("client_id")?.trim() ?? "";
  const companyId = params.get("company_id")?.trim() ?? "";
  const queryEnd = madridDateToUtcIso(addDays(normalizedPeriod.to, 1));
  let ordersQuery = supabase
    .from("orders")
    .select("*,order_items(*),companies(id,name),company_branches(id,name)")
    .lt("created_at", queryEnd)
    .order("created_at", { ascending: true });

  if (clientId) {
    ordersQuery = ordersQuery.eq("company_id", clientId);
  }

  if (companyId) {
    ordersQuery = ordersQuery.eq("company_branch_id", companyId);
  }

  const [companiesResult, branchesResult, ordersResult] = await Promise.all([
    supabase.from("companies").select("*").order("name", { ascending: true }),
    supabase.from("company_branches").select("*").order("name", { ascending: true }),
    ordersQuery
  ]);

  if (companiesResult.error || branchesResult.error || ordersResult.error) {
    return NextResponse.json(
      {
        error:
          companiesResult.error?.message ??
          branchesResult.error?.message ??
          ordersResult.error?.message ??
          "No se pudo cargar el dashboard."
      },
      { status: 400 }
    );
  }

  const companies = (companiesResult.data ?? []) as Company[];
  const branches = (branchesResult.data ?? []) as CompanyBranch[];
  const orders = (ordersResult.data as Parameters<typeof buildBusinessDashboardStats>[0]["orders"] | null) ?? [];

  return NextResponse.json({
    filters: {
      from: normalizedPeriod.from,
      to: normalizedPeriod.to,
      clientId,
      companyId,
      compare
    },
    options: dashboardOptions(companies, branches),
    ...buildBusinessDashboardStats({
      orders,
      period: normalizedPeriod,
      comparisonPeriod,
      clientId,
      companyId
    })
  });
}
