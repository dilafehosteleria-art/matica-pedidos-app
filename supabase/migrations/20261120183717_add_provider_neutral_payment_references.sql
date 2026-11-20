alter table public.orders
add column if not exists payment_checkout_id text,
add column if not exists payment_transaction_id text,
add column if not exists payment_notification_sent_at timestamptz,
add column if not exists payment_notification_claimed_at timestamptz;

comment on column public.orders.payment_checkout_id is
  'Checkout identifier from payment_provider. Stripe-specific historical columns remain for compatibility.';

comment on column public.orders.payment_transaction_id is
  'Successful transaction identifier from payment_provider. Stripe-specific historical columns remain for compatibility.';

comment on column public.orders.payment_notification_sent_at is
  'Timestamp of the successful Matica notification for a confirmed online payment.';

comment on column public.orders.payment_notification_claimed_at is
  'Short-lived claim used to prevent concurrent payment notifications. Stale claims may be retried.';

update public.orders
set
  payment_provider = coalesce(payment_provider, 'stripe'),
  payment_checkout_id = coalesce(payment_checkout_id, stripe_checkout_session_id),
  payment_transaction_id = coalesce(payment_transaction_id, stripe_payment_intent_id)
where
  stripe_checkout_session_id is not null
  or stripe_payment_intent_id is not null;

create unique index if not exists idx_orders_provider_checkout_id
on public.orders(payment_provider, payment_checkout_id)
where payment_provider is not null and payment_checkout_id is not null;

create unique index if not exists idx_orders_provider_transaction_id
on public.orders(payment_provider, payment_transaction_id)
where payment_provider is not null and payment_transaction_id is not null;
