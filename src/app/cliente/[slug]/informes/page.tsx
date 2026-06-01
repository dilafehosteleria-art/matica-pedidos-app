import { ClientReportsPortal } from "@/components/public/ClientReportsPortal";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Informes cliente | Matica Fresh Food",
  description: "Portal de informes de facturación para clientes de Matica Fresh Food."
};

export default async function ClientReportsPage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return <ClientReportsPortal companySlug={slug} />;
}
