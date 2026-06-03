alter table public.companies
add column if not exists allow_pay_on_delivery boolean not null default true,
add column if not exists allow_card_payment boolean not null default false,
add column if not exists allow_bizum_payment boolean not null default false;

update public.companies
set
  allow_pay_on_delivery = true,
  allow_card_payment = false,
  allow_bizum_payment = false
where slug = 'bureau-veritas';

alter table public.orders
add column if not exists payment_method text not null default 'pay_on_delivery',
add column if not exists payment_status text not null default 'pending',
add column if not exists payment_provider text,
add column if not exists stripe_checkout_session_id text,
add column if not exists stripe_payment_intent_id text,
add column if not exists paid_at timestamptz;

create index if not exists idx_orders_stripe_checkout_session_id
on public.orders(stripe_checkout_session_id);

create index if not exists idx_orders_payment_status
on public.orders(payment_status);
