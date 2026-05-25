export type PaymentPlaceholder = {
  provider: "adyen";
  enabled: false;
  order_id: string;
  amount: number;
  status: "placeholder";
};

export function shouldRequireOnlinePayment() {
  return false;
}

export function createPaymentPlaceholder(orderId: string, amount: number): PaymentPlaceholder {
  return {
    provider: "adyen",
    enabled: false,
    order_id: orderId,
    amount,
    status: "placeholder"
  };
}
