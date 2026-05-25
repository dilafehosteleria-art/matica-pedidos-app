import { NextResponse } from "next/server";
import { getPublicCompanies } from "@/lib/public-data";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ companies: await getPublicCompanies() });
}
