import { useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  AlertTriangle,
  Archive,
  Bell,
  Boxes,
  CalendarDays,
  CircleDollarSign,
  ShieldCheck,
  Download,
  Eye,
  LayoutDashboard,
  Lock,
  LogOut,
  Mail,
  PackagePlus,
  Plus,
  ReceiptText,
  RefreshCcw,
  Save,
  Search,
  Settings,
  ShoppingCart,
  SlidersHorizontal,
  Truck,
  Upload,
  Users,
  Warehouse,
} from 'lucide-react';
import { hasSupabaseConfig, supabase } from './lib/supabase';
import {
  createSale,
  createStockEntry,
  createUser,
  deleteExpense,
  deleteSale,
  deleteStockEntry,
  exportBackup,
  importBackup,
  loadAppData,
  saveCustomer,
  saveExpense,
  saveProduct,
  saveSupplier,
  updateUserRole,
} from './lib/repository';
import { formatDateTime, formatKg, formatMoney, fromInputDateTime, todayRange, toInputDateTime } from './lib/format';
import type { AppData, Customer, ExpenseCategory, Page, Product, Supplier } from './lib/types';

const emptyData: AppData = {
  products: [],
  suppliers: [],
  customers: [],
  entries: [],
  sales: [],
  expenses: [],
  currentProfile: null,
  profiles: [],
};

const expenseLabels: Record<ExpenseCategory, string> = {
  almoco: 'Almoco de funcionarios',
  frete: 'Frete',
  manutencao: 'Manutencao',
  combustivel: 'Combustivel',
  outros: 'Outros',
};

const navItems = [
  { page: 'dashboard' as Page, label: 'Dashboard', icon: LayoutDashboard },
  { page: 'products' as Page, label: 'Produtos e Estoque', icon: Boxes },
  { page: 'entries' as Page, label: 'Entradas', icon: PackagePlus },
  { page: 'sales' as Page, label: 'Vendas e Saidas', icon: ShoppingCart },
  { page: 'expenses' as Page, label: 'Despesas', icon: ReceiptText },
  { page: 'suppliers' as Page, label: 'Fornecedores', icon: Truck },
  { page: 'customers' as Page, label: 'Clientes', icon: Users },
  { page: 'admin' as Page, label: 'Admin', icon: ShieldCheck },
  { page: 'backup' as Page, label: 'Backup', icon: Settings },
];

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [page, setPage] = useState<Page>('dashboard');
  const [data, setData] = useState<AppData>(emptyData);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: authData }) => {
      setSession(authData.session);
      setAuthLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function refresh() {
    if (!session) return;
    setLoading(true);
    setError('');
    try {
      setData(await loadAppData());
    } catch (err) {
      setError(getMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, [session]);

  async function runAction(successMessage: string, action: () => Promise<void>) {
    setError('');
    setNotice('');
    try {
      await action();
      await refresh();
      setNotice(successMessage);
    } catch (err) {
      setError(getMessage(err));
    }
  }

  if (!hasSupabaseConfig) {
    return <MissingConfig />;
  }

  if (authLoading) {
    return <div className="boot">Carregando Papelão Gestor...</div>;
  }

  if (!session) {
    return <PremiumLoginScreen onError={setError} error={error} />;
  }

  const CurrentIcon = navItems.find((item) => item.page === page)?.icon || Warehouse;
  const isAdmin = data.currentProfile?.role === 'admin';
  const visibleNavItems = navItems.filter((item) => item.page !== 'admin' || isAdmin);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Warehouse size={24} />
          </div>
          <div>
            <strong>Papelão Gestor</strong>
            <span>Controle da distribuidora</span>
          </div>
        </div>

        <nav>
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.page}
                className={page === item.page ? 'nav-button active' : 'nav-button'}
                onClick={() => setPage(item.page)}
                type="button"
              >
                <Icon size={18} />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-profile">
          <div className="profile-avatar">RP</div>
          <div>
            <strong>{data.currentProfile?.name || 'Administrador'}</strong>
            <span>{session.user.email}</span>
          </div>
        </div>

        <button className="nav-button exit" onClick={() => supabase.auth.signOut()} type="button">
          <LogOut size={18} />
          Sair
        </button>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="topbar-search">
            <Search size={18} />
            <input placeholder="Buscar produtos, vendas, entradas ou relatórios..." />
          </div>
          <div className="topbar-actions">
            <div className="time-pill">
              <CalendarDays size={16} />
              {new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date())}
            </div>
            <button className="icon-button" title="Notificações" type="button">
              <Bell size={18} />
            </button>
            <button className="icon-button" title="Configurações" type="button" onClick={() => setPage('backup')}>
              <SlidersHorizontal size={18} />
            </button>
            <button className="icon-button" onClick={refresh} title="Atualizar dados" type="button">
              <RefreshCcw size={18} />
            </button>
          </div>
        </header>

        <section className="page-heading">
          <div>
            <span className="eyebrow">RODPEL • Sistema de controle</span>
            <h1>
              <CurrentIcon size={30} />
              {navItems.find((item) => item.page === page)?.label}
            </h1>
          </div>
          <div className="heading-actions">
            <button className="secondary-button" type="button">
              <ReceiptText size={17} />
              Relatório
            </button>
            <button className="secondary-button" type="button" onClick={() => setPage('products')}>
              <Boxes size={17} />
              Novo produto
            </button>
            <button className="primary-button" type="button" onClick={() => setPage('sales')}>
              <ShoppingCart size={17} />
              Nova venda
            </button>
          </div>
        </section>

        {notice && <div className="notice success">{notice}</div>}
        {error && <div className="notice danger">{error}</div>}
        {loading && <div className="notice neutral">Atualizando dados...</div>}

        {page === 'dashboard' && <Dashboard data={data} />}
        {page === 'products' && <ProductsPage data={data} runAction={runAction} />}
        {page === 'entries' && <EntriesPage data={data} runAction={runAction} isAdmin={isAdmin} />}
        {page === 'sales' && <SalesPage data={data} runAction={runAction} isAdmin={isAdmin} />}
        {page === 'expenses' && <ExpensesPage data={data} runAction={runAction} isAdmin={isAdmin} />}
        {page === 'suppliers' && <ContactsPage type="suppliers" data={data} runAction={runAction} />}
        {page === 'customers' && <ContactsPage type="customers" data={data} runAction={runAction} />}
        {page === 'admin' && isAdmin && <AdminPage data={data} runAction={runAction} />}
        {page === 'backup' && <BackupPage runAction={runAction} />}
      </main>
    </div>
  );
}

