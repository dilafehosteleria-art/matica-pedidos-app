alter table public.companies
add column if not exists local_ordering_enabled boolean not null default false,
add column if not exists local_order_days smallint[] not null default array[1, 2, 3, 4, 5]::smallint[],
add column if not exists local_ordering_open_time time not null default time '09:30',
add column if not exists local_ordering_close_time time not null default time '15:00',
add column if not exists local_ordering_guarantee_cutoff time not null default time '13:30',
add column if not exists local_orders_closed_on date,
add column if not exists local_only_days smallint[] not null default '{}'::smallint[];

alter table public.companies
add constraint companies_local_order_days_check
check (
  cardinality(local_order_days) > 0
  and local_order_days <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]
),
add constraint companies_local_only_days_check
check (
  local_only_days <@ local_order_days
),
add constraint companies_local_ordering_times_check
check (
  local_ordering_open_time < local_ordering_guarantee_cutoff
  and local_ordering_guarantee_cutoff < local_ordering_close_time
);

update public.companies
set
  local_ordering_enabled = true,
  local_order_days = array[1, 2, 3, 4, 5]::smallint[],
  local_ordering_open_time = time '09:30',
  local_ordering_close_time = time '15:00',
  local_ordering_guarantee_cutoff = time '13:30',
  local_orders_closed_on = null,
  local_only_days = array[5]::smallint[]
where slug = 'bureau-veritas';

alter table public.orders
add column if not exists fulfillment_type text not null default 'delivery',
add column if not exists requested_time time,
add column if not exists menu_selection_mode text not null default 'confirmed';

alter table public.orders
add constraint orders_fulfillment_type_check
check (fulfillment_type in ('delivery', 'dine_in', 'pickup')),
add constraint orders_menu_selection_mode_check
check (menu_selection_mode in ('confirmed', 'on_arrival')),
add constraint orders_requested_time_matches_fulfillment_check
check (
  (fulfillment_type = 'delivery' and requested_time is null)
  or (fulfillment_type in ('dine_in', 'pickup') and requested_time is not null)
),
add constraint orders_on_arrival_requires_local_fulfillment_check
check (
  menu_selection_mode <> 'on_arrival'
  or fulfillment_type in ('dine_in', 'pickup')
);

create index if not exists orders_fulfillment_created_idx
on public.orders(fulfillment_type, created_at desc);

comment on column public.companies.local_ordering_enabled is
  'Permite pedidos para comer o recoger en el local.';
comment on column public.companies.local_order_days is
  'Dias ISO (1=lunes, 7=domingo) en los que se aceptan pedidos en el local.';
comment on column public.companies.local_ordering_guarantee_cutoff is
  'A partir de esta hora la eleccion de platos deja de estar garantizada.';
comment on column public.companies.local_orders_closed_on is
  'Fecha Europe/Madrid cerrada manualmente para pedidos en el local; al dia siguiente se reabre.';
comment on column public.companies.local_only_days is
  'Dias ISO en los que la empresa solo admite pedidos para comer o recoger en el local.';
comment on column public.orders.fulfillment_type is
  'Modalidad del pedido: entrega, comer en el local o recoger en el local.';
comment on column public.orders.requested_time is
  'Hora local solicitada para comer o recoger; nula cuando no corresponde.';
comment on column public.orders.menu_selection_mode is
  'confirmed conserva los platos elegidos; on_arrival los decide en el local segun disponibilidad.';
