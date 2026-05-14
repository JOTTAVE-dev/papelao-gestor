import { useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  AlertTriangle,
  Archive,
  Bell,
  Boxes,
  Check,
  CircleDollarSign,
  ShieldCheck,
  Download,
  Eye,
  LayoutDashboard,
  Lock,
  LogOut,
  Mail,
  Menu,
  Mic,
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
  X,
} from 'lucide-react';
import { hasSupabaseConfig, supabase } from './lib/supabase';
import {
  createSale,
  createCustomer,
  createSupplier,
  createStockEntry,
  createUser,
  clearSupportCompany,
  deleteExpense,
  deleteCustomer,
  deleteProduct,
  deleteSale,
  deleteSupplier,
  deleteStockEntry,
  exportBackup,
  importBackup,
  loadAppData,
  removeOperator,
  saveCustomer,
  saveExpense,
  saveProduct,
  saveSupplier,
  setSupportCompany,
  updateCompanyLimit,
  updateSale,
  updateStockEntry,
  updateUserRole,
} from './lib/repository';
import { formatDateTime, formatKg, formatMoney, fromInputDateTime, todayRange, toInputDateTime } from './lib/format';
import type { AppData, Customer, Expense, ExpenseCategory, Page, Product, Sale, StockEntry, Supplier } from './lib/types';

type ToastVariant = 'success' | 'info' | 'warning' | 'error';

type AppToast = {
  id: number;
  variant: ToastVariant;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
};

const emptyData: AppData = {
  companies: [],
  products: [],
  suppliers: [],
  customers: [],
  entries: [],
  sales: [],
  expenses: [],
  currentProfile: null,
  profiles: [],
};

const expenseLabels: Record<string, string> = {
  almoco: 'Almoco de funcionarios',
  frete: 'Frete',
  manutencao: 'Manutencao',
  combustivel: 'Combustivel',
  outros: 'Outros',
};

type VoiceIntent = 'entrada' | 'venda' | 'saida' | 'despesa' | 'produto';
type VoiceStatus = 'idle' | 'listening' | 'processing' | 'completed' | 'error';

type ParsedVoiceCommand = {
  intent: VoiceIntent;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalValue: number;
  supplierName: string;
  customerName: string;
  expenseDescription: string;
  confidence: number;
  warnings: string[];
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionEventLike = {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
};

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

const navItems = [
  { page: 'dashboard' as Page, label: 'Dashboard', icon: LayoutDashboard },
  { page: 'products' as Page, label: 'Produtos e Estoque', icon: Boxes },
  { page: 'entries' as Page, label: 'Entradas', icon: PackagePlus },
  { page: 'sales' as Page, label: 'Vendas', icon: ShoppingCart },
  { page: 'voice' as Page, label: 'Lançar por Áudio', icon: Mic },
  { page: 'expenses' as Page, label: 'Despesas', icon: ReceiptText },
  { page: 'reports' as Page, label: 'Relatorios', icon: ReceiptText },
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
  const [sidebarPinned, setSidebarPinned] = useState(false);
  const [sidebarHovered, setSidebarHovered] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [toasts, setToasts] = useState<AppToast[]>([]);

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

  function showToast(toast: Omit<AppToast, 'id'>) {
    const nextToast = { ...toast, id: Date.now() + Math.floor(Math.random() * 1000) };
    setToasts((current) => [...current, nextToast]);
  }

  function dismissToast(id: number) {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }

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

  useEffect(() => {
    if (!notice) return;
    showToast({ variant: 'success', title: notice });
    setNotice('');
  }, [notice]);

  useEffect(() => {
    if (!error || !session) return;
    showToast({ variant: 'error', title: 'Operacao nao concluida', description: error });
    setError('');
  }, [error, session]);

  const CurrentIcon = navItems.find((item) => item.page === page)?.icon || Warehouse;
  const isSuperAdmin = data.currentProfile?.role === 'super_admin';
  const isOwner = data.currentProfile?.role === 'owner';
  const canOpenAdmin = isSuperAdmin || isOwner;
  const canManageRecords = isSuperAdmin || isOwner;
  const sidebarExpanded = sidebarPinned || sidebarHovered;
  const supportOwnerId = isSuperAdmin ? data.currentProfile?.support_company_owner_id || null : null;
  const supportCompany = supportOwnerId ? data.companies.find((company) => company.owner_id === supportOwnerId) || null : null;
  const supportRequired = isSuperAdmin && !supportOwnerId && page !== 'admin' && page !== 'backup';
  const scopedData =
    isSuperAdmin && supportOwnerId
      ? {
          ...data,
          companies: supportCompany ? [supportCompany] : [],
          profiles: data.profiles.filter((item) => item.company_owner_id === supportOwnerId || item.role === 'super_admin'),
          products: data.products.filter((item) => item.owner_id === supportOwnerId),
          suppliers: data.suppliers.filter((item) => item.owner_id === supportOwnerId),
          customers: data.customers.filter((item) => item.owner_id === supportOwnerId),
          entries: data.entries.filter((item) => item.owner_id === supportOwnerId),
          sales: data.sales.filter((item) => item.owner_id === supportOwnerId),
          expenses: data.expenses.filter((item) => item.owner_id === supportOwnerId),
        }
      : data;
  const visibleNavItems = navItems.filter((item) => item.page !== 'admin' || canOpenAdmin);

  useEffect(() => {
    if (!session || !supportRequired) return;
    showToast({
      variant: 'warning',
      title: 'Selecione uma empresa para suporte',
      description: 'Escolha a empresa na tela Admin para evitar dados misturados.',
      actionLabel: 'Abrir Admin',
      onAction: () => setPage('admin'),
    });
  }, [session, supportRequired]);

  if (!hasSupabaseConfig) {
    return <MissingConfig />;
  }

  if (authLoading) {
    return <div className="boot">Carregando RODPEL...</div>;
  }

  if (!session) {
    return <PremiumLoginScreen onError={setError} error={error} />;
  }

  return (
    <div className={sidebarExpanded ? 'shell sidebar-expanded' : 'shell sidebar-collapsed'}>
      <aside
        className={sidebarExpanded ? 'sidebar expanded' : 'sidebar collapsed'}
        onMouseEnter={() => setSidebarHovered(true)}
        onMouseLeave={() => setSidebarHovered(false)}
      >
        <div className="sidebar-top">
          <button
            className={sidebarPinned ? 'sidebar-toggle active' : 'sidebar-toggle'}
            onClick={() => setSidebarPinned((current) => !current)}
            type="button"
            aria-label={sidebarPinned ? 'Recolher menu lateral' : 'Fixar menu lateral aberto'}
            title={sidebarPinned ? 'Recolher menu' : 'Fixar menu'}
          >
            <Menu size={18} />
          </button>
          <div className={profileMenuOpen ? 'profile-menu open' : 'profile-menu'}>
            <button
              className="brand profile-trigger"
              onClick={() => setProfileMenuOpen((current) => !current)}
              type="button"
              aria-expanded={profileMenuOpen}
              title="Perfil e sair"
            >
              <div className="brand-mark">
                <Warehouse size={24} />
              </div>
              <div className="brand-copy">
                <strong>Papelão Gestor</strong>
                <span>Controle da distribuidora</span>
              </div>
            </button>
            <div className="profile-popover">
              <div className="profile-popover-head">
                <div className="profile-avatar">RP</div>
                <div>
                  <strong>{data.currentProfile?.name || 'Administrador'}</strong>
                  <span>{session.user.email}</span>
                </div>
              </div>
              <button className="profile-logout" onClick={() => supabase.auth.signOut()} type="button">
                <LogOut size={17} />
                Sair
              </button>
            </div>
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
                title={sidebarExpanded ? undefined : item.label}
              >
                <Icon size={18} />
                <span className="nav-label">{item.label}</span>
              </button>
            );
          })}
        </nav>

      </aside>

      <main className="main">
        <header className="topbar">
          <div className="topbar-search">
            <Search size={18} />
            <input placeholder="Buscar produtos, vendas, entradas ou relatórios..." />
          </div>
          <div className="topbar-actions">
            <button
              className="icon-button"
              onClick={() => {
                showToast({
                  variant: 'info',
                  title: 'Atualizando dados',
                  description: 'Buscando as informacoes mais recentes.',
                });
                refresh();
              }}
              title="Atualizar dados"
              type="button"
            >
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
            {isSuperAdmin && supportCompany && <span className="muted-text">Suporte ativo em: {supportCompany.name}</span>}
          </div>
          <div className="heading-actions">
            <button className="secondary-button" type="button" onClick={() => setPage('reports')}>
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

        {supportRequired ? (
          <section className="panel">
            <h2>Escolha uma empresa para suporte</h2>
            <p>Como admin geral, selecione primeiro a empresa na tela Admin. Assim voce enxerga e ajusta apenas o contexto correto.</p>
          </section>
        ) : (
          <>
            {page === 'dashboard' && <Dashboard data={scopedData} />}
            {page === 'products' && <ProductsPage data={scopedData} runAction={runAction} isAdmin={isSuperAdmin} />}
            {page === 'entries' && <EntriesPage data={scopedData} runAction={runAction} isAdmin={isSuperAdmin} />}
            {page === 'sales' && <SalesPage data={scopedData} runAction={runAction} isAdmin={isSuperAdmin} />}
            {page === 'voice' && <VoicePage data={scopedData} runAction={runAction} />}
            {page === 'expenses' && <ExpensesPage data={scopedData} runAction={runAction} canManage={canManageRecords} />}
            {page === 'suppliers' && <ContactsPage type="suppliers" data={scopedData} runAction={runAction} canManage={canManageRecords} />}
            {page === 'customers' && <ContactsPage type="customers" data={scopedData} runAction={runAction} canManage={canManageRecords} />}
            {page === 'admin' && canOpenAdmin && <AdminPage data={data} runAction={runAction} />}
            {page === 'reports' && <ReportsPage data={scopedData} />}
          </>
        )}
        {page === 'backup' && <BackupPage runAction={runAction} />}
      </main>
      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
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
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [authNotice, setAuthNotice] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    onError('');
    setAuthNotice('');
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) onError(authError.message);
    } catch {
      onError('Nao foi possivel conectar ao Supabase. Verifique as variaveis da Vercel e tente novamente.');
    } finally {
      setLoading(false);
    }
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
            <h1>Entrar no sistema</h1>
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
                <button
                  className="forgot-link"
                  onClick={async () => {
                    onError('');
                    setAuthNotice('');
                    if (!email) {
                      onError('Informe seu email para recuperar a senha.');
                      return;
                    }
                    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email);
                    if (resetError) onError(resetError.message);
                    else setAuthNotice('Enviamos as instrucoes de recuperacao para o email informado.');
                  }}
                  type="button"
                >
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
              <button type="button" className="social-button" disabled title="Login social ainda nao configurado">
                <span className="google-mark">G</span>
                Google
              </button>
              <button type="button" className="social-button" disabled title="Login social ainda nao configurado">
                <span className="facebook-mark">f</span>
                Facebook
              </button>
            </div>
            <p className="signup-line">
              Novos acessos sao criados pelo admin geral ou pelo proprietario da empresa.
              <button className="inline-link" hidden onClick={() => setMode(mode === 'login' ? 'signup' : 'login')} type="button">
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

