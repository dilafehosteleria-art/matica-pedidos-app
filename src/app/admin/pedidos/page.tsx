import { AdminOrdersClient } from "@/components/admin/AdminDashboardClient";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pedidos | Admin Matica",
  description: "Operativa diaria de pedidos corporativos de Matica Fresh Food."
};

export default function AdminOrdersPage() {
  return <AdminOrdersClient />;
}
