import { supabase } from './supabase';
import type {
  AppData,
  BackupPayload,
  Customer,
  Expense,
  ExpenseCategory,
  Product,
  Sale,
  StockEntry,
  Supplier,
} from './types';

type ProductInput = {
  name: string;
  category: string;
  price_per_kg: number;
  stock_kg?: number;
  min_stock_kg: number;
  active: boolean;
};

type ContactInput = {
  name: string;
  phone: string;
  document: string;
  notes: string;
};

function cleanText(value: string) {
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function raise(error: unknown): never {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = String(error.message);
    if (message.includes('products_owner_name_unique_idx')) {
      throw new Error('Ja existe um produto cadastrado com esse nome.');
    }
    throw new Error(message);
  }
  throw new Error('Operacao nao concluida.');
}

async function requireUserId() {
  const { data, error } = await supabase.auth.getUser();
  if (error) raise(error);
  if (!data.user) throw new Error('Sessao expirada. Entre novamente.');
  return data.user.id;
}

async function selectAll<T>(table: string, order = 'created_at') {
  const { data, error } = await supabase.from(table).select('*').order(order, { ascending: false });
  if (error) raise(error);
  return (data || []) as T[];
}

export async function loadAppData(): Promise<AppData> {
  const [products, suppliers, customers, entries, sales, expenses] = await Promise.all([
    selectAll<Product>('products', 'name'),
    selectAll<Supplier>('suppliers', 'name'),
    selectAll<Customer>('customers', 'name'),
    selectAll<StockEntry>('stock_entries', 'occurred_at'),
    selectAll<Sale>('sales', 'occurred_at'),
    selectAll<Expense>('expenses', 'occurred_at'),
  ]);

  return { products, suppliers, customers, entries, sales, expenses };
}

export async function saveProduct(input: ProductInput, id?: string) {
  const userId = await requireUserId();
  const name = input.name.trim();
  const { data: existing, error: existingError } = await supabase
    .from('products')
    .select('id')
    .eq('owner_id', userId)
    .ilike('name', name)
    .maybeSingle();

  if (existingError) raise(existingError);
  if (existing && existing.id !== id) {
    throw new Error('Ja existe um produto cadastrado com esse nome.');
  }

  const payload = {
    owner_id: userId,
    name,
    category: input.category.trim(),
    price_per_kg: input.price_per_kg,
    min_stock_kg: input.min_stock_kg,
    active: input.active,
    updated_at: new Date().toISOString(),
  };

  const query = id
    ? supabase.from('products').update(payload).eq('id', id)
    : supabase.from('products').insert({ ...payload, stock_kg: input.stock_kg || 0 });
  const { error } = await query;
  if (error) raise(error);
}

export async function saveSupplier(input: ContactInput, id?: string) {
  await saveContact('suppliers', input, id);
}

export async function saveCustomer(input: ContactInput, id?: string) {
  await saveContact('customers', input, id);
}

async function saveContact(table: 'suppliers' | 'customers', input: ContactInput, id?: string) {
  const userId = await requireUserId();
  const payload = {
    owner_id: userId,
    name: input.name.trim(),
    phone: cleanText(input.phone),
    document: cleanText(input.document),
    notes: cleanText(input.notes),
  };

  const query = id ? supabase.from(table).update(payload).eq('id', id) : supabase.from(table).insert(payload);
  const { error } = await query;
  if (error) raise(error);
}

export async function createStockEntry(input: {
  product_id: string;
  supplier_id: string;
  weight_kg: number;
  unit_cost: number;
  total_cost: number;
  occurred_at: string;
  notes: string;
}) {
  const { error } = await supabase.rpc('create_stock_entry', {
    p_product_id: input.product_id,
    p_supplier_id: input.supplier_id,
    p_weight_kg: input.weight_kg,
    p_unit_cost: input.unit_cost,
    p_total_cost: input.total_cost,
    p_occurred_at: input.occurred_at,
    p_notes: cleanText(input.notes),
  });
  if (error) raise(error);
}

export async function createSale(input: {
  product_id: string;
  customer_id: string;
  weight_kg: number;
  unit_price: number;
  total_price: number;
  occurred_at: string;
  notes: string;
}) {
  const { error } = await supabase.rpc('create_sale', {
    p_product_id: input.product_id,
    p_customer_id: input.customer_id,
    p_weight_kg: input.weight_kg,
    p_unit_price: input.unit_price,
    p_total_price: input.total_price,
    p_occurred_at: input.occurred_at,
    p_notes: cleanText(input.notes),
  });
  if (error) raise(error);
}

export async function saveExpense(input: {
  description: string;
  category: ExpenseCategory;
  amount: number;
  occurred_at: string;
  notes: string;
}) {
  const userId = await requireUserId();
  const { error } = await supabase.from('expenses').insert({
    owner_id: userId,
    description: input.description.trim(),
    category: input.category,
    amount: input.amount,
    occurred_at: input.occurred_at,
    notes: cleanText(input.notes),
  });
  if (error) raise(error);
}

export async function exportBackup(): Promise<BackupPayload> {
  const data = await loadAppData();
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    products: data.products,
    suppliers: data.suppliers,
    customers: data.customers,
    entries: data.entries,
    sales: data.sales,
    expenses: data.expenses,
  };
}

export async function importBackup(payload: BackupPayload) {
  if (!payload || payload.version !== 1) {
    throw new Error('Arquivo de backup invalido ou versao nao suportada.');
  }

  const userId = await requireUserId();
  const tables = ['sales', 'stock_entries', 'expenses', 'products', 'suppliers', 'customers'] as const;
  for (const table of tables) {
    const { error } = await supabase.from(table).delete().eq('owner_id', userId);
    if (error) raise(error);
  }

  const withOwner = <T extends { owner_id: string }>(rows: T[]) => rows.map((row) => ({ ...row, owner_id: userId }));
  const batches = [
    ['suppliers', withOwner(payload.suppliers)] as const,
    ['customers', withOwner(payload.customers)] as const,
    ['products', withOwner(payload.products)] as const,
    ['stock_entries', withOwner(payload.entries)] as const,
    ['sales', withOwner(payload.sales)] as const,
    ['expenses', withOwner(payload.expenses)] as const,
  ];

  for (const [table, rows] of batches) {
    if (!rows.length) continue;
    const { error } = await supabase.from(table as string).insert(rows as Record<string, unknown>[]);
    if (error) raise(error);
  }
}
