alter table public.orders
add column if not exists delivery_notice_sent_at timestamptz null;

create index if not exists orders_delivery_notice_pending_idx
on public.orders(created_at, company_id)
where status = 'preparando'
  and delivery_notice_sent_at is null;
