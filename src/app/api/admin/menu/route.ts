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
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item): DailyMenuCourse | null => {
      if (typeof item === "string") {
        const name = item.trim();

        return name ? name : null;
      }

      if (item && typeof item === "object" && "name" in item) {
        const course = item as { name?: unknown; category?: unknown; excluded_from_half_menu?: unknown };
        const name = String(course.name ?? "").trim();

        if (!name) {
          return null;
        }

        return {
          name,
          category: typeof course.category === "string" && course.category.trim() ? course.category.trim() : null,
          excluded_from_half_menu: Boolean(course.excluded_from_half_menu)
        };
      }

      return null;
    })
    .filter((item): item is DailyMenuCourse => Boolean(item));
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

  if (firstCourses.length !== 4 || secondCourses.length !== 4) {
    return NextResponse.json({ error: "Configura exactamente 4 primeros y 4 segundos." }, { status: 400 });
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
