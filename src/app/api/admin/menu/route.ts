import { NextRequest, NextResponse } from "next/server";
import { assertAdmin } from "@/lib/admin";
import { toDateInputValue } from "@/lib/format";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { DailyMenuCourse } from "@/lib/types";

export const dynamic = "force-dynamic";

function sanitizeList(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [];
}

function sanitizeSecondCourses(value: unknown): DailyMenuCourse[] {
  return Array.isArray(value)
    ? value
        .map((item) => typeof item === "string" ? item.trim() : String((item as { name?: unknown })?.name ?? "").trim())
        .filter(Boolean)
    : [];
}

export async function GET(request: NextRequest) {
  const adminError = assertAdmin(request);

  if (adminError) {
    return adminError;
  }

  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return NextResponse.json({ error: "Configura Supabase para usar el panel." }, { status: 503 });
  }

  const date = request.nextUrl.searchParams.get("date") ?? toDateInputValue();
  const { data, error } = await supabase
    .from("daily_menus")
    .select("*")
    .eq("date", date)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({
    menu:
      data ?? {
        id: null,
        date,
        first_courses: [],
        second_courses: [],
        drinks: [],
        desserts: [],
        active: true
      }
  });
}

export async function PUT(request: NextRequest) {
  const adminError = assertAdmin(request);

  if (adminError) {
    return adminError;
  }

  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return NextResponse.json({ error: "Configura Supabase para usar el panel." }, { status: 503 });
  }

  const body = (await request.json()) as {
    date?: string;
    first_courses?: unknown;
    second_courses?: unknown;
    drinks?: unknown;
    desserts?: unknown;
    active?: boolean;
  };

  if (!body.date) {
    return NextResponse.json({ error: "Fecha requerida." }, { status: 400 });
  }

  const firstCourses = sanitizeList(body.first_courses);
  const secondCourses = sanitizeSecondCourses(body.second_courses);

  if (firstCourses.length !== 4 || secondCourses.length !== 3) {
    return NextResponse.json({ error: "Configura exactamente 4 primeros y 3 segundos." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("daily_menus")
    .upsert(
      {
        date: body.date,
        first_courses: firstCourses,
        second_courses: secondCourses,
        drinks: sanitizeList(body.drinks),
        desserts: sanitizeList(body.desserts),
        active: body.active ?? true
      },
      { onConflict: "date" }
    )
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ menu: data });
}
