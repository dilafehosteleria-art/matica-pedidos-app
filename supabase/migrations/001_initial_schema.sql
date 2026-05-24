create extension if not exists pgcrypto;

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.company_branches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  active boolean not null default true
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text not null,
  company_id uuid not null references public.companies(id),
  company_branch_id uuid references public.company_branches(id),
  created_at timestamptz not null default now(),
  constraint customers_company_email_unique unique (company_id, email)
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  sort_order integer not null default 100,
  active boolean not null default true
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.categories(id),
  name text not null,
  description text,
  base_price numeric(10, 2) not null check (base_price >= 0),
  customer_price numeric(10, 2) not null check (customer_price >= 0),
  image_url text,
  active boolean not null default true,
  sold_out boolean not null default false,
  sort_order integer not null default 100,
  product_type text not null default 'standard' check (
    product_type in ('daily_menu', 'half_menu', 'standard', 'drink', 'dessert', 'other')
  ),
  created_at timestamptz not null default now()
);

create table if not exists public.daily_menus (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  first_courses jsonb not null default '[]'::jsonb,
  second_courses jsonb not null default '[]'::jsonb,
  drinks jsonb not null default '[]'::jsonb,
  desserts jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status_updated_at timestamptz not null default now(),
  customer_id uuid references public.customers(id),
  company_id uuid not null references public.companies(id),
  company_branch_id uuid references public.company_branches(id),
  customer_name text not null,
  customer_email text not null,
  customer_phone text not null,
  status text not null default 'nuevo' check (
    status in ('nuevo', 'preparando', 'listo', 'entregado', 'cancelado')
  ),
  subtotal numeric(10, 2) not null default 0,
  subsidy_total numeric(10, 2) not null default 0,
  total numeric(10, 2) not null default 0,
  notes text,
  delivery_window text not null default '13:00 a 13:30'
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id),
  name text not null,
  quantity integer not null check (quantity > 0),
  unit_price numeric(10, 2) not null check (unit_price >= 0),
  base_price numeric(10, 2) not null check (base_price >= 0),
  subsidy_amount numeric(10, 2) not null default 0 check (subsidy_amount >= 0),
  total_price numeric(10, 2) not null check (total_price >= 0),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.subsidy_rules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  product_type text not null check (product_type in ('daily_menu', 'half_menu')),
  subsidy_amount numeric(10, 2) not null check (subsidy_amount >= 0),
  max_uses_per_customer_per_day integer not null default 1,
  active boolean not null default true,
  constraint subsidy_rules_company_product_unique unique (company_id, product_type)
);

create index if not exists company_branches_company_id_idx on public.company_branches(company_id);
create index if not exists customers_company_email_idx on public.customers(company_id, email);
create index if not exists products_category_sort_idx on public.products(category_id, sort_order);
create index if not exists daily_menus_date_idx on public.daily_menus(date);
create index if not exists orders_company_created_idx on public.orders(company_id, created_at);
create index if not exists orders_email_created_idx on public.orders(customer_email, created_at);
create index if not exists orders_status_updated_idx on public.orders(status, status_updated_at);
create index if not exists order_items_order_id_idx on public.order_items(order_id);

create or replace function public.set_order_status_timestamp()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();

  if tg_op = 'INSERT' then
    new.status_updated_at = coalesce(new.status_updated_at, now());
  elsif new.status is distinct from old.status then
    new.status_updated_at = now();
  end if;

  return new;
end;
$$;

drop trigger if exists orders_status_timestamp_trigger on public.orders;
create trigger orders_status_timestamp_trigger
before insert or update on public.orders
for each row execute function public.set_order_status_timestamp();

create or replace function public.is_b2b_order_window_open()
returns boolean
language sql
stable
as $$
  select extract(isodow from (now() at time zone 'Europe/Madrid')) between 1 and 4
    and ((now() at time zone 'Europe/Madrid')::time >= time '09:30')
    and ((now() at time zone 'Europe/Madrid')::time <= time '12:30');
$$;

