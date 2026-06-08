import { publicJson } from "@/lib/public-cache";
import { getPublicCompanies } from "@/lib/public-data";

export const dynamic = "force-dynamic";

export async function GET() {
  return publicJson({ companies: await getPublicCompanies() });
}
