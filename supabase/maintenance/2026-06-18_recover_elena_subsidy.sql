begin;

with invalid_attempts as (
  select id
  from public.orders
  where lower(customer_email) = 'elenasara.blanco@bureauveritas.com'
    and (created_at at time zone 'Europe/Madrid')::date = date '2026-06-18'
    and status in ('pendiente_pago', 'cancelado')
    and payment_status is distinct from 'paid'
)
update public.orders as orders
set
  status = 'cancelado',
  status_updated_at = now(),
  payment_status = case
    when orders.payment_status = 'failed' then 'failed'
    else 'cancelled'
  end,
  notes = concat_ws(
    E'\n',
    nullif(orders.notes, ''),
    'Recuperacion incidencia subvencion Stripe 2026-06-18: intento no pagado cancelado.'
  )
from invalid_attempts
where orders.id = invalid_attempts.id
returning
  orders.id,
  orders.created_at,
  orders.status,
  orders.payment_status,
  orders.subsidy_total,
  orders.total;

commit;
