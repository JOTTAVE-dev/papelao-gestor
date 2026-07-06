import { supabase, supabaseAnonKey, supabaseUrl } from './supabase';
import type {
  AppData,
  BackupPayload,
  Company,
  Customer,
  Expense,
  ExpenseCategory,
  Profile,
  Product,
  ProductRecipe,
  Production,
  CustomerProductPrice,
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
  product_type: 'materia_prima' | 'produto_acabado';
  recipe_raw_material_id?: string;
  recipe_consumption_kg?: number;
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
    if (message.includes('Could not find the table') && message.includes('profiles')) {
      throw new Error('A tabela de perfis do Supabase ainda nao foi criada. Execute o SQL consolidado do projeto.');
    }
    if (message.includes("Could not find the 'product_type' column") || (message.includes('product_type') && message.includes('schema cache'))) {
      throw new Error('O banco ainda nao tem a coluna product_type em products. Execute o arquivo supabase/production-and-pricing.sql no SQL Editor do Supabase e tente novamente.');
    }
    if (message.includes('product_recipes')) {
      throw new Error('O banco ainda nao tem a tabela de ficha tecnica. Execute o arquivo supabase/production-and-pricing.sql atualizado no SQL Editor do Supabase.');
    }
    if (message.includes('row-level security policy')) {
      throw new Error('Permissao recusada pelo Supabase. Verifique se seu usuario tem uma empresa ativa/perfil valido e tente recarregar o app.');
    }
    if (message.includes('Entrada nao encontrada')) {
      throw new Error('Entrada nao encontrada pelo banco. Atualize a funcao admin_update_stock_entry no Supabase usando o SQL mais recente do projeto.');
    }
    if (message.includes('Could not find the function')) {
      throw new Error('Uma funcao do Supabase ainda nao foi criada. Execute o SQL consolidado do projeto.');
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

export async function getCurrentProfile() {
  const userId = await requireUserId();
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) {
    const message = error.message || '';
    if (message.includes('Could not find the table') || message.includes('schema cache')) {
      return null;
    }
    raise(error);
  }
  return (data as Profile | null) || null;
}

async function requireCompanyOwnerId() {
  const userId = await requireUserId();
  const profile = await getCurrentProfile();
  if (profile?.role === 'super_admin' && profile.support_company_owner_id) return profile.support_company_owner_id;
  return profile?.company_owner_id || userId;
}

async function selectAll<T>(table: string, order = 'created_at') {
  const { data, error } = await supabase.from(table).select('*').order(order, { ascending: false });
  if (error) raise(error);
  return (data || []) as T[];
}

export async function loadAppData(): Promise<AppData> {
  const profileResult = await getCurrentProfile();
  const [companies, profiles, products, suppliers, customers, entries, sales, expenses, productions, customerPrices, productRecipes] = await Promise.all([
    selectAll<Company>('companies', 'name').catch(() => []),
    selectAll<Profile>('profiles', 'created_at').catch(() => []),
    selectAll<Product>('products', 'name'),
    selectAll<Supplier>('suppliers', 'name'),
    selectAll<Customer>('customers', 'name'),
    selectAll<StockEntry>('stock_entries', 'occurred_at'),
    selectAll<Sale>('sales', 'occurred_at'),
    selectAll<Expense>('expenses', 'occurred_at'),
    selectAll<Production>('productions', 'occurred_at').catch(() => []),
    selectAll<CustomerProductPrice>('customer_product_prices', 'updated_at').catch(() => []),
    selectAll<ProductRecipe>('product_recipes', 'updated_at').catch(() => []),
  ]);

  return { currentProfile: profileResult, companies, profiles, products, suppliers, customers, entries, sales, expenses, productions, customerPrices, productRecipes };
}

function normalizeProductName(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

export async function saveProduct(input: ProductInput, id?: string) {
  const ownerId = await requireCompanyOwnerId();
  const name = normalizeProductName(input.name);
  if (!name) throw new Error('Informe o nome do produto.');
  if (!input.category.trim()) throw new Error('Informe a categoria do produto.');
  if ((input.stock_kg || 0) < 0 || input.min_stock_kg < 0) {
    throw new Error('Estoque e estoque minimo nao podem ser negativos.');
  }
  const { data: existing, error: existingError } = await supabase
    .from('products')
    .select('id')
    .eq('owner_id', ownerId)
    .ilike('name', name)
    .maybeSingle();

  if (existingError) raise(existingError);
  if (existing && existing.id !== id) {
    throw new Error('Ja existe um produto cadastrado com esse nome.');
  }

  const payload = {
    owner_id: ownerId,
    name,
    category: input.category.trim(),
    price_per_kg: input.price_per_kg,
    min_stock_kg: input.min_stock_kg,
    active: input.active,
    product_type: input.product_type,
    updated_at: new Date().toISOString(),
  };

  const query = id
    ? supabase.from('products').update(payload).eq('id', id).select('id').single()
    : supabase.from('products').insert({ ...payload, stock_kg: input.stock_kg || 0 }).select('id').single();
  const { data: savedProduct, error } = await query;
  if (error) raise(error);
  const productId = id || savedProduct?.id;
  if (!productId) throw new Error('Produto salvo, mas nao foi possivel identificar o registro.');

  if (input.product_type === 'produto_acabado' && input.recipe_raw_material_id && (input.recipe_consumption_kg || 0) > 0) {
    const { error: recipeError } = await supabase.from('product_recipes').upsert({
      owner_id: ownerId,
      product_id: productId,
      raw_material_id: input.recipe_raw_material_id,
      consumption_kg: input.recipe_consumption_kg,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'owner_id,product_id' });
    if (recipeError) raise(recipeError);
  } else {
    const { error: recipeDeleteError } = await supabase.from('product_recipes').delete().eq('owner_id', ownerId).eq('product_id', productId);
    if (recipeDeleteError) raise(recipeDeleteError);
  }
}

export async function saveSupplier(input: ContactInput, id?: string) {
  await saveContact('suppliers', input, id);
}

export async function saveCustomer(input: ContactInput, id?: string) {
  await saveContact('customers', input, id);
}

export async function deleteSupplier(id: string) {
  const ownerId = await requireCompanyOwnerId();
  const { error } = await supabase.from('suppliers').delete().eq('owner_id', ownerId).eq('id', id);
  if (error) raise(error);
}

export async function deleteCustomer(id: string) {
  const ownerId = await requireCompanyOwnerId();
  const { error } = await supabase.from('customers').delete().eq('owner_id', ownerId).eq('id', id);
  if (error) raise(error);
}

export async function createSupplier(input: ContactInput) {
  const ownerId = await requireCompanyOwnerId();
  const { data, error } = await supabase
    .from('suppliers')
    .insert({
      owner_id: ownerId,
      name: input.name.trim(),
      phone: cleanText(input.phone),
      document: cleanText(input.document),
      notes: cleanText(input.notes),
    })
    .select('*')
    .single();
  if (error) raise(error);
  return data as Supplier;
}

export async function createCustomer(input: ContactInput) {
  const ownerId = await requireCompanyOwnerId();
  const { data, error } = await supabase
    .from('customers')
    .insert({
      owner_id: ownerId,
      name: input.name.trim(),
      phone: cleanText(input.phone),
      document: cleanText(input.document),
      notes: cleanText(input.notes),
    })
    .select('*')
    .single();
  if (error) raise(error);
  return data as Customer;
}

async function saveContact(table: 'suppliers' | 'customers', input: ContactInput, id?: string) {
  const ownerId = await requireCompanyOwnerId();
  const payload = {
    owner_id: ownerId,
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

export async function updateStockEntry(
  id: string,
  input: {
    product_id: string;
    supplier_id: string;
    weight_kg: number;
    unit_cost: number;
    total_cost: number;
    occurred_at: string;
    notes: string;
  },
) {
  const { error } = await supabase.rpc('admin_update_stock_entry', {
    p_entry_id: id,
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

export async function createProduction(input: {
  raw_material_id: string;
  finished_product_id: string;
  consumed_kg: number;
  produced_kg: number;
  occurred_at: string;
  notes: string;
}) {
  const { error } = await supabase.rpc('create_production', {
    p_raw_material_id: input.raw_material_id,
    p_finished_product_id: input.finished_product_id,
    p_consumed_kg: input.consumed_kg,
    p_produced_kg: input.produced_kg,
    p_occurred_at: input.occurred_at,
    p_notes: cleanText(input.notes),
  });
  if (error) raise(error);
}

export async function updateProduction(id: string, input: {
  raw_material_id: string;
  finished_product_id: string;
  consumed_kg: number;
  produced_kg: number;
  occurred_at: string;
  notes: string;
}) {
  const { error } = await supabase.rpc('admin_update_production', {
    p_production_id: id,
    p_raw_material_id: input.raw_material_id,
    p_finished_product_id: input.finished_product_id,
    p_consumed_kg: input.consumed_kg,
    p_produced_kg: input.produced_kg,
    p_occurred_at: input.occurred_at,
    p_notes: cleanText(input.notes),
  });
  if (error) raise(error);
}

export async function deleteProduction(id: string) {
  const { error } = await supabase.rpc('admin_delete_production', { p_production_id: id });
  if (error) raise(error);
}

export async function saveCustomerProductPrice(input: { customer_id: string; product_id: string; price_per_kg: number }) {
  const ownerId = await requireCompanyOwnerId();
  if (input.price_per_kg <= 0) throw new Error('O preco por kg deve ser maior que zero.');
  const { error } = await supabase.from('customer_product_prices').upsert({
    owner_id: ownerId,
    customer_id: input.customer_id,
    product_id: input.product_id,
    price_per_kg: input.price_per_kg,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'owner_id,customer_id,product_id' });
  if (error) raise(error);
}

export async function deleteCustomerProductPrice(id: string) {
  const ownerId = await requireCompanyOwnerId();
  const { error } = await supabase.from('customer_product_prices').delete().eq('owner_id', ownerId).eq('id', id);
  if (error) raise(error);
}

export async function updateSale(
  id: string,
  input: {
    product_id: string;
    customer_id: string;
    weight_kg: number;
    unit_price: number;
    total_price: number;
    occurred_at: string;
    notes: string;
  },
) {
  const { error } = await supabase.rpc('admin_update_sale', {
    p_sale_id: id,
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
}, id?: string) {
  const ownerId = await requireCompanyOwnerId();
  const payload = {
    owner_id: ownerId,
    description: input.description.trim(),
    category: input.category,
    amount: input.amount,
    occurred_at: input.occurred_at,
    notes: cleanText(input.notes),
  };
  const query = id ? supabase.from('expenses').update(payload).eq('owner_id', ownerId).eq('id', id) : supabase.from('expenses').insert(payload);
  const { error } = await query;
  if (error) raise(error);
}

export async function exportBackup(): Promise<BackupPayload> {
  const data = await loadAppData();
  return {
    version: 3,
    exportedAt: new Date().toISOString(),
    products: data.products,
    suppliers: data.suppliers,
    customers: data.customers,
    entries: data.entries,
    sales: data.sales,
    expenses: data.expenses,
    productions: data.productions,
    customerPrices: data.customerPrices,
    productRecipes: data.productRecipes,
  };
}

export async function importBackup(payload: BackupPayload) {
  if (!payload || ![1, 2, 3].includes(payload.version)) {
    throw new Error('Arquivo de backup invalido ou versao nao suportada.');
  }

  const ownerId = await requireCompanyOwnerId();
  const tables = ['product_recipes', 'customer_product_prices', 'productions', 'sales', 'stock_entries', 'expenses', 'products', 'suppliers', 'customers'] as const;
  for (const table of tables) {
    const { error } = await supabase.from(table).delete().eq('owner_id', ownerId);
    if (error) raise(error);
  }

  const withOwner = <T extends { owner_id: string }>(rows: T[]) => rows.map((row) => ({ ...row, owner_id: ownerId }));
  const batches = [
    ['suppliers', withOwner(payload.suppliers)] as const,
    ['customers', withOwner(payload.customers)] as const,
    ['products', withOwner(payload.products)] as const,
    ['stock_entries', withOwner(payload.entries)] as const,
    ['sales', withOwner(payload.sales)] as const,
    ['expenses', withOwner(payload.expenses)] as const,
    ['productions', withOwner(payload.productions || [])] as const,
    ['customer_product_prices', withOwner(payload.customerPrices || [])] as const,
    ['product_recipes', withOwner(payload.productRecipes || [])] as const,
  ];

  for (const [table, rows] of batches) {
    if (!rows.length) continue;
    const { error } = await supabase.from(table as string).insert(rows as Record<string, unknown>[]);
    if (error) raise(error);
  }
}

export async function createUser(input: {
  email: string;
  password: string;
  name: string;
  role: 'owner' | 'operator';
  companyName?: string;
  companyId?: string;
  userLimit?: number;
}) {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no arquivo .env.');
  }

  const { data, error } = await supabase.auth.getSession();
  if (error) raise(error);
  if (!data.session?.access_token) {
    throw new Error('Sessao expirada. Entre novamente.');
  }

  let response: Response;
  try {
    response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/functions/v1/create-user`, {
      method: 'POST',
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${data.session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    });
  } catch {
    throw new Error(
      'Nao foi possivel acessar a Edge Function create-user. Verifique se ela foi publicada no Supabase e se as secrets SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY estao configuradas.',
    );
  }

  const result = await response.json().catch(() => null) as { error?: string } | null;
  if (!response.ok) {
    throw new Error(result?.error || `Erro ao criar usuario. Status ${response.status}.`);
  }
}

export async function updateUserRole(userId: string, role: 'owner' | 'operator') {
  const { error } = await supabase.rpc('admin_update_user_role', {
    p_user_id: userId,
    p_role: role,
  });
  if (error) raise(error);
}

export async function attachExistingOperator(input: { email: string; name: string }) {
  const { error } = await supabase.rpc('owner_attach_existing_operator', {
    p_email: input.email.trim().toLowerCase(),
    p_name: input.name.trim(),
  });
  if (error) raise(error);
}

export async function removeOperator(userId: string) {
  const { error } = await supabase.rpc('owner_remove_operator', {
    p_user_id: userId,
  });
  if (error) raise(error);
}

export async function updateCompanyLimit(companyId: string, userLimit: number) {
  const { error } = await supabase.rpc('super_admin_update_company_limit', {
    p_company_id: companyId,
    p_user_limit: userLimit,
  });
  if (error) raise(error);
}

export async function setSupportCompany(companyId: string) {
  const { error } = await supabase.rpc('super_admin_set_support_company', {
    p_company_id: companyId,
  });
  if (error) raise(error);
}

export async function clearSupportCompany() {
  const { error } = await supabase.rpc('super_admin_clear_support_company');
  if (error) raise(error);
}

export async function deleteStockEntry(id: string) {
  const { error } = await supabase.rpc('admin_delete_stock_entry', { p_entry_id: id });
  if (error) raise(error);
}

export async function deleteSale(id: string) {
  const { error } = await supabase.rpc('admin_delete_sale', { p_sale_id: id });
  if (error) raise(error);
}

export async function deleteExpense(id: string) {
  const { error } = await supabase.rpc('admin_delete_expense', { p_expense_id: id });
  if (error) raise(error);
}

export async function deleteProduct(id: string) {
  const { error } = await supabase.rpc('admin_delete_product', { p_product_id: id });
  if (!error) return;

  const message = error.message || '';
  if (!message.includes('Could not find the function') && !message.includes('schema cache')) {
    raise(error);
  }

  const ownerId = await requireCompanyOwnerId();
  const [{ data: entries, error: entriesError }, { data: sales, error: salesError }] = await Promise.all([
    supabase.from('stock_entries').select('id').eq('owner_id', ownerId).eq('product_id', id).limit(1),
    supabase.from('sales').select('id').eq('owner_id', ownerId).eq('product_id', id).limit(1),
  ]);

  if (entriesError) raise(entriesError);
  if (salesError) raise(salesError);
  if (entries?.length) throw new Error('Este produto possui entradas registradas. Inative o produto para preservar o historico.');
  if (sales?.length) throw new Error('Este produto possui vendas registradas. Inative o produto para preservar o historico.');

  const { error: deleteError } = await supabase.from('products').delete().eq('owner_id', ownerId).eq('id', id);
  if (deleteError) raise(deleteError);
}
