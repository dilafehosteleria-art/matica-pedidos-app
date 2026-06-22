alter table public.companies
add column if not exists delivery_address text;

create table if not exists public.app_settings (
  id text primary key default 'global',
  active boolean not null default true,
  active_days smallint[] not null default array[1, 2, 3, 4, 5]::smallint[],
  order_open_time time not null default time '09:30',
  order_close_time time not null default time '12:40',
  delivery_start_time time not null default time '13:00',
  delivery_end_time time not null default time '13:30',
  updated_at timestamptz not null default now(),
  constraint app_settings_singleton check (id = 'global'),
  constraint app_settings_active_days check (
    active_days <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]
  ),
  constraint app_settings_order_times check (order_open_time < order_close_time),
  constraint app_settings_delivery_times check (delivery_start_time < delivery_end_time)
);

insert into public.app_settings (
  id,
  active,
  active_days,
  order_open_time,
  order_close_time,
  delivery_start_time,
  delivery_end_time
)
values (
  'global',
  true,
  array[1, 2, 3, 4, 5]::smallint[],
  time '09:30',
  time '12:40',
  time '13:00',
  time '13:30'
)
on conflict (id) do nothing;

create or replace function public.is_b2b_order_window_open()
returns boolean
language sql
stable
as $$
  select coalesce(settings.active, true)
    and extract(isodow from (now() at time zone 'Europe/Madrid'))::smallint = any(
      coalesce(settings.active_days, array[1, 2, 3, 4, 5]::smallint[])
    )
    and ((now() at time zone 'Europe/Madrid')::time >= coalesce(settings.order_open_time, time '09:30'))
    and ((now() at time zone 'Europe/Madrid')::time < coalesce(settings.order_close_time, time '12:40'))
  from (
    select *
    from public.app_settings
    where id = 'global'
    union all
    select
      'global',
      true,
      array[1, 2, 3, 4, 5]::smallint[],
      time '09:30',
      time '12:40',
      time '13:00',
      time '13:30',
      now()
    where not exists (select 1 from public.app_settings where id = 'global')
    limit 1
  ) settings;
$$;

alter table public.app_settings enable row level security;

drop policy if exists "Public read global settings" on public.app_settings;
create policy "Public read global settings"
on public.app_settings for select
using (id = 'global');

grant select on public.app_settings to anon, authenticated;
