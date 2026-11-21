create table if not exists public.calendar_closures (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  name text not null,
  scope text not null check (scope in ('national', 'regional', 'local', 'special')),
  source text not null check (source in ('official', 'manual')),
  source_url text,
  closes_delivery boolean not null default true,
  closes_local boolean not null default true,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_closures_date_scope_name_unique unique (date, scope, name),
  constraint calendar_closures_has_target check (closes_delivery or closes_local)
);

create table if not exists public.schedule_exceptions (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  channel text not null check (channel in ('delivery', 'local')),
  company_id uuid references public.companies(id) on delete cascade,
  mode text not null check (mode in ('closed', 'custom_hours')),
  open_time time,
  close_time time,
  service_start_time time,
  service_end_time time,
  menu_guarantee_cutoff time,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint schedule_exceptions_local_company check (
    channel <> 'local' or company_id is not null
  ),
  constraint schedule_exceptions_mode_times check (
    (
      mode = 'closed'
      and open_time is null
      and close_time is null
      and service_start_time is null
      and service_end_time is null
      and menu_guarantee_cutoff is null
    )
    or
    (
      mode = 'custom_hours'
      and open_time is not null
      and close_time is not null
      and open_time < close_time
    )
  ),
  constraint schedule_exceptions_service_times check (
    (service_start_time is null and service_end_time is null)
    or
    (
      channel = 'delivery'
      and mode = 'custom_hours'
      and service_start_time is not null
      and service_end_time is not null
      and service_start_time < service_end_time
    )
  ),
  constraint schedule_exceptions_menu_cutoff check (
    menu_guarantee_cutoff is null
    or
    (
      channel = 'local'
      and mode = 'custom_hours'
      and menu_guarantee_cutoff > open_time
      and menu_guarantee_cutoff < close_time
    )
  )
);

create index if not exists calendar_closures_date_enabled_idx
on public.calendar_closures(date, enabled);

create index if not exists schedule_exceptions_date_channel_idx
on public.schedule_exceptions(date, channel);

create unique index if not exists schedule_exceptions_global_date_channel_unique
on public.schedule_exceptions(date, channel)
where company_id is null;

create unique index if not exists schedule_exceptions_company_date_channel_unique
on public.schedule_exceptions(date, channel, company_id)
where company_id is not null;

create or replace function public.set_scheduling_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.set_scheduling_updated_at() from public, anon, authenticated;

drop trigger if exists calendar_closures_updated_at_trigger on public.calendar_closures;
create trigger calendar_closures_updated_at_trigger
before update on public.calendar_closures
for each row execute function public.set_scheduling_updated_at();

drop trigger if exists schedule_exceptions_updated_at_trigger on public.schedule_exceptions;
create trigger schedule_exceptions_updated_at_trigger
before update on public.schedule_exceptions
for each row execute function public.set_scheduling_updated_at();

alter table public.calendar_closures enable row level security;
alter table public.schedule_exceptions enable row level security;

revoke all on public.calendar_closures from anon, authenticated;
revoke all on public.schedule_exceptions from anon, authenticated;
grant select on public.calendar_closures to anon, authenticated;
grant select (
  id,
  date,
  channel,
  company_id,
  mode,
  open_time,
  close_time,
  service_start_time,
  service_end_time,
  menu_guarantee_cutoff
) on public.schedule_exceptions to anon, authenticated;
grant all on public.calendar_closures to service_role;
grant all on public.schedule_exceptions to service_role;

drop policy if exists "Public read enabled calendar closures" on public.calendar_closures;
create policy "Public read enabled calendar closures"
on public.calendar_closures for select
to anon, authenticated
using (enabled);

drop policy if exists "Public read current schedule exceptions" on public.schedule_exceptions;
create policy "Public read current schedule exceptions"
on public.schedule_exceptions for select
to anon, authenticated
using (date >= ((now() at time zone 'Europe/Madrid')::date - 1));

insert into public.schedule_exceptions (
  date,
  channel,
  company_id,
  mode,
  reason
)
select
  companies.local_orders_closed_on,
  'local',
  companies.id,
  'closed',
  'Cierre local migrado desde la configuración anterior'
from public.companies
where companies.local_orders_closed_on is not null
on conflict do nothing;

update public.companies
set local_orders_closed_on = null
where local_orders_closed_on is not null;

comment on table public.calendar_closures is
  'Festivos oficiales de Madrid y cierres especiales aplicables a delivery y pedidos locales.';
