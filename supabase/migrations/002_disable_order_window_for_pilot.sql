create or replace function public.is_b2b_order_window_open()
returns boolean
language sql
stable
as $$
  select true;
$$;
