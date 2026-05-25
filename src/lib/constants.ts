import type { Category, Company, CompanyBranch, DailyMenu, Product } from "./types";

export const BUREAU_VERITAS_COMPANY_ID = "7dca1236-f8ad-4d2f-9ec0-2ed0f51ce2a1";

export const BUREAU_VERITAS_COMPANY: Company = {
  id: BUREAU_VERITAS_COMPANY_ID,
  name: "Bureau Veritas",
  slug: "bureau-veritas",
  order_window: "lunes a jueves de 09:30 a 12:30",
  delivery_window: "13:00 a 13:30",
  active: true
};

export const COMPANIES: Company[] = [BUREAU_VERITAS_COMPANY];

export const BUREAU_VERITAS_BRANCHES: CompanyBranch[] = [
  {
    id: "28126727-f1b6-47cd-aad3-9785694b0937",
    company_id: BUREAU_VERITAS_COMPANY_ID,
    name: "Bureau Veritas Iberia",
    active: true
  },
  {
    id: "530a03e0-2058-414d-85c7-baf168fd84a3",
    company_id: BUREAU_VERITAS_COMPANY_ID,
    name: "Bureau Veritas Inversiones",
    active: true
  },
  {
    id: "df58207d-23c4-4635-a05f-af568096d495",
    company_id: BUREAU_VERITAS_COMPANY_ID,
    name: "Bureau Veritas Solutions",
    active: true
  },
  {
    id: "6b9d7adf-73da-481b-80d7-e89732e3023b",
    company_id: BUREAU_VERITAS_COMPANY_ID,
    name: "Bureau Veritas Insp. y Test.",
    active: true
  },
  {
    id: "9e99d394-cd7c-4c13-95ae-25da310469dd",
    company_id: BUREAU_VERITAS_COMPANY_ID,
    name: "Bureau Veritas Sus. Fuels",
    active: true
  }
];

export const CATEGORIES: Category[] = [
  { id: "d6fc42e5-e5d8-4efa-a02c-5266916ab4ae", name: "Menús", slug: "menus", sort_order: 10, active: true },
  { id: "1a5a480c-8a8c-4b5f-bf93-0eebc13f9623", name: "Medio menú", slug: "medio-menu", sort_order: 20, active: true },
  { id: "5f0416a3-f6d4-4345-a39f-503a1f3c301c", name: "Matica Signature Bowls y Ensaladas", slug: "bowls-ensaladas", sort_order: 30, active: true },
  { id: "218dfc4c-0897-428e-aa6b-0cc115ac04c2", name: "Wraps Signature", slug: "wraps-signature", sort_order: 40, active: true },
  { id: "bd72f8b2-686b-453c-bd47-bac02d43a42b", name: "Matica Grill", slug: "matica-grill", sort_order: 50, active: true },
  { id: "7dd1024d-488d-480b-842d-207038e9f6c4", name: "Bocadillos", slug: "bocadillos", sort_order: 60, active: true },
  { id: "943a1885-7301-479d-a3a5-3b11b43ef017", name: "Bebidas", slug: "bebidas", sort_order: 70, active: true },
  { id: "a9d9ecdf-2746-45b5-b3fe-d3611e99e031", name: "Postres", slug: "postres", sort_order: 80, active: true },
  { id: "2eb77724-bab2-4ac9-a834-dee699f0aa10", name: "Otros", slug: "otros", sort_order: 90, active: true }
];