function LoginScreen({ error, onError }: { error: string; onError: (value: string) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [loading, setLoading] = useState(false);
  const [authNotice, setAuthNotice] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    onError('');
    setAuthNotice('');
    const authCall =
      mode === 'login'
        ? supabase.auth.signInWithPassword({ email, password })
        : supabase.auth.signUp({ email, password });
    const { data, error: authError } = await authCall;
    if (authError) onError(authError.message);
    if (!authError && mode === 'signup') {
      if (data.session) {
        setAuthNotice('Acesso criado. Entrando no sistema...');
      } else {
        setAuthNotice('Acesso criado. Verifique seu email e confirme o cadastro antes de entrar.');
        setMode('login');
      }
    }
    setLoading(false);
  }

  return (
    <main className="login-page">
      <section className="login-panel">
        <div className="brand login-brand">
          <div className="brand-mark">
            <Warehouse size={26} />
          </div>
          <div>
            <strong>Papelão Gestor</strong>
            <span>Distribuidora de papelão</span>
          </div>
        </div>

        <form onSubmit={submit} className="form-stack">
          <label>
            Email do gestor
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required />
          </label>
          <label>
            Senha
            <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" required />
          </label>
          {error && <div className="notice danger">{error}</div>}
          {authNotice && <div className="notice success">{authNotice}</div>}
          <button className="primary-button" disabled={loading} type="submit">
            <LogOut size={18} />
            {loading ? 'Entrando...' : mode === 'login' ? 'Entrar' : 'Criar acesso'}
          </button>
          <button className="link-button" onClick={() => setMode(mode === 'login' ? 'signup' : 'login')} type="button">
            {mode === 'login' ? 'Criar primeiro acesso do gestor' : 'Ja tenho acesso'}
          </button>
        </form>
      </section>
    </main>
  );
}

