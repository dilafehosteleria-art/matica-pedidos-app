import { AdminMenuClient } from "@/components/admin/AdminMenuClient";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Menú del día | Admin Matica",
  description: "Edición interna del menú diario de Matica Fresh Food."
};

export default function AdminMenuPage() {
  return <AdminMenuClient />;
}
