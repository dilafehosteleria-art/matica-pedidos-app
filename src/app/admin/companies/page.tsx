import { AdminCompaniesClient } from "@/components/admin/AdminCompaniesClient";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Empresas | Matica B2B Orders"
};

export default function AdminCompaniesPage() {
  return <AdminCompaniesClient />;
}