function PremiumLoginScreen({ error, onError }: { error: string; onError: (value: string) => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [loading, setLoading] = useState(false);
  const [authNotice, setAuthNotice] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    onError('');
    setAuthNotice('');
    const authCall =
      mode === 'login'
        ? supabase.auth.signInWithPassword({ email, password })
        : supabase.auth.signUp({ email, password, options: { data: { name } } });
    const { data, error: authError } = await authCall;
    if (authError) onError(authError.message);
    if (!authError && mode === 'signup') {
      if (data.session) {
        setAuthNotice('Acesso criado. Entrando no sistema...');
      } else {
        setAuthNotice('Acesso criado. Verifique seu email e confirme o cadastro antes de entrar.');
        setMode('login');
      }
    }
    setLoading(false);
  }

  return (
    <main className="login-page premium-login-page">
      <section className="login-card">
        <div className="login-left">
          <div className="brand login-brand">
            <div className="brand-mark">
              R
            </div>
            <div>
              <strong>RODPEL</strong>
              <span>Gestão de papelão</span>
            </div>
          </div>

          <div className="login-copy">
            <h1>{mode === 'login' ? 'Entrar no sistema' : 'Criar uma conta'}</h1>
            <p>
              {mode === 'login'
                ? 'Bem-vindo de volta. Acesse estoque, vendas, entradas e despesas.'
                : 'Cadastre seu acesso para controlar a operação da RODPEL.'}
            </p>
          </div>

          <form onSubmit={submit} className="form-stack refined-login-form">
            {mode === 'signup' && (
              <label>
                Nome
                <div className="field-shell">
                  <Users size={18} />
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Digite seu nome"
                    required
                  />
                </div>
              </label>
            )}
            <label>
              Email *
              <div className="field-shell">
                <Mail size={18} />
                <input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="gestor@empresa.com"
                  type="email"
                  required
                />
              </div>
            </label>
            <label>
              <span className="label-row">
                Senha *
                <button className="forgot-link" type="button">
                  Recuperar senha
                </button>
              </span>
              <div className="field-shell">
                <Lock size={18} />
                <input
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Digite sua senha"
                  type={showPassword ? 'text' : 'password'}
                  required
                />
                <button
                  className="field-icon"
                  onClick={() => setShowPassword((current) => !current)}
                  title="Mostrar ou ocultar senha"
                  type="button"
                >
                  <Eye size={18} />
                </button>
              </div>
            </label>
            {error && <div className="notice danger">{error}</div>}
            {authNotice && <div className="notice success">{authNotice}</div>}
            <button className="login-submit" disabled={loading} type="submit">
              {loading ? 'Entrando...' : mode === 'login' ? 'Entrar' : 'Criar acesso'}
            </button>
            <div className="login-divider">
              <span>Ou</span>
            </div>
            <div className="social-row">
              <button type="button" className="social-button">
                <span className="google-mark">G</span>
                Google
              </button>
              <button type="button" className="social-button">
                <span className="facebook-mark">f</span>
                Facebook
              </button>
            </div>
            <p className="signup-line">
              {mode === 'login' ? 'Ainda nao tem acesso?' : 'Ja possui acesso?'}
              <button className="inline-link" onClick={() => setMode(mode === 'login' ? 'signup' : 'login')} type="button">
                {mode === 'login' ? 'Criar primeiro acesso' : 'Entrar'}
              </button>
            </p>
          </form>
        </div>

        <div className="login-right">
          <div className="tech-squares" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>

          <div className="analytics-card">
            <div className="analytics-head">
              <strong>Analytics</strong>
              <div>
                <span>Semanal</span>
                <span>Mensal</span>
                <span>Anual</span>
              </div>
            </div>
            <div className="line-chart">
              <svg viewBox="0 0 360 160" role="img" aria-label="Gráfico de controle de estoque">
                <path d="M24 118 C82 74 112 104 160 68 S250 42 336 82" />
                <path d="M24 92 C74 102 116 44 166 88 S260 118 336 44" />
              </svg>
              <div className="chart-days">
                <span>SEG</span>
                <span>TER</span>
                <span>QUA</span>
                <span>QUI</span>
              </div>
            </div>
          </div>

          <div className="donut-card">
            <div className="donut-chart">
              <span>Total<br />42%</span>
            </div>
          </div>

          <div className="right-copy">
            <h2>Gestão simples para a RODPEL</h2>
            <p>
              Controle entradas, vendas, estoque e despesas da distribuidora de papelão com clareza, rapidez e segurança.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}

function MissingConfig() {
  return (
    <main className="login-page">
      <section className="login-panel wide">
        <div className="brand login-brand">
          <div className="brand-mark">
            <AlertTriangle size={26} />
          </div>
          <div>
            <strong>Configurar Supabase</strong>
            <span>Credenciais ausentes</span>
          </div>
        </div>
        <p>
          Crie um arquivo <code>.env</code> baseado em <code>.env.example</code> com
          <code> VITE_SUPABASE_URL </code> e <code> VITE_SUPABASE_ANON_KEY</code>.
        </p>
        <p>Depois execute o SQL em <code>supabase/schema.sql</code> no painel SQL do Supabase.</p>
      </section>
    </main>
  );
}

function Dashboard({ data }: { data: AppData }) {
  const { start, end } = todayRange();
  const salesToday = data.sales.filter((sale) => sale.occurred_at >= start && sale.occurred_at <= end);
  const expensesToday = data.expenses.filter((expense) => expense.occurred_at >= start && expense.occurred_at <= end);
  const totalSales = salesToday.reduce((sum, sale) => sum + sale.total_price, 0);
  const totalExpenses = expensesToday.reduce((sum, expense) => sum + expense.amount, 0);
  const lowStock = data.products.filter((product) => product.active && product.stock_kg <= product.min_stock_kg);
  const topProducts = data.products
    .map((product) => {
      const productSales = data.sales.filter((sale) => sale.product_id === product.id);
      return {
        product,
        soldKg: productSales.reduce((sum, sale) => sum + sale.weight_kg, 0),
        total: productSales.reduce((sum, sale) => sum + sale.total_price, 0),
      };
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, 3);
  const maxTopTotal = Math.max(...topProducts.map((item) => item.total), 1);
  const recent = [
    ...data.entries.map((entry) => ({ kind: 'Entrada', at: entry.occurred_at, text: `${productName(data, entry.product_id)} +${formatKg(entry.weight_kg)}` })),
    ...data.sales.map((sale) => ({ kind: 'Venda', at: sale.occurred_at, text: `${productName(data, sale.product_id)} -${formatKg(sale.weight_kg)}` })),
    ...data.expenses.map((expense) => ({ kind: 'Despesa', at: expense.occurred_at, text: `${expense.description} ${formatMoney(expense.amount)}` })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 8);

  return (
    <div className="content-grid">
      <Metric icon={CircleDollarSign} label="Vendas hoje" value={formatMoney(totalSales)} />
      <Metric icon={ReceiptText} label="Despesas hoje" value={formatMoney(totalExpenses)} />
      <Metric icon={Archive} label="Saldo estimado" value={formatMoney(totalSales - totalExpenses)} />
      <Metric icon={AlertTriangle} label="Estoque baixo" value={`${lowStock.length} produtos`} />

      <section className="panel performance-card span-2">
        <div className="panel-title-row">
          <div>
            <h2>Total de vendas</h2>
            <strong className="panel-total">{formatMoney(totalSales)}</strong>
          </div>
          <div className="chart-legend">
            <span><i className="legend-soft" /> Entradas</span>
            <span><i className="legend-strong" /> Vendas</span>
          </div>
        </div>
        <div className="bar-chart" aria-label="Resumo visual de performance">
          {[
            { label: 'Produtos', a: Math.min(data.products.length * 12, 92), b: Math.min(data.products.filter((product) => product.active).length * 14, 88) },
            { label: 'Entradas', a: Math.min(data.entries.length * 16, 94), b: Math.min(salesToday.length * 18, 86) },
            { label: 'Financeiro', a: Math.min(totalSales / 80, 92), b: Math.min(Math.max(totalSales - totalExpenses, 0) / 80, 86) },
          ].map((group) => (
            <div className="bar-group" key={group.label}>
              <div className="bars">
                <span style={{ height: `${Math.max(group.a, 12)}%` }} />
                <span style={{ height: `${Math.max(group.b, 12)}%` }} />
                <span style={{ height: '28%' }} />
              </div>
              <strong>{group.label}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="panel top-products-card">
        <div className="panel-title-row">
          <div>
            <h2>Produtos mais vendidos</h2>
            <strong className="panel-total">
              {formatMoney(topProducts.reduce((sum, item) => sum + item.total, 0))}
            </strong>
          </div>
        </div>
        <div className="product-ranking">
          {(topProducts.length ? topProducts : data.products.slice(0, 3).map((product) => ({ product, soldKg: 0, total: 0 }))).map((item, index) => (
            <div className="ranking-item" key={item.product.id}>
              <div className="ranking-head">
                <div>
                  <strong>{item.product.name}</strong>
                  <span>{formatKg(item.soldKg)} vendidos</span>
                </div>
                <b>{Math.round((item.total / maxTopTotal) * 100)}%</b>
              </div>
              <div className={`ranking-bars ranking-${index + 1}`}>
                <span style={{ width: `${Math.max((item.total / maxTopTotal) * 100, 12)}%` }} />
                <span style={{ width: `${Math.max((item.total / maxTopTotal) * 72, 10)}%` }} />
                <span style={{ width: `${Math.max((item.total / maxTopTotal) * 48, 8)}%` }} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="panel span-2">
        <h2>Alertas de estoque</h2>
        <Table
          empty="Nenhum produto abaixo do minimo."
          headers={['Produto', 'Categoria', 'Estoque', 'Minimo']}
          rows={lowStock.map((product) => [
            product.name,
            product.category,
            formatKg(product.stock_kg),
            formatKg(product.min_stock_kg),
          ])}
        />
      </section>

      <section className="panel recent-orders span-2">
        <div className="panel-title-row">
          <h2>Movimentações recentes</h2>
          <button className="link-button" type="button">Ver tudo</button>
        </div>
        <Table
          empty="Nenhuma movimentacao registrada."
          headers={['Tipo', 'Descricao', 'Data']}
          rows={recent.map((item) => [item.kind, item.text, formatDateTime(item.at)])}
        />
      </section>
    </div>
  );
}

function ProductsPage({ data, runAction }: PageProps) {
  const [editing, setEditing] = useState<Product | null>(null);
  const [query, setQuery] = useState('');
  const filtered = filterBy(data.products, query, (product) => `${product.name} ${product.category}`);

  return (
    <div className="two-column">
      <section className="panel">
        <h2>{editing ? 'Editar produto' : 'Novo produto'}</h2>
        <ProductForm
          product={editing}
          products={data.products}
          onCancel={() => setEditing(null)}
          onSubmit={(input) =>
            runAction('Produto salvo.', async () => {
              await saveProduct(input, editing?.id);
              setEditing(null);
            })
          }
        />
      </section>
      <section className="panel">
        <PanelSearch value={query} onChange={setQuery} placeholder="Buscar produto" />
        <Table
          empty="Nenhum produto cadastrado."
          headers={['Produto', 'Preco/kg', 'Estoque', 'Minimo', 'Status', '']}
          rows={filtered.map((product) => [
            <strong>{product.name}</strong>,
            formatMoney(product.price_per_kg),
            formatKg(product.stock_kg),
            formatKg(product.min_stock_kg),
            product.active ? 'Ativo' : 'Inativo',
            <button className="small-button" onClick={() => setEditing(product)} type="button">
              Editar
            </button>,
          ])}
        />
      </section>
    </div>
  );
}

function ProductForm({
  product,
  products,
  onSubmit,
  onCancel,
}: {
  product: Product | null;
  products: Product[];
  onSubmit: (input: {
    name: string;
    category: string;
    price_per_kg: number;
    stock_kg?: number;
    min_stock_kg: number;
    active: boolean;
  }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(product?.name || '');
  const [category, setCategory] = useState(product?.category || '');
  const [price, setPrice] = useState(product?.price_per_kg || 0);
  const [stock, setStock] = useState(product?.stock_kg || 0);
  const [minimum, setMinimum] = useState(product?.min_stock_kg || 0);
  const [active, setActive] = useState(product?.active ?? true);
  const duplicate = products.some(
    (item) => item.id !== product?.id && normalizeName(item.name) === normalizeName(name),
  );

  useEffect(() => {
    setName(product?.name || '');
    setCategory(product?.category || '');
    setPrice(product?.price_per_kg || 0);
    setStock(product?.stock_kg || 0);
    setMinimum(product?.min_stock_kg || 0);
    setActive(product?.active ?? true);
  }, [product]);

  return (
    <form
      className="form-grid"
      onSubmit={(event) => {
        event.preventDefault();
        if (duplicate) return;
        onSubmit({ name, category, price_per_kg: price, stock_kg: product ? undefined : stock, min_stock_kg: minimum, active });
      }}
    >
      <label>
        Nome
        <input value={name} onChange={(event) => setName(event.target.value)} required />
      </label>
      {duplicate && <div className="notice danger span-all">Ja existe um produto cadastrado com esse nome.</div>}
      <label>
        Categoria
        <input value={category} onChange={(event) => setCategory(event.target.value)} required />
      </label>
      <label>
        Preco por kg
        <input min="0" step="0.01" value={price} onChange={(event) => setPrice(Number(event.target.value))} type="number" required />
      </label>
      {!product && (
        <label>
          Estoque inicial em kg
          <input min="0" step="0.01" value={stock} onChange={(event) => setStock(Number(event.target.value))} type="number" />
        </label>
      )}
      <label>
        Estoque minimo em kg
        <input min="0" step="0.01" value={minimum} onChange={(event) => setMinimum(Number(event.target.value))} type="number" />
      </label>
      <label className="checkbox-line">
        <input checked={active} onChange={(event) => setActive(event.target.checked)} type="checkbox" />
        Produto ativo
      </label>
      <div className="form-actions">
        {product && (
          <button className="secondary-button" onClick={onCancel} type="button">
            Cancelar
          </button>
        )}
        <button className="primary-button" disabled={duplicate} type="submit">
          <Save size={18} />
          Salvar
        </button>
      </div>
    </form>
  );
}

function EntriesPage({ data, runAction, isAdmin }: PageProps & { isAdmin: boolean }) {
  const activeProducts = data.products.filter((product) => product.active);
  const [productId, setProductId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [weight, setWeight] = useState(0);
  const [unitCost, setUnitCost] = useState(0);
  const [totalCost, setTotalCost] = useState(0);
  const [date, setDate] = useState(toInputDateTime());
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (weight && unitCost) setTotalCost(roundMoney(weight * unitCost));
  }, [weight, unitCost]);

  return (
    <div className="two-column">
      <section className="panel">
        <h2>Registrar chegada de mercadoria</h2>
        <form
          className="form-grid"
          onSubmit={(event) => {
            event.preventDefault();
            runAction('Entrada registrada e estoque atualizado.', async () => {
              await createStockEntry({
                product_id: productId,
                supplier_id: supplierId,
                weight_kg: weight,
                unit_cost: unitCost,
                total_cost: totalCost,
                occurred_at: fromInputDateTime(date),
                notes,
              });
              setWeight(0);
              setUnitCost(0);
              setTotalCost(0);
              setNotes('');
            });
          }}
        >
          <Select label="Produto" value={productId} onChange={setProductId} options={activeProducts.map(optionFromName)} />
          <Select label="Fornecedor" value={supplierId} onChange={setSupplierId} options={data.suppliers.map(optionFromName)} />
          <label>
            Peso recebido em kg
            <input min="0.01" step="0.01" value={weight} onChange={(event) => setWeight(Number(event.target.value))} type="number" required />
          </label>
          <label>
            Custo por kg
            <input min="0" step="0.01" value={unitCost} onChange={(event) => setUnitCost(Number(event.target.value))} type="number" required />
          </label>
          <label>
            Custo total
            <input min="0" step="0.01" value={totalCost} onChange={(event) => setTotalCost(Number(event.target.value))} type="number" required />
          </label>
          <label>
            Data e hora
            <input value={date} onChange={(event) => setDate(event.target.value)} type="datetime-local" required />
          </label>
          <label className="span-all">
            Observacao
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
          </label>
          <button className="primary-button" disabled={!productId || !supplierId} type="submit">
            <Plus size={18} />
            Registrar entrada
          </button>
        </form>
      </section>
      <section className="panel">
        <h2>Historico de entradas</h2>
        <Table
          empty="Nenhuma entrada registrada."
          headers={isAdmin ? ['Produto', 'Fornecedor', 'Peso', 'Custo total', 'Data', ''] : ['Produto', 'Fornecedor', 'Peso', 'Custo total', 'Data']}
          rows={data.entries.map((entry) => [
            productName(data, entry.product_id),
            supplierName(data, entry.supplier_id),
            formatKg(entry.weight_kg),
            formatMoney(entry.total_cost),
            formatDateTime(entry.occurred_at),
            ...(isAdmin
              ? [
                  <button
                    className="small-button danger-button"
                    onClick={() => confirmAction('Apagar esta entrada e ajustar o estoque?', () => runAction('Entrada apagada.', () => deleteStockEntry(entry.id)))}
                    type="button"
                  >
                    Apagar
                  </button>,
                ]
              : []),
          ])}
        />
      </section>
    </div>
  );
}

function SalesPage({ data, runAction, isAdmin }: PageProps & { isAdmin: boolean }) {
  const activeProducts = data.products.filter((product) => product.active);
  const [productId, setProductId] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [weight, setWeight] = useState(0);
  const [date, setDate] = useState(toInputDateTime());
  const [notes, setNotes] = useState('');
  const selectedProduct = data.products.find((product) => product.id === productId);
  const unitPrice = selectedProduct?.price_per_kg || 0;
  const total = roundMoney(unitPrice * weight);
  const blocked = Boolean(selectedProduct && weight > selectedProduct.stock_kg);

  return (
    <div className="two-column">
      <section className="panel">
        <h2>Registrar venda/saida</h2>
        <form
          className="form-grid"
          onSubmit={(event) => {
            event.preventDefault();
            runAction('Venda registrada e estoque atualizado.', async () => {
              await createSale({
                product_id: productId,
                customer_id: customerId,
                weight_kg: weight,
                unit_price: unitPrice,
                total_price: total,
                occurred_at: fromInputDateTime(date),
                notes,
              });
              setWeight(0);
              setNotes('');
            });
          }}
        >
          <Select label="Produto" value={productId} onChange={setProductId} options={activeProducts.map(optionFromName)} />
          <Select label="Cliente" value={customerId} onChange={setCustomerId} options={data.customers.map(optionFromName)} />
          <label>
            Peso vendido em kg
            <input min="0.01" step="0.01" value={weight} onChange={(event) => setWeight(Number(event.target.value))} type="number" required />
          </label>
          <label>
            Preco por kg
            <input value={unitPrice} readOnly type="number" />
          </label>
          <label>
            Total da venda
            <input value={total} readOnly type="number" />
          </label>
          <label>
            Data e hora
            <input value={date} onChange={(event) => setDate(event.target.value)} type="datetime-local" required />
          </label>
          <label className="span-all">
            Observacao
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
          </label>
          {selectedProduct && <div className={blocked ? 'notice danger span-all' : 'notice neutral span-all'}>Estoque atual: {formatKg(selectedProduct.stock_kg)}</div>}
          <button className="primary-button" disabled={!productId || !customerId || blocked} type="submit">
            <ShoppingCart size={18} />
            Registrar venda
          </button>
        </form>
      </section>
      <section className="panel">
        <h2>Historico de vendas</h2>
        <Table
          empty="Nenhuma venda registrada."
          headers={isAdmin ? ['Produto', 'Cliente', 'Peso', 'Total', 'Data', ''] : ['Produto', 'Cliente', 'Peso', 'Total', 'Data']}
          rows={data.sales.map((sale) => [
            productName(data, sale.product_id),
            customerName(data, sale.customer_id),
            formatKg(sale.weight_kg),
            formatMoney(sale.total_price),
            formatDateTime(sale.occurred_at),
            ...(isAdmin
              ? [
                  <button
                    className="small-button danger-button"
                    onClick={() => confirmAction('Apagar esta venda e devolver o peso ao estoque?', () => runAction('Venda apagada.', () => deleteSale(sale.id)))}
                    type="button"
                  >
                    Apagar
                  </button>,
                ]
              : []),
          ])}
        />
      </section>
    </div>
  );
}

function ExpensesPage({ data, runAction, isAdmin }: PageProps & { isAdmin: boolean }) {
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('almoco');
  const [amount, setAmount] = useState(0);
  const [date, setDate] = useState(toInputDateTime());
  const [notes, setNotes] = useState('');

  return (
    <div className="two-column">
      <section className="panel">
        <h2>Nova despesa</h2>
        <form
          className="form-grid"
          onSubmit={(event) => {
            event.preventDefault();
            runAction('Despesa registrada.', async () => {
              await saveExpense({ description, category, amount, occurred_at: fromInputDateTime(date), notes });
              setDescription('');
              setAmount(0);
              setNotes('');
            });
          }}
        >
          <label>
            Descricao
            <input value={description} onChange={(event) => setDescription(event.target.value)} required />
          </label>
          <label>
            Categoria
            <select value={category} onChange={(event) => setCategory(event.target.value as ExpenseCategory)}>
              {Object.entries(expenseLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Valor
            <input min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(Number(event.target.value))} type="number" required />
          </label>
          <label>
            Data e hora
            <input value={date} onChange={(event) => setDate(event.target.value)} type="datetime-local" required />
          </label>
          <label className="span-all">
            Observacao
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
          </label>
          <button className="primary-button" type="submit">
            <Plus size={18} />
            Registrar despesa
          </button>
        </form>
      </section>
      <section className="panel">
        <h2>Historico de despesas</h2>
        <Table
          empty="Nenhuma despesa registrada."
          headers={isAdmin ? ['Descricao', 'Categoria', 'Valor', 'Data', ''] : ['Descricao', 'Categoria', 'Valor', 'Data']}
          rows={data.expenses.map((expense) => [
            expense.description,
            expenseLabels[expense.category],
            formatMoney(expense.amount),
            formatDateTime(expense.occurred_at),
            ...(isAdmin
              ? [
                  <button
                    className="small-button danger-button"
                    onClick={() => confirmAction('Apagar esta despesa?', () => runAction('Despesa apagada.', () => deleteExpense(expense.id)))}
                    type="button"
                  >
                    Apagar
                  </button>,
                ]
              : []),
          ])}
        />
      </section>
    </div>
  );
}

function AdminPage({ data, runAction }: PageProps) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'admin' | 'operador'>('operador');

  return (
    <div className="two-column">
      <section className="panel">
        <h2>Criar usuario</h2>
        <form
          className="form-grid"
          onSubmit={(event) => {
            event.preventDefault();
            runAction('Usuario criado.', async () => {
              await createUser({ email, password, name, role });
              setEmail('');
              setName('');
              setPassword('');
              setRole('operador');
            });
          }}
        >
          <label>
            Nome
            <input value={name} onChange={(event) => setName(event.target.value)} required />
          </label>
          <label>
            Email
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required />
          </label>
          <label>
            Senha inicial
            <input minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} type="password" required />
          </label>
          <label>
            Perfil
            <select value={role} onChange={(event) => setRole(event.target.value as 'admin' | 'operador')}>
              <option value="operador">Operador</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <button className="primary-button" type="submit">
            <Plus size={18} />
            Criar usuario
          </button>
        </form>
      </section>

      <section className="panel">
        <h2>Usuarios da empresa</h2>
        <Table
          empty="Nenhum usuario encontrado."
          headers={['Nome', 'Email', 'Perfil']}
          rows={data.profiles.map((profile) => [
            profile.name || '-',
            profile.email,
            <select
              value={profile.role}
              onChange={(event) =>
                runAction('Perfil atualizado.', () => updateUserRole(profile.id, event.target.value as 'admin' | 'operador'))
              }
              disabled={profile.id === data.currentProfile?.id}
            >
              <option value="operador">Operador</option>
              <option value="admin">Admin</option>
            </select>,
          ])}
        />
      </section>
    </div>
  );
}

function ContactsPage({ type, data, runAction }: PageProps & { type: 'suppliers' | 'customers' }) {
  const [editing, setEditing] = useState<Supplier | Customer | null>(null);
  const [query, setQuery] = useState('');
  const contacts = type === 'suppliers' ? data.suppliers : data.customers;
  const filtered = filterBy(contacts, query, (contact) => `${contact.name} ${contact.phone || ''} ${contact.document || ''}`);
  const title = type === 'suppliers' ? 'Fornecedor' : 'Cliente';

  return (
    <div className="two-column">
      <section className="panel">
        <h2>{editing ? `Editar ${title.toLowerCase()}` : `Novo ${title.toLowerCase()}`}</h2>
        <ContactForm
          contact={editing}
          onCancel={() => setEditing(null)}
          onSubmit={(input) =>
            runAction(`${title} salvo.`, async () => {
              if (type === 'suppliers') await saveSupplier(input, editing?.id);
              else await saveCustomer(input, editing?.id);
              setEditing(null);
            })
          }
        />
      </section>
      <section className="panel">
        <PanelSearch value={query} onChange={setQuery} placeholder={`Buscar ${title.toLowerCase()}`} />
        <Table
          empty={`Nenhum ${title.toLowerCase()} cadastrado.`}
          headers={[title, 'Telefone', 'Documento', '']}
          rows={filtered.map((contact) => [
            <strong>{contact.name}</strong>,
            contact.phone || '-',
            contact.document || '-',
            <button className="small-button" onClick={() => setEditing(contact)} type="button">
              Editar
            </button>,
          ])}
        />
      </section>
    </div>
  );
}

function ContactForm({
  contact,
  onSubmit,
  onCancel,
}: {
  contact: Supplier | Customer | null;
  onSubmit: (input: { name: string; phone: string; document: string; notes: string }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(contact?.name || '');
  const [phone, setPhone] = useState(contact?.phone || '');
  const [document, setDocument] = useState(contact?.document || '');
  const [notes, setNotes] = useState(contact?.notes || '');

  useEffect(() => {
    setName(contact?.name || '');
    setPhone(contact?.phone || '');
    setDocument(contact?.document || '');
    setNotes(contact?.notes || '');
  }, [contact]);

  return (
    <form
      className="form-grid"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({ name, phone, document, notes });
      }}
    >
      <label>
        Nome
        <input value={name} onChange={(event) => setName(event.target.value)} required />
      </label>
      <label>
        Telefone
        <input value={phone} onChange={(event) => setPhone(event.target.value)} />
      </label>
      <label>
        Documento
        <input value={document} onChange={(event) => setDocument(event.target.value)} />
      </label>
      <label className="span-all">
        Observacoes
        <textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
      </label>
      <div className="form-actions">
        {contact && (
          <button className="secondary-button" onClick={onCancel} type="button">
            Cancelar
          </button>
        )}
        <button className="primary-button" type="submit">
          <Save size={18} />
          Salvar
        </button>
      </div>
    </form>
  );
}

function BackupPage({ runAction }: { runAction: (message: string, action: () => Promise<void>) => Promise<void> }) {
  async function downloadBackup() {
    const payload = await exportBackup();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `papelao-gestor-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function uploadBackup(file: File | undefined) {
    if (!file) return;
    const text = await file.text();
    await importBackup(JSON.parse(text));
  }

  return (
    <section className="panel backup-panel">
      <h2>Backup e configuracoes</h2>
      <p>Use exportacao antes de grandes alteracoes ou ao trocar de computador.</p>
      <div className="backup-actions">
        <button className="primary-button" onClick={() => runAction('Backup exportado.', downloadBackup)} type="button">
          <Download size={18} />
          Exportar JSON
        </button>
        <label className="file-button">
          <Upload size={18} />
          Importar JSON
          <input
            accept="application/json"
            onChange={(event) => runAction('Backup importado.', () => uploadBackup(event.target.files?.[0]))}
            type="file"
          />
        </label>
      </div>
      <div className="settings-list">
        <div>
          <strong>Banco de dados</strong>
          <span>Supabase PostgreSQL com seguranca por usuario autenticado.</span>
        </div>
        <div>
          <strong>Moeda e datas</strong>
          <span>BRL, pt-BR e America/Fortaleza.</span>
        </div>
        <div>
          <strong>Estoque</strong>
          <span>Controlado em kg, com vendas bloqueadas quando nao houver quantidade suficiente.</span>
        </div>
      </div>
    </section>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof LayoutDashboard; label: string; value: string }) {
  return (
    <section className="metric">
      <Icon size={22} />
      <span>{label}</span>
      <strong>{value}</strong>
    </section>
  );
}

function PanelSearch({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <label className="search-box">
      <Search size={18} />
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </label>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label>
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)} required>
        <option value="">Selecione</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Table({
  headers,
  rows,
  empty,
}: {
  headers: string[];
  rows: ReactNode[][];
  empty: string;
}) {
  if (!rows.length) return <div className="empty-state">{empty}</div>;

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type PageProps = {
  data: AppData;
  runAction: (message: string, action: () => Promise<void>) => Promise<void>;
};

function productName(data: AppData, id: string) {
  return data.products.find((product) => product.id === id)?.name || 'Produto removido';
}

function supplierName(data: AppData, id: string) {
  return data.suppliers.find((supplier) => supplier.id === id)?.name || 'Fornecedor removido';
}

function customerName(data: AppData, id: string) {
  return data.customers.find((customer) => customer.id === id)?.name || 'Cliente removido';
}

function optionFromName(item: { id: string; name: string }) {
  return { value: item.id, label: item.name };
}

function roundMoney(value: number) {
  return Math.round((value || 0) * 100) / 100;
}

function filterBy<T>(items: T[], query: string, getText: (item: T) => string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return items;
  return items.filter((item) => getText(item).toLowerCase().includes(normalized));
}

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function confirmAction(message: string, action: () => void) {
  if (window.confirm(message)) action();
}

function getMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return 'Operacao nao concluida.';
}
