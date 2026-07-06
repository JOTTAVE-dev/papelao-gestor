-- Execute depois de schema.sql e admin-features.sql.
alter table public.products add column if not exists product_type text
  check (product_type in ('materia_prima', 'produto_acabado'));
alter table public.products add column if not exists average_cost numeric(14,4) not null default 0 check (average_cost >= 0);
alter table public.products add column if not exists stock_value numeric(14,2) not null default 0 check (stock_value >= 0);
alter table public.sales add column if not exists cost_of_goods numeric(14,2) not null default 0 check (cost_of_goods >= 0);

-- Classificacao inicial para produtos antigos criados antes desta coluna existir.
update public.products
set product_type = case
  when lower(name) like '%miolo%' or lower(category) like '%materia%' then 'materia_prima'
  else 'produto_acabado'
end,
category = case
  when lower(name) like '%miolo%' or lower(category) like '%materia%' then 'Materia-prima'
  else 'Produto acabado'
end
where product_type is null;

-- Estimativa inicial deterministica para estoques preexistentes.
update public.products p
set average_cost = coalesce(x.average_cost, 0),
    stock_value = round(p.stock_kg * coalesce(x.average_cost, 0), 2)
from (
  select product_id, sum(total_cost) / nullif(sum(weight_kg), 0) as average_cost
  from public.stock_entries group by product_id
) x
where x.product_id = p.id and p.average_cost = 0 and p.stock_value = 0;

create table if not exists public.productions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  raw_material_id uuid not null references public.products(id) on delete restrict,
  finished_product_id uuid not null references public.products(id) on delete restrict,
  consumed_kg numeric(12,2) not null check (consumed_kg > 0),
  produced_kg numeric(12,2) not null check (produced_kg > 0),
  loss_kg numeric(12,2) not null check (loss_kg >= 0),
  yield_percent numeric(8,2) not null check (yield_percent between 0 and 100),
  transferred_cost numeric(14,2) not null check (transferred_cost >= 0),
  unit_cost numeric(14,4) not null check (unit_cost >= 0),
  occurred_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now(),
  check (raw_material_id <> finished_product_id),
  check (produced_kg <= consumed_kg)
);

create table if not exists public.customer_product_prices (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  price_per_kg numeric(12,2) not null check (price_per_kg > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, customer_id, product_id)
);

create table if not exists public.product_recipes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  raw_material_id uuid not null references public.products(id) on delete restrict,
  consumption_kg numeric(12,4) not null check (consumption_kg > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, product_id),
  check (product_id <> raw_material_id)
);

create index if not exists productions_owner_date_idx on public.productions(owner_id, occurred_at desc);
create index if not exists customer_prices_owner_idx on public.customer_product_prices(owner_id, customer_id);
create index if not exists product_recipes_owner_idx on public.product_recipes(owner_id, product_id);
alter table public.productions enable row level security;
alter table public.customer_product_prices enable row level security;
alter table public.product_recipes enable row level security;

drop policy if exists productions_select_company on public.productions;
drop policy if exists productions_insert_company on public.productions;
drop policy if exists productions_update_admin on public.productions;
drop policy if exists productions_delete_admin on public.productions;
create policy productions_select_company on public.productions for select using (public.current_user_is_super_admin() or owner_id = public.current_company_owner_id());
create policy productions_insert_company on public.productions for insert with check (owner_id = public.current_company_owner_id());
create policy productions_update_admin on public.productions for update using (public.can_manage_owner_records(owner_id));
create policy productions_delete_admin on public.productions for delete using (public.can_manage_owner_records(owner_id));

drop policy if exists customer_prices_select_company on public.customer_product_prices;
drop policy if exists customer_prices_write_company on public.customer_product_prices;
drop policy if exists customer_prices_update_company on public.customer_product_prices;
drop policy if exists customer_prices_delete_company on public.customer_product_prices;
create policy customer_prices_select_company on public.customer_product_prices for select using (public.current_user_is_super_admin() or owner_id = public.current_company_owner_id());
create policy customer_prices_write_company on public.customer_product_prices for insert with check (owner_id = public.current_company_owner_id());
create policy customer_prices_update_company on public.customer_product_prices for update using (owner_id = public.current_company_owner_id()) with check (owner_id = public.current_company_owner_id());
create policy customer_prices_delete_company on public.customer_product_prices for delete using (owner_id = public.current_company_owner_id());