create or replace function public.submit_b2b_order(order_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_branch_id uuid;
  v_customer_id uuid;
  v_order_id uuid;
  v_customer_name text;
  v_email text;
  v_phone text;
  v_notes text;
  v_item jsonb;
  v_product_id uuid;
  v_product record;
  v_quantity integer;
  v_line_subtotal numeric(10, 2);
  v_line_subsidy numeric(10, 2);
  v_line_total numeric(10, 2);
  v_subtotal numeric(10, 2) := 0;
  v_subsidy_total numeric(10, 2) := 0;
  v_total numeric(10, 2) := 0;
  v_prior_subsidy_used boolean := false;
  v_subsidy_applied boolean := false;
begin
  if not public.is_b2b_order_window_open() then
    raise exception 'Los pedidos están disponibles de lunes a jueves de 09:30 a 12:30.';
  end if;

  if jsonb_typeof(coalesce(order_payload->'items', '[]'::jsonb)) <> 'array'
    or jsonb_array_length(coalesce(order_payload->'items', '[]'::jsonb)) = 0 then
    raise exception 'El carrito está vacío.';
  end if;

  select id into v_company_id
  from public.companies
  where slug = order_payload->>'company_slug'
    and active = true;

  if v_company_id is null then
    raise exception 'Empresa no encontrada.';
  end if;

  v_branch_id := nullif(order_payload#>>'{customer,company_branch_id}', '')::uuid;

  if not exists (
    select 1
    from public.company_branches
    where id = v_branch_id
      and company_id = v_company_id
      and active = true
  ) then
    raise exception 'Sociedad Bureau Veritas no valida.';
  end if;

  v_customer_name := nullif(trim(order_payload#>>'{customer,name}'), '');
  v_email := lower(nullif(trim(order_payload#>>'{customer,email}'), ''));
  v_phone := nullif(trim(order_payload#>>'{customer,phone}'), '');
  v_notes := nullif(trim(coalesce(order_payload->>'notes', '')), '');

  if v_customer_name is null or v_email is null or v_phone is null then
    raise exception 'Faltan datos del cliente.';
  end if;

  insert into public.customers (name, email, phone, company_id, company_branch_id)
  values (v_customer_name, v_email, v_phone, v_company_id, v_branch_id)
  on conflict (company_id, email)
  do update set
    name = excluded.name,
    phone = excluded.phone,
    company_branch_id = excluded.company_branch_id
  returning id into v_customer_id;

  select exists (
    select 1
    from public.orders o
    join public.order_items oi on oi.order_id = o.id
    where o.company_id = v_company_id
      and o.customer_email = v_email
      and o.status <> 'cancelado'
      and oi.subsidy_amount > 0
      and ((o.created_at at time zone 'Europe/Madrid')::date = (now() at time zone 'Europe/Madrid')::date)
  ) into v_prior_subsidy_used;

  insert into public.orders (
    customer_id,
    company_id,
    company_branch_id,
    customer_name,
    customer_email,
    customer_phone,
    status,
    subtotal,
    subsidy_total,
    total,
    notes,
    delivery_window
  )
  values (
    v_customer_id,
    v_company_id,
    v_branch_id,
    v_customer_name,
    v_email,
    v_phone,
    'nuevo',
    0,
    0,
    0,
    v_notes,
    '13:00 a 13:30'
  )
  returning id into v_order_id;

  for v_item in
    select value
    from jsonb_array_elements(order_payload->'items') as items(value)
  loop
    v_product_id := nullif(v_item->>'product_id', '')::uuid;
    v_quantity := least(greatest(coalesce((v_item->>'quantity')::integer, 1), 1), 20);

    select
      p.*,
      coalesce(sr.subsidy_amount, 0) as rule_subsidy_amount
    into v_product
    from public.products p
    left join public.subsidy_rules sr
      on sr.company_id = v_company_id
      and sr.product_type = p.product_type
      and sr.active = true
    where p.id = v_product_id
      and p.active = true
      and p.sold_out = false;

    if not found then
      raise exception 'Producto no disponible.';
    end if;

    v_line_subtotal := round(v_product.base_price * v_quantity, 2);
    v_line_subsidy := 0;

    if v_product.rule_subsidy_amount > 0
      and not v_prior_subsidy_used
      and not v_subsidy_applied then
      v_line_subsidy := least(v_product.rule_subsidy_amount, v_product.base_price);
      v_subsidy_applied := true;
    end if;

    v_line_total := round(v_line_subtotal - v_line_subsidy, 2);
    v_subtotal := round(v_subtotal + v_line_subtotal, 2);
    v_subsidy_total := round(v_subsidy_total + v_line_subsidy, 2);
    v_total := round(v_total + v_line_total, 2);

    insert into public.order_items (
      order_id,
      product_id,
      name,
      quantity,
      unit_price,
      base_price,
      subsidy_amount,
      total_price,
      metadata
    )
    values (
      v_order_id,
      v_product.id,
      v_product.name,
      v_quantity,
      v_product.base_price,
      v_product.base_price,
      v_line_subsidy,
      v_line_total,
      coalesce(v_item->'metadata', '{}'::jsonb)
    );
  end loop;

  update public.orders
  set
    subtotal = v_subtotal,
    subsidy_total = v_subsidy_total,
    total = v_total
  where id = v_order_id;

  return jsonb_build_object(
    'id', v_order_id,
    'subtotal', v_subtotal,
    'subsidy_total', v_subsidy_total,
    'total', v_total,
    'subsidy_applied', v_subsidy_applied,
    'prior_subsidy_used', v_prior_subsidy_used
  );
end;
$$;

insert into public.companies (id, name, slug, active)
values ('7dca1236-f8ad-4d2f-9ec0-2ed0f51ce2a1', 'Bureau Veritas', 'bureau-veritas', true)
on conflict (id) do update set name = excluded.name, slug = excluded.slug, active = excluded.active;

insert into public.company_branches (id, company_id, name, active)
values
  ('28126727-f1b6-47cd-aad3-9785694b0937', '7dca1236-f8ad-4d2f-9ec0-2ed0f51ce2a1', 'Bureau Veritas Iberia', true),
  ('530a03e0-2058-414d-85c7-baf168fd84a3', '7dca1236-f8ad-4d2f-9ec0-2ed0f51ce2a1', 'Bureau Veritas Inversiones', true),
  ('df58207d-23c4-4635-a05f-af568096d495', '7dca1236-f8ad-4d2f-9ec0-2ed0f51ce2a1', 'Bureau Veritas Solutions', true),
  ('6b9d7adf-73da-481b-80d7-e89732e3023b', '7dca1236-f8ad-4d2f-9ec0-2ed0f51ce2a1', 'Bureau Veritas Insp. y Test.', true),
  ('9e99d394-cd7c-4c13-95ae-25da310469dd', '7dca1236-f8ad-4d2f-9ec0-2ed0f51ce2a1', 'Bureau Veritas Sus. Fuels', true)
on conflict (id) do update set name = excluded.name, active = excluded.active;

insert into public.categories (id, name, slug, sort_order, active)
values
  ('d6fc42e5-e5d8-4efa-a02c-5266916ab4ae', 'Menú del día', 'menu-del-dia', 10, true),
  ('1a5a480c-8a8c-4b5f-bf93-0eebc13f9623', 'Medio menú', 'medio-menu', 20, true),
  ('5f0416a3-f6d4-4345-a39f-503a1f3c301c', 'Matica Signature Bowls y Ensaladas', 'bowls-ensaladas', 30, true),
  ('218dfc4c-0897-428e-aa6b-0cc115ac04c2', 'Wraps Signature', 'wraps-signature', 40, true),
  ('bd72f8b2-686b-453c-bd47-bac02d43a42b', 'Matica Grill', 'matica-grill', 50, true),
  ('7dd1024d-488d-480b-842d-207038e9f6c4', 'Bocadillos', 'bocadillos', 60, true),
  ('943a1885-7301-479d-a3a5-3b11b43ef017', 'Bebidas', 'bebidas', 70, true),
  ('a9d9ecdf-2746-45b5-b3fe-d3611e99e031', 'Postres', 'postres', 80, true),
  ('2eb77724-bab2-4ac9-a834-dee699f0aa10', 'Otros', 'otros', 90, true)
on conflict (id) do update set name = excluded.name, slug = excluded.slug, sort_order = excluded.sort_order, active = excluded.active;

insert into public.products (
  id,
  category_id,
  name,
  description,
  base_price,
  customer_price,
  image_url,
  active,
  sold_out,
  sort_order,
  product_type
)
values
  ('e0cc5cbb-9170-4df3-a07a-8d8a76fa36d3', 'd6fc42e5-e5d8-4efa-a02c-5266916ab4ae', 'Menú del día', 'Primer plato, segundo plato y bebida o postre.', 13, 9, null, true, false, 10, 'daily_menu'),
  ('fe6a9ab8-f7a4-4f29-9606-3a4213816eb5', '1a5a480c-8a8c-4b5f-bf93-0eebc13f9623', 'Medio menú', 'Un plato y bebida o postre.', 10, 6.50, null, true, false, 10, 'half_menu'),
  ('508060cf-b36f-4ae5-92bd-989954034da3', '5f0416a3-f6d4-4345-a39f-503a1f3c301c', 'Ensalada mediana', 'Base verde con toppings de temporada Matica.', 7, 7, null, true, false, 10, 'standard'),
  ('b0c4026f-b520-4202-b206-320dc152607a', '218dfc4c-0897-428e-aa6b-0cc115ac04c2', 'Wrap a tu manera', 'Wrap signature preparado al momento.', 7.50, 7.50, null, true, false, 10, 'standard'),
  ('ef86e12e-9dc5-4646-b2f2-50977d21f2cc', '7dd1024d-488d-480b-842d-207038e9f6c4', 'Bocadillo serrano', 'Pan crujiente con jamón serrano.', 5.50, 5.50, null, true, false, 10, 'standard'),
  ('0fb219b7-584d-469f-8f09-57fcdce1d89e', '943a1885-7301-479d-a3a5-3b11b43ef017', 'Coca Cola', 'Lata fría.', 2, 2, null, true, false, 10, 'drink'),
  ('b1bdcf0d-5536-4b44-8c16-c5e1ca3b13d6', '2eb77724-bab2-4ac9-a834-dee699f0aa10', 'Cubiertos', 'Set compostable.', 0.20, 0.20, null, true, false, 10, 'other')
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  description = excluded.description,
  base_price = excluded.base_price,
  customer_price = excluded.customer_price,
  active = excluded.active,
  sold_out = excluded.sold_out,
  sort_order = excluded.sort_order,
  product_type = excluded.product_type;

insert into public.daily_menus (date, first_courses, second_courses, drinks, desserts, active)
values (
  (now() at time zone 'Europe/Madrid')::date,
  '["Crema de calabacín", "Ensalada campera", "Pasta fresca con pesto"]'::jsonb,
  '["Pollo al limón con arroz", "Merluza al horno", "Lentejas vegetales"]'::jsonb,
  '["Agua mineral", "Coca Cola", "Nestea"]'::jsonb,
  '["Yogur natural", "Fruta de temporada", "Brownie Matica"]'::jsonb,
  true
)
on conflict (date) do update set
  first_courses = excluded.first_courses,
  second_courses = excluded.second_courses,
  drinks = excluded.drinks,
  desserts = excluded.desserts,
  active = excluded.active;

insert into public.subsidy_rules (
  company_id,
  product_type,
  subsidy_amount,
  max_uses_per_customer_per_day,
  active
)
values
  ('7dca1236-f8ad-4d2f-9ec0-2ed0f51ce2a1', 'daily_menu', 4, 1, true),
  ('7dca1236-f8ad-4d2f-9ec0-2ed0f51ce2a1', 'half_menu', 3.50, 1, true)
on conflict (company_id, product_type) do update set
  subsidy_amount = excluded.subsidy_amount,
  max_uses_per_customer_per_day = excluded.max_uses_per_customer_per_day,
  active = excluded.active;

alter table public.companies enable row level security;
alter table public.company_branches enable row level security;
alter table public.customers enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.daily_menus enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.subsidy_rules enable row level security;

drop policy if exists "Public read active companies" on public.companies;
create policy "Public read active companies"
on public.companies for select
using (active = true);

drop policy if exists "Public read active branches" on public.company_branches;
create policy "Public read active branches"
on public.company_branches for select
using (active = true);

drop policy if exists "Public insert customers" on public.customers;
create policy "Public insert customers"
on public.customers for insert
with check (true);

drop policy if exists "Public update customers through app" on public.customers;
create policy "Public update customers through app"
on public.customers for update
using (true)
with check (true);

drop policy if exists "Public read categories" on public.categories;
create policy "Public read categories"
on public.categories for select
using (true);

drop policy if exists "Public read products" on public.products;
create policy "Public read products"
on public.products for select
using (true);

drop policy if exists "Admin api update products" on public.products;
create policy "Admin api update products"
on public.products for update
using (true)
with check (true);

drop policy if exists "Public read daily menus" on public.daily_menus;
create policy "Public read daily menus"
on public.daily_menus for select
using (true);

drop policy if exists "Admin api insert daily menus" on public.daily_menus;
create policy "Admin api insert daily menus"
on public.daily_menus for insert
with check (true);

drop policy if exists "Admin api update daily menus" on public.daily_menus;
create policy "Admin api update daily menus"
on public.daily_menus for update
using (true)
with check (true);

drop policy if exists "Admin api read orders" on public.orders;
create policy "Admin api read orders"
on public.orders for select
using (true);

drop policy if exists "Public insert orders" on public.orders;
create policy "Public insert orders"
on public.orders for insert
with check (true);

drop policy if exists "Admin api update orders" on public.orders;
create policy "Admin api update orders"
on public.orders for update
using (true)
with check (true);

drop policy if exists "Admin api read order items" on public.order_items;
create policy "Admin api read order items"
on public.order_items for select
using (true);

drop policy if exists "Public insert order items" on public.order_items;
create policy "Public insert order items"
on public.order_items for insert
with check (true);

drop policy if exists "Public read active subsidy rules" on public.subsidy_rules;
create policy "Public read active subsidy rules"
on public.subsidy_rules for select
using (active = true);

grant usage on schema public to anon, authenticated;
grant select on public.companies, public.company_branches, public.categories, public.products, public.daily_menus, public.subsidy_rules to anon, authenticated;
grant select, insert, update on public.customers to anon, authenticated;
grant select, insert, update on public.orders to anon, authenticated;
grant select, insert on public.order_items to anon, authenticated;
grant insert, update on public.daily_menus to anon, authenticated;
grant update on public.products to anon, authenticated;
grant execute on function public.submit_b2b_order(jsonb) to anon, authenticated;
