import {
  formatCompanyDisplayName,
  formatOrderDateTime,
  formatThermalCurrency,
  metadataEntryValues,
  ORDER_STATUS_LABELS,
  orderCompanyInvoiceTotal,
  orderEmployeeTotal,
  orderItemOptionLines,
  orderReference,
  thermalPaymentLabel,
  thermalTicketText
} from "@/lib/order-ticket";
import type { AdminOrder } from "@/lib/types";

type ThermalTicketProps = {
  className?: string;
  order: AdminOrder;
};

export function ThermalTicket({ className = "hidden print:block thermal-ticket", order }: ThermalTicketProps) {
  const companyName = order.companies?.name ?? "Cliente principal";
  const branchName = formatCompanyDisplayName(order.company_branches?.name ?? "Sin empresa interna");

  return (
    <section className={className}>
      <header className="ticket-center">
        <h1 className="ticket-primary-client">{thermalTicketText(companyName).toUpperCase()}</h1>
      </header>
      <div className="ticket-separator" />
      <p className="ticket-highlight">REF: {orderReference(order.id)}</p>
      <p>FECHA: {formatOrderDateTime(order.created_at)}</p>
      <p>CLIENTE: {thermalTicketText(order.customer_name)}</p>
      <div className="ticket-field-block">
        <p className="ticket-field-label">EMPRESA</p>
        <p className="ticket-field-value">&gt; {thermalTicketText(branchName)}</p>
      </div>
      {order.companies?.delivery_address ? (
        <div className="ticket-field-block">
          <p className="ticket-field-label">DIRECCION</p>
          <p className="ticket-field-value">&gt; {thermalTicketText(order.companies.delivery_address)}</p>
        </div>
      ) : null}
      <div className="ticket-separator" />
      <p className="ticket-section-title">PRODUCTOS</p>
      {order.order_items.map((item) => (
        <div key={item.id} className="ticket-item">
          <div className="ticket-item-main">
            <span>{item.quantity}x</span>
            <span className="ticket-item-name">{thermalTicketText(item.name)}</span>
            <span className="ticket-item-price">{formatThermalCurrency(Number(item.total_price))}</span>
          </div>
          {orderItemOptionLines(item.metadata).map((entry) => (
            <div key={`${item.id}-${entry.key}`} className="ticket-option-block">
              <p className="ticket-option-label">{thermalTicketText(entry.label).toUpperCase()}</p>
              {metadataEntryValues(entry).map((value) => (
                <p key={`${item.id}-${entry.key}-${value}`} className="ticket-option">
                  &gt; {entry.key === "cutlery" ? thermalTicketText(value).toUpperCase() : thermalTicketText(value)}
                </p>
              ))}
            </div>
          ))}
        </div>
      ))}
      {order.notes ? (
        <>
          <div className="ticket-separator" />
          <p className="ticket-note">OBSERVACIONES: {thermalTicketText(order.notes)}</p>
        </>
      ) : null}
      <div className="ticket-separator" />
      <div className="ticket-total"><span>Subtotal</span><span>{formatThermalCurrency(Number(order.subtotal))}</span></div>
      <div className="ticket-total"><span>Subvencion</span><span>-{formatThermalCurrency(Number(order.subsidy_total))}</span></div>
      <div className="ticket-total"><span>Factura empresa</span><span>{formatThermalCurrency(orderCompanyInvoiceTotal(order))}</span></div>
      <div className="ticket-total ticket-total-strong"><span>Total empleado</span><span>{formatThermalCurrency(orderEmployeeTotal(order))}</span></div>
      <div className="ticket-separator" />
      <p className="ticket-highlight">ESTADO DE PAGO:</p>
      <p className="ticket-payment-status">{thermalTicketText(thermalPaymentLabel(order)).toUpperCase()}</p>
      <p>ESTADO PEDIDO: {thermalTicketText(ORDER_STATUS_LABELS[order.status])}</p>
      <div className="ticket-separator" />
      <p className="ticket-center">Gracias por confiar en Matica.</p>
    </section>
  );
}