drop policy if exists product_recipes_select_company on public.product_recipes;
drop policy if exists product_recipes_write_company on public.product_recipes;
drop policy if exists product_recipes_update_company on public.product_recipes;
drop policy if exists product_recipes_delete_company on public.product_recipes;
create policy product_recipes_select_company on public.product_recipes for select using (public.current_user_is_super_admin() or owner_id = public.current_company_owner_id());
create policy product_recipes_write_company on public.product_recipes for insert with check (owner_id = public.current_company_owner_id());
create policy product_recipes_update_company on public.product_recipes for update using (owner_id = public.current_company_owner_id()) with check (owner_id = public.current_company_owner_id());
create policy product_recipes_delete_company on public.product_recipes for delete using (owner_id = public.current_company_owner_id());

create or replace function public.ensure_default_catalog() returns void language plpgsql security invoker as $$
begin
  if auth.uid() is null then raise exception 'Usuario nao autenticado.'; end if;
  -- Catalogo inicial desativado: os produtos devem ser cadastrados pelo proprietario.
end $$;

create or replace function public.create_stock_entry(p_product_id uuid,p_supplier_id uuid,p_weight_kg numeric,p_unit_cost numeric,p_total_cost numeric,p_occurred_at timestamptz,p_notes text)
returns void language plpgsql as $$
declare v_owner uuid := public.current_company_owner_id(); v_total numeric;
begin
  if p_weight_kg <= 0 then raise exception 'Peso da entrada deve ser maior que zero.'; end if;
  if not exists(select 1 from public.suppliers where id=p_supplier_id and owner_id=v_owner) then raise exception 'Fornecedor invalido.'; end if;
  v_total := coalesce(nullif(p_total_cost,0), p_weight_kg*p_unit_cost);
  update public.products set stock_kg=stock_kg+p_weight_kg, stock_value=round(stock_value+v_total,2),
    average_cost=round((stock_value+v_total)/(stock_kg+p_weight_kg),4), updated_at=now()
  where id=p_product_id and owner_id=v_owner and active and product_type='materia_prima';
  if not found then raise exception 'Selecione uma materia-prima ativa.'; end if;
  insert into public.stock_entries(owner_id,product_id,supplier_id,weight_kg,unit_cost,total_cost,occurred_at,notes)
  values(v_owner,p_product_id,p_supplier_id,p_weight_kg,p_unit_cost,v_total,p_occurred_at,p_notes);
end $$;

create or replace function public.create_production(p_raw_material_id uuid,p_finished_product_id uuid,p_consumed_kg numeric,p_produced_kg numeric,p_occurred_at timestamptz,p_notes text)
returns void language plpgsql as $$
declare v_owner uuid:=public.current_company_owner_id(); v_raw public.products%rowtype; v_cost numeric;
begin
  if p_consumed_kg<=0 or p_produced_kg<=0 then raise exception 'Os pesos devem ser maiores que zero.'; end if;
  if p_produced_kg>p_consumed_kg then raise exception 'O peso produzido nao pode superar o consumido.'; end if;
  select * into v_raw from public.products where id=p_raw_material_id and owner_id=v_owner and active and product_type='materia_prima' for update;
  if v_raw.id is null then raise exception 'Materia-prima invalida.'; end if;
  if v_raw.stock_kg<p_consumed_kg then raise exception 'Estoque de materia-prima insuficiente.'; end if;
  if not exists(select 1 from public.products where id=p_finished_product_id and owner_id=v_owner and active and product_type='produto_acabado') then raise exception 'Produto acabado invalido.'; end if;
  v_cost:=round(v_raw.average_cost*p_consumed_kg,2);
  update public.products set stock_kg=stock_kg-p_consumed_kg, stock_value=greatest(0,round(stock_value-v_cost,2)),
    average_cost=case when stock_kg-p_consumed_kg=0 then 0 else average_cost end, updated_at=now() where id=p_raw_material_id;
  update public.products set stock_kg=stock_kg+p_produced_kg, stock_value=round(stock_value+v_cost,2),
    average_cost=round((stock_value+v_cost)/(stock_kg+p_produced_kg),4), updated_at=now() where id=p_finished_product_id;
  insert into public.productions(owner_id,raw_material_id,finished_product_id,consumed_kg,produced_kg,loss_kg,yield_percent,transferred_cost,unit_cost,occurred_at,notes)
  values(v_owner,p_raw_material_id,p_finished_product_id,p_consumed_kg,p_produced_kg,p_consumed_kg-p_produced_kg,round(p_produced_kg/p_consumed_kg*100,2),v_cost,round(v_cost/p_produced_kg,4),p_occurred_at,p_notes);
end $$;

