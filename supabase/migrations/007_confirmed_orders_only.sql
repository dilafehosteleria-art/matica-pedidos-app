create index if not exists idx_orders_company_email_payment_created
on public.orders(company_id, customer_email, payment_status, created_at);

create or replace function public.submit_b2b_order(order_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'submit_b2b_order esta deshabilitada: usa /api/orders para crear pedidos con confirmacion de pago.';
end;
$$;
