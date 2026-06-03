import { CompanyLanding } from "@/components/public/CompanyLanding";
import { buildPublicCatalogSections } from "@/lib/catalog";
import { getPublicCompanies, getPublicCompanyData } from "@/lib/public-data";

export default async function HomePage() {
  const [companies, bureauVeritasData] = await Promise.all([
    getPublicCompanies(),
    getPublicCompanyData("bureau-veritas")
  ]);
  const catalogSections = bureauVeritasData
    ? buildPublicCatalogSections(bureauVeritasData.categories, bureauVeritasData.products)
    : [];
  const featuredProducts = catalogSections
    .flatMap((section) => section.products)
    .filter((product) => product.active && !product.sold_out)
    .filter((product, index, products) => products.findIndex((item) => item.id === product.id) === index)
    .slice(0, 6);

  return <CompanyLanding companies={companies} featuredProducts={featuredProducts} />;
}
