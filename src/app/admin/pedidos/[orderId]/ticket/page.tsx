import { AdminTicketPrintClient } from "@/components/admin/AdminTicketPrintClient";

export const dynamic = "force-dynamic";

export default async function AdminOrderTicketPage({
  params
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;

  return <AdminTicketPrintClient orderId={orderId} />;
}
