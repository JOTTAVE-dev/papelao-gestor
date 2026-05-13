export type Product = {
  id: string;
  owner_id: string;
  name: string;
  category: string;
  price_per_kg: number;
  stock_kg: number;
  min_stock_kg: number;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type Supplier = {
  id: string;
  owner_id: string;
  name: string;
  phone: string | null;
  document: string | null;
  notes: string | null;
  created_at: string;
};

export type Customer = {
  id: string;
  owner_id: string;
  name: string;
  phone: string | null;
  document: string | null;
  notes: string | null;
  created_at: string;
};

export type StockEntry = {
  id: string;
  owner_id: string;
  product_id: string;
  supplier_id: string;
  weight_kg: number;
  unit_cost: number;
  total_cost: number;
  occurred_at: string;
  notes: string | null;
  created_at: string;
};

export type Sale = {
  id: string;
  owner_id: string;
  product_id: string;
  customer_id: string;
  weight_kg: number;
  unit_price: number;
  total_price: number;
  occurred_at: string;
  notes: string | null;
  created_at: string;
};

export type ExpenseCategory = 'almoco' | 'frete' | 'manutencao' | 'combustivel' | 'outros';

export type Expense = {
  id: string;
  owner_id: string;
  description: string;
  category: ExpenseCategory;
  amount: number;
  occurred_at: string;
  notes: string | null;
  created_at: string;
};

export type UserRole = 'super_admin' | 'owner' | 'operator';

export type Company = {
  id: string;
  name: string;
  owner_id: string | null;
  user_limit: number;
  created_at: string;
  updated_at: string;
};

export type Profile = {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  company_owner_id: string;
  company_id: string | null;
  support_company_owner_id?: string | null;
  created_at: string;
};

export type BackupPayload = {
  version: 1;
  exportedAt: string;
  products: Product[];
  suppliers: Supplier[];
  customers: Customer[];
  entries: StockEntry[];
  sales: Sale[];
  expenses: Expense[];
};

export type AppData = {
  currentProfile: Profile | null;
  companies: Company[];
  profiles: Profile[];
  products: Product[];
  suppliers: Supplier[];
  customers: Customer[];
  entries: StockEntry[];
  sales: Sale[];
  expenses: Expense[];
};

export type Page =
  | 'dashboard'
  | 'products'
  | 'entries'
  | 'sales'
  | 'expenses'
  | 'suppliers'
  | 'customers'
  | 'admin'
  | 'voice'
  | 'backup';