export const PRODUCTS: Product[] = [
  {
    id: "e0cc5cbb-9170-4df3-a07a-8d8a76fa36d3",
    category_id: "d6fc42e5-e5d8-4efa-a02c-5266916ab4ae",
    name: "Menú del día",
    description: "Primer plato, segundo plato y bebida o postre.",
    base_price: 13,
    customer_price: 9,
    image_url: null,
    active: true,
    sold_out: false,
    sort_order: 10,
    product_type: "daily_menu"
  },
  {
    id: "fe6a9ab8-f7a4-4f29-9606-3a4213816eb5",
    category_id: "d6fc42e5-e5d8-4efa-a02c-5266916ab4ae",
    name: "Medio menú",
    description: "Un plato y bebida o postre.",
    base_price: 10,
    customer_price: 6.5,
    image_url: null,
    active: true,
    sold_out: false,
    sort_order: 20,
    product_type: "half_menu"
  },
  {
    id: "55cae0d1-1d44-4dcb-96fb-a1dc05c74511",
    category_id: "d6fc42e5-e5d8-4efa-a02c-5266916ab4ae",
    name: "Menú ensalada pequeña + bocadillo",
    description: "Ensalada pequeña de temporada y bocadillo frío.",
    base_price: 9.5,
    customer_price: 9.5,
    image_url: null,
    active: true,
    sold_out: false,
    sort_order: 30,
    product_type: "standard"
  },
  {
    id: "508060cf-b36f-4ae5-92bd-989954034da3",
    category_id: "5f0416a3-f6d4-4345-a39f-503a1f3c301c",
    name: "Caesar Crunch Chicken Bowl",
    description: "Pollo, mezclum, croutons, parmesano y salsa Caesar.",
    base_price: 8.5,
    customer_price: 8.5,
    image_url: null,
    active: true,
    sold_out: false,
    sort_order: 10,
    product_type: "standard"
  },
  {
    id: "9e62560b-9633-4743-877c-3c387d044d3f",
    category_id: "5f0416a3-f6d4-4345-a39f-503a1f3c301c",
    name: "Mediterranean Power Bowl",
    description: "Quinoa, atún, huevo, tomate, aceitunas y vinagreta.",
    base_price: 8.5,
    customer_price: 8.5,
    image_url: null,
    active: true,
    sold_out: false,
    sort_order: 20,
    product_type: "standard"
  },
  {
    id: "16eff41e-86d0-4d05-a19b-7fd977fcd4ee",
    category_id: "5f0416a3-f6d4-4345-a39f-503a1f3c301c",
    name: "Tex-Mex Protein Bowl",
    description: "Arroz, proteína especiada, maíz, pico de gallo y salsa suave.",
    base_price: 8.5,
    customer_price: 8.5,
    image_url: null,
    active: true,
    sold_out: false,
    sort_order: 30,
    product_type: "standard"
  },
  {
    id: "7c53ddc4-67cc-4a30-9f46-111ef6344c4a",
    category_id: "5f0416a3-f6d4-4345-a39f-503a1f3c301c",
    name: "Green Fresh Bowl",
    description: "Base verde, verduras frescas, aguacate y salsa de yogur.",
    base_price: 8,
    customer_price: 8,
    image_url: null,
    active: true,
    sold_out: false,
    sort_order: 40,
    product_type: "standard"
  },
  {
    id: "f4542750-92e9-4a8d-aa9c-3a9f5d5fbebd",
    category_id: "5f0416a3-f6d4-4345-a39f-503a1f3c301c",
    name: "Diseña tu ensalada",
    description: "Elige base, proteína, toppings y salsa.",
    base_price: 7.5,
    customer_price: 7.5,
    image_url: null,
    active: true,
    sold_out: false,
    sort_order: 50,
    product_type: "standard"
  },
  {
    id: "f42ace28-8bbb-48a2-b4af-18bf4fa74606",
    category_id: "218dfc4c-0897-428e-aa6b-0cc115ac04c2",
    name: "Wrap Caesar Crunch",
    description: "Pollo, lechuga, parmesano y salsa Caesar.",
    base_price: 7.5,
    customer_price: 7.5,
    image_url: null,
    active: true,
    sold_out: false,
    sort_order: 10,
    product_type: "standard"
  },
  {
    id: "d8e39218-2a10-4f21-8b5f-b2089300c911",
    category_id: "218dfc4c-0897-428e-aa6b-0cc115ac04c2",
    name: "Wrap Tex-Mex Pork",
    description: "Cerdo especiado, arroz, maíz y salsa chipotle suave.",
    base_price: 7.5,
    customer_price: 7.5,
    image_url: null,
    active: true,
    sold_out: false,
    sort_order: 20,
    product_type: "standard"
  },
  {
    id: "3191e6e9-34ed-4468-8cfe-bb825e963c97",
    category_id: "218dfc4c-0897-428e-aa6b-0cc115ac04c2",
    name: "Wrap Fresh Chicken",
    description: "Pollo, mezclum, tomate, zanahoria y salsa de yogur.",
    base_price: 7.5,
    customer_price: 7.5,
    image_url: null,
    active: true,
    sold_out: false,
    sort_order: 30,
    product_type: "standard"
  },
  {
    id: "4f0b8a09-ea54-44c1-b215-d914d204b7fd",
    category_id: "218dfc4c-0897-428e-aa6b-0cc115ac04c2",
    name: "Wrap Mediterranean Tuna",
    description: "Atún, huevo, tomate, aceitunas y vinagreta.",
    base_price: 7.5,
    customer_price: 7.5,
    image_url: null,
    active: true,
    sold_out: false,
    sort_order: 40,
    product_type: "standard"
  },
  {
    id: "b0c4026f-b520-4202-b206-320dc152607a",
    category_id: "218dfc4c-0897-428e-aa6b-0cc115ac04c2",
    name: "Diseña tu wrap",
    description: "Monta tu wrap con proteína, relleno, toppings y salsa.",
    base_price: 7.5,
    customer_price: 7.5,
    image_url: null,
    active: true,
    sold_out: false,
    sort_order: 50,
    product_type: "standard"
  },
  {
    id: "fa921f79-4917-48b6-a25f-20cf7f3a55ca",
    category_id: "bd72f8b2-686b-453c-bd47-bac02d43a42b",
    name: "Plato combinado",
    description: "Proteína a la plancha, dos guarniciones y bebida o postre.",
    base_price: 11,
    customer_price: 11,
    image_url: null,
    active: true,
    sold_out: false,
    sort_order: 10,
    product_type: "standard"
  },
  {
    id: "ef86e12e-9dc5-4646-b2f2-50977d21f2cc",
    category_id: "7dd1024d-488d-480b-842d-207038e9f6c4",
    name: "Bocadillo a elegir",
    description: "Elige entre los seis bocadillos disponibles.",
    base_price: 5.5,
    customer_price: 5.5,
    image_url: null,
    active: true,
    sold_out: false,
    sort_order: 10,
    product_type: "standard"
  },
  {
    id: "d7d6e225-1156-4d66-9d4e-afad4147fb5e",
    category_id: "943a1885-7301-479d-a3a5-3b11b43ef017",
    name: "Agua mineral",
    description: "Botella fría.",
    base_price: 1.5,
    customer_price: 1.5,
    image_url: null,
    active: true,
    sold_out: false,
    sort_order: 10,
    product_type: "drink"
  },
  {
    id: "1fdc66e8-79db-48c7-8d20-c7f64c350385",
    category_id: "943a1885-7301-479d-a3a5-3b11b43ef017",
    name: "Agua con gas",
    description: "Botella fría.",
    base_price: 1.8,
    customer_price: 1.8,
    image_url: null,
    active: true,
    sold_out: false,
    sort_order: 20,
    product_type: "drink"
  },
  {
    id: "0fb219b7-584d-469f-8f09-57fcdce1d89e",
    category_id: "943a1885-7301-479d-a3a5-3b11b43ef017",
    name: "Coca Cola",
    description: "Lata fría.",
    base_price: 2,
    customer_price: 2,
    image_url: null,
    active: true,
    sold_out: false,
    sort_order: 30,
    product_type: "drink"
  },
  {
    id: "bc474bdc-5e96-4c58-b9f5-32511bad20d8",
    category_id: "943a1885-7301-479d-a3a5-3b11b43ef017",
    name: "Coca Cola Zero",
    description: "Lata fría.",
    base_price: 2,
    customer_price: 2,
    image_url: null,
    active: true,
    sold_out: false,
    sort_order: 40,
    product_type: "drink"
  },
  {
    id: "5b72d7d4-fbbb-4f75-86d4-4c3c8800f1cb",
    category_id: "943a1885-7301-479d-a3a5-3b11b43ef017",
    name: "Fanta naranja",
    description: "Lata fría.",
    base_price: 2,
    customer_price: 2,
    image_url: null,
    active: true,
    sold_out: false,
    sort_order: 50,
    product_type: "drink"
  },
  {
    id: "ce70c4e6-382a-41e9-a392-f82a0c9d5f03",
    category_id: "943a1885-7301-479d-a3a5-3b11b43ef017",
    name: "Lipton",
    description: "Té frío.",
    base_price: 2,
    customer_price: 2,
    image_url: null,
    active: true,
    sold_out: false,
    sort_order: 60,
    product_type: "drink"
  },
  {
    id: "d93d5c58-2200-43d8-9c16-ed4b3d291006",
    category_id: "a9d9ecdf-2746-45b5-b3fe-d3611e99e031",
    name: "Yogur",
    description: "Postre individual.",
    base_price: 1.8,
    customer_price: 1.8,
    image_url: null,
    active: true,
    sold_out: false,
    sort_order: 10,
    product_type: "dessert"
  },
  {
    id: "6da5475f-5578-42ec-83bb-0efb74a57abc",
    category_id: "a9d9ecdf-2746-45b5-b3fe-d3611e99e031",
    name: "Natilla",
    description: "Natilla individual.",
    base_price: 2,
    customer_price: 2,
    image_url: null,
    active: true,
    sold_out: false,
    sort_order: 30,
    product_type: "dessert"
  },
  {
    id: "720b4080-cb9e-4147-9156-7d5041f0fb62",
    category_id: "a9d9ecdf-2746-45b5-b3fe-d3611e99e031",
    name: "Flan de queso",
    description: "Flan cremoso de queso.",
    base_price: 2.4,
    customer_price: 2.4,
    image_url: null,
    active: true,
    sold_out: false,
    sort_order: 40,
    product_type: "dessert"
  },
  {
    id: "84fc034e-1900-4ad7-99c3-e80e72cc76da",
    category_id: "a9d9ecdf-2746-45b5-b3fe-d3611e99e031",
    name: "Cookie",
    description: "Cookie casera.",
    base_price: 2.2,
    customer_price: 2.2,
    image_url: null,
    active: true,
    sold_out: false,
    sort_order: 50,
    product_type: "dessert"
  },
  {
    id: "342071d7-1b07-4da4-8784-e45a7f62407f",
    category_id: "a9d9ecdf-2746-45b5-b3fe-d3611e99e031",
    name: "Plátano",
    description: "Fruta fresca.",
    base_price: 1.2,
    customer_price: 1.2,
    image_url: null,
    active: true,
    sold_out: false,
    sort_order: 60,
    product_type: "dessert"
  },
  {
    id: "b53fb346-192f-4b3c-97a9-80a0dbed8ac4",
    category_id: "a9d9ecdf-2746-45b5-b3fe-d3611e99e031",
    name: "Manzana",
    description: "Fruta fresca.",
    base_price: 1.2,
    customer_price: 1.2,
    image_url: null,
    active: true,
    sold_out: false,
    sort_order: 70,
    product_type: "dessert"
  },
  {
    id: "b1bdcf0d-5536-4b44-8c16-c5e1ca3b13d6",
    category_id: "a9d9ecdf-2746-45b5-b3fe-d3611e99e031",
    name: "Flan",
    description: "Flan clásico.",
    base_price: 2,
    customer_price: 2,
    image_url: null,
    active: true,
    sold_out: false,
    sort_order: 20,
    product_type: "dessert"
  }
];

export const DEFAULT_DAILY_MENU: DailyMenu = {
  id: "d8489fda-d5e3-41f0-9cd1-4d21119a0a69",
  date: "2026-05-20",
  first_courses: ["Crema de calabacín", "Ensalada campera", "Pasta fresca con pesto"],
  second_courses: ["Pollo al limón con arroz", "Merluza al horno", "Lentejas vegetales"],
  drinks: ["Agua mineral", "Coca Cola", "Nestea"],
  desserts: ["Yogur natural", "Fruta de temporada", "Brownie Matica"],
  active: true
};

export const DELIVERY_WINDOW = "13:00 a 13:30";
export const ORDER_WINDOW_MESSAGE = "Los pedidos están disponibles de lunes a jueves de 09:30 a 12:30.";
