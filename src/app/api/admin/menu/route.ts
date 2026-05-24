import { NextRequest, NextResponse } from "next/server";
import { assertAdmin } from "@/lib/admin";
import { toDateInputValue } from "@/lib/format";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

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
    first_courses?: string[];
    second_courses?: string[];
    drinks?: string[];
    desserts?: string[];
    active?: boolean;
  };

  if (!body.date) {
    return NextResponse.json({ error: "Fecha requerida." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("daily_menus")
    .upsert(
      {
        date: body.date,
        first_courses: body.first_courses ?? [],
        second_courses: body.second_courses ?? [],
        drinks: body.drinks ?? [],
        desserts: body.desserts ?? [],
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
