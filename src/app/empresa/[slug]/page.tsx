import { BureauVeritasOrderApp } from "@/components/public/BureauVeritasOrderApp";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pedido empresa | Matica Fresh Food",
  description: "Carta corporativa de Matica Fresh Food."
};

export default async function CompanyOrderPage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return <BureauVeritasOrderApp companySlug={slug} />;
}
