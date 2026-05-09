-- Recursos de admin, usuarios da mesma empresa e exclusao segura de lancamentos.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text,
  role text not null default 'operador' check (role in ('admin', 'operador')),
  company_owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create or replace function public.current_company_owner_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select company_owner_id from public.profiles where id = auth.uid()),
    auth.uid()
  )
$$;

create or replace function public.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.profiles
     where id = auth.uid()
       and role = 'admin'
  )
$$;

insert into public.profiles (id, email, name, role, company_owner_id)
select id, email, raw_user_meta_data->>'name', 'operador', id
from auth.users
on conflict (id) do nothing;

-- Promove o usuario que ja criou os dados atuais a admin.
insert into public.profiles (id, email, name, role, company_owner_id)
select id, email, raw_user_meta_data->>'name', 'admin', id
from auth.users
where id = '11603412-e40a-476a-9839-e7f47eebc604'
on conflict (id) do update set role = 'admin', company_owner_id = excluded.company_owner_id;

drop policy if exists "profiles_select_company" on public.profiles;
drop policy if exists "profiles_update_admin" on public.profiles;

create policy "profiles_select_company"
on public.profiles for select
using (company_owner_id = public.current_company_owner_id());

create policy "profiles_update_admin"
on public.profiles for update
using (public.current_user_is_admin() and company_owner_id = public.current_company_owner_id())
with check (public.current_user_is_admin() and company_owner_id = public.current_company_owner_id());

drop policy if exists "products_select_own" on public.products;
drop policy if exists "products_insert_own" on public.products;
drop policy if exists "products_update_own" on public.products;
drop policy if exists "products_delete_own" on public.products;
drop policy if exists "suppliers_select_own" on public.suppliers;
drop policy if exists "suppliers_insert_own" on public.suppliers;
drop policy if exists "suppliers_update_own" on public.suppliers;
drop policy if exists "suppliers_delete_own" on public.suppliers;
drop policy if exists "customers_select_own" on public.customers;
drop policy if exists "customers_insert_own" on public.customers;
drop policy if exists "customers_update_own" on public.customers;
drop policy if exists "customers_delete_own" on public.customers;
drop policy if exists "stock_entries_select_own" on public.stock_entries;
drop policy if exists "stock_entries_insert_own" on public.stock_entries;
drop policy if exists "stock_entries_delete_own" on public.stock_entries;
drop policy if exists "sales_select_own" on public.sales;
drop policy if exists "sales_insert_own" on public.sales;
drop policy if exists "sales_delete_own" on public.sales;
drop policy if exists "expenses_select_own" on public.expenses;
drop policy if exists "expenses_insert_own" on public.expenses;
drop policy if exists "expenses_delete_own" on public.expenses;

create policy "products_select_company" on public.products for select using (owner_id = public.current_company_owner_id());
create policy "products_insert_company" on public.products for insert with check (owner_id = public.current_company_owner_id());
create policy "products_update_company" on public.products for update using (owner_id = public.current_company_owner_id()) with check (owner_id = public.current_company_owner_id());
create policy "products_delete_admin" on public.products for delete using (owner_id = public.current_company_owner_id() and public.current_user_is_admin());

create policy "suppliers_select_company" on public.suppliers for select using (owner_id = public.current_company_owner_id());
create policy "suppliers_insert_company" on public.suppliers for insert with check (owner_id = public.current_company_owner_id());
create policy "suppliers_update_company" on public.suppliers for update using (owner_id = public.current_company_owner_id()) with check (owner_id = public.current_company_owner_id());
create policy "suppliers_delete_admin" on public.suppliers for delete using (owner_id = public.current_company_owner_id() and public.current_user_is_admin());

create policy "customers_select_company" on public.customers for select using (owner_id = public.current_company_owner_id());
create policy "customers_insert_company" on public.customers for insert with check (owner_id = public.current_company_owner_id());
create policy "customers_update_company" on public.customers for update using (owner_id = public.current_company_owner_id()) with check (owner_id = public.current_company_owner_id());
create policy "customers_delete_admin" on public.customers for delete using (owner_id = public.current_company_owner_id() and public.current_user_is_admin());

