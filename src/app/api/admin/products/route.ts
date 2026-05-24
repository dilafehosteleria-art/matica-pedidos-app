import { NextRequest, NextResponse } from "next/server";
import { assertAdmin } from "@/lib/admin";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { ProductDraft } from "@/lib/types";

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

  const [categories, products] = await Promise.all([
    supabase.from("categories").select("*").order("sort_order", { ascending: true }),
    supabase.from("products").select("*").order("sort_order", { ascending: true })
  ]);

  if (categories.error || products.error) {
    return NextResponse.json(
      { error: categories.error?.message ?? products.error?.message },
      { status: 400 }
    );
  }

  return NextResponse.json({ categories: categories.data ?? [], products: products.data ?? [] });
}

export async function PATCH(request: NextRequest) {
  const adminError = assertAdmin(request);

  if (adminError) {
    return adminError;
  }

  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return NextResponse.json({ error: "Configura Supabase para usar el panel." }, { status: 503 });
  }

  const body = (await request.json()) as ProductDraft;

  if (!body.id) {
    return NextResponse.json({ error: "Producto requerido." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("products")
    .update({
      active: body.active,
      sold_out: body.sold_out,
      base_price: Number(body.base_price),
      customer_price: Number(body.customer_price),
      description: body.description
    })
    .eq("id", body.id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ product: data });
}
