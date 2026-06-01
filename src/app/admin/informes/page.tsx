import { AdminReportsClient } from "@/components/admin/AdminDashboardClient";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Informes | Admin Matica",
  description: "Informes de facturación por rango, cliente y empresa interna."
};

export default function AdminReportsPage() {
  return <AdminReportsClient />;
}
