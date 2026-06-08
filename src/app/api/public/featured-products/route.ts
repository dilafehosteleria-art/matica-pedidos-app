import { publicJson } from "@/lib/public-cache";
import { getPublicFeaturedProducts } from "@/lib/public-data";

export const dynamic = "force-dynamic";

export async function GET() {
  return publicJson({ products: await getPublicFeaturedProducts() });
}
