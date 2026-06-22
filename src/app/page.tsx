import { CompanyLanding } from "@/components/public/CompanyLanding";
import { getGlobalSchedule } from "@/lib/global-settings";
import { getPublicCompanies, getPublicFeaturedProducts } from "@/lib/public-data";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [companies, featuredProducts, schedule] = await Promise.all([
    getPublicCompanies(),
    getPublicFeaturedProducts(),
    getGlobalSchedule()
  ]);

  return <CompanyLanding companies={companies} featuredProducts={featuredProducts} schedule={schedule} />;
}
