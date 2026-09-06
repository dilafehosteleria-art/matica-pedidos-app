import type { Category, Company, CompanyBranch, DailyMenu, Product } from "./types";

export const BUREAU_VERITAS_COMPANY_ID = "7dca1236-f8ad-4d2f-9ec0-2ed0f51ce2a1";

export const BUREAU_VERITAS_COMPANY: Company = {
  id: BUREAU_VERITAS_COMPANY_ID,
  name: "Bureau Veritas",
  slug: "bureau-veritas",
  delivery_address: null,
  order_window: "lunes a viernes de 09:30 a 12:40",
  delivery_window: "13:00 a 13:30",
  allow_pay_on_delivery: false,
  allow_card_payment: true,
  allow_bizum_payment: false,
  billing_type: "subsidized",
  subsidy_rules: [
    { product_type: "daily_menu", subsidy_amount: 4, active: true },
    { product_type: "half_menu", subsidy_amount: 3.5, active: true }
  ],
  active: true
};

export const ICF_COMPANY_ID = "1cf00000-0000-4000-8000-000000000001";

export const ICF_COMPANY: Company = {
  id: ICF_COMPANY_ID,
  name: "ICF",
  slug: "icf",
  delivery_address: null,
  order_window: "lunes a viernes de 09:30 a 12:40",
  delivery_window: "13:00 a 13:30",
  allow_pay_on_delivery: true,
  allow_card_payment: false,
  allow_bizum_payment: false,
  billing_type: "company",
  subsidy_rules: [],
  active: true
};

export const COMPANIES: Company[] = [BUREAU_VERITAS_COMPANY, ICF_COMPANY];

export const BUREAU_VERITAS_BRANCHES: CompanyBranch[] = [
  {
    id: "28126727-f1b6-47cd-aad3-9785694b0937",
    company_id: BUREAU_VERITAS_COMPANY_ID,
    name: "BUREAU VERITAS IBERIA",
    active: true
  },
  {
    id: "6b9d7adf-73da-481b-80d7-e89732e3023b",
    company_id: BUREAU_VERITAS_COMPANY_ID,
    name: "BUREAU VERITAS INSP Y TEST.",
    active: true
  },
  {
    id: "530a03e0-2058-414d-85c7-baf168fd84a3",
    company_id: BUREAU_VERITAS_COMPANY_ID,
    name: "BUREAU VERITAS INVERSIONES",
    active: true
  },
  {
    id: "df58207d-23c4-4635-a05f-af568096d495",
    company_id: BUREAU_VERITAS_COMPANY_ID,
    name: "BUREAU VERITAS SOLUTIONS",
    active: true
  },
  {
    id: "9e99d394-cd7c-4c13-95ae-25da310469dd",
    company_id: BUREAU_VERITAS_COMPANY_ID,
    name: "BUREAU VERITAS SUST.FUELS",
    active: true
  },
  {
    id: "dbe6b0b2-fce1-40b2-926e-d4ce281c49af",
    company_id: BUREAU_VERITAS_COMPANY_ID,
    name: "ECOINTEGRAL",
    active: true
  },
  {
    id: "67f0bf94-fe51-44ee-95f3-3ebdb047b5b8",
    company_id: BUREAU_VERITAS_COMPANY_ID,
    name: "IDP GLOBAL ENGINEERING",
    active: true
  },
  {
    id: "6ea56323-04c9-4060-88ff-50c487b184ac",
    company_id: BUREAU_VERITAS_COMPANY_ID,
    name: "IDP ING.Y ARQUITECTURA",
    active: true
  },
  {
    id: "27584bb3-403b-4ad3-aa57-7349b1c8cd1d",
    company_id: BUREAU_VERITAS_COMPANY_ID,
    name: "INDUTEC",
    active: true
  },
  {
    id: "121dd82f-7399-48ac-83bc-b4121f074fb4",
    company_id: BUREAU_VERITAS_COMPANY_ID,
    name: "PBV INVESTMENT",
    active: true
  },
  {
    id: "1ff17af8-5fcc-4093-be9a-d73dca0cf90b",
    company_id: BUREAU_VERITAS_COMPANY_ID,
    name: "SÓLIDA",
    active: true
  }
];

