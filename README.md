# Papelão Gestor

Sistema web para controle de distribuidora de papelão com Supabase como banco de dados.

## Configuração

1. Crie um projeto no Supabase.
2. No painel do Supabase, abra o SQL Editor e execute, nesta ordem: `supabase/schema.sql`, `supabase/admin-features.sql` e `supabase/production-and-pricing.sql`.
3. Copie `.env.example` para `.env` e preencha:

```bash
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-anon-publica
```

4. Instale dependências e rode o app:

```bash
npm install
npm run dev
```

## Acesso

Na tela de login, use "Criar primeiro acesso do gestor" para cadastrar o email e senha do gestor pelo Supabase Auth. Depois, use o mesmo email e senha para entrar.

## Funcionalidades

- Dashboard com vendas, despesas, saldo do dia e alertas de estoque baixo.
- Matéria-prima e produtos acabados com estoque, custo médio e valor do estoque.
- Produção com consumo de papel miolo, rendimento e perdas.
- Preços específicos por cliente e produto, com ajuste pontual na venda.
- Cadastro de fornecedores e clientes.
- Entradas de mercadoria com fornecedor, peso, custo, data/hora e atualização automática do estoque.
- Vendas/saídas com cliente, preço do produto, total automático e bloqueio de estoque insuficiente.
- Despesas por categoria.
- Exportação e importação de backup JSON.
