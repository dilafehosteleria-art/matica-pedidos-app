import { NextResponse } from "next/server";
import { publicJson } from "@/lib/public-cache";
import { getPublicCompanyData } from "@/lib/public-data";

export const revalidate = 60;

export async function GET() {
  const data = await getPublicCompanyData("bureau-veritas");

  if (!data) {
    return NextResponse.json({ error: "Empresa no encontrada." }, { status: 404 });
  }

  return publicJson(data);
}
