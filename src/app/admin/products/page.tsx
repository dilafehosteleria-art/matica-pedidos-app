import { AdminProductsClient } from "@/components/admin/AdminProductsClient";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Productos | Admin Matica",
  description: "Gestión interna de productos, precios y disponibilidad."
};

export default function AdminProductsPage() {
  return <AdminProductsClient />;
}
