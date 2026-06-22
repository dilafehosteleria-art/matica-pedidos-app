import { AdminSettingsClient } from "@/components/admin/AdminSettingsClient";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Configuración | Matica B2B Orders"
};

export default function AdminSettingsPage() {
  return <AdminSettingsClient />;
}
