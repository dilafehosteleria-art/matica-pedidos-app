import { CompanyLanding } from "@/components/public/CompanyLanding";
import { buildPublicCatalogSections } from "@/lib/catalog";
import { getPublicCompanies, getPublicCompanyData } from "@/lib/public-data";

const LANDING_FEATURED_PRODUCT_IDS = [
  "e0cc5cbb-9170-4df3-a07a-8d8a76fa36d3",
  "fe6a9ab8-f7a4-4f29-9606-3a4213816eb5",
  "55cae0d1-1d44-4dcb-96fb-a1dc05c74511",
  "508060cf-b36f-4ae5-92bd-989954034da3"
];

export default async function HomePage() {
  const [companies, bureauVeritasData] = await Promise.all([
    getPublicCompanies(),
    getPublicCompanyData("bureau-veritas")
  ]);
  const catalogSections = bureauVeritasData
    ? buildPublicCatalogSections(bureauVeritasData.categories, bureauVeritasData.products)
    : [];
  const productsById = new Map(
    catalogSections
      .flatMap((section) => section.products)
      .filter((product) => product.active && !product.sold_out)
      .map((product) => [product.id, product])
  );
  const featuredProducts = LANDING_FEATURED_PRODUCT_IDS.flatMap((productId) => {
    const product = productsById.get(productId);

    return product ? [product] : [];
  });

  return <CompanyLanding companies={companies} featuredProducts={featuredProducts} />;
}
