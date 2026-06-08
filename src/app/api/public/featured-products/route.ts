import { publicJson } from "@/lib/public-cache";
import { getPublicFeaturedProducts } from "@/lib/public-data";

export const revalidate = 60;

export async function GET() {
  return publicJson({ products: await getPublicFeaturedProducts() });
}
