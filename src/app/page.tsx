import { CompanyLanding } from "@/components/public/CompanyLanding";
import { getPublicCompanies, getPublicFeaturedProducts } from "@/lib/public-data";

export default async function HomePage() {
  const [companies, featuredProducts] = await Promise.all([
    getPublicCompanies(),
    getPublicFeaturedProducts()
  ]);

  return <CompanyLanding companies={companies} featuredProducts={featuredProducts} />;
}
