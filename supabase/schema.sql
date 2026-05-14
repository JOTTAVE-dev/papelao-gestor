create extension if not exists pgcrypto;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  category text not null,
  price_per_kg numeric(12, 2) not null default 0 check (price_per_kg >= 0),
  stock_kg numeric(12, 2) not null default 0 check (stock_kg >= 0),
  min_stock_kg numeric(12, 2) not null default 0 check (min_stock_kg >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  phone text,
  document text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  phone text,
  document text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.stock_entries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  weight_kg numeric(12, 2) not null check (weight_kg > 0),
  unit_cost numeric(12, 2) not null default 0 check (unit_cost >= 0),
  total_cost numeric(12, 2) not null default 0 check (total_cost >= 0),
  occurred_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  weight_kg numeric(12, 2) not null check (weight_kg > 0),
  unit_price numeric(12, 2) not null default 0 check (unit_price >= 0),
  total_price numeric(12, 2) not null default 0 check (total_price >= 0),
  occurred_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  description text not null,
  category text not null,
  amount numeric(12, 2) not null check (amount > 0),
  occurred_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists products_owner_idx on public.products(owner_id);
create unique index if not exists products_owner_name_unique_idx on public.products(owner_id, lower(trim(name)));
create index if not exists suppliers_owner_idx on public.suppliers(owner_id);
create index if not exists customers_owner_idx on public.customers(owner_id);
create index if not exists stock_entries_owner_date_idx on public.stock_entries(owner_id, occurred_at desc);
create index if not exists sales_owner_date_idx on public.sales(owner_id, occurred_at desc);
create index if not exists expenses_owner_date_idx on public.expenses(owner_id, occurred_at desc);

alter table public.products enable row level security;
alter table public.suppliers enable row level security;
alter table public.customers enable row level security;
alter table public.stock_entries enable row level security;
alter table public.sales enable row level security;
alter table public.expenses enable row level security;

create policy "products_select_own" on public.products for select using (owner_id = auth.uid());
create policy "products_insert_own" on public.products for insert with check (owner_id = auth.uid());
create policy "products_update_own" on public.products for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "products_delete_own" on public.products for delete using (owner_id = auth.uid());

create policy "suppliers_select_own" on public.suppliers for select using (owner_id = auth.uid());
create policy "suppliers_insert_own" on public.suppliers for insert with check (owner_id = auth.uid());
create policy "suppliers_update_own" on public.suppliers for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "suppliers_delete_own" on public.suppliers for delete using (owner_id = auth.uid());

create policy "customers_select_own" on public.customers for select using (owner_id = auth.uid());
create policy "customers_insert_own" on public.customers for insert with check (owner_id = auth.uid());
create policy "customers_update_own" on public.customers for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "customers_delete_own" on public.customers for delete using (owner_id = auth.uid());

create policy "stock_entries_select_own" on public.stock_entries for select using (owner_id = auth.uid());
create policy "stock_entries_insert_own" on public.stock_entries for insert with check (owner_id = auth.uid());
create policy "stock_entries_delete_own" on public.stock_entries for delete using (owner_id = auth.uid());

create policy "sales_select_own" on public.sales for select using (owner_id = auth.uid());
create policy "sales_insert_own" on public.sales for insert with check (owner_id = auth.uid());
create policy "sales_delete_own" on public.sales for delete using (owner_id = auth.uid());

create policy "expenses_select_own" on public.expenses for select using (owner_id = auth.uid());
create policy "expenses_insert_own" on public.expenses for insert with check (owner_id = auth.uid());
create policy "expenses_delete_own" on public.expenses for delete using (owner_id = auth.uid());

create or replace function public.create_stock_entry(
  p_product_id uuid,
  p_supplier_id uuid,
  p_weight_kg numeric,
  p_unit_cost numeric,
  p_total_cost numeric,
  p_occurred_at timestamptz,
  p_notes text
) returns void
language plpgsql
as $$
declare
  v_owner uuid := auth.uid();
begin
  if v_owner is null then
    raise exception 'Usuario nao autenticado.';
  end if;

  if p_weight_kg <= 0 then
    raise exception 'Peso da entrada deve ser maior que zero.';
  end if;

  if not exists (select 1 from public.suppliers where id = p_supplier_id and owner_id = v_owner) then
    raise exception 'Fornecedor invalido.';
  end if;

  update public.products
     set stock_kg = stock_kg + p_weight_kg,
         updated_at = now()
   where id = p_product_id
     and owner_id = v_owner
     and active = true;

  if not found then
    raise exception 'Produto invalido ou inativo.';
  end if;

  insert into public.stock_entries (
    owner_id, product_id, supplier_id, weight_kg, unit_cost, total_cost, occurred_at, notes
  ) values (
    v_owner, p_product_id, p_supplier_id, p_weight_kg, p_unit_cost, p_total_cost, p_occurred_at, p_notes
  );
end;
$$;

create or replace function public.create_sale(
  p_product_id uuid,
  p_customer_id uuid,
  p_weight_kg numeric,
  p_unit_price numeric,
  p_total_price numeric,
  p_occurred_at timestamptz,
  p_notes text
) returns void
language plpgsql
as $$
declare
  v_owner uuid := auth.uid();
  v_stock numeric;
begin
  if v_owner is null then
    raise exception 'Usuario nao autenticado.';
  end if;

  if p_weight_kg <= 0 then
    raise exception 'Peso da venda deve ser maior que zero.';
  end if;

  if not exists (select 1 from public.customers where id = p_customer_id and owner_id = v_owner) then
    raise exception 'Cliente invalido.';
  end if;

  select stock_kg
    into v_stock
    from public.products
   where id = p_product_id
     and owner_id = v_owner
     and active = true
   for update;

  if v_stock is null then
    raise exception 'Produto invalido ou inativo.';
  end if;

  if v_stock < p_weight_kg then
    raise exception 'Estoque insuficiente para esta venda.';
  end if;

  update public.products
     set stock_kg = stock_kg - p_weight_kg,
         updated_at = now()
   where id = p_product_id
     and owner_id = v_owner;

  insert into public.sales (
    owner_id, product_id, customer_id, weight_kg, unit_price, total_price, occurred_at, notes
  ) values (
    v_owner, p_product_id, p_customer_id, p_weight_kg, p_unit_price, p_total_price, p_occurred_at, p_notes
  );
end;
$$;

grant execute on function public.create_stock_entry(uuid, uuid, numeric, numeric, numeric, timestamptz, text) to authenticated;
grant execute on function public.create_sale(uuid, uuid, numeric, numeric, numeric, timestamptz, text) to authenticated;
