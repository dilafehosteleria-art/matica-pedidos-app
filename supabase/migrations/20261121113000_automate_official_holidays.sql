create table if not exists public.official_calendar_syncs (
  year integer primary key,
  complete boolean not null default false,
  official_count smallint not null default 0,
  fingerprint text,
  source_url text,
  last_checked_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now(),
  constraint official_calendar_syncs_year_check check (year between 2000 and 2200),
  constraint official_calendar_syncs_count_check check (official_count between 0 and 14),
  constraint official_calendar_syncs_complete_count_check check (not complete or official_count = 14),
  constraint official_calendar_syncs_fingerprint_check check (
    fingerprint is null or fingerprint ~ '^[0-9a-f]{64}$'
  )
);

drop trigger if exists official_calendar_syncs_updated_at_trigger on public.official_calendar_syncs;
create trigger official_calendar_syncs_updated_at_trigger
before update on public.official_calendar_syncs
for each row execute function public.set_scheduling_updated_at();

alter table public.official_calendar_syncs enable row level security;

revoke all on public.official_calendar_syncs from public, anon, authenticated;
grant select (year, complete, official_count) on public.official_calendar_syncs to anon, authenticated;
grant all on public.official_calendar_syncs to service_role;

drop policy if exists "Public reads official calendar readiness" on public.official_calendar_syncs;
create policy "Public reads official calendar readiness"
on public.official_calendar_syncs
for select
to anon, authenticated
using (true);

drop policy if exists "Service role manages official calendar syncs" on public.official_calendar_syncs;
create policy "Service role manages official calendar syncs"
on public.official_calendar_syncs
for all
to service_role
using (true)
with check (true);

comment on table public.official_calendar_syncs is
  'Estado de la sincronizacion automatica del calendario laboral oficial de Madrid por ano.';
comment on column public.official_calendar_syncs.fingerprint is
  'SHA-256 del conjunto canonico de 14 festivos oficiales del ano.';
comment on column public.official_calendar_syncs.last_error is
  'Ultimo fallo de comprobacion; no invalida un calendario completo sincronizado previamente.';

