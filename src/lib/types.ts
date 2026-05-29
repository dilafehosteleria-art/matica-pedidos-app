export type ProductType =
  | "daily_menu"
  | "half_menu"
  | "standard"
  | "drink"
  | "dessert"
  | "other";

export type OrderStatus =
  | "pendiente_pago"
  | "nuevo"
  | "preparando"
  | "listo"
  | "entregado"
  | "cancelado";

export type Company = {
  id: string;
  name: string;
  slug: string;
  order_window?: string | null;
  delivery_window?: string | null;
  active: boolean;
  created_at?: string;
};

export type PublicCompany = Pick<Company, "id" | "name" | "slug" | "active" | "order_window" | "delivery_window">;

export type CompanyBranch = {
  id: string;
  company_id: string;
  name: string;
  active: boolean;
};

export type Category = {
  id: string;
  name: string;
  slug: string;
  sort_order: number;
  active: boolean;
};

export type Product = {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  base_price: number;
  customer_price: number;
  image_url: string | null;
  active: boolean;
  sold_out: boolean;
  sort_order: number;
  product_type: ProductType;
  created_at?: string;
};

export type DailyMenuCourse =
  | string
  | {
      name: string;
      category?: string | null;
      excluded_from_half_menu?: boolean | null;
    };

export type DailyMenu = {
  id: string | null;
  date: string;
  first_courses: string[];
  second_courses: DailyMenuCourse[];
  drinks: string[];
  desserts: string[];
  active: boolean;
  created_at?: string;
};

export type CustomerForm = {
  name: string;
  email: string;
  phone: string;
  company_branch_id: string;
};

export type CartItem = {
  key: string;
  product_id: string;
  name: string;
  quantity: number;
  base_price: number;
  customer_price: number;
  product_type: ProductType;
  metadata?: Record<string, string>;
};

export type PublicData = {
  company: Company;
  branches: CompanyBranch[];
  categories: Category[];
  products: Product[];
  dailyMenu: DailyMenu | null;
  source: "supabase" | "seed";
};

export type OrderItem = {
  id: string;
  order_id: string;
  product_id: string | null;
  name: string;
  quantity: number;
  unit_price: number;
  base_price: number;
  subsidy_amount: number;
  total_price: number;
  metadata: Record<string, string> | null;
};

export type AdminOrder = {
  id: string;
  created_at: string;
  status_updated_at: string | null;
  customer_id: string | null;
  company_id: string;
  company_branch_id: string | null;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  status: OrderStatus;
  subtotal: number;
  subsidy_total: number;
  total: number;
  notes: string | null;
  delivery_window: string;
  order_items: OrderItem[];
  companies?: { name: string } | null;
  company_branches?: { name: string } | null;
};

export type AdminCompany = Company & {
  subsidy_rules?: {
    product_type: "daily_menu" | "half_menu";
    subsidy_amount: number;
    active: boolean;
  }[];
};

export type CompanyDraft = Pick<Company, "id" | "name" | "slug" | "active" | "order_window" | "delivery_window"> & {
  daily_menu_subsidy: number;
  half_menu_subsidy: number;
};

export type ProductDraft = Pick<
  Product,
  "id" | "active" | "sold_out" | "base_price" | "customer_price" | "description" | "image_url"
>;