export const ICF_BRANCHES: CompanyBranch[] = [
  {
    id: "1cf00000-0000-4000-8000-000000000002",
    company_id: ICF_COMPANY_ID,
    name: "ICF",
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
    base_price: 13.5,
    customer_price: 9.5,
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
    description: "Ensalada pequeña 750ML configurable y bocadillo a elegir.",
    base_price: 10,
    customer_price: 10,
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
    description:
      "Mézclum fresco y fusilli al dente con pollo crispy, tomate, huevo, lascas de parmesano y cebolla crujiente, acompañado de nuestra salsa César parmesana.",
    base_price: 9.9,
    customer_price: 9.9,
    image_url: null,
    active: true,
    sold_out: false,
    sort_order: 10,
    product_type: "standard"
  },
  {
    id: "9e62560b-9633-4743-877c-3c387d044d3f",
    category_id: "5f0416a3-f6d4-4345-a39f-503a1f3c301c",
    name: "Mediterranean Fresh Bowl",
    description:
      "Quinoa y espinaca fresca con atún, pepino, aceitunas, queso fresco y garbanzos, con nuestra vinagreta balsámica prémium.",
    base_price: 9.9,
    customer_price: 9.9,
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
    description:
      "Arroz jazmín y mézclum fresco con cerdo asado, maíz, cebolla, pimientos y huevo, con nuestra salsa de mostaza miel.",
    base_price: 9.9,
    customer_price: 9.9,
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
    description:
      "Espinaca fresca y arroz integral con pollo a la plancha, pepino, zanahoria, frutos secos y queso fresco, acompañado de nuestra salsa yogur-limón.",
    base_price: 9.9,
    customer_price: 9.9,
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
    description: "Elige una base, 3 toppings y una proteína. Termínala con la salsa que más te guste.",
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
    description: "Pollo crispy, mézclum, tomate, parmesano y salsa César parmesana en tortilla wrap.",
    base_price: 8.9,
    customer_price: 8.9,
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
    description:
      "Wrap con cerdo asado, arroz jazmín, maíz, pimiento, cebolla y salsa chipotle suave. Una opción sabrosa, contundente y con toque Tex-Mex.",
    base_price: 8.9,
    customer_price: 8.9,
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
    description:
      "Wrap con pollo a la plancha, espinaca fresca, pepino, zanahoria, queso fresco y salsa yogur-limón. Ligero, fresco y equilibrado.",
    base_price: 8.9,
    customer_price: 8.9,
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
    description:
      "Wrap con atún, mézclum fresco, pepino, aceitunas, queso fresco y salsa yogur-limón. Fresco, mediterráneo y muy fácil de comer.",
    base_price: 8.9,
    customer_price: 8.9,
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
    description:
      "Diseña tu wrap con 1 o 2 bases, 1 proteína, hasta 5 toppings y hasta 2 salsas.",
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
    name: "Platos combinados Matica",
    description:
      "Escoge entre pollo a la plancha, lomo de cerdo o filete de ternera + 1 huevo frito + 2 guarniciones + postre o bebida + pan.",
    base_price: 10,
    customer_price: 10,
    image_url: null,
    active: true,
    sold_out: false,
    sort_order: 10,
    product_type: "standard"
  },
  {
    id: "ef86e12e-9dc5-4646-b2f2-50977d21f2cc",
    category_id: "7dd1024d-488d-480b-842d-207038e9f6c4",
    name: "Escoge tu bocadillo",
    description: "Elige entre los bocadillos disponibles.",
    base_price: 6,
    customer_price: 6,
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
    base_price: 1.5,
    customer_price: 1.5,
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
    name: "Fanta Naranja",
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
    name: "Yogur de frutas",
    description: "Postre individual.",
    base_price: 1,
    customer_price: 1,
    image_url: null,
    active: true,
    sold_out: false,
    sort_order: 10,
    product_type: "dessert"
  },
  {
    id: "6da5475f-5578-42ec-83bb-0efb74a57abc",
    category_id: "a9d9ecdf-2746-45b5-b3fe-d3611e99e031",
    name: "Natillas",
    description: "Natillas individuales.",
    base_price: 1,
    customer_price: 1,
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
    base_price: 1.2,
    customer_price: 1.2,
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
    base_price: 2,
    customer_price: 2,
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
    base_price: 1,
    customer_price: 1,
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
    base_price: 1,
    customer_price: 1,
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
    base_price: 1,
    customer_price: 1,
    image_url: null,
    active: true,
    sold_out: false,
    sort_order: 20,
    product_type: "dessert"
  },
  {
    id: "b84d31b4-43e8-42f8-8ddc-34526f3a4ef4",
    category_id: "2eb77724-bab2-4ac9-a834-dee699f0aa10",
    name: "Cubiertos",
    description: "Set de cubiertos para tu pedido.",
    base_price: 0.2,
    customer_price: 0.2,
    image_url: null,
    active: true,
    sold_out: false,
    sort_order: 10,
    product_type: "other"
  }
];

export const DEFAULT_DAILY_MENU: DailyMenu = {
  id: "d8489fda-d5e3-41f0-9cd1-4d21119a0a69",
  date: "2026-05-20",
  first_courses: [
    "Ensalada arroz con queso fresco",
    "Lasaña de espinacas con champiñones y pimientos asados",
    "Pasta con gambas y tomate cherry",
    "Salmorejo cordobés"
  ],
  second_courses: [
    { name: "Filete de pescado en salsa de soja y jengibre" },
    { name: "Hamburguesa clásica con bacon y queso" },
    { name: "Pollo asado" }
  ],
  drinks: ["Agua mineral", "Agua con gas", "Coca Cola", "Coca Cola Zero", "Fanta Naranja", "Lipton Limón"],
  desserts: ["Flan", "Gelatina", "Natillas", "Plátano", "Manzana", "Yogur de frutas"],
  active: true
};

export const DELIVERY_WINDOW = "13:00 a 13:30";
