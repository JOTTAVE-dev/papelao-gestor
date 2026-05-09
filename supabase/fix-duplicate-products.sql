-- Corrige produtos duplicados antes de criar a trava de nome unico.
-- Mantem o produto mais antigo com o nome original e renomeia os demais,
-- preservando entradas, vendas e historico ligados a cada produto.

with ranked_products as (
  select
    id,
    row_number() over (
      partition by owner_id, lower(trim(name))
      order by created_at asc, id asc
    ) as duplicate_number
  from public.products
)
update public.products p
set
  name = p.name || ' (duplicado ' || ranked_products.duplicate_number || ')',
  updated_at = now()
from ranked_products
where p.id = ranked_products.id
  and ranked_products.duplicate_number > 1;

create unique index if not exists products_owner_name_unique_idx
on public.products(owner_id, lower(trim(name)));