comment on table public.schedule_exceptions is
  'Aperturas, horarios especiales o cierres puntuales por fecha y canal.';
comment on column public.schedule_exceptions.service_start_time is
  'Inicio puntual de la franja de reparto; solo se usa en delivery.';
comment on column public.schedule_exceptions.service_end_time is
  'Fin puntual de la franja de reparto; solo se usa en delivery.';
comment on column public.schedule_exceptions.menu_guarantee_cutoff is
  'Hora puntual hasta la que se garantiza la selección del menú en pedidos locales.';

with official_sources(year, source_url) as (
  values
    (
      2026,
      'https://www.madrid.es/portales/munimadrid/es/Inicio/Actividad-economica-y-hacienda/Empresa-y-comercio/Gestiones-y-tramites/Calendario-oficial-laboral-y-de-dias-inhabiles-y-festivos-2026-para-Madrid/?vgnextchannel=b42c6d5ef88fe410VgnVCM1000000b205a0aRCRD&vgnextfmt=default&vgnextoid=b59770d1c3589910VgnVCM100000891ecb1aRCRD'
    ),
    (
      2027,
      'https://www.madrid.es/portales/munimadrid/es/Inicio/Actividad-economica-y-hacienda/Empresa-y-comercio/Direcciones-y-telefonos/Calendario-oficial-laboral-y-de-dias-inhabiles-y-festivos-2027-para-Madrid/?vgnextchannel=ed0c6d5ef88fe410VgnVCM1000000b205a0aRCRD&vgnextoid=f67c646ba5011a10VgnVCM100000891ecb1aRCRD'
    )
),
official_holidays(date, name, scope, year) as (
  values
    (date '2026-01-01', 'Año Nuevo', 'national', 2026),
    (date '2026-01-06', 'Epifanía del Señor', 'national', 2026),
    (date '2026-04-02', 'Jueves Santo', 'regional', 2026),
    (date '2026-04-03', 'Viernes Santo', 'national', 2026),
    (date '2026-05-01', 'Fiesta del Trabajo', 'national', 2026),
    (date '2026-05-02', 'Fiesta de la Comunidad de Madrid', 'regional', 2026),
    (date '2026-05-15', 'San Isidro Labrador', 'local', 2026),
    (date '2026-08-15', 'Asunción de la Virgen', 'national', 2026),
    (date '2026-10-12', 'Fiesta Nacional de España', 'national', 2026),
    (date '2026-11-02', 'Traslado de Todos los Santos', 'regional', 2026),
    (date '2026-11-09', 'Nuestra Señora de la Almudena', 'local', 2026),
    (date '2026-12-07', 'Traslado del Día de la Constitución Española', 'regional', 2026),
    (date '2026-12-08', 'Día de la Inmaculada Concepción', 'national', 2026),
    (date '2026-12-25', 'Natividad del Señor', 'national', 2026),
    (date '2027-01-01', 'Año Nuevo', 'national', 2027),
    (date '2027-01-06', 'Epifanía del Señor', 'national', 2027),
    (date '2027-03-19', 'San José', 'regional', 2027),
    (date '2027-03-25', 'Jueves Santo', 'regional', 2027),
    (date '2027-03-26', 'Viernes Santo', 'national', 2027),
    (date '2027-05-01', 'Fiesta del Trabajo', 'national', 2027),
    (date '2027-05-15', 'San Isidro Labrador', 'local', 2027),
    (date '2027-08-16', 'Traslado de la Asunción de la Virgen', 'regional', 2027),
    (date '2027-10-12', 'Fiesta Nacional de España', 'national', 2027),
    (date '2027-11-01', 'Día de Todos los Santos', 'national', 2027),
    (date '2027-11-09', 'Nuestra Señora de la Almudena', 'local', 2027),
    (date '2027-12-06', 'Día de la Constitución Española', 'national', 2027),
    (date '2027-12-08', 'Día de la Inmaculada Concepción', 'national', 2027),
    (date '2027-12-25', 'Natividad del Señor', 'national', 2027)
)
insert into public.calendar_closures (
  date,
  name,
  scope,
  source,
  source_url,
  closes_delivery,
  closes_local,
  enabled
)
select
  official_holidays.date,
  official_holidays.name,
  official_holidays.scope,
  'official',
  official_sources.source_url,
  true,
  true,
  true
from official_holidays
join official_sources using (year)
on conflict (date, scope, name) do nothing;
