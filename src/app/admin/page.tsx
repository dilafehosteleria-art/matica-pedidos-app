import { AdminDashboardClient } from "@/components/admin/AdminDashboardClient";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin | Matica B2B Orders",
  description: "Panel interno de gestión de pedidos corporativos de Matica Fresh Food."
};

export default function AdminPage() {
  return <AdminDashboardClient />;
}
