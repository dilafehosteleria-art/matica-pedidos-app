import { BureauVeritasOrderApp } from "@/components/public/BureauVeritasOrderApp";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Bureau Veritas | Matica Fresh Food",
  description: "Pedidos corporativos de Matica Fresh Food para empleados de Bureau Veritas."
};

export default function BureauVeritasPage() {
  return <BureauVeritasOrderApp />;
}
