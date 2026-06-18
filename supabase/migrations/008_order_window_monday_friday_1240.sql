create or replace function public.is_b2b_order_window_open()
returns boolean
language sql
stable
as $$
  select extract(isodow from (now() at time zone 'Europe/Madrid')) between 1 and 5
    and ((now() at time zone 'Europe/Madrid')::time >= time '09:30')
    and ((now() at time zone 'Europe/Madrid')::time < time '12:40');
$$;

update public.companies
set order_window = 'lunes a viernes de 09:30 a 12:40'
where slug = 'bureau-veritas';
