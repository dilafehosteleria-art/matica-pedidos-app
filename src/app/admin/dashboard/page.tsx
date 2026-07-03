import { AdminBusinessDashboardClient } from "@/components/admin/AdminBusinessDashboardClient";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dashboard | Admin Matica",
  description: "Dashboard interno de negocio para administradores de Matica B2B."
};

export default function AdminBusinessDashboardPage() {
  return <AdminBusinessDashboardClient />;
}
