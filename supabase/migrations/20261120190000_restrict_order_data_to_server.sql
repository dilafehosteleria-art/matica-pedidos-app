begin;

grant all privileges
on table public.orders, public.order_items, public.customers, public.products, public.daily_menus
to service_role;

revoke all privileges
on table public.orders, public.order_items, public.customers
from anon, authenticated;

revoke all privileges
on table public.orders, public.order_items, public.customers
from public;

revoke all privileges
on table public.products, public.daily_menus
from public, anon, authenticated;

grant select
on table public.products, public.daily_menus
to anon, authenticated;

drop policy if exists "Public insert customers" on public.customers;
drop policy if exists "Public update customers through app" on public.customers;

drop policy if exists "Admin api read orders" on public.orders;
drop policy if exists "Public insert orders" on public.orders;
drop policy if exists "Admin api update orders" on public.orders;

drop policy if exists "Admin api read order items" on public.order_items;
drop policy if exists "Public insert order items" on public.order_items;

drop policy if exists "Admin api update products" on public.products;

drop policy if exists "Admin api insert daily menus" on public.daily_menus;
drop policy if exists "Admin api update daily menus" on public.daily_menus;

revoke execute on function public.submit_b2b_order(jsonb)
from public, anon, authenticated;

commit;
