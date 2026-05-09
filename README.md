# Papelão Gestor

Sistema web para controle de distribuidora de papelão com Supabase como banco de dados.

## Configuração

1. Crie um projeto no Supabase.
2. No painel do Supabase, abra o SQL Editor e execute `supabase/schema.sql`.
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
- Produtos com preço por kg, estoque atual, estoque mínimo e status.
- Cadastro de fornecedores e clientes.
- Entradas de mercadoria com fornecedor, peso, custo, data/hora e atualização automática do estoque.
- Vendas/saídas com cliente, preço do produto, total automático e bloqueio de estoque insuficiente.
- Despesas por categoria.
- Exportação e importação de backup JSON.