create or replace function public.create_sale(p_product_id uuid,p_customer_id uuid,p_weight_kg numeric,p_unit_price numeric,p_total_price numeric,p_occurred_at timestamptz,p_notes text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_owner uuid:=public.current_company_owner_id(); v_product public.products%rowtype; v_cost numeric;
begin
  if p_weight_kg<=0 then raise exception 'Peso da venda deve ser maior que zero.'; end if;
  if not exists(select 1 from public.customers where id=p_customer_id and owner_id=v_owner) then raise exception 'Cliente invalido.'; end if;
  select * into v_product from public.products where id=p_product_id and owner_id=v_owner and active and product_type='produto_acabado' for update;
  if v_product.id is null then raise exception 'Selecione um produto acabado ativo.'; end if;
  if v_product.stock_kg<p_weight_kg then raise exception 'Estoque insuficiente para esta venda.'; end if;
  v_cost:=round(v_product.average_cost*p_weight_kg,2);
  update public.products set stock_kg=stock_kg-p_weight_kg,stock_value=greatest(0,round(stock_value-v_cost,2)),
    average_cost=case when stock_kg-p_weight_kg=0 then 0 else average_cost end,updated_at=now() where id=p_product_id;
  insert into public.sales(owner_id,product_id,customer_id,weight_kg,unit_price,total_price,cost_of_goods,occurred_at,notes)
  values(v_owner,p_product_id,p_customer_id,p_weight_kg,p_unit_price,p_total_price,v_cost,p_occurred_at,p_notes);
end $$;

create or replace function public.admin_delete_stock_entry(p_entry_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v public.stock_entries%rowtype; v_stock numeric;
begin
  select * into v from public.stock_entries where id=p_entry_id for update;
  if v.id is null then raise exception 'Entrada nao encontrada.'; end if;
  if not public.can_manage_owner_records(v.owner_id) then raise exception 'Sem permissao para editar esta entrada.'; end if;
  select stock_kg into v_stock from public.products where id=v.product_id for update;
  if v_stock<v.weight_kg then raise exception 'Nao e possivel apagar: estoque ja foi consumido.'; end if;
  update public.products set stock_kg=stock_kg-v.weight_kg,stock_value=greatest(0,round(stock_value-v.total_cost,2)),
    average_cost=case when stock_kg-v.weight_kg=0 then 0 else round(greatest(0,stock_value-v.total_cost)/(stock_kg-v.weight_kg),4) end,updated_at=now() where id=v.product_id;
  delete from public.stock_entries where id=v.id;
end $$;

create or replace function public.admin_update_stock_entry(p_entry_id uuid,p_product_id uuid,p_supplier_id uuid,p_weight_kg numeric,p_unit_cost numeric,p_total_cost numeric,p_occurred_at timestamptz,p_notes text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v public.stock_entries%rowtype; v_stock numeric; v_total numeric;
begin
  select * into v from public.stock_entries where id=p_entry_id for update;
  if v.id is null then raise exception 'Entrada nao encontrada.'; end if;
  if not public.can_manage_owner_records(v.owner_id) then raise exception 'Sem permissao para editar esta entrada.'; end if;
  select stock_kg into v_stock from public.products where id=v.product_id for update;
  if v_stock<v.weight_kg then raise exception 'Nao e possivel editar: estoque original ja foi consumido.'; end if;
  if not exists(select 1 from public.products where id=p_product_id and owner_id=v.owner_id and product_type='materia_prima' and active) then raise exception 'Materia-prima invalida.'; end if;
  if not exists(select 1 from public.suppliers where id=p_supplier_id and owner_id=v.owner_id) then raise exception 'Fornecedor invalido.'; end if;
  v_total:=coalesce(nullif(p_total_cost,0),p_weight_kg*p_unit_cost);
  update public.products set stock_kg=stock_kg-v.weight_kg,stock_value=greatest(0,round(stock_value-v.total_cost,2)),
    average_cost=case when stock_kg-v.weight_kg=0 then 0 else round(greatest(0,stock_value-v.total_cost)/(stock_kg-v.weight_kg),4) end,updated_at=now() where id=v.product_id;
  update public.products set stock_kg=stock_kg+p_weight_kg,stock_value=round(stock_value+v_total,2),
    average_cost=round((stock_value+v_total)/(stock_kg+p_weight_kg),4),updated_at=now() where id=p_product_id;
  update public.stock_entries set product_id=p_product_id,supplier_id=p_supplier_id,weight_kg=p_weight_kg,unit_cost=p_unit_cost,total_cost=v_total,occurred_at=p_occurred_at,notes=p_notes where id=v.id;
end $$;

create or replace function public.admin_delete_sale(p_sale_id uuid) returns void language plpgsql as $$
declare v public.sales%rowtype;
begin
  select * into v from public.sales where id=p_sale_id and public.can_manage_owner_records(owner_id) for update;
  if v.id is null then raise exception 'Venda nao encontrada.'; end if;
  update public.products set stock_kg=stock_kg+v.weight_kg,stock_value=round(stock_value+v.cost_of_goods,2),
    average_cost=round((stock_value+v.cost_of_goods)/(stock_kg+v.weight_kg),4),updated_at=now() where id=v.product_id;
  delete from public.sales where id=v.id;
end $$;

create or replace function public.admin_update_sale(p_sale_id uuid,p_product_id uuid,p_customer_id uuid,p_weight_kg numeric,p_unit_price numeric,p_total_price numeric,p_occurred_at timestamptz,p_notes text)
returns void language plpgsql as $$
declare v public.sales%rowtype; v_product public.products%rowtype; v_new_cost numeric;
begin
  select * into v from public.sales where id=p_sale_id and public.can_manage_owner_records(owner_id) for update;
  if v.id is null then raise exception 'Venda nao encontrada.'; end if;
  if not exists(select 1 from public.customers where id=p_customer_id and owner_id=v.owner_id) then raise exception 'Cliente invalido.'; end if;
  update public.products set stock_kg=stock_kg+v.weight_kg,stock_value=round(stock_value+v.cost_of_goods,2),
    average_cost=round((stock_value+v.cost_of_goods)/(stock_kg+v.weight_kg),4),updated_at=now() where id=v.product_id;
  select * into v_product from public.products where id=p_product_id and owner_id=v.owner_id and product_type='produto_acabado' and active for update;
  if v_product.id is null then raise exception 'Produto acabado invalido.'; end if;
  if v_product.stock_kg<p_weight_kg then raise exception 'Estoque insuficiente para esta venda.'; end if;
  v_new_cost:=round(v_product.average_cost*p_weight_kg,2);
  update public.products set stock_kg=stock_kg-p_weight_kg,stock_value=greatest(0,round(stock_value-v_new_cost,2)),
    average_cost=case when stock_kg-p_weight_kg=0 then 0 else average_cost end,updated_at=now() where id=p_product_id;
  update public.sales set product_id=p_product_id,customer_id=p_customer_id,weight_kg=p_weight_kg,unit_price=p_unit_price,total_price=p_total_price,cost_of_goods=v_new_cost,occurred_at=p_occurred_at,notes=p_notes where id=v.id;
end $$;

create or replace function public.admin_delete_production(p_production_id uuid) returns void language plpgsql as $$
declare v public.productions%rowtype; v_finished public.products%rowtype;
begin
  select * into v from public.productions where id=p_production_id and public.can_manage_owner_records(owner_id) for update;
  if v.id is null then raise exception 'Producao nao encontrada.'; end if;
  select * into v_finished from public.products where id=v.finished_product_id for update;
  if v_finished.stock_kg<v.produced_kg then raise exception 'Nao e possivel excluir: produto acabado ja foi consumido ou vendido.'; end if;
  update public.products set stock_kg=stock_kg+v.consumed_kg,stock_value=round(stock_value+v.transferred_cost,2),
    average_cost=round((stock_value+v.transferred_cost)/(stock_kg+v.consumed_kg),4),updated_at=now() where id=v.raw_material_id;
  update public.products set stock_kg=stock_kg-v.produced_kg,stock_value=greatest(0,round(stock_value-v.transferred_cost,2)),
    average_cost=case when stock_kg-v.produced_kg=0 then 0 else round(greatest(0,stock_value-v.transferred_cost)/(stock_kg-v.produced_kg),4) end,updated_at=now() where id=v.finished_product_id;
  delete from public.productions where id=v.id;
end $$;

create or replace function public.admin_update_production(p_production_id uuid,p_raw_material_id uuid,p_finished_product_id uuid,p_consumed_kg numeric,p_produced_kg numeric,p_occurred_at timestamptz,p_notes text)
returns void language plpgsql as $$
begin
  perform public.admin_delete_production(p_production_id);
  perform public.create_production(p_raw_material_id,p_finished_product_id,p_consumed_kg,p_produced_kg,p_occurred_at,p_notes);
end $$;

grant execute on function public.ensure_default_catalog() to authenticated;
grant execute on function public.create_stock_entry(uuid,uuid,numeric,numeric,numeric,timestamptz,text) to authenticated;
grant execute on function public.create_sale(uuid,uuid,numeric,numeric,numeric,timestamptz,text) to authenticated;
grant execute on function public.create_production(uuid,uuid,numeric,numeric,timestamptz,text) to authenticated;
grant execute on function public.admin_update_production(uuid,uuid,uuid,numeric,numeric,timestamptz,text) to authenticated;
grant execute on function public.admin_delete_production(uuid) to authenticated;
