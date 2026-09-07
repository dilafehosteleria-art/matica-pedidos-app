import type { CartItem } from "./types";

export type CartPriceUpdate = { product_id: string; unit_price: number };

export function applyCartPriceUpdate(cart: CartItem[], updates: CartPriceUpdate[]): CartItem[] | null {
  if (!Array.isArray(updates) || updates.length !== cart.length || updates.some((update, index) =>
    !update || update.product_id !== cart[index].product_id || !Number.isFinite(update.unit_price) || update.unit_price <= 0
  )) return null;
  return cart.map((item, index) => {
    const unitPrice = updates[index].unit_price;
    return { ...item, base_price: unitPrice, customer_price: unitPrice,
      metadata: { ...item.metadata, _configured_unit_price: unitPrice.toFixed(2) } };
  });
}