create or replace function public.replace_official_calendar(
  p_year integer,
  p_holidays jsonb,
  p_source_url text,
  p_fingerprint text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_item jsonb;
  v_date date;
  v_now timestamptz := pg_catalog.now();
  v_unique_dates integer;
  v_local_count integer;
  v_national_count integer;
  v_regional_count integer;
  v_existing_count integer;
  v_matching_count integer;
  v_existing_fingerprint text;
begin
  if p_year is null or p_year < 2000 or p_year > 2200 then
    raise exception using
      errcode = '22023',
      message = 'El ano del calendario oficial no es valido.';
  end if;

  if pg_catalog.jsonb_typeof(p_holidays) is distinct from 'array' then
    raise exception using
      errcode = '22023',
      message = 'Los festivos oficiales deben enviarse como una lista.';
  end if;

  if pg_catalog.jsonb_array_length(p_holidays) <> 14 then
    raise exception using
      errcode = '22023',
      message = 'El calendario oficial debe contener exactamente 14 festivos.';
  end if;

  if p_source_url is null or p_source_url !~ '^https://datos\.madrid\.es/dataset/300082-0-calendario_laboral/resource/300082-1-calendario_laboral-csv/download/[^/?#]+(\?[^#]*)?$' then
    raise exception using
      errcode = '22023',
      message = 'La fuente del calendario no pertenece al recurso oficial autorizado.';
  end if;

  if p_fingerprint is null or p_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception using
      errcode = '22023',
      message = 'La huella del calendario oficial no es valida.';
  end if;

  for v_item in
    select value
    from pg_catalog.jsonb_array_elements(p_holidays)
  loop
    if pg_catalog.jsonb_typeof(v_item) is distinct from 'object'
      or pg_catalog.jsonb_typeof(v_item -> 'date') is distinct from 'string'
      or pg_catalog.jsonb_typeof(v_item -> 'name') is distinct from 'string'
      or pg_catalog.jsonb_typeof(v_item -> 'scope') is distinct from 'string'
    then
      raise exception using
        errcode = '22023',
        message = 'Cada festivo oficial debe incluir fecha, nombre y ambito.';
    end if;

    if (v_item ->> 'date') !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception using
        errcode = '22023',
        message = 'Una fecha del calendario oficial no tiene formato ISO.';
    end if;

    begin
      v_date := (v_item ->> 'date')::date;
    exception when others then
      raise exception using
        errcode = '22023',
        message = 'Una fecha del calendario oficial no existe.';
    end;

    if pg_catalog.to_char(v_date, 'YYYY-MM-DD') <> (v_item ->> 'date')
      or pg_catalog.date_part('year', v_date)::integer <> p_year
    then
      raise exception using
        errcode = '22023',
        message = 'Todas las fechas deben pertenecer al ano solicitado.';
    end if;

    if (v_item ->> 'scope') not in ('national', 'regional', 'local') then
      raise exception using
        errcode = '22023',
        message = 'Un festivo oficial contiene un ambito desconocido.';
    end if;

    if pg_catalog.char_length(pg_catalog.btrim(v_item ->> 'name')) not between 1 and 160 then
      raise exception using
        errcode = '22023',
        message = 'Un festivo oficial no tiene un nombre valido.';
    end if;
  end loop;

  select
    pg_catalog.count(distinct item ->> 'date'),
    pg_catalog.count(*) filter (where item ->> 'scope' = 'local'),
    pg_catalog.count(*) filter (where item ->> 'scope' = 'national'),
    pg_catalog.count(*) filter (where item ->> 'scope' = 'regional')
  into v_unique_dates, v_local_count, v_national_count, v_regional_count
  from pg_catalog.jsonb_array_elements(p_holidays) as holidays(item);

  if v_unique_dates <> 14 then
    raise exception using
      errcode = '22023',
      message = 'El calendario oficial contiene fechas duplicadas.';
  end if;

  if v_local_count <> 2 or v_national_count < 1 or v_regional_count < 1 then
    raise exception using
      errcode = '22023',
      message = 'El calendario debe incluir los ambitos nacional, autonomico y exactamente dos festivos de Madrid capital.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(20261121, p_year);

  select syncs.fingerprint
  into v_existing_fingerprint
  from public.official_calendar_syncs as syncs
  where syncs.year = p_year
  for update;

  select pg_catalog.count(*)
  into v_existing_count
  from public.calendar_closures as closures
  where closures.source = 'official'
    and closures.date >= pg_catalog.make_date(p_year, 1, 1)
    and closures.date < pg_catalog.make_date(p_year + 1, 1, 1);

  select pg_catalog.count(*)
  into v_matching_count
  from pg_catalog.jsonb_array_elements(p_holidays) as holidays(item)
  join public.calendar_closures as closures
    on closures.date = (holidays.item ->> 'date')::date
    and closures.name = pg_catalog.btrim(holidays.item ->> 'name')
    and closures.scope = holidays.item ->> 'scope'
    and closures.source = 'official'
    and closures.source_url = p_source_url
    and closures.closes_delivery
    and closures.closes_local
    and closures.enabled;

  if v_existing_fingerprint = p_fingerprint
    and v_existing_count = 14
    and v_matching_count = 14
  then
    update public.official_calendar_syncs
    set
      complete = true,
      official_count = 14,
      source_url = p_source_url,
      last_checked_at = v_now,
      last_success_at = coalesce(last_success_at, v_now),
      last_error = null
    where year = p_year;

    return pg_catalog.jsonb_build_object(
      'status', 'unchanged',
      'year', p_year,
      'official_count', 14
    );
  end if;

  delete from public.calendar_closures
  where source = 'official'
    and date >= pg_catalog.make_date(p_year, 1, 1)
    and date < pg_catalog.make_date(p_year + 1, 1, 1);

  insert into public.calendar_closures (
    date,
    name,
    scope,
    source,
    source_url,
    closes_delivery,
    closes_local,
    enabled,
    updated_at
  )
  select
    (holidays.item ->> 'date')::date,
    pg_catalog.btrim(holidays.item ->> 'name'),
    holidays.item ->> 'scope',
    'official',
    p_source_url,
    true,
    true,
    true,
    v_now
  from pg_catalog.jsonb_array_elements(p_holidays) as holidays(item)
  order by holidays.item ->> 'date';

  insert into public.official_calendar_syncs (
    year,
    complete,
    official_count,
    fingerprint,
    source_url,
    last_checked_at,
    last_success_at,
    last_error
  ) values (
    p_year,
    true,
    14,
    p_fingerprint,
    p_source_url,
    v_now,
    v_now,
    null
  )
  on conflict (year) do update
  set
    complete = excluded.complete,
    official_count = excluded.official_count,
    fingerprint = excluded.fingerprint,
    source_url = excluded.source_url,
    last_checked_at = excluded.last_checked_at,
    last_success_at = excluded.last_success_at,
    last_error = excluded.last_error;

  return pg_catalog.jsonb_build_object(
    'status', 'updated',
    'year', p_year,
    'official_count', 14
  );
end;
$$;

revoke all on function public.replace_official_calendar(integer, jsonb, text, text)
from public, anon, authenticated;
grant execute on function public.replace_official_calendar(integer, jsonb, text, text)
to service_role;

comment on function public.replace_official_calendar(integer, jsonb, text, text) is
  'Valida y sustituye atomicamente un ano completo de festivos oficiales sin tocar cierres manuales.';

with requested_years(year) as (
  values (2026), (2027)
), year_counts as (
  select
    requested_years.year,
    pg_catalog.count(closures.id)::smallint as official_count
  from requested_years
  left join public.calendar_closures as closures
    on closures.source = 'official'
    and closures.date >= pg_catalog.make_date(requested_years.year, 1, 1)
    and closures.date < pg_catalog.make_date(requested_years.year + 1, 1, 1)
  group by requested_years.year
)
insert into public.official_calendar_syncs (
  year,
  complete,
  official_count,
  fingerprint,
  source_url,
  last_checked_at,
  last_success_at,
  last_error
)
select
  year_counts.year,
  year_counts.official_count = 14,
  year_counts.official_count,
  null,
  'https://datos.madrid.es/dataset/300082-0-calendario_laboral/resource/300082-1-calendario_laboral-csv/download/300082-3-calendario_laboral-xls_v2.csv',
  null,
  case when year_counts.official_count = 14 then pg_catalog.now() else null end,
  case
    when year_counts.official_count = 14 then null
    else 'La migracion no encontro los 14 festivos oficiales esperados.'
  end
from year_counts
on conflict (year) do update
set
  complete = excluded.complete,
  official_count = excluded.official_count,
  source_url = excluded.source_url,
  last_checked_at = excluded.last_checked_at,
  last_success_at = excluded.last_success_at,
  last_error = excluded.last_error;
