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

export type PaymentMethod =
  | "pay_on_delivery"
  | "stripe_card"
  | "stripe_bizum";

export type PaymentStatus =
  | "pending"
  | "paid"
  | "failed"
  | "cancelled";

export type CompanyBillingType = "employee" | "subsidized" | "company";

export type Company = {
  id: string;
  name: string;
  slug: string;
  order_window?: string | null;
  delivery_window?: string | null;
  allow_pay_on_delivery?: boolean | null;
  allow_card_payment?: boolean | null;
  allow_bizum_payment?: boolean | null;
  billing_type?: CompanyBillingType | null;
  subsidy_rules?: {
    product_type: "daily_menu" | "half_menu";
    subsidy_amount: number;
    active: boolean;
  }[];
  stripe_payments_enabled?: boolean;
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
  payment_method?: PaymentMethod | null;
  payment_status?: PaymentStatus | null;
  payment_provider?: string | null;
  stripe_checkout_session_id?: string | null;
  stripe_payment_intent_id?: string | null;
  paid_at?: string | null;
  subtotal: number;
  subsidy_total: number;
  employee_total?: number;
  company_invoice_total?: number;
  total: number;
  notes: string | null;
  delivery_window: string;
  order_items: OrderItem[];
  companies?: { name: string } | null;
  company_branches?: { name: string } | null;
};

export type AdminCompany = Company & {
};

export type CompanyDraft = Pick<Company, "id" | "name" | "slug" | "active" | "order_window" | "delivery_window"> & {
  daily_menu_subsidy: number;
  half_menu_subsidy: number;
  allow_pay_on_delivery: boolean;
  allow_card_payment: boolean;
  allow_bizum_payment: boolean;
  billing_type: CompanyBillingType;
};

export type ProductDraft = Pick<
  Product,
  "id" | "active" | "sold_out" | "base_price" | "customer_price" | "description" | "image_url"
>;