function VoicePage({ data, runAction }: PageProps) {
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>('idle');
  const [transcript, setTranscript] = useState('');
  const [speechError, setSpeechError] = useState('');
  const [backendMessage, setBackendMessage] = useState('');
  const [parsed, setParsed] = useState<ParsedVoiceCommand | null>(null);

  const recognitionAvailable = typeof window !== 'undefined' && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
  const listening = voiceStatus === 'listening';
  const processing = voiceStatus === 'processing';

  async function requestMicrophonePermission() {
    if (!navigator.mediaDevices?.getUserMedia) return;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
  }

  async function sendAudioText(text: string) {
    setVoiceStatus('processing');
    setBackendMessage('');
    const response = await fetch('/lancamentos/audio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texto: text }),
    });
    const result = (await response.json().catch(() => null)) as { mensagem?: string; error?: string } | null;
    if (!response.ok) {
      throw new Error(result?.error || 'Nao foi possivel enviar o texto para o backend.');
    }
    setBackendMessage(result?.mensagem || 'Lancamento por audio recebido.');
    setVoiceStatus('completed');
  }

  async function startListening() {
    setSpeechError('');
    setBackendMessage('');
    if (!recognitionAvailable) {
      setSpeechError('Seu navegador nao suporta reconhecimento de voz. No celular, teste pelo Chrome.');
      setVoiceStatus('error');
      return;
    }

    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) return;

    try {
      await requestMicrophonePermission();
    } catch {
      setSpeechError('Permissao do microfone negada. Libere o microfone no navegador para usar o lancamento por audio.');
      setVoiceStatus('error');
      return;
    }

    const recognition = new Recognition();
    recognition.lang = 'pt-BR';
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = async (event) => {
      const text = Array.from(event.results)
        .map((result) => result[0]?.transcript || '')
        .join(' ')
        .trim();
      setTranscript(text);
      setParsed(parseVoiceCommand(text));
      if (!text) {
        setSpeechError('Nenhuma fala foi identificada. Tente novamente mais perto do microfone.');
        setVoiceStatus('error');
        return;
      }
      try {
        await sendAudioText(text);
      } catch (err) {
        setSpeechError(getMessage(err));
        setVoiceStatus('error');
      }
    };
    recognition.onerror = (event) => {
      const denied = event.error === 'not-allowed' || event.error === 'service-not-allowed';
      setSpeechError(
        denied
          ? 'Permissao do microfone negada. Libere o microfone no navegador para usar o lancamento por audio.'
          : `Nao foi possivel entender o audio${event.error ? `: ${event.error}` : '.'}`,
      );
      setVoiceStatus('error');
    };
    recognition.onend = () => {
      setVoiceStatus((current) => (current === 'listening' ? 'idle' : current));
    };
    try {
      setVoiceStatus('listening');
      recognition.start();
    } catch (err) {
      setSpeechError(getMessage(err));
      setVoiceStatus('error');
    }
  }

  function updateParsed<K extends keyof ParsedVoiceCommand>(key: K, value: ParsedVoiceCommand[K]) {
    setParsed((current) => (current ? { ...current, [key]: value } : current));
  }

  async function confirmVoiceCommand() {
    if (!parsed) return;
    await runAction('Lancamento por audio confirmado.', async () => {
      if (parsed.intent === 'produto') {
        await saveProduct({
          name: parsed.productName,
          category: 'Papelão',
          price_per_kg: parsed.unitPrice || parsed.totalValue,
          min_stock_kg: 0,
          active: true,
        });
        return;
      }

      if (parsed.intent === 'despesa') {
        await saveExpense({
          description: parsed.expenseDescription || 'Despesa por audio',
          category: inferExpenseCategory(parsed.expenseDescription),
          amount: parsed.totalValue,
          occurred_at: new Date().toISOString(),
          notes: transcript,
        });
        return;
      }

      const product = findByName(data.products, parsed.productName);
      if (!product) throw new Error('Produto nao encontrado. Cadastre ou selecione um produto existente antes de confirmar.');

      if (parsed.intent === 'entrada') {
        const supplier = findByName(data.suppliers, parsed.supplierName) || (await createSupplier({
          name: parsed.supplierName || 'Fornecedor por audio',
          phone: '',
          document: '',
          notes: 'Criado por lançamento de áudio.',
        }));
        await createStockEntry({
          product_id: product.id,
          supplier_id: supplier.id,
          weight_kg: parsed.quantity,
          unit_cost: parsed.unitPrice || parsed.totalValue / parsed.quantity,
          total_cost: parsed.totalValue || parsed.quantity * parsed.unitPrice,
          occurred_at: new Date().toISOString(),
          notes: transcript,
        });
        return;
      }

      if (parsed.intent === 'venda') {
        const customer = findByName(data.customers, parsed.customerName) || (await createCustomer({
          name: parsed.customerName || 'Cliente por audio',
          phone: '',
          document: '',
          notes: 'Criado por lançamento de áudio.',
        }));
        await createSale({
          product_id: product.id,
          customer_id: customer.id,
          weight_kg: parsed.quantity,
          unit_price: parsed.unitPrice || parsed.totalValue / parsed.quantity || product.price_per_kg,
          total_price: parsed.totalValue || parsed.quantity * (parsed.unitPrice || product.price_per_kg),
          occurred_at: new Date().toISOString(),
          notes: transcript,
        });
        return;
      }

      throw new Error('Saida de estoque sem cliente ainda precisa ser revisada manualmente. Use venda ou informe um cliente.');
    });
    setParsed(null);
    setTranscript('');
  }

  const canConfirm = parsed ? validateVoiceCommand(parsed, data).length === 0 : false;
  const validationMessages = parsed ? validateVoiceCommand(parsed, data) : [];
  const statusLabel =
    voiceStatus === 'listening'
      ? 'Ouvindo'
      : voiceStatus === 'processing'
        ? 'Processando'
        : voiceStatus === 'completed'
          ? 'Concluido'
          : voiceStatus === 'error'
            ? 'Erro'
            : 'Pronto';

  return (
    <div className="voice-layout">
      <section className="panel voice-panel">
        <div className="voice-hero">
          <button className={listening ? 'mic-button listening' : 'mic-button'} disabled={listening || processing} onClick={startListening} type="button">
            <Mic size={34} />
          </button>
          <div>
            <h2>Lançamento por áudio</h2>
            <p>Toque no microfone, fale o comando e revise os dados antes de salvar.</p>
            <span className={`voice-status ${voiceStatus}`}>{statusLabel}</span>
          </div>
        </div>

        {speechError && <div className="notice danger">{speechError}</div>}
        {backendMessage && <div className="notice success">{backendMessage}</div>}
        {!recognitionAvailable && <div className="notice neutral">Reconhecimento de voz disponível principalmente no Chrome/Android.</div>}

        <label>
          Texto reconhecido
          <textarea
            value={transcript}
            onChange={(event) => {
              setTranscript(event.target.value);
              setBackendMessage('');
              setVoiceStatus('idle');
              setParsed(event.target.value.trim() ? parseVoiceCommand(event.target.value) : null);
            }}
            placeholder="Ex.: Chegou 500 folhas de papelão onda B do fornecedor João, preço 2 reais cada."
          />
        </label>
        <div className="form-actions">
          <button
            className="secondary-button"
            disabled={!transcript.trim() || listening || processing}
            onClick={async () => {
              setSpeechError('');
              try {
                await sendAudioText(transcript.trim());
              } catch (err) {
                setSpeechError(getMessage(err));
                setVoiceStatus('error');
              }
            }}
            type="button"
          >
            <RefreshCcw size={18} />
            Enviar texto
          </button>
        </div>
      </section>

      <section className="panel voice-panel">
        <h2>Confirmação antes de salvar</h2>
        {!parsed && <div className="empty-state">Nenhum comando interpretado ainda.</div>}
        {parsed && (
          <div className="form-grid">
            <label>
              Tipo
              <select value={parsed.intent} onChange={(event) => updateParsed('intent', event.target.value as VoiceIntent)}>
                <option value="entrada">Entrada</option>
                <option value="venda">Venda</option>
                <option value="saida">Saída</option>
                <option value="despesa">Despesa</option>
                <option value="produto">Cadastro de produto</option>
              </select>
            </label>
            {parsed.intent !== 'despesa' && (
              <label>
                Produto
                <input value={parsed.productName} onChange={(event) => updateParsed('productName', event.target.value)} />
              </label>
            )}
            {parsed.intent !== 'produto' && parsed.intent !== 'despesa' && (
              <label>
                Quantidade
                <input min="0" step="0.01" type="number" value={parsed.quantity} onChange={(event) => updateParsed('quantity', Number(event.target.value))} />
              </label>
            )}
            {(parsed.intent === 'entrada' || parsed.intent === 'produto') && (
              <label>
                Preço unitário
                <input min="0" step="0.01" type="number" value={parsed.unitPrice} onChange={(event) => updateParsed('unitPrice', Number(event.target.value))} />
              </label>
            )}
            {(parsed.intent === 'venda' || parsed.intent === 'despesa') && (
              <label>
                Valor total
                <input min="0" step="0.01" type="number" value={parsed.totalValue} onChange={(event) => updateParsed('totalValue', Number(event.target.value))} />
              </label>
            )}
            {parsed.intent === 'entrada' && (
              <label>
                Fornecedor
                <input value={parsed.supplierName} onChange={(event) => updateParsed('supplierName', event.target.value)} />
              </label>
            )}
            {parsed.intent === 'venda' && (
              <label>
                Cliente
                <input value={parsed.customerName} onChange={(event) => updateParsed('customerName', event.target.value)} />
              </label>
            )}
            {parsed.intent === 'despesa' && (
              <label className="span-all">
                Descrição
                <input value={parsed.expenseDescription} onChange={(event) => updateParsed('expenseDescription', event.target.value)} />
              </label>
            )}
            {(parsed.warnings.length > 0 || validationMessages.length > 0) && (
              <div className="notice neutral span-all">
                {[...parsed.warnings, ...validationMessages].map((message) => (
                  <div key={message}>{message}</div>
                ))}
              </div>
            )}
            <div className="form-actions">
              <button className="secondary-button" onClick={() => setParsed(null)} type="button">
                <X size={18} />
                Cancelar
              </button>
              <button className="primary-button" disabled={!canConfirm} onClick={confirmVoiceCommand} type="button">
                <Check size={18} />
                Confirmar e salvar
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function ProductsPage({ data, runAction, isAdmin }: PageProps & { isAdmin: boolean }) {
  const [editing, setEditing] = useState<Product | null>(null);
  const [viewing, setViewing] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState('');
  const filtered = filterBy(data.products, query, (product) => `${product.name} ${product.category}`);
  const closeProductModal = () => {
    setCreating(false);
    setEditing(null);
  };

  return (
    <div className="admin-layout">
      <section className="panel">
        <div className="panel-title-row">
          <div>
            <h2>Produtos cadastrados</h2>
            <span className="muted-text">{filtered.length} produto(s) encontrado(s)</span>
          </div>
          <button className="primary-button" onClick={() => setCreating(true)} type="button">
            <Plus size={18} />
            Novo produto
          </button>
        </div>
        <PanelSearch value={query} onChange={setQuery} placeholder="Buscar produto por nome ou categoria" />
        <Table
          empty="Nenhum produto cadastrado."
          headers={isAdmin ? ['Produto', 'Preco/kg', 'Estoque', 'Minimo', 'Status', 'Ações'] : ['Produto', 'Preco/kg', 'Estoque', 'Minimo', 'Status', '']}
          rows={filtered.map((product) => [
            <strong>{product.name}</strong>,
            formatMoney(product.price_per_kg),
            formatKg(product.stock_kg),
            formatKg(product.min_stock_kg),
            product.active ? 'Ativo' : 'Inativo',
            <div className="row-actions">
              <button className="small-button" onClick={() => setViewing(product)} type="button">
                Ver
              </button>
              <button className="small-button" onClick={() => setEditing(product)} type="button">
                Editar
              </button>
              {isAdmin && (
                <button
                  className="small-button danger-button"
                  onClick={() => setDeleting(product)}
                  type="button"
                >
                  Apagar
                </button>
              )}
            </div>,
          ])}
        />
      </section>

      {(creating || editing) && (
        <Modal title={editing ? 'Editar produto' : 'Novo produto'} onClose={closeProductModal}>
          <ProductForm
            product={editing}
            products={data.products}
            onCancel={closeProductModal}
            onSubmit={(input) =>
              runAction('Produto salvo.', async () => {
                await saveProduct(input, editing?.id);
                closeProductModal();
              })
            }
          />
        </Modal>
      )}

      {viewing && (
        <Modal title="Detalhes do produto" onClose={() => setViewing(null)}>
          <div className="detail-grid">
            <div>
              <span>Produto</span>
              <strong>{viewing.name}</strong>
            </div>
            <div>
              <span>Categoria</span>
              <strong>{viewing.category}</strong>
            </div>
            <div>
              <span>Preco por kg</span>
              <strong>{formatMoney(viewing.price_per_kg)}</strong>
            </div>
            <div>
              <span>Estoque atual</span>
              <strong>{formatKg(viewing.stock_kg)}</strong>
            </div>
            <div>
              <span>Estoque minimo</span>
              <strong>{formatKg(viewing.min_stock_kg)}</strong>
            </div>
            <div>
              <span>Status</span>
              <strong>{viewing.active ? 'Ativo' : 'Inativo'}</strong>
            </div>
          </div>
          <div className="form-actions">
            <button className="secondary-button" onClick={() => setViewing(null)} type="button">
              Fechar
            </button>
            <button
              className="primary-button"
              onClick={() => {
                setEditing(viewing);
                setViewing(null);
              }}
              type="button"
            >
              <Save size={18} />
              Editar produto
            </button>
          </div>
        </Modal>
      )}

      {deleting && (
        <Modal title="Apagar produto" onClose={() => setDeleting(null)}>
          <div className="notice danger">
            Apagar este produto? Isso so sera permitido se ele nao tiver entradas ou vendas.
          </div>
          <div className="detail-grid compact">
            <div>
              <span>Produto</span>
              <strong>{deleting.name}</strong>
            </div>
            <div>
              <span>Estoque</span>
              <strong>{formatKg(deleting.stock_kg)}</strong>
            </div>
          </div>
          <div className="form-actions">
            <button className="secondary-button" onClick={() => setDeleting(null)} type="button">
              Cancelar
            </button>
            <button
              className="primary-button danger-solid-button"
              onClick={() =>
                runAction('Produto apagado.', async () => {
                  await deleteProduct(deleting.id);
                  setDeleting(null);
                })
              }
              type="button"
            >
              Apagar produto
            </button>
          </div>
        </Modal>
      )}
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
  const [price, setPrice] = useState(product ? String(product.price_per_kg) : '');
  const [stock, setStock] = useState(product ? String(product.stock_kg) : '');
  const [minimum, setMinimum] = useState(product ? String(product.min_stock_kg) : '');
  const [active, setActive] = useState(product?.active ?? true);
  const productNameOptions = Array.from(new Set(products.map((item) => item.name).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  const categoryOptions = Array.from(new Set(products.map((item) => item.category).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  const duplicate = products.some(
    (item) => item.id !== product?.id && normalizeName(item.name) === normalizeName(name),
  );

  useEffect(() => {
    setName(product?.name || '');
    setCategory(product?.category || '');
    setPrice(product ? String(product.price_per_kg) : '');
    setStock(product ? String(product.stock_kg) : '');
    setMinimum(product ? String(product.min_stock_kg) : '');
    setActive(product?.active ?? true);
  }, [product]);

  return (
    <form
      className="form-grid"
      onSubmit={(event) => {
        event.preventDefault();
        if (duplicate) return;
        onSubmit({
          name,
          category,
          price_per_kg: Number(price),
          stock_kg: product ? undefined : Number(stock || 0),
          min_stock_kg: Number(minimum || 0),
          active,
        });
      }}
    >
      <label>
        Nome
        <input list="product-name-options" value={name} onChange={(event) => setName(event.target.value)} placeholder="Digite ou pesquise um produto" required />
        <datalist id="product-name-options">
          {productNameOptions.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>
      </label>
      {duplicate && <div className="notice danger span-all">Ja existe um produto cadastrado com esse nome.</div>}
      <label>
        Categoria
        <input list="product-category-options" value={category} onChange={(event) => setCategory(event.target.value)} placeholder="Digite ou pesquise uma categoria" required />
        <datalist id="product-category-options">
          {categoryOptions.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>
      </label>
      <label>
        Preco por kg
        <input min="0" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="0,00" type="number" required />
      </label>
      {!product && (
        <label>
          Estoque inicial em kg
          <input min="0" step="0.01" value={stock} onChange={(event) => setStock(event.target.value)} placeholder="0,00" type="number" />
        </label>
      )}
      <label>
        Estoque minimo em kg
        <input min="0" step="0.01" value={minimum} onChange={(event) => setMinimum(event.target.value)} placeholder="0,00" type="number" />
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
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [viewing, setViewing] = useState<StockEntry | null>(null);
  const [editing, setEditing] = useState<StockEntry | null>(null);
  const [deleting, setDeleting] = useState<StockEntry | null>(null);
  const filtered = filterBy(data.entries, query, (entry) => `${productName(data, entry.product_id)} ${supplierName(data, entry.supplier_id)} ${entry.notes || ''}`);
  const closeEntryModal = () => {
    setCreating(false);
    setEditing(null);
  };

  return (
    <div className="admin-layout">
      <section className="panel">
        <div className="panel-title-row">
          <div>
            <h2>Historico de entradas</h2>
            <span className="muted-text">{filtered.length} entrada(s) encontrada(s)</span>
          </div>
          <button className="primary-button" onClick={() => setCreating(true)} type="button">
            <Plus size={18} />
            Nova entrada
          </button>
        </div>
        <PanelSearch value={query} onChange={setQuery} placeholder="Buscar por produto, fornecedor ou observacao" />
        <Table
          empty="Nenhuma entrada registrada."
          headers={['Produto', 'Fornecedor', 'Peso', 'Custo total', 'Data', 'Acoes']}
          rows={filtered.map((entry) => [
            productName(data, entry.product_id),
            supplierName(data, entry.supplier_id),
            formatKg(entry.weight_kg),
            formatMoney(entry.total_cost),
            formatDateTime(entry.occurred_at),
            <div className="row-actions">
              <button className="small-button" onClick={() => setViewing(entry)} type="button">
                Ver
              </button>
              {isAdmin && (
                <>
                  <button className="small-button" onClick={() => setEditing(entry)} type="button">
                    Editar
                  </button>
                  <button className="small-button danger-button" onClick={() => setDeleting(entry)} type="button">
                    Apagar
                  </button>
                </>
              )}
            </div>,
          ])}
        />
      </section>

      {(creating || editing) && (
        <Modal title={editing ? 'Editar entrada' : 'Nova entrada'} onClose={closeEntryModal}>
          <EntryForm
            entry={editing}
            products={activeProducts}
            suppliers={data.suppliers}
            onCancel={closeEntryModal}
            onSubmit={(input) =>
              runAction(editing ? 'Entrada atualizada e estoque ajustado.' : 'Entrada registrada e estoque atualizado.', async () => {
                if (editing) await updateStockEntry(editing.id, input);
                else await createStockEntry(input);
                closeEntryModal();
              })
            }
          />
        </Modal>
      )}

      {viewing && (
        <Modal title="Detalhes da entrada" onClose={() => setViewing(null)}>
          <EntryDetails entry={viewing} data={data} />
          <div className="form-actions">
            <button className="secondary-button" onClick={() => setViewing(null)} type="button">
              Fechar
            </button>
            {isAdmin && (
              <button
                className="primary-button"
                onClick={() => {
                  setEditing(viewing);
                  setViewing(null);
                }}
                type="button"
              >
                <Save size={18} />
                Editar entrada
              </button>
            )}
          </div>
        </Modal>
      )}

      {deleting && (
        <Modal title="Apagar entrada" onClose={() => setDeleting(null)}>
          <div className="notice danger">Apagar esta entrada e ajustar o estoque?</div>
          <EntryDetails entry={deleting} data={data} compact />
          <div className="form-actions">
            <button className="secondary-button" onClick={() => setDeleting(null)} type="button">
              Cancelar
            </button>
            <button
              className="primary-button danger-solid-button"
              onClick={() =>
                runAction('Entrada apagada.', async () => {
                  await deleteStockEntry(deleting.id);
                  setDeleting(null);
                })
              }
              type="button"
            >
              Apagar entrada
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function EntryForm({
  entry,
  products,
  suppliers,
  onSubmit,
  onCancel,
}: {
  entry: StockEntry | null;
  products: Product[];
  suppliers: Supplier[];
  onSubmit: (input: {
    product_id: string;
    supplier_id: string;
    weight_kg: number;
    unit_cost: number;
    total_cost: number;
    occurred_at: string;
    notes: string;
  }) => void;
  onCancel: () => void;
}) {
  const productOptions = entry && !products.some((product) => product.id === entry.product_id)
    ? [...products, { id: entry.product_id, name: 'Produto atual', active: true } as Product]
    : products;
  const supplierOptions = suppliers;
  const [productId, setProductId] = useState(entry?.product_id || '');
  const [supplierId, setSupplierId] = useState(entry?.supplier_id || '');
  const [productQuery, setProductQuery] = useState(() => productOptions.find((product) => product.id === entry?.product_id)?.name || '');
  const [supplierQuery, setSupplierQuery] = useState(() => supplierOptions.find((supplier) => supplier.id === entry?.supplier_id)?.name || '');
  const [weight, setWeight] = useState(entry ? String(entry.weight_kg) : '');
  const [unitCost, setUnitCost] = useState(entry ? String(entry.unit_cost) : '');
  const [totalCost, setTotalCost] = useState(entry ? String(entry.total_cost) : '');
  const [date, setDate] = useState(entry ? toInputDateTime(entry.occurred_at) : toInputDateTime());
  const [notes, setNotes] = useState(entry?.notes || '');

  useEffect(() => {
    const weightValue = Number(weight);
    const unitCostValue = Number(unitCost);
    if (weight !== '' && unitCost !== '' && !Number.isNaN(weightValue) && !Number.isNaN(unitCostValue)) {
      setTotalCost(String(roundMoney(weightValue * unitCostValue)));
    }
  }, [weight, unitCost]);

  useEffect(() => {
    setProductId(entry?.product_id || '');
    setSupplierId(entry?.supplier_id || '');
    setProductQuery(productOptions.find((product) => product.id === entry?.product_id)?.name || '');
    setSupplierQuery(supplierOptions.find((supplier) => supplier.id === entry?.supplier_id)?.name || '');
    setWeight(entry ? String(entry.weight_kg) : '');
    setUnitCost(entry ? String(entry.unit_cost) : '');
    setTotalCost(entry ? String(entry.total_cost) : '');
    setDate(entry ? toInputDateTime(entry.occurred_at) : toInputDateTime());
    setNotes(entry?.notes || '');
  }, [entry, productOptions, supplierOptions]);

  return (
    <form
      className="form-grid"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({
          product_id: productId,
          supplier_id: supplierId,
          weight_kg: Number(weight),
          unit_cost: Number(unitCost),
          total_cost: Number(totalCost),
          occurred_at: fromInputDateTime(date),
          notes,
        });
      }}
    >
      <label>
        Produto
        <input
          list="entry-product-options"
          value={productQuery}
          onChange={(event) => {
            const value = event.target.value;
            setProductQuery(value);
            const match = productOptions.find((product) => normalizeName(product.name) === normalizeName(value));
            setProductId(match?.id || '');
          }}
          placeholder="Digite ou pesquise um produto"
          required
        />
        <datalist id="entry-product-options">
          {productOptions.map((product) => (
            <option key={product.id} value={product.name} />
          ))}
        </datalist>
      </label>
      <label>
        Fornecedor
        <input
          list="entry-supplier-options"
          value={supplierQuery}
          onChange={(event) => {
            const value = event.target.value;
            setSupplierQuery(value);
            const match = supplierOptions.find((supplier) => normalizeName(supplier.name) === normalizeName(value));
            setSupplierId(match?.id || '');
          }}
          placeholder="Digite ou pesquise um fornecedor"
          required
        />
        <datalist id="entry-supplier-options">
          {supplierOptions.map((supplier) => (
            <option key={supplier.id} value={supplier.name} />
          ))}
        </datalist>
      </label>
      <label>
        Peso recebido em kg
        <input min="0.01" step="0.01" value={weight} onChange={(event) => setWeight(event.target.value)} placeholder="0,00" type="number" required />
      </label>
      <label>
        Custo por kg
        <input min="0" step="0.01" value={unitCost} onChange={(event) => setUnitCost(event.target.value)} placeholder="0,00" type="number" required />
      </label>
      <label>
        Custo total
        <input min="0" step="0.01" value={totalCost} onChange={(event) => setTotalCost(event.target.value)} placeholder="0,00" type="number" required />
      </label>
      <label>
        Data e hora
        <input value={date} onChange={(event) => setDate(event.target.value)} type="datetime-local" required />
      </label>
      <label className="span-all">
        Observacao
        <textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
      </label>
      <div className="form-actions">
        <button className="secondary-button" onClick={onCancel} type="button">
          Cancelar
        </button>
        <button className="primary-button" disabled={!productId || !supplierId} type="submit">
          <Save size={18} />
          Salvar
        </button>
      </div>
    </form>
  );
}

function EntryDetails({ entry, data, compact = false }: { entry: StockEntry; data: AppData; compact?: boolean }) {
  return (
    <div className={compact ? 'detail-grid compact' : 'detail-grid'}>
      <div>
        <span>Produto</span>
        <strong>{productName(data, entry.product_id)}</strong>
      </div>
      <div>
        <span>Fornecedor</span>
        <strong>{supplierName(data, entry.supplier_id)}</strong>
      </div>
      <div>
        <span>Peso</span>
        <strong>{formatKg(entry.weight_kg)}</strong>
      </div>
      <div>
        <span>Custo por kg</span>
        <strong>{formatMoney(entry.unit_cost)}</strong>
      </div>
      <div>
        <span>Custo total</span>
        <strong>{formatMoney(entry.total_cost)}</strong>
      </div>
      <div>
        <span>Data</span>
        <strong>{formatDateTime(entry.occurred_at)}</strong>
      </div>
      {entry.notes && (
        <div>
          <span>Observacao</span>
          <strong>{entry.notes}</strong>
        </div>
      )}
    </div>
  );
}

function SalesPage({ data, runAction, isAdmin }: PageProps & { isAdmin: boolean }) {
  const activeProducts = data.products.filter((product) => product.active);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [viewing, setViewing] = useState<Sale | null>(null);
  const [editing, setEditing] = useState<Sale | null>(null);
  const [deleting, setDeleting] = useState<Sale | null>(null);
  const filtered = filterBy(data.sales, query, (sale) => `${productName(data, sale.product_id)} ${customerName(data, sale.customer_id)} ${sale.notes || ''}`);
  const closeSaleModal = () => {
    setCreating(false);
    setEditing(null);
  };

  return (
    <div className="admin-layout">
      <section className="panel">
        <div className="panel-title-row">
          <div className="brand-copy">
            <h2>Historico de vendas</h2>
            <span className="muted-text">{filtered.length} venda(s) encontrada(s)</span>
          </div>
          <button className="primary-button" onClick={() => setCreating(true)} type="button">
            <Plus size={18} />
            Nova venda
          </button>
        </div>
        <PanelSearch value={query} onChange={setQuery} placeholder="Buscar por produto, cliente ou observacao" />
        <Table
          empty="Nenhuma venda registrada."
          headers={['Produto', 'Cliente', 'Peso', 'Total', 'Data', 'Acoes']}
          rows={filtered.map((sale) => [
            productName(data, sale.product_id),
            customerName(data, sale.customer_id),
            formatKg(sale.weight_kg),
            formatMoney(sale.total_price),
            formatDateTime(sale.occurred_at),
            <div className="row-actions">
              <button className="small-button" onClick={() => setViewing(sale)} type="button">
                Ver
              </button>
              {isAdmin && (
                <>
                  <button className="small-button" onClick={() => setEditing(sale)} type="button">
                    Editar
                  </button>
                  <button
                    className="small-button danger-button"
                    onClick={() => setDeleting(sale)}
                    type="button"
                  >
                    Apagar
                  </button>
                </>
              )}
            </div>,
          ])}
        />
      </section>

      {(creating || editing) && (
        <Modal title={editing ? 'Editar venda' : 'Nova venda'} onClose={closeSaleModal}>
          <SaleForm
            sale={editing}
            data={data}
            products={activeProducts}
            onCancel={closeSaleModal}
            onSubmit={(input) =>
              runAction(editing ? 'Venda atualizada e estoque ajustado.' : 'Venda registrada e estoque atualizado.', async () => {
                if (editing) await updateSale(editing.id, input);
                else await createSale(input);
                closeSaleModal();
              })
            }
          />
        </Modal>
      )}

      {viewing && (
        <Modal title="Detalhes da venda" onClose={() => setViewing(null)}>
          <SaleDetails sale={viewing} data={data} />
          <div className="form-actions">
            <button className="secondary-button" onClick={() => setViewing(null)} type="button">
              Fechar
            </button>
            {isAdmin && (
              <button
                className="primary-button"
                onClick={() => {
                  setEditing(viewing);
                  setViewing(null);
                }}
                type="button"
              >
                <Save size={18} />
                Editar venda
              </button>
            )}
          </div>
        </Modal>
      )}

      {deleting && (
        <Modal title="Apagar venda" onClose={() => setDeleting(null)}>
          <div className="notice danger">Apagar esta venda e devolver o peso ao estoque?</div>
          <SaleDetails sale={deleting} data={data} compact />
          <div className="form-actions">
            <button className="secondary-button" onClick={() => setDeleting(null)} type="button">
              Cancelar
            </button>
            <button
              className="primary-button danger-solid-button"
              onClick={() =>
                runAction('Venda apagada.', async () => {
                  await deleteSale(deleting.id);
                  setDeleting(null);
                })
              }
              type="button"
            >
              Apagar venda
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function SaleForm({
  sale,
  data,
  products,
  onSubmit,
  onCancel,
}: {
  sale: Sale | null;
  data: AppData;
  products: Product[];
  onSubmit: (input: {
    product_id: string;
    customer_id: string;
    weight_kg: number;
    unit_price: number;
    total_price: number;
    occurred_at: string;
    notes: string;
  }) => void;
  onCancel: () => void;
}) {
  const currentProduct = sale ? data.products.find((product) => product.id === sale.product_id) : null;
  const productOptions = currentProduct && !products.some((product) => product.id === currentProduct.id) ? [...products, currentProduct] : products;
  const [productId, setProductId] = useState(sale?.product_id || '');
  const [customerId, setCustomerId] = useState(sale?.customer_id || '');
  const [weight, setWeight] = useState(sale?.weight_kg || 0);
  const [date, setDate] = useState(sale ? toInputDateTime(sale.occurred_at) : toInputDateTime());
  const [notes, setNotes] = useState(sale?.notes || '');
  const selectedProduct = data.products.find((product) => product.id === productId);
  const availableStock = selectedProduct ? selectedProduct.stock_kg + (sale?.product_id === productId ? sale.weight_kg : 0) : 0;
  const unitPrice = selectedProduct?.price_per_kg || 0;
  const total = roundMoney(unitPrice * weight);
  const blocked = Boolean(selectedProduct && weight > availableStock);

  useEffect(() => {
    setProductId(sale?.product_id || '');
    setCustomerId(sale?.customer_id || '');
    setWeight(sale?.weight_kg || 0);
    setDate(sale ? toInputDateTime(sale.occurred_at) : toInputDateTime());
    setNotes(sale?.notes || '');
  }, [sale]);

  return (
    <form
      className="form-grid"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({
          product_id: productId,
          customer_id: customerId,
          weight_kg: weight,
          unit_price: unitPrice,
          total_price: total,
          occurred_at: fromInputDateTime(date),
          notes,
        });
      }}
    >
      <Select label="Produto" value={productId} onChange={setProductId} options={productOptions.map(optionFromName)} />
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
      {selectedProduct && <div className={blocked ? 'notice danger span-all' : 'notice neutral span-all'}>Estoque disponivel: {formatKg(availableStock)}</div>}
      <div className="form-actions">
        <button className="secondary-button" onClick={onCancel} type="button">
          Cancelar
        </button>
        <button className="primary-button" disabled={!productId || !customerId || blocked} type="submit">
          <Save size={18} />
          Salvar
        </button>
      </div>
    </form>
  );
}

function SaleDetails({ sale, data, compact = false }: { sale: Sale; data: AppData; compact?: boolean }) {
  return (
    <div className={compact ? 'detail-grid compact' : 'detail-grid'}>
      <div>
        <span>Produto</span>
        <strong>{productName(data, sale.product_id)}</strong>
      </div>
      <div>
        <span>Cliente</span>
        <strong>{customerName(data, sale.customer_id)}</strong>
      </div>
      <div>
        <span>Peso</span>
        <strong>{formatKg(sale.weight_kg)}</strong>
      </div>
      <div>
        <span>Preco por kg</span>
        <strong>{formatMoney(sale.unit_price)}</strong>
      </div>
      <div>
        <span>Total</span>
        <strong>{formatMoney(sale.total_price)}</strong>
      </div>
      <div>
        <span>Data</span>
        <strong>{formatDateTime(sale.occurred_at)}</strong>
      </div>
      {sale.notes && (
        <div>
          <span>Observacao</span>
          <strong>{sale.notes}</strong>
        </div>
      )}
    </div>
  );
}

function ExpensesPage({ data, runAction, canManage }: PageProps & { canManage: boolean }) {
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [viewing, setViewing] = useState<Expense | null>(null);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [deleting, setDeleting] = useState<Expense | null>(null);
  const filtered = filterBy(data.expenses, query, (expense) => `${expense.description} ${expenseCategoryLabel(expense.category)} ${expense.notes || ''}`);
  const closeExpenseModal = () => {
    setCreating(false);
    setEditing(null);
  };

  return (
    <div className="admin-layout">
      <section className="panel">
        <div className="panel-title-row">
          <div>
            <h2>Historico de despesas</h2>
            <span className="muted-text">{filtered.length} despesa(s) encontrada(s)</span>
          </div>
          <button className="primary-button" onClick={() => setCreating(true)} type="button">
            <Plus size={18} />
            Nova despesa
          </button>
        </div>
        <PanelSearch value={query} onChange={setQuery} placeholder="Buscar por descricao, categoria ou observacao" />
        <Table
          empty="Nenhuma despesa registrada."
          headers={['Descricao', 'Categoria', 'Valor', 'Data', 'Acoes']}
          rows={filtered.map((expense) => [
            expense.description,
            expenseCategoryLabel(expense.category),
            formatMoney(expense.amount),
            formatDateTime(expense.occurred_at),
            <div className="row-actions">
              <button className="small-button" onClick={() => setViewing(expense)} type="button">
                Ver
              </button>
              <button className="small-button" onClick={() => setEditing(expense)} type="button">
                Editar
              </button>
              {canManage && (
                <button className="small-button danger-button" onClick={() => setDeleting(expense)} type="button">
                  Apagar
                </button>
              )}
            </div>,
          ])}
        />
      </section>

      {(creating || editing) && (
        <Modal title={editing ? 'Editar despesa' : 'Nova despesa'} onClose={closeExpenseModal}>
          <ExpenseForm
            expense={editing}
            expenses={data.expenses}
            onCancel={closeExpenseModal}
            onSubmit={(input) =>
              runAction(editing ? 'Despesa atualizada.' : 'Despesa registrada.', async () => {
                await saveExpense(input, editing?.id);
                closeExpenseModal();
              })
            }
          />
        </Modal>
      )}

      {viewing && (
        <Modal title="Detalhes da despesa" onClose={() => setViewing(null)}>
          <ExpenseDetails expense={viewing} />
          <div className="form-actions">
            <button className="secondary-button" onClick={() => setViewing(null)} type="button">
              Fechar
            </button>
            <button
              className="primary-button"
              onClick={() => {
                setEditing(viewing);
                setViewing(null);
              }}
              type="button"
            >
              <Save size={18} />
              Editar despesa
            </button>
          </div>
        </Modal>
      )}

      {deleting && (
        <Modal title="Apagar despesa" onClose={() => setDeleting(null)}>
          <div className="notice danger">Apagar esta despesa?</div>
          <ExpenseDetails expense={deleting} compact />
          <div className="form-actions">
            <button className="secondary-button" onClick={() => setDeleting(null)} type="button">
              Cancelar
            </button>
            <button
              className="primary-button danger-solid-button"
              onClick={() =>
                runAction('Despesa apagada.', async () => {
                  await deleteExpense(deleting.id);
                  setDeleting(null);
                })
              }
              type="button"
            >
              Apagar despesa
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function ExpenseForm({
  expense,
  expenses,
  onSubmit,
  onCancel,
}: {
  expense: Expense | null;
  expenses: Expense[];
  onSubmit: (input: { description: string; category: ExpenseCategory; amount: number; occurred_at: string; notes: string }) => void;
  onCancel: () => void;
}) {
  const [description, setDescription] = useState(expense?.description || '');
  const [category, setCategory] = useState(expense?.category || '');
  const [amount, setAmount] = useState(currencyInputValue(expense?.amount || 0));
  const [date, setDate] = useState(expense ? toInputDateTime(expense.occurred_at) : toInputDateTime());
  const [notes, setNotes] = useState(expense?.notes || '');
  const categoryOptions = Array.from(
    new Set([...Object.keys(expenseLabels), ...expenses.map((item) => item.category)].filter(Boolean)),
  ).sort((a, b) => expenseCategoryLabel(a).localeCompare(expenseCategoryLabel(b)));
  const amountNumber = parseCurrencyInput(amount);

  useEffect(() => {
    setDescription(expense?.description || '');
    setCategory(expense?.category || '');
    setAmount(currencyInputValue(expense?.amount || 0));
    setDate(expense ? toInputDateTime(expense.occurred_at) : toInputDateTime());
    setNotes(expense?.notes || '');
  }, [expense]);

  return (
    <form
      className="form-grid"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({ description, category: category.trim(), amount: amountNumber, occurred_at: fromInputDateTime(date), notes });
      }}
    >
      <label>
        Descricao
        <input value={description} onChange={(event) => setDescription(event.target.value)} required />
      </label>
      <label>
        Categoria
        <input
          list="expense-category-options"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          placeholder="Digite ou escolha uma categoria"
          required
        />
        <datalist id="expense-category-options">
          {categoryOptions.map((option) => (
            <option key={option} value={option}>
              {expenseCategoryLabel(option)}
            </option>
          ))}
        </datalist>
      </label>
      <label>
        Valor
        <input
          inputMode="decimal"
          onChange={(event) => setAmount(formatCurrencyInput(event.target.value))}
          placeholder="R$ 0,00"
          required
          type="text"
          value={amount}
        />
      </label>
      <label>
        Data e hora
        <input value={date} onChange={(event) => setDate(event.target.value)} type="datetime-local" required />
      </label>
      <label className="span-all">
        Observacao
        <textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
      </label>
      <div className="form-actions">
        <button className="secondary-button" onClick={onCancel} type="button">
          Cancelar
        </button>
        <button className="primary-button" disabled={!category.trim() || amountNumber <= 0} type="submit">
          <Save size={18} />
          Salvar
        </button>
      </div>
    </form>
  );
}

function ExpenseDetails({ expense, compact = false }: { expense: Expense; compact?: boolean }) {
  return (
    <div className={compact ? 'detail-grid compact' : 'detail-grid'}>
      <div>
        <span>Descricao</span>
        <strong>{expense.description}</strong>
      </div>
      <div>
        <span>Categoria</span>
        <strong>{expenseCategoryLabel(expense.category)}</strong>
      </div>
      <div>
        <span>Valor</span>
        <strong>{formatMoney(expense.amount)}</strong>
      </div>
      <div>
        <span>Data</span>
        <strong>{formatDateTime(expense.occurred_at)}</strong>
      </div>
      {expense.notes && (
        <div>
          <span>Observacao</span>
          <strong>{expense.notes}</strong>
        </div>
      )}
    </div>
  );
}
function AdminPage({ data, runAction }: PageProps) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'owner' | 'operator'>('owner');
  const [companyName, setCompanyName] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [userLimit, setUserLimit] = useState(3);
  const [operatorEmail, setOperatorEmail] = useState('');
  const [operatorName, setOperatorName] = useState('');
  const [operatorPassword, setOperatorPassword] = useState('');
  const isSuperAdmin = data.currentProfile?.role === 'super_admin';
  const isOwner = data.currentProfile?.role === 'owner';
  const selectableCompanies = data.companies.filter((company) => Boolean(company.owner_id));
  const supportCompany = data.currentProfile?.support_company_owner_id
    ? data.companies.find((company) => company.owner_id === data.currentProfile?.support_company_owner_id) || null
    : null;
  const owners = data.profiles.filter((profile) => profile.role === 'owner');
  const operators = data.profiles.filter((profile) => profile.role === 'operator');
  const ownerCompany = data.companies.find((company) => company.owner_id === data.currentProfile?.id || company.id === data.currentProfile?.company_id);
  const ownerOperators = ownerCompany ? operators.filter((profile) => profile.company_id === ownerCompany.id) : [];
  const companyOwner = (ownerId: string | null) => owners.find((profile) => profile.id === ownerId);
  const companyUsers = (id: string) => operators.filter((profile) => profile.company_id === id);

  return (
    <div className="admin-layout">
      <div className="content-grid">
        <Metric icon={ShieldCheck} label="Empresas" value={String(data.companies.length)} />
        <Metric icon={Users} label="Proprietarios" value={String(owners.length)} />
        <Metric icon={Mail} label="Subusuarios" value={String(operators.length)} />
        <Metric icon={SlidersHorizontal} label="Limite total" value={String(data.companies.reduce((sum, company) => sum + company.user_limit, 0))} />
      </div>

      {isSuperAdmin && (
        <section className="panel">
          <div className="panel-title-row">
            <div>
              <h2>Suporte por empresa</h2>
              <span className="muted-text">
                {supportCompany ? `Voce esta atendendo ${supportCompany.name}` : 'Escolha uma empresa antes de ajustar dados operacionais'}
              </span>
            </div>
            {supportCompany && (
              <button
                className="secondary-button"
                onClick={() => runAction('Modo de suporte encerrado.', () => clearSupportCompany())}
                type="button"
              >
                Sair do suporte
              </button>
            )}
          </div>
          <Table
            empty="Nenhuma empresa cadastrada."
            headers={['Empresa', 'Proprietario', 'Subusuarios', 'Suporte']}
            rows={data.companies.map((company) => {
              const owner = companyOwner(company.owner_id);
              const used = companyUsers(company.id).length;
              const active = supportCompany?.id === company.id;
              return [
                <strong>{company.name}</strong>,
                owner?.name || '-',
                `${used}/${company.user_limit}`,
                <button
                  className={active ? 'small-button' : 'small-button'}
                  onClick={() => runAction(`Suporte iniciado em ${company.name}.`, () => setSupportCompany(company.id))}
                  type="button"
                >
                  {active ? 'Em suporte' : 'Entrar em suporte'}
                </button>,
              ];
            })}
          />
        </section>
      )}

      {isSuperAdmin && (
        <section className="panel">
          <h2>Criar proprietario ou subusuario</h2>
          <form
            className="form-grid"
            onSubmit={(event) => {
              event.preventDefault();
              runAction('Usuario criado.', async () => {
                await createUser({
                  email,
                  password,
                  name,
                  role,
                  companyName,
                  companyId,
                  userLimit,
                });
                setEmail('');
                setName('');
                setPassword('');
                setCompanyName('');
                setCompanyId('');
                setRole('owner');
              });
            }}
          >
            <label>
              Tipo de acesso
              <select value={role} onChange={(event) => setRole(event.target.value as 'owner' | 'operator')}>
                <option value="owner">Proprietario</option>
                <option value="operator">Subusuario</option>
              </select>
            </label>
            {role === 'owner' && (
              <>
                <label>
                  Empresa
                  <input value={companyName} onChange={(event) => setCompanyName(event.target.value)} required />
                </label>
                <label>
                  Limite de subusuarios
                  <input min="0" value={userLimit} onChange={(event) => setUserLimit(Number(event.target.value))} type="number" required />
                </label>
              </>
            )}
            {role === 'operator' && (
              <label>
                Empresa
                <select value={companyId} onChange={(event) => setCompanyId(event.target.value)} required>
                  <option value="">Selecione</option>
                  {selectableCompanies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
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
            <button className="primary-button" type="submit">
              <Plus size={18} />
              Criar acesso
            </button>
          </form>
        </section>
      )}

      {isOwner && (
        <section className="panel">
          <div className="panel-title-row">
            <div>
              <h2>Subusuarios da empresa</h2>
              <span className="muted-text">
                {ownerCompany ? `${ownerOperators.length}/${ownerCompany.user_limit} subusuario(s) vinculados` : 'Empresa nao encontrada'}
              </span>
            </div>
          </div>
          <form
            className="form-grid"
            onSubmit={(event) => {
              event.preventDefault();
              runAction('Subusuario criado e vinculado a empresa.', async () => {
                await createUser({
                  email: operatorEmail,
                  password: operatorPassword,
                  name: operatorName,
                  role: 'operator',
                });
                setOperatorEmail('');
                setOperatorName('');
                setOperatorPassword('');
              });
            }}
          >
            <label>
              Nome do subusuario
              <input value={operatorName} onChange={(event) => setOperatorName(event.target.value)} required />
            </label>
            <label>
              Email
              <input value={operatorEmail} onChange={(event) => setOperatorEmail(event.target.value)} type="email" required />
            </label>
            <label>
              Senha inicial
              <input minLength={6} value={operatorPassword} onChange={(event) => setOperatorPassword(event.target.value)} type="password" required />
            </label>
            <button className="primary-button" disabled={!ownerCompany || ownerOperators.length >= (ownerCompany?.user_limit || 0)} type="submit">
              <Plus size={18} />
              Criar subusuario
            </button>
          </form>
          <Table
            empty="Nenhum subusuario vinculado."
            headers={['Nome', 'Email', 'Acoes']}
            rows={ownerOperators.map((profile) => [
              profile.name || '-',
              profile.email,
              <button
                className="small-button danger-button"
                onClick={() => confirmAction('Remover este subusuario da empresa?', () => runAction('Subusuario removido.', () => removeOperator(profile.id)))}
                type="button"
              >
                Remover
              </button>,
            ])}
          />
        </section>
      )}

      {isSuperAdmin && <section className="panel">
        <h2>Empresas, proprietarios e limites</h2>
        <Table
          empty="Nenhuma empresa cadastrada."
          headers={['Empresa', 'Proprietario', 'Email', 'Subusuarios', 'Limite']}
          rows={data.companies.map((company) => {
            const owner = companyOwner(company.owner_id);
            const used = companyUsers(company.id).length;
            return [
              <strong>{company.name}</strong>,
              owner?.name || '-',
              owner?.email || '-',
              `${used}/${company.user_limit}`,
              <input
                min="0"
                value={company.user_limit}
                onChange={(event) =>
                  runAction('Limite atualizado.', () => updateCompanyLimit(company.id, Number(event.target.value)))
                }
                type="number"
              />,
            ];
          })}
        />
      </section>}

      {isSuperAdmin && <section className="panel">
        <h2>Usuarios criados</h2>
        <Table
          empty="Nenhum usuario encontrado."
          headers={['Nome', 'Email', 'Empresa', 'Perfil']}
          rows={data.profiles.map((profile) => [
            profile.name || '-',
            profile.email,
            data.companies.find((company) => company.id === profile.company_id)?.name || '-',
            <select
              value={profile.role}
              onChange={(event) =>
                runAction('Perfil atualizado.', () => updateUserRole(profile.id, event.target.value as 'owner' | 'operator'))
              }
              disabled={profile.id === data.currentProfile?.id || profile.role === 'super_admin'}
            >
              {profile.role === 'super_admin' && <option value="super_admin">Admin geral</option>}
              <option value="operator">Subusuario</option>
              <option value="owner">Proprietario</option>
            </select>,
          ])}
        />
      </section>}
    </div>
  );
}

function ContactsPage({ type, data, runAction, canManage }: PageProps & { type: 'suppliers' | 'customers'; canManage: boolean }) {
  const [editing, setEditing] = useState<Supplier | Customer | null>(null);
  const [creating, setCreating] = useState(false);
  const [viewing, setViewing] = useState<Supplier | Customer | null>(null);
  const [deleting, setDeleting] = useState<Supplier | Customer | null>(null);
  const [query, setQuery] = useState('');
  const contacts = type === 'suppliers' ? data.suppliers : data.customers;
  const filtered = filterBy(contacts, query, (contact) => `${contact.name} ${contact.phone || ''} ${contact.document || ''}`);
  const title = type === 'suppliers' ? 'Fornecedor' : 'Cliente';
  const closeContactModal = () => {
    setCreating(false);
    setEditing(null);
  };

  return (
    <div className="admin-layout">
      <section className="panel">
        <div className="panel-title-row">
          <div>
            <h2>{type === 'suppliers' ? 'Fornecedores' : 'Clientes'}</h2>
            <span className="muted-text">{filtered.length} registro(s) encontrado(s)</span>
          </div>
          <button className="primary-button" onClick={() => setCreating(true)} type="button">
            <Plus size={18} />
            Novo {title.toLowerCase()}
          </button>
        </div>
        <PanelSearch value={query} onChange={setQuery} placeholder={`Buscar ${title.toLowerCase()}`} />
        <Table
          empty={`Nenhum ${title.toLowerCase()} cadastrado.`}
          headers={[title, 'Telefone', 'Documento', 'Acoes']}
          rows={filtered.map((contact) => [
            <strong>{contact.name}</strong>,
            contact.phone || '-',
            contact.document || '-',
            <div className="row-actions">
              <button className="small-button" onClick={() => setViewing(contact)} type="button">
                Ver
              </button>
              <button className="small-button" onClick={() => setEditing(contact)} type="button">
                Editar
              </button>
              {canManage && (
                <button className="small-button danger-button" onClick={() => setDeleting(contact)} type="button">
                  Apagar
                </button>
              )}
            </div>,
          ])}
        />
      </section>

      {(creating || editing) && (
        <Modal title={editing ? `Editar ${title.toLowerCase()}` : `Novo ${title.toLowerCase()}`} onClose={closeContactModal}>
          <ContactForm
            contact={editing}
            onCancel={closeContactModal}
            onSubmit={(input) =>
              runAction(`${title} salvo.`, async () => {
                if (type === 'suppliers') await saveSupplier(input, editing?.id);
                else await saveCustomer(input, editing?.id);
                closeContactModal();
              })
            }
          />
        </Modal>
      )}

      {viewing && (
        <Modal title={`Detalhes do ${title.toLowerCase()}`} onClose={() => setViewing(null)}>
          <ContactDetails contact={viewing} />
          <div className="form-actions">
            <button className="secondary-button" onClick={() => setViewing(null)} type="button">
              Fechar
            </button>
            <button
              className="primary-button"
              onClick={() => {
                setEditing(viewing);
                setViewing(null);
              }}
              type="button"
            >
              <Save size={18} />
              Editar {title.toLowerCase()}
            </button>
          </div>
        </Modal>
      )}

      {deleting && (
        <Modal title={`Apagar ${title.toLowerCase()}`} onClose={() => setDeleting(null)}>
          <div className="notice danger">
            Apagar este {title.toLowerCase()}? Se houver registros vinculados, o Supabase pode bloquear para preservar o historico.
          </div>
          <ContactDetails contact={deleting} compact />
          <div className="form-actions">
            <button className="secondary-button" onClick={() => setDeleting(null)} type="button">
              Cancelar
            </button>
            <button
              className="primary-button danger-solid-button"
              onClick={() =>
                runAction(`${title} apagado.`, async () => {
                  if (type === 'suppliers') await deleteSupplier(deleting.id);
                  else await deleteCustomer(deleting.id);
                  setDeleting(null);
                })
              }
              type="button"
            >
              Apagar {title.toLowerCase()}
            </button>
          </div>
        </Modal>
      )}
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

function ContactDetails({ contact, compact = false }: { contact: Supplier | Customer; compact?: boolean }) {
  return (
    <div className={compact ? 'detail-grid compact' : 'detail-grid'}>
      <div>
        <span>Nome</span>
        <strong>{contact.name}</strong>
      </div>
      <div>
        <span>Telefone</span>
        <strong>{contact.phone || '-'}</strong>
      </div>
      <div>
        <span>Documento</span>
        <strong>{contact.document || '-'}</strong>
      </div>
      {contact.notes && (
        <div>
          <span>Observacoes</span>
          <strong>{contact.notes}</strong>
        </div>
      )}
    </div>
  );
}

function ReportsPage({ data }: { data: AppData }) {
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const todayInput = today.toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(monthStart);
  const [endDate, setEndDate] = useState(todayInput);
  const [activePreset, setActivePreset] = useState<'today' | 'week' | 'month' | 'custom'>('month');

  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T23:59:59.999`);
  const periodLabel = `${new Intl.DateTimeFormat('pt-BR').format(start)} ate ${new Intl.DateTimeFormat('pt-BR').format(end)}`;
  const inPeriod = (value: string) => {
    const date = new Date(value);
    return date >= start && date <= end;
  };

  const sales = data.sales.filter((sale) => inPeriod(sale.occurred_at));
  const expenses = data.expenses.filter((expense) => inPeriod(expense.occurred_at));
  const entries = data.entries.filter((entry) => inPeriod(entry.occurred_at));
  const totalSales = sales.reduce((sum, sale) => sum + sale.total_price, 0);
  const totalExpenses = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const soldKg = sales.reduce((sum, sale) => sum + sale.weight_kg, 0);
  const entryKg = entries.reduce((sum, entry) => sum + entry.weight_kg, 0);
  const lowStock = data.products.filter((product) => product.active && product.stock_kg <= product.min_stock_kg);
  const averageTicket = sales.length ? totalSales / sales.length : 0;

  const salesRows = [...sales]
    .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
    .map((sale) => [
      formatDateTime(sale.occurred_at),
      productName(data, sale.product_id),
      customerName(data, sale.customer_id),
      formatKg(sale.weight_kg),
      formatMoney(sale.total_price),
    ]);
  const expenseRows = [...expenses]
    .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
    .map((expense) => [
      formatDateTime(expense.occurred_at),
      expenseLabels[expense.category] || expense.category,
      expense.description,
      formatMoney(expense.amount),
    ]);
  const stockRows = [...data.products]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((product) => [
      product.name,
      product.category,
      formatKg(product.stock_kg),
      formatKg(product.min_stock_kg),
      product.stock_kg <= product.min_stock_kg ? 'Baixo' : 'OK',
    ]);

  function setPreset(preset: 'today' | 'week' | 'month') {
    const now = new Date();
    const startPreset = new Date(now);
    if (preset === 'today') startPreset.setHours(0, 0, 0, 0);
    if (preset === 'week') startPreset.setDate(now.getDate() - 6);
    if (preset === 'month') startPreset.setDate(1);
    setStartDate(startPreset.toISOString().slice(0, 10));
    setEndDate(now.toISOString().slice(0, 10));
    setActivePreset(preset);
  }

  function download(filename: string, content: string, type: string) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  function toCsv(rows: string[][]) {
    return rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(';')).join('\n');
  }

  function exportCsv() {
    const rows = [
      ['Relatorio RODPEL', `${startDate} ate ${endDate}`],
      [],
      ['Resumo'],
      ['Vendas', formatMoney(totalSales)],
      ['Despesas', formatMoney(totalExpenses)],
      ['Saldo', formatMoney(totalSales - totalExpenses)],
      ['Kg vendidos', formatKg(soldKg)],
      ['Ticket medio', formatMoney(averageTicket)],
      [],
      ['Vendas'],
      ['Data', 'Produto', 'Cliente', 'Peso', 'Valor'],
      ...salesRows.map((row) => row.map(String)),
      [],
      ['Despesas'],
      ['Data', 'Categoria', 'Descricao', 'Valor'],
      ...expenseRows.map((row) => row.map(String)),
      [],
      ['Estoque'],
      ['Produto', 'Categoria', 'Estoque', 'Minimo', 'Status'],
      ...stockRows.map((row) => row.map(String)),
    ];
    download(`relatorio-rodpel-${startDate}-${endDate}.csv`, toCsv(rows), 'text/csv;charset=utf-8');
  }

  function exportExcel() {
    const escapeHtml = (value: ReactNode) =>
      String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    const table = (title: string, headers: string[], rows: ReactNode[][]) => `
      <h2>${title}</h2>
      <table border="1"><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>
    `;
    const html = `
      <html><head><meta charset="utf-8" /></head><body>
      <h1>Relatorio RODPEL</h1>
      <p>Periodo: ${startDate} ate ${endDate}</p>
      ${table('Resumo', ['Indicador', 'Valor'], [
        ['Vendas', formatMoney(totalSales)],
        ['Despesas', formatMoney(totalExpenses)],
        ['Saldo', formatMoney(totalSales - totalExpenses)],
        ['Kg vendidos', formatKg(soldKg)],
        ['Kg recebidos', formatKg(entryKg)],
        ['Ticket medio', formatMoney(averageTicket)],
      ])}
      ${table('Vendas', ['Data', 'Produto', 'Cliente', 'Peso', 'Valor'], salesRows)}
      ${table('Despesas', ['Data', 'Categoria', 'Descricao', 'Valor'], expenseRows)}
      ${table('Estoque', ['Produto', 'Categoria', 'Estoque', 'Minimo', 'Status'], stockRows)}
      </body></html>
    `;
    download(`relatorio-rodpel-${startDate}-${endDate}.xls`, html, 'application/vnd.ms-excel;charset=utf-8');
  }

  return (
    <div className="reports-page">
      <section className="panel report-controls">
        <div>
          <h2>Relatorio por periodo</h2>
          <p className="muted-paragraph">Vendas, despesas e estoque usando somente os dados da empresa atual.</p>
          <span className="selected-period">Periodo selecionado: {periodLabel}</span>
        </div>
        <div className="report-filter-grid">
          <label>
            Inicio
            <input
              type="date"
              value={startDate}
              onChange={(event) => {
                setStartDate(event.target.value);
                setActivePreset('custom');
              }}
            />
          </label>
          <label>
            Fim
            <input
              type="date"
              value={endDate}
              onChange={(event) => {
                setEndDate(event.target.value);
                setActivePreset('custom');
              }}
            />
          </label>
          <div className="report-presets">
            <button className={activePreset === 'today' ? 'small-button filter-chip active' : 'small-button filter-chip'} type="button" onClick={() => setPreset('today')}>Hoje</button>
            <button className={activePreset === 'week' ? 'small-button filter-chip active' : 'small-button filter-chip'} type="button" onClick={() => setPreset('week')}>7 dias</button>
            <button className={activePreset === 'month' ? 'small-button filter-chip active' : 'small-button filter-chip'} type="button" onClick={() => setPreset('month')}>Mes</button>
          </div>
        </div>
        <div className="report-export-actions">
          <button className="secondary-button" type="button" onClick={() => window.print()}>
            <ReceiptText size={17} />
            Gerar PDF
          </button>
          <button className="secondary-button" type="button" onClick={exportCsv}>
            <Download size={17} />
            CSV
          </button>
          <button className="primary-button" type="button" onClick={exportExcel}>
            <Download size={17} />
            Excel
          </button>
        </div>
      </section>

      <div className="content-grid report-summary">
        <Metric icon={CircleDollarSign} label="Vendas" value={formatMoney(totalSales)} />
        <Metric icon={ReceiptText} label="Despesas" value={formatMoney(totalExpenses)} />
        <Metric icon={Archive} label="Saldo" value={formatMoney(totalSales - totalExpenses)} />
        <Metric icon={Boxes} label="Estoque baixo" value={`${lowStock.length} produtos`} />
        <Metric icon={ShoppingCart} label="Kg vendidos" value={formatKg(soldKg)} />
        <Metric icon={PackagePlus} label="Kg recebidos" value={formatKg(entryKg)} />
        <Metric icon={CircleDollarSign} label="Ticket medio" value={formatMoney(averageTicket)} />
        <Metric icon={Warehouse} label="Produtos ativos" value={`${data.products.filter((product) => product.active).length}`} />
      </div>

      <section className="panel report-print-section">
        <h2>Vendas no periodo</h2>
        <Table empty="Nenhuma venda no periodo." headers={['Data', 'Produto', 'Cliente', 'Peso', 'Valor']} rows={salesRows} />
      </section>
      <section className="panel report-print-section">
        <h2>Despesas no periodo</h2>
        <Table empty="Nenhuma despesa no periodo." headers={['Data', 'Categoria', 'Descricao', 'Valor']} rows={expenseRows} />
      </section>
      <section className="panel report-print-section">
        <h2>Estoque atual</h2>
        <Table empty="Nenhum produto cadastrado." headers={['Produto', 'Categoria', 'Estoque', 'Minimo', 'Status']} rows={stockRows} />
      </section>
    </div>
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

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="icon-button" onClick={onClose} title="Fechar" type="button">
            <X size={18} />
          </button>
        </div>
        {children}
      </section>
    </div>
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
    <>
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
      <div className="mobile-card-list">
        {rows.map((row, index) => (
          <article className="mobile-data-card" key={index}>
            <div className="mobile-data-card-title">{row[0]}</div>
            <div className="mobile-data-card-body">
              {row.slice(1).map((cell, cellIndex) => {
                const header = headers[cellIndex + 1] || '';
                const normalizedHeader = header.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
                const isAction = normalizedHeader.startsWith('aco') || header === '';
                return (
                  <div className={isAction ? 'mobile-data-card-actions' : 'mobile-data-card-row'} key={cellIndex}>
                    {!isAction && <span>{header}</span>}
                    <strong>{cell}</strong>
                  </div>
                );
              })}
            </div>
          </article>
        ))}
      </div>
    </>
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

function expenseCategoryLabel(category: string) {
  return expenseLabels[category] || toTitle(category);
}

function currencyInputValue(value: number) {
  return value > 0 ? formatMoney(value) : '';
}

function formatCurrencyInput(value: string) {
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  return formatMoney(Number(digits) / 100);
}

function parseCurrencyInput(value: string) {
  const digits = value.replace(/\D/g, '');
  return digits ? Number(digits) / 100 : 0;
}

function filterBy<T>(items: T[], query: string, getText: (item: T) => string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return items;
  return items.filter((item) => getText(item).toLowerCase().includes(normalized));
}

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function normalizeSpeech(value: string) {
  return normalizeName(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function parseVoiceCommand(text: string): ParsedVoiceCommand {
  const normalized = normalizeSpeech(text);
  const intent = inferIntent(normalized);
  const quantity = extractFirstNumber(normalized) || 0;
  const totalValue = extractMoneyAfter(normalized, ['valor total', 'total', 'valor', 'despesa de']) || 0;
  const unitPrice = extractMoneyAfter(normalized, ['preco de venda', 'preco', 'cada', 'por']) || 0;
  const supplierName = extractNameAfter(normalized, ['fornecedor']);
  const customerName = extractNameAfter(normalized, ['cliente']);
  const productName = extractProductName(normalized, intent);
  const expenseDescription = intent === 'despesa' ? extractExpenseDescription(normalized) : '';
  const warnings: string[] = [];

  if (!productName && intent !== 'despesa') warnings.push('Nao identifiquei o produto com seguranca.');
  if (!quantity && intent !== 'produto' && intent !== 'despesa') warnings.push('Nao identifiquei a quantidade.');
  if (!totalValue && !unitPrice && intent !== 'saida') warnings.push('Nao identifiquei valor ou preco.');
  if (intent === 'entrada' && !supplierName) warnings.push('Fornecedor nao identificado; voce pode preencher antes de confirmar.');
  if (intent === 'venda' && !customerName) warnings.push('Cliente nao identificado; voce pode preencher antes de confirmar.');

  return {
    intent,
    productName,
    quantity,
    unitPrice,
    totalValue,
    supplierName,
    customerName,
    expenseDescription,
    confidence: Math.max(0.35, 1 - warnings.length * 0.15),
    warnings,
  };
}

function inferIntent(text: string): VoiceIntent {
  if (/(cadastre|cadastrar|novo produto|produto chamado|chamado)/.test(text)) return 'produto';
  if (/(despesa|gasto|paguei|pagamento)/.test(text)) return 'despesa';
  if (/(vendi|venda|cliente)/.test(text)) return 'venda';
  if (/(chegou|entrada|recebi|compramos|fornecedor)/.test(text)) return 'entrada';
  if (/(saiu|saida|retirei|baixar|baixa)/.test(text)) return 'saida';
  return 'entrada';
}

function extractFirstNumber(text: string) {
  const match = text.match(/(\d+(?:[,.]\d+)?)/);
  return match ? Number(match[1].replace(',', '.')) : 0;
}

function extractMoneyAfter(text: string, markers: string[]) {
  for (const marker of markers) {
    const index = text.indexOf(marker);
    if (index === -1) continue;
    const slice = text.slice(index + marker.length, index + marker.length + 42);
    const match = slice.match(/(\d+(?:[,.]\d+)?)/);
    if (match) return Number(match[1].replace(',', '.'));
  }
  return 0;
}

function extractNameAfter(text: string, markers: string[]) {
  for (const marker of markers) {
    const match = text.match(new RegExp(`${marker}\\s+([a-z0-9\\s]+?)(?:,| preco| valor| total|$)`));
    if (match?.[1]) return toTitle(match[1]);
  }
  return '';
}

function extractProductName(text: string, intent: VoiceIntent) {
  if (intent === 'produto') {
    const byCalled = text.match(/(?:chamado|produto chamado|nome)\s+([a-z0-9\s]+?)(?:,| preco| valor|$)/);
    if (byCalled?.[1]) return toTitle(byCalled[1]);
  }

  const productMatch = text.match(/(?:de|do|da)\s+([a-z0-9\s]+?)(?:\s+do fornecedor|\s+da fornecedor|\s+para cliente|\s+cliente|,| preco| valor| total|$)/);
  if (productMatch?.[1]) {
    return toTitle(productMatch[1].replace(/^(papelao\s+)?/, 'papelao '));
  }
  return '';
}

function extractExpenseDescription(text: string) {
  const match = text.match(/(?:com|de)\s+([a-z0-9\s]+?)(?:,|$)/);
  return match?.[1] ? toTitle(match[1]) : 'Despesa por audio';
}

function toTitle(value: string) {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function findByName<T extends { name: string }>(items: T[], name: string) {
  const normalized = normalizeSpeech(name);
  if (!normalized) return undefined;
  return items.find((item) => normalizeSpeech(item.name) === normalized || normalizeSpeech(item.name).includes(normalized));
}

function inferExpenseCategory(description: string): ExpenseCategory {
  const normalized = normalizeSpeech(description);
  if (/funcionario|almoco|comida|refeicao/.test(normalized)) return 'almoco';
  if (/frete|entrega|transporte/.test(normalized)) return 'frete';
  if (/manutencao|conserto|reparo/.test(normalized)) return 'manutencao';
  if (/combustivel|gasolina|diesel/.test(normalized)) return 'combustivel';
  return 'outros';
}

function validateVoiceCommand(command: ParsedVoiceCommand, data: AppData) {
  const messages: string[] = [];
  if (command.intent !== 'despesa' && !command.productName.trim()) messages.push('Informe o produto.');
  if (command.intent !== 'produto' && command.intent !== 'despesa' && command.quantity <= 0) messages.push('Informe uma quantidade maior que zero.');
  if (command.intent === 'produto' && command.unitPrice <= 0 && command.totalValue <= 0) messages.push('Informe o preço de venda do produto.');
  if (command.intent === 'despesa' && command.totalValue <= 0) messages.push('Informe o valor da despesa.');
  if (command.intent === 'entrada' && command.unitPrice <= 0 && command.totalValue <= 0) messages.push('Informe preço unitário ou valor total da entrada.');
  if (command.intent === 'venda' && command.totalValue <= 0 && command.unitPrice <= 0) messages.push('Informe o valor da venda.');
  if ((command.intent === 'entrada' || command.intent === 'venda' || command.intent === 'saida') && !findByName(data.products, command.productName)) {
    messages.push('Produto ainda não encontrado no cadastro.');
  }
  if (command.intent === 'saida') messages.push('Saída sem cliente ainda não salva automaticamente; converta para venda ou lance manualmente.');
  return messages;
}

function ToastViewport({ toasts, onDismiss }: { toasts: AppToast[]; onDismiss: (id: number) => void }) {
  return (
    <div className="toast-viewport" aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastCard({ toast, onDismiss }: { toast: AppToast; onDismiss: (id: number) => void }) {
  useEffect(() => {
    const timeout = window.setTimeout(() => onDismiss(toast.id), toast.variant === 'error' ? 6500 : 4200);
    return () => window.clearTimeout(timeout);
  }, [onDismiss, toast.id, toast.variant]);

  const action = toast.onAction;

  const icon =
    toast.variant === 'success' ? (
      <Check size={16} />
    ) : toast.variant === 'warning' ? (
      <AlertTriangle size={16} />
    ) : toast.variant === 'error' ? (
      <AlertTriangle size={16} />
    ) : (
      <Bell size={16} />
    );

  return (
    <div className={`toast-card ${toast.variant}`} role="status">
      <div className={`toast-icon ${toast.variant}`}>{icon}</div>
      <div className="toast-body">
        <strong>{toast.title}</strong>
        {toast.description && <span>{toast.description}</span>}
        {toast.actionLabel && action && (
          <button
            className="toast-action"
            onClick={() => {
              action();
              onDismiss(toast.id);
            }}
            type="button"
          >
            {toast.actionLabel}
          </button>
        )}
      </div>
      <button className="toast-close" onClick={() => onDismiss(toast.id)} type="button" aria-label="Fechar aviso">
        <X size={14} />
      </button>
    </div>
  );
}

function confirmAction(message: string, action: () => void) {
  if (window.confirm(message)) action();
}

function getMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return 'Operacao nao concluida.';
}
