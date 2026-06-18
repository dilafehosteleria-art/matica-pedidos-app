alter table public.companies
add column if not exists order_window text default 'lunes a viernes de 09:30 a 12:40',
add column if not exists delivery_window text default '13:00 a 13:30';

update public.companies
set
  order_window = coalesce(order_window, 'lunes a viernes de 09:30 a 12:40'),
  delivery_window = coalesce(delivery_window, '13:00 a 13:30')
where slug = 'bureau-veritas';

insert into public.categories (id, name, slug, sort_order, active)
values
  ('d6fc42e5-e5d8-4efa-a02c-5266916ab4ae', 'Menús', 'menus', 10, true),
  ('5f0416a3-f6d4-4345-a39f-503a1f3c301c', 'Matica Signature Bowls y Ensaladas', 'bowls-ensaladas', 30, true),
  ('218dfc4c-0897-428e-aa6b-0cc115ac04c2', 'Wraps Signature', 'wraps-signature', 40, true),
  ('bd72f8b2-686b-453c-bd47-bac02d43a42b', 'Matica Grill', 'matica-grill', 50, true),
  ('7dd1024d-488d-480b-842d-207038e9f6c4', 'Bocadillos', 'bocadillos', 60, true),
  ('943a1885-7301-479d-a3a5-3b11b43ef017', 'Bebidas', 'bebidas', 70, true),
  ('a9d9ecdf-2746-45b5-b3fe-d3611e99e031', 'Postres', 'postres', 80, true)
