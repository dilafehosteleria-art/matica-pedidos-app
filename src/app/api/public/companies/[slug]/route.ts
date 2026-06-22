import { NextResponse } from "next/server";
import { getPublicCompanyData } from "@/lib/public-data";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;
  const data = await getPublicCompanyData(slug);

  if (!data) {
    return NextResponse.json({ error: "Empresa no encontrada." }, { status: 404 });
  }

  return NextResponse.json(data, {
    headers: {
      "Cache-Control": "no-store"
    }
  });
}
