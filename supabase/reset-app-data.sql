-- ATENCAO: este script apaga os dados operacionais do aplicativo.
-- Ele preserva usuarios, perfis e empresas para nao bloquear o acesso ao sistema.
--
-- Apaga:
-- - produtos
-- - fornecedores
-- - clientes
-- - entradas de estoque
-- - vendas
-- - despesas
-- - producoes
-- - precos por cliente
--
-- Execute no SQL Editor do Supabase somente se tiver certeza.

begin;

truncate table
  public.product_recipes,
  public.customer_product_prices,
  public.productions,
  public.sales,
  public.stock_entries,
  public.expenses,
  public.products,
  public.suppliers,
  public.customers
restart identity cascade;

commit;
