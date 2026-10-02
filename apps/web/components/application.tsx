'use client';
import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  ShieldCheck,
  LayoutDashboard,
  MapPinned,
  ScanLine,
  Bell,
  ChartNoAxesCombined,
  SlidersHorizontal,
  Settings as SettingsIcon,
  LogOut,
  Menu,
  X,
  Radio,
  TriangleAlert,
  Thermometer,
  Wind,
  Upload,
  Download,
  ArrowUpRight,
  RefreshCw,
  Clock,
  CheckCircle2,
  Info,
} from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Card, CardContent } from './ui/card';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from './ui/table';
import { api, ApiError } from '@/lib/api';
import {
  loginSchema,
  type Auth,
  type Snapshot,
  type Zone,
  type Reading,
  type Inspection,
  type Finding,
  type Alert,
  type Rule,
} from '@safesight/contracts';
const navigation = [
  ['dashboard', 'Overview', LayoutDashboard],
  ['zones', 'Facility zones', MapPinned],
  ['inspections', 'PPE inspections', ScanLine],
  ['alerts', 'Alerts & incidents', Bell],
  ['analytics', 'Analytics & reports', ChartNoAxesCombined],
  ['simulation', 'Simulation controls', SlidersHorizontal],
  ['settings', 'Settings & QR', SettingsIcon],
] as const;
const date = (v: string | null | undefined, tz: string) =>
  v
    ? new Intl.DateTimeFormat('en-IN', {
        timeZone: tz,
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).format(new Date(v))
    : 'No observation';
function Status({ value, children }: { value: string; children?: ReactNode }) {
  return (
    <span className={`status ${value.toLowerCase()} ${value}`}>
      <span aria-hidden="true">●</span>
      <span>{children ?? value.replaceAll('_', ' ')}</span>
    </span>
  );
}
function ErrorNotice({
  error,
  retry,
}: {
  error: Error | null;
  retry?: () => void;
}) {
  if (!error) return null;
  return (
    <div className="notice error" role="alert">
      <TriangleAlert size={16} />
      <span className="break">{error.message}</span>
      {retry && (
        <Button size="sm" variant="outline" onClick={retry}>
          Retry
        </Button>
      )}
    </div>
  );
}
function Loading() {
  return (
    <div className="empty" role="status">
      Loading current facility data…
    </div>
  );
}
function PageTitle({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {children}
    </div>
  );
}
function Panel({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
function useAction(auth: Auth) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      path,
      body,
      method = 'POST',
    }: {
      path: string;
      body?: unknown;
      method?: string;
    }) =>
      api(
        path,
        {
          method,
          ...(body !== undefined
            ? { body: body instanceof FormData ? body : JSON.stringify(body) }
            : {}),
        },
        auth.csrf,
      ),
    onSuccess: () => client.invalidateQueries(),
  });
}
export default function Application() {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: (count, error) =>
              !(
                error instanceof ApiError && [401, 403].includes(error.status)
              ) && count < 2,
            refetchOnWindowFocus: true,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>
  );
}
function App() {
  const router = useRouter(),
    path = usePathname(),
    client = useQueryClient();
  const [guestError, setGuestError] = useState<Error | null>(null),
    [exchanging, setExchanging] = useState(false),
    [menu, setMenu] = useState(false),
    [mobile, setMobile] = useState(false),
    [connected, setConnected] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width:700px)');
    setMobile(mq.matches);
    const update = () => setMobile(mq.matches);
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  const auth = useQuery({
    queryKey: ['auth'],
    queryFn: () => api<Auth>('/auth/me'),
    retry: false,
  });
  useEffect(() => {
    if (
      auth.data &&
      auth.error instanceof ApiError &&
      auth.error.status === 401
    )
      client.clear();
  }, [auth.data, auth.error, client]);
  useEffect(() => {
    if (path !== '/guest') return;
    const secret = window.location.hash.slice(1);
    window.history.replaceState(null, '', '/guest');
    if (!secret) return;
    setExchanging(true);
    api('/shares/exchange', {
      method: 'POST',
      body: JSON.stringify({ token: secret }),
    })
      .then(() => {
        client.clear();
        router.replace('/dashboard');
      })
      .catch((e) => setGuestError(e))
      .finally(() => setExchanging(false));
  }, [path, client, router]);
  useEffect(() => {
    if (!auth.data) return;
    const stream = new EventSource('/api/events');
    const refresh = () => {
      setConnected(true);
      void client.invalidateQueries();
    };
    stream.addEventListener('ready', refresh);
    stream.addEventListener('change', () => {
      void client.invalidateQueries({
        predicate: (q) => q.queryKey[0] !== 'auth',
      });
    });
    stream.onerror = () => {
      setConnected(false);
      void client.invalidateQueries({ queryKey: ['auth'] });
    };
    return () => {
      stream.close();
      setConnected(false);
    };
  }, [auth.data?.user.id, client]);
  const snapshot = useQuery({
    queryKey: ['snapshot'],
    queryFn: () => api<Snapshot>('/dashboard'),
    enabled: !!auth.data,
    refetchInterval: connected ? 30000 : 5000,
  });
  if (exchanging)
    return (
      <div className="login">
        <Loading />
      </div>
    );
  if (guestError)
    return (
      <div className="login">
        <div className="login-card">
          <ErrorNotice error={guestError} />
          <Button onClick={() => router.replace('/login')}>
            Staff sign in
          </Button>
        </div>
      </div>
    );
  if (auth.isPending)
    return (
      <div className="login">
        <Loading />
      </div>
    );
  if (
    !auth.data ||
    (auth.error instanceof ApiError && auth.error.status === 401)
  ) {
    if (auth.error instanceof ApiError && auth.error.status !== 401)
      return (
        <div className="login">
          <div className="login-card">
            <ErrorNotice error={auth.error} retry={() => void auth.refetch()} />
          </div>
        </div>
      );
    return (
      <Login
        onSuccess={() => {
          client.clear();
          router.replace(path.startsWith('/zones/') ? path : '/dashboard');
        }}
      />
    );
  }
  const a = auth.data,
    role = a.user.role,
    section = path.split('/')[1] || 'dashboard',
    id = path.split('/')[2],
    tz = a.facility.timezone;
  async function logout() {
    try {
      await api('/auth/logout', { method: 'POST' }, a.csrf);
      client.clear();
      router.replace('/login');
    } catch (e) {
      setGuestError(e as Error);
    }
  }
  const nav = navigation.filter(
    ([key]) =>
      !(role !== 'ADMIN' && key === 'simulation') &&
      !(role === 'GUEST' && key === 'settings'),
  );
  return (
    <div className="shell">
      <button
        className={`mobile-scrim ${menu ? 'open' : ''}`}
        aria-label="Dismiss navigation"
        onClick={() => setMenu(false)}
      />
      <aside
        id="facility-navigation"
        inert={mobile && !menu}
        className={`sidebar ${menu ? 'open' : ''}`}
      >
        <Link href="/dashboard" className="logo">
          <span className="logo-mark">
            <ShieldCheck size={24} />
          </span>
          SafeSight
        </Link>
        <Button
          className="mobile-toggle nav-close"
          size="icon"
          variant="ghost"
          aria-label="Close menu"
          onClick={() => setMenu(false)}
        >
          <X />
        </Button>
        <div>
          <small>OPERATIONS WORKSPACE</small>
          <nav className="nav" style={{ marginTop: 16 }}>
            {nav.map(([key, label, Icon]) => (
              <Link
                key={key}
                href={`/${key}`}
                className={section === key ? 'active' : ''}
                onClick={() => setMenu(false)}
              >
                <Icon size={18} />
                {label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="sidebar-footer">
          <div className="row">
            <Radio size={15} />
            <strong>Demonstration facility</strong>
          </div>
          Environmental data is simulated.
          <br />
          PPE analysis is a snapshot.
          <br />
          Decision-support prototype.
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div className="row">
            <Button
              className="mobile-toggle"
              size="icon"
              variant="ghost"
              aria-label="Open menu"
              aria-expanded={menu}
              aria-controls="facility-navigation"
              onClick={() => setMenu(true)}
            >
              <Menu />
            </Button>
            <div>
              <div className="facility">{a.facility.name}</div>
              <div className="muted" style={{ fontSize: 10, marginTop: 5 }}>
                INDUSTRIAL SAFETY ANALYTICS · {tz}
              </div>
            </div>
          </div>
          <div className="row">
            <Status value={connected ? 'normal' : 'unknown'}>
              {connected ? 'Live stream' : 'Reconnecting'}
            </Status>
            <span className="muted user-name">
              {a.user.name} · {role}
            </span>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Sign out"
              onClick={() => void logout()}
            >
              <LogOut size={17} />
            </Button>
          </div>
        </header>
        <div className="content">
          {!connected && (
            <div className="notice warning">
              <Radio size={16} />
              Live stream disconnected. Fetching authoritative data every 5
              seconds; freshness is shown separately.
            </div>
          )}
          <ErrorNotice error={guestError} />
          <ErrorNotice
            error={snapshot.error}
            retry={() => void snapshot.refetch()}
          />
          {snapshot.isPending ? (
            <Loading />
          ) : snapshot.data ? (
            <>
              <div className="notice">
                <Info size={16} />
                <span>
                  {snapshot.data.simulationLabel}. PPE mode:{' '}
                  <strong>{snapshot.data.inference.mode}</strong>
                  {snapshot.data.inference.mode === 'DEMO'
                    ? ' · sample fixtures only, no real AI inference'
                    : ''}
                  .{' '}
                  {snapshot.data.inference.ready
                    ? ''
                    : snapshot.data.inference.reason}
                </span>
              </div>
              {section === 'dashboard' ||
              section === 'login' ||
              section === 'guest' ? (
                <Dashboard auth={a} data={snapshot.data} />
              ) : section === 'zones' ? (
                <Zones auth={a} data={snapshot.data} id={id} />
              ) : section === 'inspections' ? (
                <Inspections auth={a} data={snapshot.data} id={id} />
              ) : section === 'alerts' ? (
                <Alerts auth={a} data={snapshot.data} id={id} />
              ) : section === 'analytics' ? (
                <Analytics auth={a} data={snapshot.data} />
              ) : section === 'simulation' ? (
                <Simulation auth={a} data={snapshot.data} />
              ) : section === 'settings' ? (
                <Settings auth={a} data={snapshot.data} />
              ) : (
                <div className="empty">
                  Page not found.{' '}
                  <Link className="link" href="/dashboard">
                    Return to overview
                  </Link>
                </div>
              )}
            </>
          ) : null}
        </div>
      </main>
    </div>
  );
}
function Login({ onSuccess }: { onSuccess: () => void }) {
  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
  });
  const login = useMutation({
    mutationFn: (b: z.infer<typeof loginSchema>) =>
      api('/auth/login', { method: 'POST', body: JSON.stringify(b) }),
    onSuccess,
  });
  return (
    <div className="login">
      <div className="login-box">
        <div className="logo">
          <span className="logo-mark">
            <ShieldCheck size={25} />
          </span>
          SafeSight
        </div>
        <div className="login-card">
          <div className="eyebrow">OPERATIONS ACCESS</div>
          <h1>Welcome back.</h1>
          <p>Sign in to your facility safety workspace.</p>
          <ErrorNotice error={login.error} />
          <form
            onSubmit={form.handleSubmit((b) => login.mutate(b))}
            style={{ marginTop: 24 }}
          >
            <div className="field">
              <label htmlFor="email">Work email</label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                placeholder="officer@safesight.local"
                {...form.register('email')}
              />
              {form.formState.errors.email && (
                <p role="alert">{form.formState.errors.email.message}</p>
              )}
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                {...form.register('password')}
              />
              {form.formState.errors.password && (
                <p role="alert">{form.formState.errors.password.message}</p>
              )}
            </div>
            <Button type="submit" disabled={login.isPending} className="w-full">
              {login.isPending ? 'Signing in…' : 'Sign in to workspace'}
              <ArrowUpRight size={16} />
            </Button>
          </form>
          <p style={{ marginTop: 20, fontSize: 11 }}>
            Local development accounts are generated during setup. See{' '}
            <code>.runtime/dev-credentials.json</code>. This prototype does not
            certify workplace safety.
          </p>
        </div>
        <p
          style={{
            color: '#98b3c5',
            fontSize: 11,
            textAlign: 'center',
            marginTop: 22,
          }}
        >
          Environmental simulation · Timestamped PPE inspections · Human review
        </p>
      </div>
    </div>
  );
}
function Summary({ data }: { data: Snapshot }) {
  const active = data.alerts.filter((a) => a.status !== 'RESOLVED'),
    reviewed = data.reviewStats;
  const cards = [
    [
      'Zones needing attention',
      data.zones.filter((z) => ['warning', 'critical'].includes(z.state))
        .length,
      `${data.zones.filter((z) => z.stale).length} stale / unknown observations`,
      MapPinned,
    ],
    [
      'Open incident workload',
      active.length,
      `${active.filter((a) => a.status === 'ACKNOWLEDGED').length} acknowledged · condition tracked separately`,
      Bell,
    ],
    [
      'Recent inspections',
      data.inspections.length,
      'Latest 8 snapshot inspections',
      ScanLine,
    ],
    [
      'Reviewed PPE findings',
      reviewed.potentialMissingPersons,
      `${reviewed.reviewedPersons} reviewed persons · last 7 days`,
      ShieldCheck,
    ],
  ] as const;
  return (
    <div className="stats">
      {cards.map(([label, value, note, Icon]) => (
        <Card key={label} className="stat gap-0 py-0">
          <CardContent className="p-0">
            <div className="stat-head">
              {label}
              <Icon size={17} />
            </div>
            <div className="stat-value">{value}</div>
            <div className="stat-note">{note}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
function ZoneTile({ zone: z, tz }: { zone: Zone; tz: string }) {
  return (
    <Link
      href={`/zones/${z.id}`}
      className={`zone ${z.state}`}
      data-zone-id={z.id}
      data-reading-id={z.latest?.id ?? ''}
    >
      <div className="row spread">
        <MapPinned size={16} />
        <Status value={z.state} />
      </div>
      <h3 style={{ marginTop: 12 }}>{z.name}</h3>
      <div className="zone-metrics">
        <div>
          {z.latest ? z.latest.temperature.toFixed(1) : '—'}
          <span>TEMP · °C</span>
        </div>
        <div>
          {z.latest ? z.latest.aqi : '—'}
          <span>SIM. US AQI</span>
        </div>
      </div>
      <p style={{ fontSize: 10, marginTop: 14 }}>
        {z.stale ? '⚠ Stale / no current observation' : '● Fresh reading'}
        <br />
        {date(z.latest?.observed_at, tz)}
      </p>
    </Link>
  );
}
function Dashboard({ auth, data }: { auth: Auth; data: Snapshot }) {
  return (
    <>
      <PageTitle
        eyebrow="FACILITY INTELLIGENCE"
        title="Operations overview"
        subtitle="A shared, current view of your facility. Every finding has a source."
      >
        {['ADMIN', 'OFFICER'].includes(auth.user.role) && (
          <Button asChild>
            <Link href="/inspections">
              <Upload size={15} />
              New inspection
            </Link>
          </Button>
        )}
      </PageTitle>
      <Summary data={data} />
      <div className="grid-two">
        <Panel
          title="Facility zones"
          action={<Link href="/zones">Explore zones →</Link>}
        >
          <div className="zones">
            {data.zones.map((z) => (
              <ZoneTile key={z.id} zone={z} tz={auth.facility.timezone} />
            ))}
          </div>
        </Panel>
        <Panel
          title="Incident workload"
          action={<Link href="/alerts">View all →</Link>}
        >
          <AlertFeed
            alerts={data.alerts
              .filter((a) => a.status !== 'RESOLVED')
              .slice(0, 4)}
            zones={data.zones}
            auth={auth}
          />
        </Panel>
      </div>
      <Trend auth={auth} zones={data.zones} />
      <Panel
        title="Recent PPE inspections"
        action={<Link href="/inspections">Open inspection queue →</Link>}
      >
        <InspectionTable
          items={data.inspections}
          auth={auth}
          zones={data.zones}
        />
      </Panel>
      <p style={{ fontSize: 11, marginTop: 14 }}>
        Authoritative snapshot: {date(data.generatedAt, auth.facility.timezone)}
        . Stale readings never dismiss unresolved critical incidents.
      </p>
    </>
  );
}
function Trend({
  auth,
  zones,
  zoneId,
}: {
  auth: Auth;
  zones: Zone[];
  zoneId?: string;
}) {
  const [selected, setSelected] = useState(zoneId ?? zones[0]?.id ?? ''),
    [period, setPeriod] = useState('1h');
  const history = useQuery({
    queryKey: ['history', selected, period],
    queryFn: () =>
      api<{ rows: (Reading & { samples: number })[]; bucket: string }>(
        `/history?zoneId=${selected}&range=${period}`,
      ),
    enabled: !!selected,
    refetchInterval: 15000,
  });
  const bucketMs =
    (period === '1h' ? 15 : period === '24h' ? 300 : 3600) * 1000;
  const chartRows: (Omit<Reading, 'temperature' | 'aqi' | 'humidity'> & {
    temperature: number | null;
    aqi: number | null;
    humidity: number | null;
  })[] = [];
  for (const row of history.data?.rows ?? []) {
    const previous = chartRows.at(-1);
    if (
      previous &&
      new Date(row.observed_at).getTime() -
        new Date(previous.observed_at).getTime() >
        bucketMs * 1.5
    )
      chartRows.push({
        ...previous,
        observed_at: new Date(
          new Date(previous.observed_at).getTime() + bucketMs,
        ).toISOString(),
        temperature: null,
        aqi: null,
        humidity: null,
      });
    chartRows.push(row);
  }
  return (
    <div style={{ marginBottom: 22 }}>
      <div className="row spread" style={{ marginBottom: 14 }}>
        <div>
          <h2>Environmental trends</h2>
          <p>
            Simulated observations, downsampled to{' '}
            {history.data?.bucket ?? 'time buckets'}. Gaps mean missing data.
          </p>
        </div>
        <div className="row">
          {!zoneId && (
            <select
              aria-label="Trend zone"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </select>
          )}
          <select
            aria-label="Time range"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          >
            <option value="1h">Last hour</option>
            <option value="24h">Last 24 hours</option>
            <option value="7d">Last 7 days</option>
          </select>
        </div>
      </div>
      <ErrorNotice error={history.error} retry={() => void history.refetch()} />
      <div
        className="grid-two equal-panels"
        style={{ gridTemplateColumns: 'repeat(2,minmax(0,1fr))' }}
      >
        {(['temperature', 'aqi'] as const).map((metric) => (
          <Panel
            key={metric}
            title={
              metric === 'temperature'
                ? 'Temperature · °C'
                : 'Air quality · simulated US AQI'
            }
          >
            {history.isPending ? (
              <Loading />
            ) : !history.data?.rows.length ? (
              <div className="empty">No readings in this range.</div>
            ) : (
              <div className="chart">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartRows}>
                    <defs>
                      <linearGradient
                        id={`gradient-${metric}`}
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="0%"
                          stopColor={
                            metric === 'temperature' ? '#0a998a' : '#608eb5'
                          }
                          stopOpacity={0.24}
                        />
                        <stop offset="100%" stopColor="#fff" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="#e7eef2"
                    />
                    <XAxis
                      dataKey="observed_at"
                      tickFormatter={(v) =>
                        new Intl.DateTimeFormat('en-IN', {
                          timeZone: auth.facility.timezone,
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: false,
                        }).format(new Date(v))
                      }
                      fontSize={10}
                      minTickGap={48}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      width={36}
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                      domain={['auto', 'auto']}
                    />
                    <Tooltip
                      labelFormatter={(v) =>
                        date(String(v), auth.facility.timezone)
                      }
                    />
                    <Area
                      type="linear"
                      dataKey={metric}
                      stroke={metric === 'temperature' ? '#0a998a' : '#608eb5'}
                      fill={`url(#gradient-${metric})`}
                      strokeWidth={2}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </Panel>
        ))}
      </div>
      <p style={{ fontSize: 11 }}>
        Demonstration thresholds are not occupational exposure limits.
        Temperature alone does not establish heat safety; AQI does not establish
        indoor air safety.
      </p>
    </div>
  );
}
function AlertFeed({
  alerts,
  zones,
  auth,
}: {
  alerts: Alert[];
  zones: Zone[];
  auth: Auth;
}) {
  return alerts.length ? (
    alerts.map((a) => (
      <Link href={`/alerts/${a.id}`} className="feed-item" key={a.id}>
        <span className="feed-icon">
          <TriangleAlert size={17} />
        </span>
        <div className="feed-text">
          <h3>{a.title}</h3>
          <p>
            {zones.find((z) => z.id === a.zone_id)?.name} ·{' '}
            {date(a.opened_at, auth.facility.timezone)}
          </p>
          <div className="row">
            <Status value={a.severity === 'CRITICAL' ? 'critical' : 'warning'}>
              {a.severity}
            </Status>
            <span className="muted">
              {a.status} ·{' '}
              {a.condition_active
                ? 'Condition active'
                : 'Recovered / corrected'}
            </span>
          </div>
        </div>
      </Link>
    ))
  ) : (
    <div className="empty">
      <CheckCircle2
        size={24}
        style={{ margin: '0 auto 10px', color: '#2aa58d' }}
      />
      No incidents in this view. Unknown data is shown on zone tiles.
    </div>
  );
}
function InspectionTable({
  items,
  auth,
  zones,
}: {
  items: Inspection[];
  auth: Auth;
  zones: Zone[];
}) {
  if (!items.length)
    return (
      <div className="empty">
        No inspections yet. Upload an image or run a labeled sample fixture.
      </div>
    );
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Snapshot</TableHead>
          <TableHead>Zone & observed time</TableHead>
          <TableHead>Processing</TableHead>
          <TableHead>Source</TableHead>
          <TableHead>Details</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((i) => (
          <TableRow key={i.id}>
            <TableCell>
              {!i.image_deleted && auth.allowImages !== false ? (
                <img
                  className="thumb"
                  src={`/api/inspections/${i.id}/image`}
                  alt="Uploaded inspection snapshot"
                />
              ) : (
                <span className="muted">Protected / deleted</span>
              )}
            </TableCell>
            <TableCell>
              <h3>{zones.find((z) => z.id === i.zone_id)?.name ?? 'Zone'}</h3>
              <p style={{ fontSize: 11 }}>
                {date(i.created_at, auth.facility.timezone)}
              </p>
            </TableCell>
            <TableCell>
              <Status value={i.status} />
            </TableCell>
            <TableCell>
              <Status value={i.mode === 'DEMO' ? 'warning' : 'normal'}>
                {i.mode === 'DEMO' ? 'Fixture · no AI' : 'Real model'}
              </Status>
            </TableCell>
            <TableCell>
              <Link className="link" href={`/inspections/${i.id}`}>
                Review →
              </Link>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
function Zones({
  auth,
  data,
  id,
}: {
  auth: Auth;
  data: Snapshot;
  id?: string;
}) {
  const selected = data.zones.find((z) => z.id === id);
  if (id && !selected)
    return (
      <div className="empty">
        Zone unavailable or outside your access scope.
      </div>
    );
  return (
    <>
      <PageTitle
        eyebrow="FACILITY MONITORING"
        title={selected?.name ?? 'Facility zones'}
        subtitle={
          selected
            ? 'Persisted observations and unresolved incidents for this zone.'
            : 'Five operational areas. Environmental readings are centrally simulated.'
        }
      />
      {selected ? (
        <>
          <div className="stats">
            <div className="stat">
              <div className="stat-head">Zone condition</div>
              <div className="stat-value">
                <Status value={selected.state} />
              </div>
              <div className="stat-note">
                {selected.stale
                  ? 'Observation stale / unknown'
                  : 'Fresh observation'}
              </div>
            </div>
            {[
              ['Temperature', selected.latest?.temperature, '°C'],
              ['Humidity', selected.latest?.humidity, '%'],
              ['Simulated US AQI', selected.latest?.aqi, 'AQI'],
            ].map(([label, value, unit]) => (
              <div className="stat" key={String(label)}>
                <div className="stat-head">{label}</div>
                <div className="stat-value">
                  {value ?? '—'} <span className="muted">{unit}</span>
                </div>
                <div className="stat-note">
                  {date(selected.latest?.observed_at, auth.facility.timezone)}
                </div>
              </div>
            ))}
          </div>
          <Trend auth={auth} zones={data.zones} zoneId={id} />
          <Panel title="Zone incident history">
            <AlertFeed
              alerts={data.alerts.filter((a) => a.zone_id === id)}
              zones={data.zones}
              auth={auth}
            />
          </Panel>
          <div style={{ marginTop: 20 }}>
            <Panel title="Recent zone inspections">
              <InspectionTable
                items={data.inspections.filter((i) => i.zone_id === id)}
                auth={auth}
                zones={data.zones}
              />
            </Panel>
          </div>
          <div className="row" style={{ marginTop: 16 }}>
            <Link className="link" href="/zones">
              ← All zones
            </Link>
            {auth.user.role === 'ADMIN' && (
              <Link className="link" href="/simulation">
                Control simulation →
              </Link>
            )}
          </div>
        </>
      ) : (
        <div className="zones">
          {data.zones.map((zone) => (
            <ZoneTile key={zone.id} zone={zone} tz={auth.facility.timezone} />
          ))}
        </div>
      )}
    </>
  );
}
function Inspections({
  auth,
  data,
  id,
}: {
  auth: Auth;
  data: Snapshot;
  id?: string;
}) {
  if (id) return <InspectionDetail auth={auth} id={id} />;
  return <InspectionList auth={auth} data={data} />;
}
function InspectionList({ auth, data }: { auth: Auth; data: Snapshot }) {
  const [selected, setSelected] = useState(data.zones[0]?.id ?? ''),
    [file, setFile] = useState<File | null>(null),
    [status, setStatus] = useState(''),
    [page, setPage] = useState(0),
    [sampleError, setSampleError] = useState<Error | null>(null),
    [sampling, setSampling] = useState(false);
  const router = useRouter(),
    action = useAction(auth);
  const allowed = ['ADMIN', 'OFFICER'].includes(auth.user.role);
  const list = useQuery({
    queryKey: ['inspections', status, page],
    queryFn: () =>
      api<{ rows: Inspection[] }>(
        `/inspections?page=${page}&limit=10${status ? `&status=${status}` : ''}`,
      ),
    refetchInterval: 5000,
  });
  async function upload(image: File) {
    const form = new FormData();
    form.set('zoneId', selected);
    form.set('image', image);
    action.mutate(
      { path: '/inspections', body: form },
      {
        onSuccess: (r) =>
          router.push(`/inspections/${(r as { id: string }).id}`),
      },
    );
  }
  async function sample(name: string) {
    setSampling(true);
    setSampleError(null);
    try {
      const r = await fetch(`/api/samples/${name}`);
      if (!r.ok) throw new Error('Sample image unavailable');
      await upload(
        new File([await r.blob()], `${name}-fixture.png`, {
          type: 'image/png',
        }),
      );
    } catch (e) {
      setSampleError(e as Error);
    } finally {
      setSampling(false);
    }
  }
  return (
    <>
      <PageTitle
        eyebrow="VISUAL SAFETY REVIEW"
        title="PPE inspections"
        subtitle="Timestamped image inspections. No cameras, tracking, or identity recognition."
      />
      {allowed && (
        <div style={{ marginBottom: 22 }}>
          <Panel title="Create an inspection">
            <ErrorNotice error={action.error ?? sampleError} />
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (file) void upload(file);
              }}
            >
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="inspection-zone">Zone</label>
                  <select
                    id="inspection-zone"
                    className="w-full"
                    value={selected}
                    onChange={(e) => setSelected(e.target.value)}
                  >
                    {data.zones.map((z) => (
                      <option key={z.id} value={z.id}>
                        {z.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="inspection-image">
                    JPEG, PNG or WebP · ≤8MB, ≤20MP
                  </label>
                  <Input
                    id="inspection-image"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                </div>
              </div>
              <div className="row">
                <Button
                  type="submit"
                  disabled={!file || action.isPending || sampling}
                >
                  <Upload size={16} />
                  {action.isPending ? 'Queuing…' : 'Upload for inspection'}
                </Button>
                <span className="muted">
                  Private image delivery · EXIF orientation normalized
                </span>
              </div>
            </form>
            {data.inference.mode === 'DEMO' && (
              <div
                className="notice warning"
                style={{ marginTop: 18, marginBottom: 0 }}
              >
                <div>
                  <strong>DEMO fixtures only.</strong> Arbitrary images will
                  fail with an honest unavailable-model message. These original
                  schematic samples use fixed annotations.
                  <div className="row" style={{ marginTop: 10 }}>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={action.isPending || sampling}
                      onClick={() => void sample('equipped')}
                    >
                      Run equipped sample
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={action.isPending || sampling}
                      onClick={() => void sample('review')}
                    >
                      Run review sample
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </Panel>
        </div>
      )}
      <Panel
        title="Inspection queue"
        action={
          <select
            aria-label="Inspection status filter"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(0);
            }}
          >
            <option value="">All statuses</option>
            {['QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED'].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        }
      >
        <ErrorNotice error={list.error} retry={() => void list.refetch()} />
        {list.isPending ? (
          <Loading />
        ) : (
          <InspectionTable
            items={list.data?.rows ?? []}
            auth={auth}
            zones={data.zones}
          />
        )}
        <Pager
          page={page}
          setPage={setPage}
          count={list.data?.rows.length ?? 0}
        />
      </Panel>
    </>
  );
}
function Pager({
  page,
  setPage,
  count,
}: {
  page: number;
  setPage: (n: number) => void;
  count: number;
}) {
  return (
    <div className="pager">
      <Button
        variant="outline"
        size="sm"
        disabled={page === 0}
        onClick={() => setPage(page - 1)}
      >
        Previous
      </Button>
      Page {page + 1}
      <Button
        variant="outline"
        size="sm"
        disabled={count < 10}
        onClick={() => setPage(page + 1)}
      >
        Next
      </Button>
    </div>
  );
}
function InspectionDetail({ auth, id }: { auth: Auth; id: string }) {
  const query = useQuery({
      queryKey: ['inspection', id],
      queryFn: () => api<Inspection>(`/inspections/${id}`),
      refetchInterval: (q) =>
        ['QUEUED', 'PROCESSING'].includes(q.state.data?.status ?? '')
          ? 1500
          : false,
    }),
    action = useAction(auth);
  const i = query.data;
  const allowed = ['ADMIN', 'OFFICER'].includes(auth.user.role);
  if (query.isPending) return <Loading />;
  if (!i)
    return (
      <ErrorNotice error={query.error} retry={() => void query.refetch()} />
    );
  return (
    <>
      <PageTitle
        eyebrow="TIMESTAMPED SNAPSHOT"
        title="Inspection review"
        subtitle={`${date(i.created_at, auth.facility.timezone)} · ${i.original_name}`}
      >
        <Link className="link" href="/inspections">
          ← Inspection queue
        </Link>
      </PageTitle>
      <div className="row" style={{ marginBottom: 18 }}>
        <Status value={i.status} />
        <Status value={i.mode === 'DEMO' ? 'warning' : 'normal'}>
          {i.mode === 'DEMO' ? 'DEMO fixture · no real AI' : 'REAL PPE model'}
        </Status>
        <span className="muted">Attempt {i.attempts} of 3</span>
      </div>
      <ErrorNotice error={query.error ?? action.error} />
      {i.error && (
        <div className="notice error" role="alert">
          {i.error}
        </div>
      )}
      {i.status === 'FAILED' && allowed && !i.image_deleted && (
        <Button
          disabled={action.isPending || i.attempts >= 3}
          onClick={() => action.mutate({ path: `/inspections/${id}/retry` })}
        >
          <RefreshCw size={16} />
          Retry inspection ({3 - i.attempts} left)
        </Button>
      )}
      <div className="grid-two" style={{ marginTop: 18 }}>
        <Panel title="Image & original model detections">
          {i.image_deleted || auth.allowImages === false ? (
            <div className="empty">
              Image deleted or guest image access disabled.
            </div>
          ) : (
            <div className="image-overlay">
              <img
                src={`/api/inspections/${id}/image`}
                alt="Inspection snapshot with aligned PPE bounding boxes"
              />
              {i.result && (
                <svg
                  viewBox={`0 0 ${i.width} ${i.height}`}
                  role="img"
                  aria-label="Original model detection overlays"
                >
                  {i.result.detections.map((d, index) => (
                    <g key={index}>
                      <rect
                        x={d.box[0]}
                        y={d.box[1]}
                        width={d.box[2] - d.box[0]}
                        height={d.box[3] - d.box[1]}
                        fill="none"
                        stroke={
                          d.class.startsWith('no_') ? '#e54b51' : '#0b8f7c'
                        }
                        strokeWidth={2}
                      />
                      <text x={d.box[0] + 3} y={Math.max(15, d.box[1] - 5)}>
                        {d.class} ·{' '}
                        {i.mode === 'DEMO'
                          ? 'fixture annotation'
                          : `${Math.round(d.confidence * 100)}%`}
                        {d.class === 'person' ? ` · ${d.personId}` : ''}
                      </text>
                    </g>
                  ))}
                </svg>
              )}
            </div>
          )}
          <p>
            Boxes use xyxy pixels on the normalized {i.width} × {i.height}{' '}
            source image.{' '}
            {i.mode === 'DEMO'
              ? 'Fixture annotations are not model predictions or accuracy evidence.'
              : 'Confidence is a model score, not verified detection accuracy.'}
          </p>
          {i.result && (
            <>
              <p>
                Model: {i.result.modelVersion} · {i.result.processingMs}ms
              </p>
              {i.result.warnings.map((w) => (
                <p key={w}>⚠ {w}</p>
              ))}
            </>
          )}
          {allowed &&
            !i.image_deleted &&
            !['QUEUED', 'PROCESSING'].includes(i.status) && (
              <Button
                variant="outline"
                size="sm"
                disabled={action.isPending}
                onClick={() => {
                  if (
                    window.confirm(
                      'Delete this private image? The inspection record and review history will remain.',
                    )
                  )
                    action.mutate({
                      path: `/inspections/${id}/image`,
                      method: 'DELETE',
                    });
                }}
              >
                Delete image
              </Button>
            )}
        </Panel>
        <Panel title="Person findings & human review">
          {!i.result ? (
            <div className="empty">
              {i.status === 'FAILED'
                ? 'Inference unavailable. No compliance conclusion.'
                : 'Worker is processing this snapshot…'}
            </div>
          ) : (
            <ReviewForm
              key={`${id}:${i.reviews?.length}`}
              auth={auth}
              inspection={i}
              editable={allowed}
            />
          )}
        </Panel>
      </div>
      <Panel title="Review audit trail · original prediction retained">
        {i.reviews?.length ? (
          i.reviews.map((r) => (
            <div className="audit" key={r.id}>
              <h3>
                {r.reviewer_name} · {date(r.created_at, auth.facility.timezone)}
              </h3>
              <p>{r.note}</p>
              <pre>
                {r.findings
                  .map(
                    (f) => `${f.personId}: helmet ${f.helmet}, vest ${f.vest}`,
                  )
                  .join('\n')}
              </pre>
            </div>
          ))
        ) : (
          <div className="empty">
            Unreviewed. Model findings are potential findings only.
          </div>
        )}
      </Panel>
    </>
  );
}
function ReviewForm({
  auth,
  inspection,
  editable,
}: {
  auth: Auth;
  inspection: Inspection;
  editable: boolean;
}) {
  const initial =
    inspection.reviews?.[0]?.findings ?? inspection.result?.findings ?? [];
  const [findings, setFindings] = useState<Finding[]>(initial),
    [note, setNote] = useState('');
  const action = useAction(auth);
  return (
    <>
      <p>
        {inspection.reviews?.length
          ? 'Latest reviewed findings. “Missing” is a reviewer-confirmed snapshot violation.'
          : 'Unreviewed predictions. Unknown is not compliant.'}
      </p>
      {!findings.length ? (
        <div className="empty">
          No confidently detected person. Cannot conclude PPE compliance.
        </div>
      ) : (
        <div className="findings">
          {findings.map((f, index) => (
            <div className="finding" key={f.personId}>
              <h3>{f.personId}</h3>
              <div className="form-grid" style={{ marginTop: 12 }}>
                {(['helmet', 'vest'] as const).map((field) => (
                  <div key={field}>
                    <label htmlFor={`${f.personId}-${field}`}>
                      {field === 'helmet' ? 'Helmet' : 'High-visibility vest'}
                    </label>
                    <select
                      id={`${f.personId}-${field}`}
                      value={f[field]}
                      disabled={!editable}
                      className="w-full"
                      onChange={(e) =>
                        setFindings((fs) =>
                          fs.map((x, n) =>
                            n === index ? { ...x, [field]: e.target.value } : x,
                          ),
                        )
                      }
                    >
                      <option value="detected">
                        Detected / confirmed worn
                      </option>
                      <option value="potential_missing">
                        Potential missing / confirm violation
                      </option>
                      <option value="unknown">Unknown / not visible</option>
                    </select>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {editable && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            action.mutate(
              {
                path: `/inspections/${inspection.id}/reviews`,
                body: { findings, note },
              },
              { onSuccess: () => setNote('') },
            );
          }}
          style={{ marginTop: 18 }}
        >
          <label htmlFor="review-note">Review notes (required)</label>
          <Textarea
            id="review-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            minLength={3}
            maxLength={2000}
            required
            placeholder="Describe evidence, corrections, or uncertainty…"
          />
          <ErrorNotice error={action.error} />
          <Button type="submit" className="mt-3" disabled={action.isPending}>
            {action.isPending ? 'Saving review…' : 'Save human review'}
          </Button>
        </form>
      )}
    </>
  );
}
function Alerts({
  auth,
  data,
  id,
}: {
  auth: Auth;
  data: Snapshot;
  id?: string;
}) {
  if (id) return <Incident auth={auth} id={id} />;
  return <AlertList auth={auth} data={data} />;
}
function AlertList({ auth, data }: { auth: Auth; data: Snapshot }) {
  const [status, setStatus] = useState(''),
    [page, setPage] = useState(0);
  const query = useQuery({
    queryKey: ['alerts', status, page],
    queryFn: () =>
      api<{ rows: Alert[] }>(
        `/alerts?limit=10&page=${page}${status ? `&status=${status}` : ''}`,
      ),
  });
  return (
    <>
      <PageTitle
        eyebrow="RESPONSE WORKSPACE"
        title="Alerts & incidents"
        subtitle="Condition state and incident workflow are tracked independently."
      />
      <div className="notice warning">
        <Info size={16} />
        Acknowledgment does not mean recovery. Resolve after recovery or record
        an explicit override with a reason.
      </div>
      <Panel
        title="Incident register"
        action={
          <select
            aria-label="Incident status filter"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(0);
            }}
          >
            <option value="">All statuses</option>
            {['OPEN', 'ACKNOWLEDGED', 'RESOLVED'].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        }
      >
        <ErrorNotice error={query.error} retry={() => void query.refetch()} />
        {query.isPending ? (
          <Loading />
        ) : (
          <AlertFeed
            alerts={query.data?.rows ?? []}
            zones={data.zones}
            auth={auth}
          />
        )}
        <Pager
          page={page}
          setPage={setPage}
          count={query.data?.rows.length ?? 0}
        />
      </Panel>
    </>
  );
}
function Incident({ auth, id }: { auth: Auth; id: string }) {
  const query = useQuery({
    queryKey: ['incident', id],
    queryFn: () =>
      api<
        Alert & {
          actions: {
            id: string;
            action: string;
            note: string;
            override: boolean;
            actor_name: string;
            created_at: string;
          }[];
        }
      >(`/alerts/${id}`),
  });
  const action = useAction(auth);
  const [note, setNote] = useState(''),
    [override, setOverride] = useState(false);
  const a = query.data;
  if (query.isPending) return <Loading />;
  if (!a)
    return (
      <ErrorNotice error={query.error} retry={() => void query.refetch()} />
    );
  return (
    <>
      <PageTitle
        eyebrow="INCIDENT DETAIL"
        title={a.title}
        subtitle={`Opened ${date(a.opened_at, auth.facility.timezone)}`}
      >
        <Link className="link" href="/alerts">
          ← Incident register
        </Link>
      </PageTitle>
      <div className="row" style={{ marginBottom: 20 }}>
        <Status value={a.severity === 'CRITICAL' ? 'critical' : 'warning'}>
          {a.severity}
        </Status>
        <Status value={a.status} />
        <Status value={a.condition_active ? 'critical' : 'normal'}>
          {a.condition_active ? 'Condition active' : 'Recovered / corrected'}
        </Status>
      </div>
      <div className="grid-two">
        <Panel title="Evidence & condition">
          <p>
            {a.inspection_id
              ? 'Timestamped PPE snapshot; does not describe current workers.'
              : 'Environmental simulator breach; demonstration limit.'}
          </p>
          {Object.entries(a.evidence).map(([key, value]) => (
            <div key={key} className="audit">
              <strong className="muted">{key}</strong>
              <p className="break">
                {typeof value === 'object'
                  ? JSON.stringify(value)
                  : String(value)}
              </p>
            </div>
          ))}
          <p>Recovered: {date(a.recovered_at, auth.facility.timezone)}</p>
          <p>Resolved: {date(a.resolved_at, auth.facility.timezone)}</p>
          {a.inspection_id && (
            <Link className="link" href={`/inspections/${a.inspection_id}`}>
              Open source inspection →
            </Link>
          )}
          {a.resolution_reason && (
            <p>Resolution reason: {a.resolution_reason}</p>
          )}
        </Panel>
        <Panel title="Respond to incident">
          {['ADMIN', 'OFFICER'].includes(auth.user.role) ? (
            <>
              <label htmlFor="incident-note">
                Action note / resolution reason (required)
              </label>
              <Textarea
                id="incident-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Describe investigation, recovery evidence, or the reason for override…"
                maxLength={2000}
              />
              {a.condition_active && a.status === 'ACKNOWLEDGED' && (
                <label
                  className="row"
                  style={{ marginTop: 14, fontWeight: 400 }}
                >
                  <input
                    type="checkbox"
                    checked={override}
                    onChange={(e) => setOverride(e.target.checked)}
                  />
                  I explicitly override resolution of this active condition.
                  Record this in the audit trail.
                </label>
              )}
              <ErrorNotice error={action.error} />
              <div className="row" style={{ marginTop: 16 }}>
                {a.status === 'OPEN' && (
                  <Button
                    disabled={note.length < 3 || action.isPending}
                    onClick={() =>
                      action.mutate(
                        {
                          path: `/alerts/${id}/actions`,
                          body: {
                            action: 'acknowledge',
                            note,
                            override: false,
                          },
                        },
                        { onSuccess: () => setNote('') },
                      )
                    }
                  >
                    Acknowledge
                  </Button>
                )}
                {a.status === 'ACKNOWLEDGED' && (
                  <Button
                    disabled={
                      note.length < 3 ||
                      action.isPending ||
                      (a.condition_active && !override)
                    }
                    onClick={() =>
                      action.mutate(
                        {
                          path: `/alerts/${id}/actions`,
                          body: { action: 'resolve', note, override },
                        },
                        { onSuccess: () => setNote('') },
                      )
                    }
                  >
                    Resolve incident
                  </Button>
                )}
                <Button
                  variant="outline"
                  disabled={note.length < 3 || action.isPending}
                  onClick={() =>
                    action.mutate(
                      {
                        path: `/alerts/${id}/actions`,
                        body: { action: 'note', note, override: false },
                      },
                      { onSuccess: () => setNote('') },
                    )
                  }
                >
                  Add note
                </Button>
              </div>
            </>
          ) : (
            <div className="empty">Your role has read-only access.</div>
          )}
          <h3 style={{ marginTop: 28 }}>Action history</h3>
          {a.actions.length ? (
            a.actions.map((x) => (
              <div className="audit" key={x.id}>
                <h3>
                  {x.action} · {x.actor_name}
                  {x.override ? ' · ACTIVE-CONDITION OVERRIDE' : ''}
                </h3>
                <p>{x.note}</p>
                <p>{date(x.created_at, auth.facility.timezone)}</p>
              </div>
            ))
          ) : (
            <p>No actions recorded yet.</p>
          )}
        </Panel>
      </div>
    </>
  );
}
function Analytics({ auth, data }: { auth: Auth; data: Snapshot }) {
  const [zoneId, setZoneId] = useState(''),
    [period, setPeriod] = useState('24h');
  const rs = data.reviewStats;
  const percent = rs.reviewedPersons
    ? Math.round((rs.compliantPersons / rs.reviewedPersons) * 100)
    : null;
  return (
    <>
      <PageTitle
        eyebrow="HISTORICAL ANALYTICS"
        title="Analytics & reports"
        subtitle="Seven days of bounded raw demo history. No invented detection accuracy."
      />
      <div className="stats">
        {[
          [
            'Reviewed persons',
            rs.reviewedPersons,
            'Latest human review per inspection · last 7 days',
          ],
          [
            'Confirmed equipped',
            percent === null ? '—' : `${percent}%`,
            `${rs.compliantPersons} / ${rs.reviewedPersons} reviewed persons (denominator includes unknown)`,
          ],
          [
            'Unknown persons',
            rs.unknownPersons,
            'Unknown evidence is not counted as equipped',
          ],
          [
            'Unreviewed inspections',
            rs.unreviewedInspections,
            'Excluded from reviewed-person percentages',
          ],
        ].map(([label, value, note]) => (
          <div className="stat" key={label}>
            <div className="stat-head">{label}</div>
            <div className="stat-value">{value}</div>
            <div className="stat-note">{note}</div>
          </div>
        ))}
      </div>
      <Trend auth={auth} zones={data.zones} />
      {auth.user.role !== 'GUEST' && (
        <Panel title="Download persisted history">
          <p>
            CSV exports honor facility and zone permissions, use UTC timestamps,
            and escape spreadsheet formulas. Maximum 10,000 rows; choose a
            smaller range if needed.
          </p>
          <div className="row" style={{ margin: '18px 0' }}>
            <select
              aria-label="Export zone"
              value={zoneId}
              onChange={(e) => setZoneId(e.target.value)}
            >
              <option value="">All permitted zones</option>
              {data.zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </select>
            <select
              aria-label="Export time range"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
            >
              <option value="1h">Last hour</option>
              <option value="24h">Last 24 hours</option>
              <option value="7d">Last 7 days</option>
            </select>
          </div>
          <div className="row exports">
            {['readings', 'inspections', 'incidents'].map((kind) => (
              <Button
                key={kind}
                variant="outline"
                onClick={async () => {
                  const res = await fetch(
                    `/api/exports/${kind}?range=${period}${zoneId ? `&zoneId=${zoneId}` : ''}`,
                  );
                  if (!res.ok) {
                    const body = await res.json();
                    window.alert(body.error?.message ?? 'Export failed');
                    return;
                  }
                  const url = URL.createObjectURL(await res.blob());
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `safesight-${kind}.csv`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                <Download size={16} />
                {kind} CSV
              </Button>
            ))}
          </div>
        </Panel>
      )}
    </>
  );
}
function Simulation({ auth, data }: { auth: Auth; data: Snapshot }) {
  const [selected, setSelected] = useState(data.zones[0]?.id ?? ''),
    [scenario, setScenario] = useState('normal'),
    [confirmation, setConfirmation] = useState('');
  const action = useAction(auth);
  if (auth.user.role !== 'ADMIN')
    return (
      <div className="empty">Simulation controls require Admin access.</div>
    );
  const z = data.zones.find((z) => z.id === selected);
  return (
    <>
      <PageTitle
        eyebrow="DEMONSTRATION LAB"
        title="Simulation controls"
        subtitle="One central server scheduler. All connected clients share persisted readings."
      />
      <div className="grid-two">
        <Panel title="Control a zone scenario">
          <ErrorNotice error={action.error} />
          <div className="field">
            <label htmlFor="scenario-zone">Target zone</label>
            <select
              id="scenario-zone"
              className="w-full"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              {data.zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="scenario">Scenario</label>
            <select
              id="scenario"
              className="w-full"
              value={scenario}
              onChange={(e) => setScenario(e.target.value)}
            >
              <option value="normal">Normal operation</option>
              <option value="temperature">Rising temperature</option>
              <option value="aqi">AQI deterioration</option>
              <option value="recovery">Gradual recovery</option>
              <option value="interrupted">Interrupted readings (stale)</option>
            </select>
          </div>
          <div className="row">
            <Button
              disabled={action.isPending}
              onClick={() =>
                action.mutate({
                  path: '/simulation',
                  body: { zoneId: selected, scenario, running: true },
                })
              }
            >
              Start scenario
            </Button>
            <Button
              variant="outline"
              disabled={action.isPending}
              onClick={() =>
                action.mutate({
                  path: '/simulation',
                  body: {
                    zoneId: selected,
                    scenario: z?.scenario ?? scenario,
                    running: !z?.running,
                  },
                })
              }
            >
              {z?.running ? 'Pause readings' : 'Resume readings'}
            </Button>
          </div>
          <p style={{ marginTop: 18 }}>
            Current persisted run: <strong>{z?.scenario}</strong> ·{' '}
            {z?.running ? 'running' : 'paused'}. Five-second interval, bounded
            gradual variation. Stopping creates no new scheduler.
          </p>
        </Panel>
        <Panel title="Demonstration rule behavior">
          <div className="feed-item">
            <Thermometer size={22} />
            <div>
              <h3>Delayed threshold breach</h3>
              <p>
                Temperature and AQI require 3 consecutive breaches by default.
                Limits are configurable in Settings.
              </p>
            </div>
          </div>
          <div className="feed-item">
            <Wind size={22} />
            <div>
              <h3>Hysteresis & recovery</h3>
              <p>
                Three readings below the recovery boundary clear the condition.
                The incident stays in the register until resolved.
              </p>
            </div>
          </div>
          <div className="feed-item">
            <Clock size={22} />
            <div>
              <h3>Interrupted readings</h3>
              <p>
                Default stale limit is 20 seconds. A stale observation cannot
                erase an unresolved critical alert.
              </p>
            </div>
          </div>
        </Panel>
      </div>
      {data.capabilities.resetDemo && (
        <Panel title="Reset demonstration data">
          <p>
            Deletes this facility’s readings, inspections, stored images,
            reviews and incidents; returns all scenarios to normal. Accounts and
            configured rules remain. Available only in development mode.
          </p>
          <label htmlFor="reset-confirmation" style={{ marginTop: 16 }}>
            Type RESET DEMO to confirm
          </label>
          <div className="row">
            <Input
              id="reset-confirmation"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              style={{ maxWidth: 240 }}
            />
            <Button
              variant="destructive"
              disabled={confirmation !== 'RESET DEMO' || action.isPending}
              onClick={() =>
                action.mutate(
                  { path: '/simulation/reset', body: { confirmation } },
                  { onSuccess: () => setConfirmation('') },
                )
              }
            >
              Reset demo data
            </Button>
          </div>
        </Panel>
      )}
    </>
  );
}
interface SettingsResponse {
  facility: { id: string; name: string; timezone: string };
  publicAppUrl: string | null;
  storageAdapter: string;
  inference: { mode: string; ready: boolean; reason: string | null };
}
interface Share {
  id: string;
  zone_id: string | null;
  expires_at: string;
  revoked_at: string | null;
  allow_images: boolean;
}
function Settings({ auth, data }: { auth: Auth; data: Snapshot }) {
  const query = useQuery({
      queryKey: ['settings'],
      queryFn: () => api<SettingsResponse>('/settings'),
      enabled: auth.user.role !== 'GUEST',
    }),
    rules = useQuery({
      queryKey: ['rules'],
      queryFn: () => api<Rule[]>('/rules'),
      enabled: auth.user.role !== 'GUEST',
    });
  if (auth.user.role === 'GUEST')
    return <div className="empty">Settings are available to staff only.</div>;
  return (
    <>
      <PageTitle
        eyebrow="FACILITY CONFIGURATION"
        title="Settings & QR access"
        subtitle="Demonstration rules, facility preferences, and secure mobile entry."
      />
      <ErrorNotice
        error={query.error ?? rules.error}
        retry={() => {
          void query.refetch();
          void rules.refetch();
        }}
      />
      {query.data ? (
        <>
          <div className="grid-two">
            <FacilityForm
              key={query.data.facility.name + query.data.facility.timezone}
              auth={auth}
              settings={query.data}
            />
            <QRPanel auth={auth} data={data} settings={query.data} />
          </div>
          <div style={{ marginBottom: 22 }}>
            <Panel title="Zone PPE requirements">
              <p>
                Helmet and high-visibility vest requirements determine which
                snapshot findings create review alerts. Original detections and
                review evidence remain unchanged.
              </p>
              {data.zones.map((z) => (
                <PPERequirements
                  key={`${z.id}:${JSON.stringify(z.ppe)}`}
                  auth={auth}
                  zone={z}
                />
              ))}
            </Panel>
          </div>
          <Panel title="Per-zone demonstration limits">
            <p>
              These configurable rules are educational examples, not certified
              occupational exposure limits. AQI uses the simulated US AQI scale;
              stale threshold is in seconds. Disabling a rule ends its active
              condition but retains incident history.
            </p>
            {rules.data?.map((r) => (
              <RuleEditor
                key={`${r.id}:${r.threshold}:${r.consecutive}:${r.enabled}:${r.recovery_readings}:${r.hysteresis}`}
                auth={auth}
                rule={r}
                name={
                  data.zones.find((z) => z.id === r.zone_id)?.name ?? 'Zone'
                }
              />
            ))}
          </Panel>
          {auth.user.role === 'ADMIN' && (
            <div style={{ marginTop: 22 }}>
              <SharePanel
                auth={auth}
                data={data}
                configured={!!query.data.publicAppUrl}
              />
            </div>
          )}
        </>
      ) : (
        <Loading />
      )}
    </>
  );
}
function FacilityForm({
  auth,
  settings,
}: {
  auth: Auth;
  settings: SettingsResponse;
}) {
  const [name, setName] = useState(settings.facility.name),
    [tz, setTz] = useState(settings.facility.timezone);
  const action = useAction(auth);
  return (
    <Panel title="Facility preferences">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          action.mutate({
            path: '/settings',
            method: 'PATCH',
            body: { name, timezone: tz },
          });
        }}
      >
        <div className="field">
          <label htmlFor="facility-name">Facility name</label>
          <Input
            id="facility-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={auth.user.role !== 'ADMIN'}
            minLength={3}
            maxLength={100}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="facility-timezone">Display timezone</label>
          <Input
            id="facility-timezone"
            value={tz}
            onChange={(e) => setTz(e.target.value)}
            disabled={auth.user.role !== 'ADMIN'}
            required
          />
        </div>
        <ErrorNotice error={action.error} />
        {auth.user.role === 'ADMIN' && (
          <Button type="submit" disabled={action.isPending}>
            {action.isPending ? 'Saving…' : 'Save preferences'}
          </Button>
        )}
        {action.isSuccess && <p role="status">Facility preferences saved.</p>}
      </form>
      <p style={{ marginTop: 18 }}>
        Image storage: {settings.storageAdapter}. Inference:{' '}
        {settings.inference.mode} ·{' '}
        {settings.inference.ready ? 'available' : settings.inference.reason}.
        Server secrets are never sent to the browser.
      </p>
    </Panel>
  );
}
function QRPanel({
  data,
  settings,
}: {
  auth: Auth;
  data: Snapshot;
  settings: SettingsResponse;
}) {
  const [zoneId, setZoneId] = useState('');
  const qr = useQuery({
    queryKey: ['qr', zoneId],
    queryFn: () =>
      api<{ payload: string; dataUrl: string }>(
        '/qr' + (zoneId ? `?zoneId=${zoneId}` : ''),
      ),
    enabled: !!settings.publicAppUrl,
  });
  return (
    <Panel title="Staff QR · authenticate on your phone">
      {!settings.publicAppUrl ? (
        <div className="empty">
          <Info size={22} style={{ margin: '0 auto 12px' }} />
          Set <code>PUBLIC_APP_URL</code> in <code>.env</code> to a
          phone-reachable URL and restart services. See README for WSL/Windows
          LAN steps. Localhost QR codes are disabled.
        </div>
      ) : (
        <>
          <select
            aria-label="QR page scope"
            value={zoneId}
            onChange={(e) => setZoneId(e.target.value)}
            className="w-full"
          >
            <option value="">Facility dashboard</option>
            {data.zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.name}
              </option>
            ))}
          </select>
          <ErrorNotice error={qr.error} />
          {qr.isPending ? (
            <Loading />
          ) : (
            qr.data && (
              <div style={{ textAlign: 'center', marginTop: 14 }}>
                <img
                  src={qr.data.dataUrl}
                  alt="QR code opening the selected authenticated staff page"
                  width={200}
                  height={200}
                  style={{ margin: '0 auto' }}
                />
                <p className="break">{qr.data.payload}</p>
              </div>
            )
          )}
          <p>
            QR carries a page URL only. No password or desktop session. Physical
            phone scanning requires manual verification.
          </p>
        </>
      )}
    </Panel>
  );
}
function RuleEditor({
  auth,
  rule: r,
  name,
}: {
  auth: Auth;
  rule: Rule;
  name: string;
}) {
  const [threshold, setThreshold] = useState(r.threshold),
    [consecutive, setConsecutive] = useState(r.consecutive),
    [hysteresis, setHysteresis] = useState(r.hysteresis),
    [recovery, setRecovery] = useState(r.recovery_readings),
    [enabled, setEnabled] = useState(r.enabled),
    [severity, setSeverity] = useState(r.severity);
  const action = useAction(auth);
  const admin = auth.user.role === 'ADMIN';
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        action.mutate({
          path: `/rules/${r.id}`,
          method: 'PATCH',
          body: {
            metric: r.metric,
            threshold,
            consecutive,
            hysteresis,
            recoveryReadings: recovery,
            enabled,
            severity,
          },
        });
      }}
    >
      <div className="rule-row">
        <div>
          <h3>{name}</h3>
          <p>
            {r.metric === 'temperature'
              ? 'Temperature · °C'
              : r.metric === 'aqi'
                ? 'Simulated US AQI'
                : 'Stale · seconds'}
          </p>
          <label className="row">
            <input
              type="checkbox"
              checked={enabled}
              disabled={!admin}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            Enabled
          </label>
          <select
            aria-label={`${name} ${r.metric} severity`}
            value={severity}
            disabled={!admin}
            onChange={(e) => setSeverity(e.target.value as Rule['severity'])}
          >
            <option>WARNING</option>
            <option>CRITICAL</option>
          </select>
        </div>
        {[
          ['Limit', threshold, setThreshold, 500],
          ['Breach readings', consecutive, setConsecutive, 30],
          ['Hysteresis', hysteresis, setHysteresis, 100],
          ['Recovery readings', recovery, setRecovery, 30],
        ].map(([label, value, set, max]) => (
          <div key={String(label)}>
            <label htmlFor={`${r.id}-${label}`}>{String(label)}</label>
            <Input
              id={`${r.id}-${label}`}
              type="number"
              value={value as number}
              min={label === 'Hysteresis' ? 0 : 1}
              max={max as number}
              step={label === 'Limit' || label === 'Hysteresis' ? 0.1 : 1}
              disabled={!admin}
              onChange={(e) =>
                (set as (v: number) => void)(Number(e.target.value))
              }
            />
          </div>
        ))}
        {admin && (
          <Button type="submit" size="sm" disabled={action.isPending}>
            Save rule
          </Button>
        )}
      </div>
      <ErrorNotice error={action.error} />
      {action.isSuccess && <p role="status">Rule saved.</p>}
    </form>
  );
}
function SharePanel({
  auth,
  data,
  configured,
}: {
  auth: Auth;
  data: Snapshot;
  configured: boolean;
}) {
  const [zoneId, setZoneId] = useState(''),
    [hours, setHours] = useState(1),
    [images, setImages] = useState(false),
    [url, setUrl] = useState('');
  const action = useAction(auth),
    shares = useQuery({
      queryKey: ['shares'],
      queryFn: () => api<Share[]>('/shares'),
    });
  return (
    <Panel title="Optional read-only guest links">
      <p>
        Scoped, expiring access. A random token is exchanged for a cookie
        session and removed from the address bar. Revocation also closes
        existing live streams. The link is shown only when created.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          action.mutate(
            {
              path: '/shares',
              body: {
                zoneId: zoneId || null,
                expiresInHours: hours,
                allowImages: images,
              },
            },
            { onSuccess: (r) => setUrl((r as { url: string }).url) },
          );
        }}
      >
        <div className="form-grid" style={{ marginTop: 16 }}>
          <div className="field">
            <label htmlFor="guest-zone">Scope</label>
            <select
              id="guest-zone"
              className="w-full"
              value={zoneId}
              onChange={(e) => setZoneId(e.target.value)}
            >
              <option value="">Whole facility</option>
              {data.zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="guest-expiry">Expires in hours (max 168)</label>
            <Input
              id="guest-expiry"
              type="number"
              min="0.01"
              max="168"
              step="0.01"
              required
              value={hours}
              onChange={(e) => setHours(Number(e.target.value))}
            />
          </div>
        </div>
        <label className="row">
          <input
            type="checkbox"
            checked={images}
            onChange={(e) => setImages(e.target.checked)}
          />
          Allow access to inspection images
        </label>
        <ErrorNotice error={action.error} />
        <Button
          type="submit"
          disabled={!configured || action.isPending}
          className="mt-3"
        >
          Create guest link
        </Button>
        {!configured && <p>Configure PUBLIC_APP_URL first.</p>}
      </form>
      {url && (
        <div className="notice warning" style={{ marginTop: 16 }}>
          <div>
            <strong>
              Guest link created. Share only with intended viewers.
            </strong>
            <p className="break">{url}</p>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                navigator.clipboard
                  .writeText(url)
                  .catch(() =>
                    window.alert(
                      'Clipboard unavailable; copy the displayed link manually.',
                    ),
                  )
              }
            >
              Copy link
            </Button>
          </div>
        </div>
      )}
      <ErrorNotice error={shares.error} retry={() => void shares.refetch()} />
      {shares.data?.map((s) => (
        <div className="audit row spread" key={s.id}>
          <div>
            <h3>
              {s.zone_id
                ? data.zones.find((z) => z.id === s.zone_id)?.name
                : 'Facility access'}
            </h3>
            <p>
              Expires {date(s.expires_at, auth.facility.timezone)} · images{' '}
              {s.allow_images ? 'enabled' : 'disabled'}
            </p>
            <Status
              value={
                s.revoked_at || new Date(s.expires_at) < new Date()
                  ? 'unknown'
                  : 'normal'
              }
            >
              {s.revoked_at
                ? 'Revoked'
                : new Date(s.expires_at) < new Date()
                  ? 'Expired'
                  : 'Active'}
            </Status>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={!!s.revoked_at || action.isPending}
            onClick={() =>
              action.mutate({ path: `/shares/${s.id}`, method: 'DELETE' })
            }
          >
            Revoke
          </Button>
        </div>
      ))}
    </Panel>
  );
}
function PPERequirements({ auth, zone }: { auth: Auth; zone: Zone }) {
  const [settings, setSettings] = useState(zone.ppe);
  const action = useAction(auth);
  return (
    <form
      className="audit"
      onSubmit={(e) => {
        e.preventDefault();
        action.mutate({
          path: `/zones/${zone.id}/ppe`,
          method: 'PATCH',
          body: settings,
        });
      }}
    >
      <div className="row spread">
        <h3>{zone.name}</h3>
        <div className="row">
          {(['helmetRequired', 'vestRequired', 'alertsEnabled'] as const).map(
            (field) => (
              <label className="row" key={field}>
                <input
                  type="checkbox"
                  checked={settings[field]}
                  disabled={auth.user.role !== 'ADMIN'}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, [field]: e.target.checked }))
                  }
                />
                {field === 'helmetRequired'
                  ? 'Helmet required'
                  : field === 'vestRequired'
                    ? 'Vest required'
                    : 'PPE alerts enabled'}
              </label>
            ),
          )}
          {auth.user.role === 'ADMIN' && (
            <Button type="submit" size="sm" disabled={action.isPending}>
              Save PPE rules
            </Button>
          )}
        </div>
      </div>
      <ErrorNotice error={action.error} />
    </form>
  );
}
