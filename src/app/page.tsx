import { CompanyLanding } from "@/components/public/CompanyLanding";
import { getPublicCompanies } from "@/lib/public-data";

export default async function HomePage() {
  const companies = await getPublicCompanies();

  return <CompanyLanding companies={companies} />;
}