on conflict (id) do update set
  name = excluded.name,
  slug = excluded.slug,
  sort_order = excluded.sort_order,
  active = excluded.active;

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
  ('fe6a9ab8-f7a4-4f29-9606-3a4213816eb5', 'd6fc42e5-e5d8-4efa-a02c-5266916ab4ae', 'Medio menú', 'Un plato a elegir con bebida o postre.', 10, 6.50, null, true, false, 20, 'half_menu'),
  ('55cae0d1-1d44-4dcb-96fb-a1dc05c74511', 'd6fc42e5-e5d8-4efa-a02c-5266916ab4ae', 'Menú ensalada pequeña + bocadillo', 'Ensalada pequeña de temporada y bocadillo frío.', 9.50, 9.50, null, true, false, 30, 'standard'),
  ('508060cf-b36f-4ae5-92bd-989954034da3', '5f0416a3-f6d4-4345-a39f-503a1f3c301c', 'Caesar Crunch Chicken Bowl', 'Pollo, mezclum, croutons, parmesano y salsa Caesar.', 8.50, 8.50, null, true, false, 10, 'standard'),
  ('9e62560b-9633-4743-877c-3c387d044d3f', '5f0416a3-f6d4-4345-a39f-503a1f3c301c', 'Mediterranean Power Bowl', 'Quinoa, atún, huevo, tomate, aceitunas y vinagreta.', 8.50, 8.50, null, true, false, 20, 'standard'),
  ('16eff41e-86d0-4d05-a19b-7fd977fcd4ee', '5f0416a3-f6d4-4345-a39f-503a1f3c301c', 'Tex-Mex Protein Bowl', 'Arroz, proteína especiada, maíz, pico de gallo y salsa suave.', 8.50, 8.50, null, true, false, 30, 'standard'),
  ('7c53ddc4-67cc-4a30-9f46-111ef6344c4a', '5f0416a3-f6d4-4345-a39f-503a1f3c301c', 'Green Fresh Bowl', 'Base verde, verduras frescas, aguacate y salsa de yogur.', 8, 8, null, true, false, 40, 'standard'),
  ('f4542750-92e9-4a8d-aa9c-3a9f5d5fbebd', '5f0416a3-f6d4-4345-a39f-503a1f3c301c', 'Diseña tu ensalada', 'Elige base, proteína, toppings y salsa.', 7.50, 7.50, null, true, false, 50, 'standard'),
  ('f42ace28-8bbb-48a2-b4af-18bf4fa74606', '218dfc4c-0897-428e-aa6b-0cc115ac04c2', 'Wrap Caesar Crunch', 'Pollo, lechuga, parmesano y salsa Caesar.', 7.50, 7.50, null, true, false, 10, 'standard'),
  ('d8e39218-2a10-4f21-8b5f-b2089300c911', '218dfc4c-0897-428e-aa6b-0cc115ac04c2', 'Wrap Tex-Mex Pork', 'Cerdo especiado, arroz, maíz y salsa chipotle suave.', 7.50, 7.50, null, true, false, 20, 'standard'),
  ('3191e6e9-34ed-4468-8cfe-bb825e963c97', '218dfc4c-0897-428e-aa6b-0cc115ac04c2', 'Wrap Fresh Chicken', 'Pollo, mezclum, tomate, zanahoria y salsa de yogur.', 7.50, 7.50, null, true, false, 30, 'standard'),
  ('4f0b8a09-ea54-44c1-b215-d914d204b7fd', '218dfc4c-0897-428e-aa6b-0cc115ac04c2', 'Wrap Mediterranean Tuna', 'Atún, huevo, tomate, aceitunas y vinagreta.', 7.50, 7.50, null, true, false, 40, 'standard'),
  ('b0c4026f-b520-4202-b206-320dc152607a', '218dfc4c-0897-428e-aa6b-0cc115ac04c2', 'Diseña tu wrap', 'Monta tu wrap con proteína, relleno, toppings y salsa.', 7.50, 7.50, null, true, false, 50, 'standard'),
  ('fa921f79-4917-48b6-a25f-20cf7f3a55ca', 'bd72f8b2-686b-453c-bd47-bac02d43a42b', 'Plato combinado', 'Proteína a la plancha, dos guarniciones y bebida o postre.', 11, 11, null, true, false, 10, 'standard'),
  ('ef86e12e-9dc5-4646-b2f2-50977d21f2cc', '7dd1024d-488d-480b-842d-207038e9f6c4', 'Bocadillo a elegir', 'Elige entre los seis bocadillos disponibles.', 5.50, 5.50, null, true, false, 10, 'standard'),
  ('d7d6e225-1156-4d66-9d4e-afad4147fb5e', '943a1885-7301-479d-a3a5-3b11b43ef017', 'Agua mineral', 'Botella fría.', 1.50, 1.50, null, true, false, 10, 'drink'),
  ('1fdc66e8-79db-48c7-8d20-c7f64c350385', '943a1885-7301-479d-a3a5-3b11b43ef017', 'Agua con gas', 'Botella fría.', 1.80, 1.80, null, true, false, 20, 'drink'),
  ('0fb219b7-584d-469f-8f09-57fcdce1d89e', '943a1885-7301-479d-a3a5-3b11b43ef017', 'Coca Cola', 'Lata fría.', 2, 2, null, true, false, 30, 'drink'),
  ('bc474bdc-5e96-4c58-b9f5-32511bad20d8', '943a1885-7301-479d-a3a5-3b11b43ef017', 'Coca Cola Zero', 'Lata fría.', 2, 2, null, true, false, 40, 'drink'),
  ('5b72d7d4-fbbb-4f75-86d4-4c3c8800f1cb', '943a1885-7301-479d-a3a5-3b11b43ef017', 'Fanta naranja', 'Lata fría.', 2, 2, null, true, false, 50, 'drink'),
  ('ce70c4e6-382a-41e9-a392-f82a0c9d5f03', '943a1885-7301-479d-a3a5-3b11b43ef017', 'Lipton', 'Té frío.', 2, 2, null, true, false, 60, 'drink'),
  ('d93d5c58-2200-43d8-9c16-ed4b3d291006', 'a9d9ecdf-2746-45b5-b3fe-d3611e99e031', 'Yogur', 'Postre individual.', 1.80, 1.80, null, true, false, 10, 'dessert'),
  ('b1bdcf0d-5536-4b44-8c16-c5e1ca3b13d6', 'a9d9ecdf-2746-45b5-b3fe-d3611e99e031', 'Flan', 'Flan clásico.', 2, 2, null, true, false, 20, 'dessert'),
  ('6da5475f-5578-42ec-83bb-0efb74a57abc', 'a9d9ecdf-2746-45b5-b3fe-d3611e99e031', 'Natilla', 'Natilla individual.', 2, 2, null, true, false, 30, 'dessert'),
  ('720b4080-cb9e-4147-9156-7d5041f0fb62', 'a9d9ecdf-2746-45b5-b3fe-d3611e99e031', 'Flan de queso', 'Flan cremoso de queso.', 2.40, 2.40, null, true, false, 40, 'dessert'),
  ('84fc034e-1900-4ad7-99c3-e80e72cc76da', 'a9d9ecdf-2746-45b5-b3fe-d3611e99e031', 'Cookie', 'Cookie casera.', 2.20, 2.20, null, true, false, 50, 'dessert'),
  ('342071d7-1b07-4da4-8784-e45a7f62407f', 'a9d9ecdf-2746-45b5-b3fe-d3611e99e031', 'Plátano', 'Fruta fresca.', 1.20, 1.20, null, true, false, 60, 'dessert'),
  ('b53fb346-192f-4b3c-97a9-80a0dbed8ac4', 'a9d9ecdf-2746-45b5-b3fe-d3611e99e031', 'Manzana', 'Fruta fresca.', 1.20, 1.20, null, true, false, 70, 'dessert')
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
