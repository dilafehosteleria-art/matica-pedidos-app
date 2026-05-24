import type { Category, Company, CompanyBranch, DailyMenu, Product } from "./types";

export const BUREAU_VERITAS_COMPANY_ID = "7dca1236-f8ad-4d2f-9ec0-2ed0f51ce2a1";

export const BUREAU_VERITAS_COMPANY: Company = {
  id: BUREAU_VERITAS_COMPANY_ID,
  name: "Bureau Veritas",
  slug: "bureau-veritas",
  active: true
};

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
  { id: "d6fc42e5-e5d8-4efa-a02c-5266916ab4ae", name: "Menú del día", slug: "menu-del-dia", sort_order: 10, active: true },
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
    category_id: "1a5a480c-8a8c-4b5f-bf93-0eebc13f9623",
    name: "Medio menú",
    description: "Un plato y bebida o postre.",
    base_price: 10,
    customer_price: 6.5,
    image_url: null,
    active: true,
    sold_out: false,
    sort_order: 10,
    product_type: "half_menu"
  },
  {
    id: "508060cf-b36f-4ae5-92bd-989954034da3",
    category_id: "5f0416a3-f6d4-4345-a39f-503a1f3c301c",
    name: "Ensalada mediana",
    description: "Base verde con toppings de temporada Matica.",
    base_price: 7,
    customer_price: 7,
    image_url: null,
    active: true,
    sold_out: false,
    sort_order: 10,
    product_type: "standard"
  },
  {
    id: "b0c4026f-b520-4202-b206-320dc152607a",
    category_id: "218dfc4c-0897-428e-aa6b-0cc115ac04c2",
    name: "Wrap a tu manera",
    description: "Wrap signature preparado al momento.",
    base_price: 7.5,
    customer_price: 7.5,
    image_url: null,
    active: true,
    sold_out: false,
    sort_order: 10,
    product_type: "standard"
  },
  {
    id: "ef86e12e-9dc5-4646-b2f2-50977d21f2cc",
    category_id: "7dd1024d-488d-480b-842d-207038e9f6c4",
    name: "Bocadillo serrano",
    description: "Pan crujiente con jamón serrano.",
    base_price: 5.5,
    customer_price: 5.5,
    image_url: null,
    active: true,
    sold_out: false,
    sort_order: 10,
    product_type: "standard"
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
    sort_order: 10,
    product_type: "drink"
  },
  {
    id: "b1bdcf0d-5536-4b44-8c16-c5e1ca3b13d6",
    category_id: "2eb77724-bab2-4ac9-a834-dee699f0aa10",
    name: "Cubiertos",
    description: "Set compostable.",
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
  first_courses: ["Crema de calabacín", "Ensalada campera", "Pasta fresca con pesto"],
  second_courses: ["Pollo al limón con arroz", "Merluza al horno", "Lentejas vegetales"],
  drinks: ["Agua mineral", "Coca Cola", "Nestea"],
  desserts: ["Yogur natural", "Fruta de temporada", "Brownie Matica"],
  active: true
};

export const DELIVERY_WINDOW = "13:00 a 13:30";
export const ORDER_WINDOW_MESSAGE = "Los pedidos están disponibles de lunes a jueves de 09:30 a 12:30.";
