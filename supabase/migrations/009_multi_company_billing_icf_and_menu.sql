alter table public.companies
add column if not exists order_window text default 'lunes a viernes de 09:30 a 12:40',
add column if not exists delivery_window text default '13:00 a 13:30',
add column if not exists billing_type text not null default 'employee'
check (billing_type in ('employee', 'subsidized', 'company'));

alter table public.companies
alter column order_window set default 'lunes a viernes de 09:30 a 12:40',
alter column delivery_window set default '13:00 a 13:30',
alter column allow_pay_on_delivery set default false,
alter column allow_card_payment set default true,
alter column allow_bizum_payment set default false;

update public.companies
set
  order_window = coalesce(order_window, 'lunes a viernes de 09:30 a 12:40'),
  delivery_window = coalesce(delivery_window, '13:00 a 13:30');

update public.companies
set
  billing_type = 'subsidized',
  allow_pay_on_delivery = false,
  allow_card_payment = true,
  allow_bizum_payment = false
where slug = 'bureau-veritas';

insert into public.companies (
  id,
  name,
  slug,
  active,
  order_window,
  delivery_window,
  allow_pay_on_delivery,
  allow_card_payment,
  allow_bizum_payment,
  billing_type
)
values (
  '1cf00000-0000-4000-8000-000000000001',
  'ICF',
  'icf',
  true,
  'lunes a viernes de 09:30 a 12:40',
  '13:00 a 13:30',
  true,
  false,
  false,
  'company'
)
on conflict (id) do update set
  name = excluded.name,
  slug = excluded.slug,
  active = excluded.active,
  order_window = excluded.order_window,
  delivery_window = excluded.delivery_window,
  allow_pay_on_delivery = excluded.allow_pay_on_delivery,
  allow_card_payment = excluded.allow_card_payment,
  allow_bizum_payment = excluded.allow_bizum_payment,
  billing_type = excluded.billing_type;

insert into public.company_branches (id, company_id, name, active)
values (
  '1cf00000-0000-4000-8000-000000000002',
  '1cf00000-0000-4000-8000-000000000001',
  'ICF',
  true
)
on conflict (id) do update set
  company_id = excluded.company_id,
  name = excluded.name,
  active = excluded.active;

insert into public.subsidy_rules (
  company_id,
  product_type,
  subsidy_amount,
  max_uses_per_customer_per_day,
  active
)
values
  ('1cf00000-0000-4000-8000-000000000001', 'daily_menu', 0, 1, false),
  ('1cf00000-0000-4000-8000-000000000001', 'half_menu', 0, 1, false)
on conflict (company_id, product_type) do update set
  subsidy_amount = 0,
  active = false;

alter table public.orders
add column if not exists employee_total numeric(10, 2) not null default 0,
add column if not exists company_invoice_total numeric(10, 2) not null default 0;

update public.orders
set
  employee_total = total,
  company_invoice_total = subsidy_total
where employee_total = 0
  and company_invoice_total = 0
  and (total > 0 or subsidy_total > 0);

update public.daily_menus
set second_courses = (
  select coalesce(jsonb_agg(course order by ordinal), '[]'::jsonb)
  from (
    select
      case
        when jsonb_typeof(value) = 'string' then value
        else to_jsonb(value->>'name')
      end as course,
      ordinal
    from jsonb_array_elements(second_courses) with ordinality as courses(value, ordinal)
    where ordinal <= 3
  ) normalized
);