create policy "stock_entries_select_company" on public.stock_entries for select using (owner_id = public.current_company_owner_id());
create policy "stock_entries_insert_company" on public.stock_entries for insert with check (owner_id = public.current_company_owner_id());
create policy "stock_entries_delete_admin" on public.stock_entries for delete using (owner_id = public.current_company_owner_id() and public.current_user_is_admin());

create policy "sales_select_company" on public.sales for select using (owner_id = public.current_company_owner_id());
create policy "sales_insert_company" on public.sales for insert with check (owner_id = public.current_company_owner_id());
create policy "sales_delete_admin" on public.sales for delete using (owner_id = public.current_company_owner_id() and public.current_user_is_admin());

create policy "expenses_select_company" on public.expenses for select using (owner_id = public.current_company_owner_id());
create policy "expenses_insert_company" on public.expenses for insert with check (owner_id = public.current_company_owner_id());
create policy "expenses_delete_admin" on public.expenses for delete using (owner_id = public.current_company_owner_id() and public.current_user_is_admin());

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
  v_owner uuid := public.current_company_owner_id();
begin
  if auth.uid() is null then
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
  v_owner uuid := public.current_company_owner_id();
  v_stock numeric;
begin
  if auth.uid() is null then
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

create or replace function public.admin_update_user_role(p_user_id uuid, p_role text)
returns void
language plpgsql
as $$
begin
  if not public.current_user_is_admin() then
    raise exception 'Apenas administradores podem alterar usuarios.';
  end if;

  if p_role not in ('admin', 'operador') then
    raise exception 'Perfil invalido.';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'Voce nao pode alterar seu proprio perfil.';
  end if;

  update public.profiles
     set role = p_role
   where id = p_user_id
     and company_owner_id = public.current_company_owner_id();
end;
$$;

create or replace function public.admin_delete_stock_entry(p_entry_id uuid)
returns void
language plpgsql
as $$
declare
  v_entry public.stock_entries%rowtype;
  v_stock numeric;
begin
  if not public.current_user_is_admin() then
    raise exception 'Apenas administradores podem apagar lancamentos.';
  end if;

  select * into v_entry
    from public.stock_entries
   where id = p_entry_id
     and owner_id = public.current_company_owner_id()
   for update;

  if v_entry.id is null then
    raise exception 'Entrada nao encontrada.';
  end if;

  select stock_kg into v_stock from public.products where id = v_entry.product_id for update;
  if v_stock < v_entry.weight_kg then
    raise exception 'Nao e possivel apagar: estoque ficaria negativo.';
  end if;

  update public.products
     set stock_kg = stock_kg - v_entry.weight_kg,
         updated_at = now()
   where id = v_entry.product_id;

  delete from public.stock_entries where id = v_entry.id;
end;
$$;

create or replace function public.admin_delete_sale(p_sale_id uuid)
returns void
language plpgsql
as $$
declare
  v_sale public.sales%rowtype;
begin
  if not public.current_user_is_admin() then
    raise exception 'Apenas administradores podem apagar lancamentos.';
  end if;

  select * into v_sale
    from public.sales
   where id = p_sale_id
     and owner_id = public.current_company_owner_id()
   for update;

  if v_sale.id is null then
    raise exception 'Venda nao encontrada.';
  end if;

  update public.products
     set stock_kg = stock_kg + v_sale.weight_kg,
         updated_at = now()
   where id = v_sale.product_id;

  delete from public.sales where id = v_sale.id;
end;
$$;

create or replace function public.admin_delete_expense(p_expense_id uuid)
returns void
language plpgsql
as $$
begin
  if not public.current_user_is_admin() then
    raise exception 'Apenas administradores podem apagar lancamentos.';
  end if;

  delete from public.expenses
   where id = p_expense_id
     and owner_id = public.current_company_owner_id();
end;
$$;

grant execute on function public.current_company_owner_id() to authenticated;
grant execute on function public.current_user_is_admin() to authenticated;
grant execute on function public.admin_update_user_role(uuid, text) to authenticated;
grant execute on function public.admin_delete_stock_entry(uuid) to authenticated;
grant execute on function public.admin_delete_sale(uuid) to authenticated;
grant execute on function public.admin_delete_expense(uuid) to authenticated;
