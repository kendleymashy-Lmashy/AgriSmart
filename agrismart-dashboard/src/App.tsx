import { CSSProperties, FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Battery,
  CalendarClock,
  Check,
  CheckCircle2,
  Droplets,
  Eye,
  EyeOff,
  Gauge,
  Home,
  Info,
  Leaf,
  Lock,
  LogOut,
  Mail,
  MapPin,
  Menu,
  Play,
  RefreshCw,
  Router,
  Save,
  Settings,
  ShieldAlert,
  Sprout,
  Sun,
  Thermometer,
  UserPlus,
  Waves,
  Wifi,
  X,
  Zap,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { apiService } from './services/apiService';
import {
  AlertNotification,
  AlertType,
  Calibration,
  CropRecommendation,
  HistoricalData,
  IrrigationAdvice,
  PumpMode,
  PumpStatus,
  SensorReading,
  SensorType,
  SystemSettings,
  WeatherContext,
} from './types';

type Page =
  | 'Dashboard'
  | 'Sensors'
  | 'Irrigation Control'
  | 'AI Recommendations'
  | 'Analytics'
  | 'Alerts'
  | 'Settings';

type SensorMetric = {
  type: SensorType;
  title: string;
  value: number;
  displayValue: string;
  status: string;
  color: string;
  accent: string;
  range: string;
  rawValue: string;
  updated: string;
};

type AuthUser = {
  name: string;
  email: string;
  password: string;
};

type AuthMode = 'login' | 'create';
type DataRefreshOptions = { showLoading?: boolean };

const usersStorageKey = 'agrismart_users';
const sessionStorageKey = 'agrismart_session';
const demoUser: AuthUser = {
  name: 'Tendai',
  email: 'demo@agrismart.local',
  password: 'demo123',
};

const pageTitles: Record<Page, string> = {
  Dashboard: 'DASHBOARD',
  Sensors: 'SENSORS',
  'Irrigation Control': 'IRRIGATION CONTROL',
  'AI Recommendations': 'AI RECOMMENDATIONS',
  Analytics: 'ANALYTICS',
  Alerts: 'ALERTS',
  Settings: 'SETTINGS',
};

const navItems = [
  { page: 'Dashboard' as Page, icon: Home },
  { page: 'Sensors' as Page, icon: MapPin },
  { page: 'Irrigation Control' as Page, icon: Droplets },
  { page: 'AI Recommendations' as Page, icon: CalendarClock },
  { page: 'Analytics' as Page, icon: BarChart3 },
  { page: 'Alerts' as Page, icon: AlertTriangle },
  { page: 'Settings' as Page, icon: Settings },
];

const formatTemperature = (value: number) => `${value.toFixed(1)} \u00b0C`;

const formatRelativeTime = (timestamp: string) => {
  const diff = Math.max(0, Date.now() - new Date(timestamp).getTime());
  const minutes = Math.max(1, Math.round(diff / 60000));

  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
};

const latestReading = (readings: SensorReading[], type: SensorType) =>
  readings
    .filter((reading) => reading.type === type)
    .sort((a, b) => {
      const timeDifference = new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      if (timeDifference !== 0) return timeDifference;
      return readingSequence(b) - readingSequence(a);
    })[0];

const readingSequence = (reading: SensorReading) => {
  const numericId = Number(reading.id);
  if (Number.isFinite(numericId)) return numericId;
  const leadingNumber = Number(String(reading.id || '').split('-')[0]);
  return Number.isFinite(leadingNumber) ? leadingNumber : 0;
};

type LiveChartPoint = {
  time: string;
  soilMoisture?: number;
  temperature?: number;
  humidity?: number;
};

function buildLiveChartData(readings: SensorReading[]): LiveChartPoint[] {
  const sorted = [...readings].sort((a, b) => {
    const timeDifference = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
    if (timeDifference !== 0) return timeDifference;
    return readingSequence(a) - readingSequence(b);
  });
  const current: Omit<LiveChartPoint, 'time'> = {};
  const points = new Map<string, LiveChartPoint>();

  sorted.forEach((reading) => {
    const date = new Date(reading.timestamp);
    const key = date.toISOString().slice(0, 16);
    const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (reading.type === 'soil_moisture') current.soilMoisture = Number(reading.value);
    if (reading.type === 'temperature') current.temperature = Number(reading.value);
    if (reading.type === 'humidity') current.humidity = Number(reading.value);

    points.set(key, { time, ...current });
  });

  return Array.from(points.values()).slice(-24);
}

const emptyReading = (type: SensorType): SensorReading => ({
  id: `empty-${type}`,
  type,
  value: 0,
  unit: type === 'temperature' ? 'C' : '%',
  timestamp: new Date().toISOString(),
  status: 'normal',
});

const emptyRecommendation: CropRecommendation = {
  id: 'empty',
  name: 'Pending',
  confidence: 0,
  reason: 'Waiting for database recommendation data.',
  waterRequirement: 0,
  image: 'Pending',
  bestSeason: 'Pending',
  yieldExpectation: 'Pending',
};

const emptyWeather: WeatherContext = {
  location: 'Harare, Zimbabwe',
  timezone: 'Africa/Harare',
  season: 'Summer',
  localHour: 6,
  temperature: 27.5,
  humidity: 58,
  rainChance: 45,
  evaporationRisk: 'low',
  condition: 'Stable field weather',
};

const emptyIrrigationAdvice: IrrigationAdvice = {
  action: 'standby',
  command: 'standby',
  label: 'No Water Needed',
  durationMinutes: 0,
  reason: 'Waiting for backend irrigation advice.',
  pumpRunning: false,
  shouldIrrigate: false,
  threshold: 30,
  effectiveThreshold: 30,
  dryThreshold: 20,
  wetThreshold: 80,
  recommendedStart: 'now',
  weather: emptyWeather,
};

const emptyPumpStatus: PumpStatus = {
  id: 'pending',
  isRunning: false,
  mode: 'automatic',
  uptime: 0,
  power: 0,
  lastCommand: 'standby',
};

const emptySettings: SystemSettings = {
  deviceName: 'AgriSmart Node',
  location: 'Harare, Zimbabwe',
  batteryLevel: 0,
  firmwareVersion: 'pending',
  uptime: 0,
  autoMode: true,
  irrigationThreshold: 30,
  timezone: 'Africa/Harare',
  unitSystem: 'Metric',
};

const emptyCalibration: Calibration = {
  soilThreshold: {
    dry: 20,
    wet: 80,
  },
};

const secondsToUptime = (seconds: number) => {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  if (days <= 0) return `${hours} hours`;
  return `${days} days, ${hours} hours`;
};

const classNames = (...names: Array<string | false | undefined>) => names.filter(Boolean).join(' ');

function readStoredUsers(): AuthUser[] {
  try {
    const stored = localStorage.getItem(usersStorageKey);
    return stored ? (JSON.parse(stored) as AuthUser[]) : [demoUser];
  } catch {
    return [demoUser];
  }
}

function writeStoredUsers(users: AuthUser[]) {
  localStorage.setItem(usersStorageKey, JSON.stringify(users));
}

function findSessionUser() {
  const email = localStorage.getItem(sessionStorageKey);
  if (!email) return null;

  return readStoredUsers().find((user) => user.email === email) || null;
}

function buildMetrics(readings: SensorReading[]): SensorMetric[] {
  const soil = latestReading(readings, 'soil_moisture') || emptyReading('soil_moisture');
  const temperature = latestReading(readings, 'temperature') || emptyReading('temperature');
  const humidity = latestReading(readings, 'humidity') || emptyReading('humidity');

  return [
    {
      type: 'soil_moisture',
      title: 'Soil Moisture',
      value: soil.value,
      displayValue: `${Math.round(soil.value)}%`,
      status: soil.value < 35 ? 'Dry' : 'Normal',
      color: '#ef2f34',
      accent: 'red',
      range: 'Range: 0% - 100%',
      rawValue: soil.rawValue ? String(soil.rawValue) : '1024',
      updated: formatRelativeTime(soil.timestamp),
    },
    {
      type: 'temperature',
      title: 'Temperature',
      value: temperature.value,
      displayValue: formatTemperature(temperature.value),
      status: 'Normal',
      color: '#ef2f34',
      accent: 'red',
      range: 'Range: -10\u00b0C - 60\u00b0C',
      rawValue: '-',
      updated: formatRelativeTime(temperature.timestamp),
    },
    {
      type: 'humidity',
      title: 'Humidity',
      value: humidity.value,
      displayValue: `${Math.round(humidity.value)}%`,
      status: 'Normal',
      color: '#2b74d6',
      accent: 'blue',
      range: 'Range: 0% - 100%',
      rawValue: '-',
      updated: formatRelativeTime(humidity.timestamp),
    },
  ];
}

function App() {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(() => findSessionUser());
  const [activePage, setActivePage] = useState<Page>('Dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [readings, setReadings] = useState<SensorReading[]>([]);
  const [pumpStatus, setPumpStatus] = useState<PumpStatus>(emptyPumpStatus);
  const [recommendations, setRecommendations] = useState<CropRecommendation[]>([]);
  const [irrigationAdvice, setIrrigationAdvice] = useState<IrrigationAdvice>(emptyIrrigationAdvice);
  const [alerts, setAlerts] = useState<AlertNotification[]>([]);
  const [settings, setSettings] = useState<SystemSettings>(emptySettings);
  const [calibration, setCalibration] = useState<Calibration>(emptyCalibration);
  const [history, setHistory] = useState<HistoricalData[]>([]);
  const [toast, setToast] = useState('');
  const [dataStatus, setDataStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  const metrics = useMemo(() => buildMetrics(readings), [readings]);
  const topRecommendation = recommendations[0] || emptyRecommendation;

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 2600);
  }, []);

  const refreshData = useCallback(async (options: DataRefreshOptions = {}) => {
    if (options.showLoading !== false) {
      setDataStatus('loading');
    }
    const [
      sensorData,
      pumpData,
      recommendationData,
      irrigationAdviceData,
      alertData,
      settingsData,
      calibrationData,
      historyData,
    ] = await Promise.all([
      apiService.getSensorReadings(),
      apiService.getPumpStatus(),
      apiService.getCropRecommendations(),
      apiService.getIrrigationAdvice(),
      apiService.getAlerts(),
      apiService.getSystemSettings(),
      apiService.getSensorCalibration(),
      apiService.getHistoricalData(7),
    ]);

    setReadings(sensorData);
    setPumpStatus(pumpData);
    setRecommendations(recommendationData);
    setIrrigationAdvice(irrigationAdviceData);
    setAlerts(alertData);
    setSettings(settingsData);
    setCalibration(calibrationData);
    setHistory(historyData);
    setDataStatus('ready');
  }, []);

  useEffect(() => {
    refreshData().catch(() => {
      setDataStatus('error');
      showToast('Backend database connection failed');
    });
  }, [refreshData, showToast]);

  useEffect(() => {
    if (!currentUser || dataStatus !== 'ready') return undefined;

    const interval = window.setInterval(() => {
      refreshData({ showLoading: false }).catch(() => {
        setDataStatus('error');
      });
    }, 5000);

    return () => window.clearInterval(interval);
  }, [currentUser, dataStatus, refreshData]);

  const handlePageChange = (page: Page) => {
    setActivePage(page);
    setSidebarOpen(false);
  };

  const handleTogglePump = async (on: boolean) => {
    const updatedPump = await apiService.togglePump(on);
    setPumpStatus(updatedPump);
    showToast(on ? 'Pump started' : 'Pump stopped');
  };

  const handleModeChange = async (mode: PumpMode) => {
    const updatedPump = await apiService.setPumpMode(mode);
    setPumpStatus(updatedPump);
    setSettings((current) => ({ ...current, autoMode: mode === 'automatic' }));
    showToast(`${mode === 'automatic' ? 'Automatic' : 'Manual'} mode enabled`);
  };

  const handleSettingsUpdate = async (updates: Partial<SystemSettings>) => {
    const updatedSettings = await apiService.updateSystemSettings(updates);
    setSettings(updatedSettings);
    showToast('Settings saved');
  };

  const handleCalibrationSave = async (nextCalibration: Calibration) => {
    const saved = await apiService.updateSensorCalibration(nextCalibration);
    setCalibration(saved);
    showToast('Calibration saved');
  };

  const handleMarkAlertRead = async (alertId: string) => {
    setAlerts((current) => current.map((alert) => (alert.id === alertId ? { ...alert, isRead: true } : alert)));
    await apiService.markAlertAsRead(alertId).catch(() => undefined);
  };

  const handleMarkAllAlertsRead = async () => {
    const unread = alerts.filter((alert) => !alert.isRead);
    setAlerts((current) => current.map((alert) => ({ ...alert, isRead: true })));
    await Promise.all(unread.map((alert) => apiService.markAlertAsRead(alert.id).catch(() => undefined)));
    showToast('All alerts marked as read');
  };

  const handleAuthSuccess = (user: AuthUser) => {
    localStorage.setItem(sessionStorageKey, user.email);
    setCurrentUser(user);
    setActivePage('Dashboard');
    showToast(`Welcome, ${user.name}`);
  };

  const handleLogout = () => {
    localStorage.removeItem(sessionStorageKey);
    setCurrentUser(null);
    setSidebarOpen(false);
  };

  if (!currentUser) {
    return <AuthScreen onAuthSuccess={handleAuthSuccess} />;
  }

  if (dataStatus !== 'ready') {
    return <DataGate status={dataStatus} onRetry={() => refreshData().catch(() => setDataStatus('error'))} />;
  }

  return (
    <div className="app-shell">
      <div className="screen-title">{pageTitles[activePage]}</div>
      <div className="workspace">
        <button className="mobile-menu" type="button" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
          <Menu size={18} />
        </button>
        <Sidebar
          activePage={activePage}
          open={sidebarOpen}
          onNavigate={handlePageChange}
          onClose={() => setSidebarOpen(false)}
          onLogout={handleLogout}
        />
        <main className="page-area">
          {activePage === 'Dashboard' && (
            <DashboardPage
              userName={currentUser.name}
              metrics={metrics}
              readings={readings}
              pumpStatus={pumpStatus}
              recommendation={topRecommendation}
              irrigationAdvice={irrigationAdvice}
              settings={settings}
              onNavigate={handlePageChange}
              onTogglePump={handleTogglePump}
            />
          )}
          {activePage === 'Sensors' && (
            <SensorsPage
              metrics={metrics}
              readings={readings}
              calibration={calibration}
              onSaveCalibration={handleCalibrationSave}
            />
          )}
          {activePage === 'Irrigation Control' && (
            <IrrigationPage
              pumpStatus={pumpStatus}
              irrigationAdvice={irrigationAdvice}
              onTogglePump={handleTogglePump}
              onModeChange={handleModeChange}
            />
          )}
          {activePage === 'AI Recommendations' && (
            <RecommendationsPage recommendation={topRecommendation} metrics={metrics} irrigationAdvice={irrigationAdvice} settings={settings} />
          )}
          {activePage === 'Analytics' && <AnalyticsPage history={history} settings={settings} />}
          {activePage === 'Alerts' && (
            <AlertsPage alerts={alerts} onMarkRead={handleMarkAlertRead} onMarkAllRead={handleMarkAllAlertsRead} />
          )}
          {activePage === 'Settings' && (
            <SettingsPage settings={settings} onSettingsUpdate={handleSettingsUpdate} onRestart={() => showToast('Device restart command sent')} />
          )}
          <SystemStatusFooter settings={settings} pumpStatus={pumpStatus} />
        </main>
      </div>
      {toast && (
        <div className="toast-message" role="status">
          <CheckCircle2 size={16} />
          {toast}
        </div>
      )}
    </div>
  );
}

function Sidebar({
  activePage,
  open,
  onNavigate,
  onClose,
  onLogout,
}: {
  activePage: Page;
  open: boolean;
  onNavigate: (page: Page) => void;
  onClose: () => void;
  onLogout: () => void;
}) {
  return (
    <>
      <aside className={classNames('sidebar', open && 'sidebar-open')}>
        <div className="brand-row">
          <Leaf size={20} />
          <span>AgriSmart</span>
          <button className="sidebar-close" type="button" onClick={onClose} aria-label="Close menu">
            <X size={16} />
          </button>
        </div>
        <nav className="nav-list">
          {navItems.map(({ page, icon: Icon }) => (
            <button
              className={classNames('nav-button', activePage === page && 'nav-button-active')}
              key={page}
              type="button"
              onClick={() => onNavigate(page)}
            >
              <Icon size={16} />
              <span>{page}</span>
            </button>
          ))}
        </nav>
        <button className="logout-button" type="button" onClick={onLogout}>
          <LogOut size={16} />
          <span>Logout</span>
        </button>
      </aside>
      {open && <button className="backdrop" type="button" aria-label="Close menu overlay" onClick={onClose} />}
    </>
  );
}

function AuthScreen({ onAuthSuccess }: { onAuthSuccess: (user: AuthUser) => void }) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('demo@agrismart.local');
  const [password, setPassword] = useState('demo123');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState('');

  const isCreate = mode === 'create';

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setMessage('');
    if (nextMode === 'login') {
      setEmail('demo@agrismart.local');
      setPassword('demo123');
      setConfirmPassword('');
    } else {
      setEmail('');
      setPassword('');
      setConfirmPassword('');
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedName = name.trim();
    const users = readStoredUsers();

    if (!trimmedEmail || !password) {
      setMessage('Enter your email and password.');
      return;
    }

    if (isCreate) {
      if (!trimmedName) {
        setMessage('Enter your name.');
        return;
      }

      if (password.length < 6) {
        setMessage('Password must be at least 6 characters.');
        return;
      }

      if (password !== confirmPassword) {
        setMessage('Passwords do not match.');
        return;
      }

      if (users.some((user) => user.email === trimmedEmail)) {
        setMessage('An account already exists for this email.');
        return;
      }

      const newUser = { name: trimmedName, email: trimmedEmail, password };
      writeStoredUsers([...users, newUser]);
      onAuthSuccess(newUser);
      return;
    }

    const user = users.find((item) => item.email === trimmedEmail && item.password === password);
    if (!user) {
      setMessage('Invalid email or password.');
      return;
    }

    onAuthSuccess(user);
  };

  return (
    <main className="auth-shell">
      <section className="auth-visual">
        <div className="auth-brand">
          <Leaf size={26} />
          <span>AgriSmart</span>
        </div>
        <div className="auth-orbit">
          <span />
          <span />
          <span />
        </div>
        <div className="auth-copy">
          <p>AI-Powered Smart Irrigation</p>
          <h1>Monitor your field, control water, and choose the right crop.</h1>
        </div>
      </section>

      <section className="auth-panel-wrap">
        <form className="auth-card" onSubmit={handleSubmit}>
          <div className="auth-tabs">
            <button className={mode === 'login' ? 'active' : ''} type="button" onClick={() => switchMode('login')}>
              Login
            </button>
            <button className={mode === 'create' ? 'active' : ''} type="button" onClick={() => switchMode('create')}>
              Create Account
            </button>
          </div>

          <div className="auth-heading">
            <div className="auth-icon">{isCreate ? <UserPlus size={22} /> : <Lock size={22} />}</div>
            <div>
              <h1>{isCreate ? 'Create your account' : 'Welcome back'}</h1>
              <p>{isCreate ? 'Set up access for your AgriSmart dashboard.' : 'Use your account or the demo login.'}</p>
            </div>
          </div>

          {isCreate && (
            <label className="auth-field">
              <span>Name</span>
              <div>
                <UserPlus size={17} />
                <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" />
              </div>
            </label>
          )}

          <label className="auth-field">
            <span>Email</span>
            <div>
              <Mail size={17} />
              <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" type="email" />
            </div>
          </label>

          <label className="auth-field">
            <span>Password</span>
            <div>
              <Lock size={17} />
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Password"
                type={showPassword ? 'text' : 'password'}
              />
              <button className="password-toggle" type="button" onClick={() => setShowPassword((current) => !current)} aria-label="Toggle password">
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </label>

          {isCreate && (
            <label className="auth-field">
              <span>Confirm Password</span>
              <div>
                <Lock size={17} />
                <input
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Confirm password"
                  type={showPassword ? 'text' : 'password'}
                />
              </div>
            </label>
          )}

          {message && <p className="auth-message">{message}</p>}

          <button className="auth-submit" type="submit">
            {isCreate ? 'Create Account' : 'Login'}
          </button>

          {!isCreate && (
            <p className="demo-hint">
              Demo: <strong>demo@agrismart.local</strong> / <strong>demo123</strong>
            </p>
          )}
        </form>
      </section>
    </main>
  );
}

function DataGate({ status, onRetry }: { status: 'loading' | 'error'; onRetry: () => Promise<void> }) {
  const [isRetrying, setIsRetrying] = useState(false);

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      await onRetry();
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <main className="data-gate">
      <div className="data-gate-card">
        <Leaf size={30} />
        <h1>{status === 'loading' ? 'Connecting to database' : 'Database connection needed'}</h1>
        <p>
          {status === 'loading'
            ? 'Loading live AgriSmart data from the backend.'
            : 'Start XAMPP MySQL and the backend, then retry.'}
        </p>
        {status === 'error' && (
          <button className="auth-submit" type="button" onClick={handleRetry} disabled={isRetrying}>
            {isRetrying ? 'Retrying...' : 'Retry Connection'}
          </button>
        )}
      </div>
    </main>
  );
}

function DashboardPage({
  userName,
  metrics,
  readings,
  pumpStatus,
  recommendation,
  irrigationAdvice,
  settings,
  onNavigate,
  onTogglePump,
}: {
  userName: string;
  metrics: SensorMetric[];
  readings: SensorReading[];
  pumpStatus: PumpStatus;
  recommendation: CropRecommendation;
  irrigationAdvice: IrrigationAdvice;
  settings: SystemSettings;
  onNavigate: (page: Page) => void;
  onTogglePump: (on: boolean) => void;
}) {
  const [liveRange, setLiveRange] = useState('24H');
  const soil = metrics[0];
  const temp = metrics[1];
  const humidity = metrics[2];
  const canApplyAdvice = irrigationAdvice.command !== 'standby';

  return (
    <section className="page dashboard-page">
      <header className="page-header dashboard-header">
        <div>
          <h1>Welcome, {userName}</h1>
          <p>Here's what's happening in your farm today.</p>
        </div>
        <div className="weather-chip">
          <Sun size={22} />
          <div>
            <strong>{irrigationAdvice.weather.temperature}&deg;C</strong>
            <span>{settings.location}</span>
          </div>
        </div>
      </header>

      <div className="metric-grid">
        <MetricCard title={soil.title} value={soil.displayValue} foot={soil.status} tone="red" icon={<Droplets size={22} />} />
        <MetricCard title={temp.title} value={temp.displayValue} foot="" tone="dark" icon={<Thermometer size={22} />} />
        <MetricCard title={humidity.title} value={humidity.displayValue} foot="" tone="dark" icon={<Waves size={22} />} />
        <MetricCard
          title="Pump Status"
          value={pumpStatus.isRunning ? 'ON' : 'OFF'}
          foot={pumpStatus.isRunning ? 'Running' : 'Stopped'}
          tone="green"
          icon={<Battery size={22} />}
        />
      </div>

      <Panel className="live-panel">
        <div className="panel-title-row">
          <h2>Live Overview</h2>
          <div className="range-pills">
            {['1H', '6H', '24H', '7D'].map((range) => (
              <button className={range === liveRange ? 'pill active' : 'pill'} key={range} type="button" onClick={() => setLiveRange(range)}>
                {range}
              </button>
            ))}
          </div>
        </div>
        <LiveLineChart height={240} readings={readings} />
      </Panel>

      <div className="dashboard-action-grid">
        <Panel>
          <h2>AI Recommendation</h2>
          <p className="small-label">Best Crop</p>
          <div className="crop-title-row">
            <strong>{recommendation.name}</strong>
            <Sprout size={22} className="green-icon" />
          </div>
          <p className="confidence-copy">Confidence: {recommendation.confidence}%</p>
          <button className="outline-danger-button" type="button" onClick={() => onNavigate('AI Recommendations')}>
            View Details
          </button>
        </Panel>
        <Panel className="next-action-panel">
          <h2>Next Action</h2>
          <strong>{irrigationAdvice.label}</strong>
          <p>
            {irrigationAdvice.durationMinutes > 0
              ? `Duration: ${irrigationAdvice.durationMinutes} minutes`
              : irrigationAdvice.reason}
          </p>
          <button
            className="primary-green-button"
            type="button"
            disabled={!canApplyAdvice}
            onClick={() => onTogglePump(irrigationAdvice.command === 'start_pump')}
          >
            <Play size={14} />
            {canApplyAdvice ? 'Apply AI Action' : 'No Action Needed'}
          </button>
        </Panel>
      </div>

    </section>
  );
}

function SensorsPage({
  metrics,
  readings,
  calibration,
  onSaveCalibration,
}: {
  metrics: SensorMetric[];
  readings: SensorReading[];
  calibration: Calibration;
  onSaveCalibration: (calibration: Calibration) => void;
}) {
  const [activeTab, setActiveTab] = useState<'Overview' | 'Charts' | 'Calibration'>('Overview');
  const [dryThreshold, setDryThreshold] = useState(calibration.soilThreshold.dry);
  const [wetThreshold, setWetThreshold] = useState(calibration.soilThreshold.wet);

  useEffect(() => {
    setDryThreshold(calibration.soilThreshold.dry);
    setWetThreshold(calibration.soilThreshold.wet);
  }, [calibration]);

  return (
    <section className="page">
      <PageIntro title="Sensors" subtitle="Real-time sensor readings from your field." />
      <SegmentedTabs tabs={['Overview', 'Charts', 'Calibration']} active={activeTab} onChange={(tab) => setActiveTab(tab as typeof activeTab)} />

      {activeTab === 'Overview' && (
        <>
          <div className="sensor-gauge-grid">
            {metrics.map((metric) => (
              <Panel className="gauge-card" key={metric.type}>
                <h2>{metric.title}</h2>
                <GaugeMeter value={metric.value} display={metric.displayValue} color={metric.color} />
                <p className="metric-status">{metric.status}</p>
                <p className="muted-text">{metric.range}</p>
              </Panel>
            ))}
          </div>
          <SensorReadingsPanel metrics={metrics} />
          <CalibrationPanel
            dryThreshold={dryThreshold}
            wetThreshold={wetThreshold}
            onDryChange={setDryThreshold}
            onWetChange={setWetThreshold}
            onSave={() => onSaveCalibration({ soilThreshold: { dry: dryThreshold, wet: wetThreshold } })}
          />
        </>
      )}

      {activeTab === 'Charts' && (
        <Panel>
          <div className="panel-title-row">
            <h2>Sensor Trends</h2>
            <span className="muted-text">Live sample history</span>
          </div>
          <LiveLineChart height={330} readings={readings} />
        </Panel>
      )}

      {activeTab === 'Calibration' && (
        <div className="settings-grid">
          <CalibrationPanel
            dryThreshold={dryThreshold}
            wetThreshold={wetThreshold}
            onDryChange={setDryThreshold}
            onWetChange={setWetThreshold}
            onSave={() => onSaveCalibration({ soilThreshold: { dry: dryThreshold, wet: wetThreshold } })}
          />
          <Panel>
            <h2>Recent Samples</h2>
            <div className="sample-list">
              {readings.slice(-6).reverse().map((reading) => (
                <div className="sample-row" key={reading.id}>
                  <span>{sensorLabel(reading.type)}</span>
                  <strong>{reading.type === 'temperature' ? formatTemperature(reading.value) : `${reading.value}%`}</strong>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      )}
    </section>
  );
}

function IrrigationPage({
  pumpStatus,
  irrigationAdvice,
  onTogglePump,
  onModeChange,
}: {
  pumpStatus: PumpStatus;
  irrigationAdvice: IrrigationAdvice;
  onTogglePump: (on: boolean) => void;
  onModeChange: (mode: PumpMode) => void;
}) {
  const canApplyAdvice = irrigationAdvice.command !== 'standby';

  return (
    <section className="page">
      <PageIntro title="Irrigation Control" subtitle="Manage your irrigation system." />

      <Panel>
        <div className="irrigation-control-card">
          <div>
            <h2>Pump Control</h2>
            <p className="small-label">Current Status</p>
            <strong className={pumpStatus.isRunning ? 'pump-state on' : 'pump-state off'}>{pumpStatus.isRunning ? 'ON' : 'OFF'}</strong>
            <p>{pumpStatus.isRunning ? 'Running' : 'Stopped'}</p>
          </div>
          <div className="vertical-divider" />
          <div className="pump-button-stack">
            <button className="danger-button" type="button" onClick={() => onTogglePump(false)}>
              <ShieldAlert size={16} />
              Stop Pump
            </button>
            <button className="plain-button" type="button" onClick={() => onTogglePump(true)}>
              <Play size={16} />
              Start Pump
            </button>
          </div>
        </div>
      </Panel>

      <Panel>
        <h2>Mode</h2>
        <div className="mode-grid">
          <button
            className={classNames('mode-card', pumpStatus.mode === 'automatic' && 'mode-card-active')}
            type="button"
            onClick={() => onModeChange('automatic')}
          >
            <span className="radio-dot" />
            <div>
              <strong>Automatic Mode</strong>
              <p>AI controls irrigation using weather and live sensor readings.</p>
            </div>
          </button>
          <button
            className={classNames('mode-card', pumpStatus.mode === 'manual' && 'mode-card-active')}
            type="button"
            onClick={() => onModeChange('manual')}
          >
            <span className="radio-dot" />
            <div>
              <strong>Manual Mode</strong>
              <p>Manual override for maintenance and emergency control.</p>
            </div>
          </button>
        </div>
      </Panel>

      <Panel>
        <h2>AI Irrigation Decision</h2>
        <div className="advice-card">
          <Droplets size={32} />
          <div>
            <strong>{irrigationAdvice.label}</strong>
            <p>{irrigationAdvice.reason}</p>
            <p>
              Duration: {irrigationAdvice.durationMinutes} minutes. AI threshold: {irrigationAdvice.effectiveThreshold}%.
            </p>
            <button
              className="primary-green-button ai-action-button"
              type="button"
              disabled={!canApplyAdvice}
              onClick={() => onTogglePump(irrigationAdvice.command === 'start_pump')}
            >
              <Play size={14} />
              {canApplyAdvice ? 'Apply AI Action' : 'No Action Needed'}
            </button>
          </div>
        </div>
      </Panel>
    </section>
  );
}

function RecommendationsPage({
  recommendation,
  metrics,
  irrigationAdvice,
  settings,
}: {
  recommendation: CropRecommendation;
  metrics: SensorMetric[];
  irrigationAdvice: IrrigationAdvice;
  settings: SystemSettings;
}) {
  const [activeTab, setActiveTab] = useState<'Crop Recommendation' | 'Irrigation Advice' | 'Fertilizer Advice'>('Crop Recommendation');
  const soil = metrics[0];
  const temp = metrics[1];
  const humidity = metrics[2];

  return (
    <section className="page">
      <PageIntro title="AI Recommendations" subtitle="Smart insights for better farming." />
      <SegmentedTabs
        tabs={['Crop Recommendation', 'Irrigation Advice', 'Fertilizer Advice']}
        active={activeTab}
        onChange={(tab) => setActiveTab(tab as typeof activeTab)}
      />

      {activeTab === 'Crop Recommendation' && (
        <>
          <Panel className="crop-recommendation-card">
            <div>
              <p className="small-label">Recommended Crop</p>
              <div className="recommendation-name">
                <strong>{recommendation.name}</strong>
                <Sprout size={28} className="green-icon" />
              </div>
              <span className="match-badge">Best Match</span>
              <p className="small-label confidence-label">Confidence</p>
              <strong className="confidence-large">{recommendation.confidence}%</strong>
              <div className="progress-track">
                <span style={{ width: `${recommendation.confidence}%` }} />
              </div>
            </div>
            <CropArtwork />
          </Panel>

          <Panel>
            <h2>Why this crop?</h2>
            <CheckList
              items={[
                recommendation.reason,
                `Suitable for current soil moisture (${Math.round(soil.value)}%)`,
                `Weather: ${irrigationAdvice.weather.condition}, ${irrigationAdvice.weather.rainChance}% rain chance`,
                `Good fit for ${settings.location} and ${recommendation.inputs?.season || irrigationAdvice.weather.season} season`,
                'High yield potential',
              ]}
            />
          </Panel>

          <Panel>
            <h2>Inputs Used</h2>
            <div className="input-grid">
              <InputStat label="Soil Moisture" value={soil.displayValue} />
              <InputStat label="Temperature" value={temp.displayValue} />
              <InputStat label="Humidity" value={humidity.displayValue} />
              <InputStat label="Season" value={recommendation.inputs?.season || irrigationAdvice.weather.season} />
              <InputStat label="Location" value={settings.location} />
              <InputStat label="Timezone" value={settings.timezone || irrigationAdvice.weather.timezone} />
              <InputStat label="Rain Chance" value={`${irrigationAdvice.weather.rainChance}%`} />
              <InputStat label="Evaporation" value={irrigationAdvice.weather.evaporationRisk} />
            </div>
          </Panel>
        </>
      )}

      {activeTab === 'Irrigation Advice' && (
        <Panel>
          <h2>Irrigation Advice</h2>
          <div className="advice-card">
            <Droplets size={32} />
            <div>
              <strong>{irrigationAdvice.label}</strong>
              <p>{irrigationAdvice.reason}</p>
              <p>
                Duration: {irrigationAdvice.durationMinutes} minutes. AI threshold: {irrigationAdvice.effectiveThreshold}%.
              </p>
            </div>
          </div>
        </Panel>
      )}

      {activeTab === 'Fertilizer Advice' && (
        <Panel>
          <h2>Fertilizer Advice</h2>
          <CheckList
            items={[
              'Apply nitrogen-rich fertilizer during early vegetative growth.',
              'Keep fertilizer away from direct seed contact.',
              'Recheck soil moisture before application.',
            ]}
          />
        </Panel>
      )}
    </section>
  );
}

function AnalyticsPage({ history, settings }: { history: HistoricalData[]; settings: SystemSettings }) {
  const [range, setRange] = useState('24H');

  return (
    <section className="page analytics-page">
      <div className="page-header analytics-header">
        <div>
          <h1>Analytics</h1>
          <p>Historical data and insights.</p>
        </div>
        <div className="range-pills">
          {['24H', '7D', '30D', '90D'].map((item) => (
            <button className={item === range ? 'pill active' : 'pill'} key={item} type="button" onClick={() => setRange(item)}>
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="analytics-grid">
        <ChartPanel title="Soil Moisture (%)" color="#ef2f34" dataKey="soilMoisture" history={history} />
        <ChartPanel title="Temperature (C)" color="#20252b" dataKey="temperature" history={history} />
        <ChartPanel title="Humidity (%)" color="#2b74d6" dataKey="humidity" history={history} />
        <Panel>
          <h2>Pump Usage (Minutes)</h2>
          <ResponsiveContainer width="100%" height={210}>
            <BarChart data={history}>
              <CartesianGrid stroke="#edf0f4" vertical={false} />
              <XAxis dataKey="date" tickLine={false} axisLine={false} fontSize={11} />
              <YAxis tickLine={false} axisLine={false} fontSize={11} />
              <Tooltip />
              <Bar dataKey="pumpUsage" fill="#20994a" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      <Panel>
        <h2>Insights</h2>
        <div className="insight-grid">
          <InsightCard tone="blue" icon={<Gauge size={18} />} title="Soil dries fastest" text="between 12PM - 4PM." />
          <InsightCard tone="purple" icon={<Droplets size={18} />} title="You used 12% more" text="water this week." />
          <InsightCard tone="green" icon={<CheckCircle2 size={18} />} title="Best irrigation time" text="is early morning." />
          <InsightCard
            tone="red"
            icon={<AlertTriangle size={18} />}
            title={settings.irrigationThreshold > 25 ? 'Soil moisture is low' : 'Soil is stable'}
            text="consider watering."
          />
        </div>
      </Panel>
    </section>
  );
}

function AlertsPage({
  alerts,
  onMarkRead,
  onMarkAllRead,
}: {
  alerts: AlertNotification[];
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
}) {
  const [filter, setFilter] = useState<'All' | 'Critical' | 'Warning' | 'Info'>('All');
  const visibleAlerts = alerts.filter((alert) => filter === 'All' || alert.type === filter.toLowerCase());

  return (
    <section className="page alerts-page">
      <PageIntro title="Alerts" subtitle="Important notifications and system alerts." />
      <div className="alert-toolbar">
        <div className="range-pills">
          {(['All', 'Critical', 'Warning', 'Info'] as const).map((item) => (
            <button className={item === filter ? 'pill active' : 'pill'} key={item} type="button" onClick={() => setFilter(item)}>
              {item}
            </button>
          ))}
        </div>
        <button className="plain-button" type="button" onClick={onMarkAllRead}>
          Mark all as read
        </button>
      </div>

      <Panel className="alert-list-panel">
        {visibleAlerts.map((alert) => (
          <button
            className={classNames('alert-row', !alert.isRead && 'alert-row-unread')}
            key={alert.id}
            type="button"
            onClick={() => onMarkRead(alert.id)}
          >
            <AlertIcon type={alert.type} />
            <div>
              <strong>{alert.title}</strong>
              <p>{alert.message}</p>
            </div>
            <div className="alert-time">
              <span>{formatRelativeTime(alert.timestamp)}</span>
              {alert.isRead ? <Check size={18} className="green-icon" /> : <em>New</em>}
            </div>
          </button>
        ))}
      </Panel>
    </section>
  );
}

function SettingsPage({
  settings,
  onSettingsUpdate,
  onRestart,
}: {
  settings: SystemSettings;
  onSettingsUpdate: (settings: Partial<SystemSettings>) => void;
  onRestart: () => void;
}) {
  const [activeTab, setActiveTab] = useState<'General' | 'Network' | 'AI Settings' | 'Notifications' | 'Profile'>('General');
  const [deviceName, setDeviceName] = useState(settings.deviceName);
  const [location, setLocation] = useState(settings.location);
  const [aiConfidence, setAiConfidence] = useState(75);
  const [criticalAlerts, setCriticalAlerts] = useState(true);
  const [irrigationAlerts, setIrrigationAlerts] = useState(true);

  useEffect(() => {
    setDeviceName(settings.deviceName);
    setLocation(settings.location);
  }, [settings.deviceName, settings.location]);

  return (
    <section className="page settings-page">
      <PageIntro title="Settings" subtitle="Configure your system." />
      <SegmentedTabs
        tabs={['General', 'Network', 'AI Settings', 'Notifications', 'Profile']}
        active={activeTab}
        onChange={(tab) => setActiveTab(tab as typeof activeTab)}
      />

      {activeTab === 'General' && (
        <div className="settings-grid">
          <Panel>
            <h2>System Information</h2>
            <InfoField label="Device Name" value={deviceName} onChange={setDeviceName} />
            <InfoField label="Location" value={location} onChange={setLocation} />
            <ReadOnlyField label="Timezone" value={settings.timezone || 'Africa/Harare'} />
            <ReadOnlyField label="Unit System" value={`${settings.unitSystem || 'Metric'} (C, %, mm)`} />
            <button className="danger-button save-settings-button" type="button" onClick={() => onSettingsUpdate({ deviceName, location })}>
              <Save size={15} />
              Save Changes
            </button>
          </Panel>
          <Panel>
            <h2>Power & Battery</h2>
            <ReadOnlyField label="Battery Level" value={`${settings.batteryLevel}%`} />
            <div className="battery-track">
              <span style={{ width: `${settings.batteryLevel}%` }} />
            </div>
            <ReadOnlyField label="Voltage" value="3.98 V" />
            <ReadOnlyField label="Charging Status" value="Not Charging" />
            <ReadOnlyField label="Power Source" value="Battery" />
          </Panel>
          <Panel>
            <h2>About Device</h2>
            <ReadOnlyField label="Firmware Version" value={settings.firmwareVersion} />
            <ReadOnlyField label="Last Restart" value="2 days ago" />
            <ReadOnlyField label="Device Uptime" value={secondsToUptime(settings.uptime)} />
            <button className="outline-danger-button restart-button" type="button" onClick={onRestart}>
              Restart Device
            </button>
          </Panel>
        </div>
      )}

      {activeTab === 'Network' && (
        <Panel>
          <h2>Network</h2>
          <div className="settings-grid compact">
            <StatusMini icon={<Router size={22} />} label="Wi-Fi" value="Connected" />
            <StatusMini icon={<Wifi size={22} />} label="SSID" value="AgriSmart-Farm" />
            <StatusMini icon={<Zap size={22} />} label="Signal" value="Strong" />
          </div>
        </Panel>
      )}

      {activeTab === 'AI Settings' && (
        <Panel>
          <h2>AI Settings</h2>
          <SliderRow label="Recommendation confidence threshold:" value={aiConfidence} min={50} max={95} unit="%" onChange={setAiConfidence} />
          <CheckList items={['Use soil moisture in scoring', 'Use temperature and humidity', 'Prefer high yield crops']} />
        </Panel>
      )}

      {activeTab === 'Notifications' && (
        <Panel>
          <h2>Notifications</h2>
          <div className="notification-row">
            <span>Critical alerts</span>
            <Switch checked={criticalAlerts} onChange={setCriticalAlerts} />
          </div>
          <div className="notification-row">
            <span>Irrigation completed</span>
            <Switch checked={irrigationAlerts} onChange={setIrrigationAlerts} />
          </div>
        </Panel>
      )}

      {activeTab === 'Profile' && (
        <Panel>
          <h2>Profile</h2>
          <ReadOnlyField label="Owner" value="Tendai" />
          <ReadOnlyField label="Farm" value="Harare Smart Field" />
          <ReadOnlyField label="Role" value="Administrator" />
        </Panel>
      )}
    </section>
  );
}

function SystemStatusFooter({ settings, pumpStatus }: { settings: SystemSettings; pumpStatus: PumpStatus }) {
  return (
    <footer className="system-footer">
      <div className="system-footer-title">
        <span className="status-dot" />
        <div>
          <strong>System Status</strong>
          <p>Live device connection and power overview</p>
        </div>
      </div>
      <div className="system-footer-grid">
        <StatusMini icon={<Wifi size={22} />} label="Wi-Fi" value="Connected" />
        <StatusMini icon={<Battery size={22} />} label="Battery" value={`${settings.batteryLevel}%`} />
        <StatusMini icon={<RefreshCw size={22} />} label="Last Update" value="2 min ago" />
        <StatusMini icon={<Settings size={22} />} label="Mode" value={pumpStatus.mode === 'automatic' ? 'Automatic' : 'Manual'} />
      </div>
    </footer>
  );
}

function PageIntro({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
    </header>
  );
}

function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={classNames('panel', className)}>{children}</div>;
}

function MetricCard({
  title,
  value,
  foot,
  tone,
  icon,
}: {
  title: string;
  value: string;
  foot: string;
  tone: 'red' | 'green' | 'dark';
  icon: ReactNode;
}) {
  return (
    <Panel className="metric-card">
      <div className={`metric-icon metric-icon-${tone}`}>{icon}</div>
      <p>{title}</p>
      <strong className={`metric-value metric-value-${tone}`}>{value}</strong>
      {foot ? <span>{foot}</span> : <span>&nbsp;</span>}
    </Panel>
  );
}

function StatusMini({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="status-mini">
      {icon}
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function LiveLineChart({ height, readings }: { height: number; readings: SensorReading[] }) {
  const data = useMemo(() => buildLiveChartData(readings), [readings]);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 12, right: 20, left: -12, bottom: 0 }}>
        <CartesianGrid stroke="#edf0f4" vertical={false} />
        <XAxis dataKey="time" tickLine={false} axisLine={false} fontSize={11} />
        <YAxis tickLine={false} axisLine={false} fontSize={11} domain={[0, 100]} />
        <Tooltip />
        <Line type="monotone" dataKey="soilMoisture" name="Soil Moisture (%)" stroke="#ef2f34" strokeWidth={3} dot={false} />
        <Line type="monotone" dataKey="temperature" name="Temperature (C)" stroke="#1f252c" strokeWidth={3} dot={false} />
        <Line type="monotone" dataKey="humidity" name="Humidity (%)" stroke="#2b74d6" strokeWidth={3} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function GaugeMeter({ value, display, color }: { value: number; display: string; color: string }) {
  const normalized = Math.min(100, Math.max(0, value));
  return (
    <div className="gauge-meter" style={{ '--gauge-value': `${normalized * 1.8}deg`, '--gauge-color': color } as CSSProperties}>
      <div className="gauge-center">
        <strong>{display}</strong>
      </div>
    </div>
  );
}

function SensorReadingsPanel({ metrics }: { metrics: SensorMetric[] }) {
  return (
    <Panel>
      <h2>Sensor Readings</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Sensor</th>
              <th>Value</th>
              <th>Raw Value</th>
              <th>Status</th>
              <th>Last Updated</th>
            </tr>
          </thead>
          <tbody>
            {metrics.map((metric) => (
              <tr key={metric.type}>
                <td>{metric.title}</td>
                <td>{metric.displayValue}</td>
                <td>{metric.rawValue}</td>
                <td>
                  <span className="ok-badge">OK</span>
                </td>
                <td>{metric.updated}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function CalibrationPanel({
  dryThreshold,
  wetThreshold,
  onDryChange,
  onWetChange,
  onSave,
}: {
  dryThreshold: number;
  wetThreshold: number;
  onDryChange: (value: number) => void;
  onWetChange: (value: number) => void;
  onSave: () => void;
}) {
  return (
    <Panel>
      <h2>Calibration (Soil Moisture)</h2>
      <div className="calibration-grid">
        <SliderRow label="Dry Threshold" value={dryThreshold} min={0} max={50} unit="%" onChange={onDryChange} />
        <SliderRow label="Wet Threshold" value={wetThreshold} min={50} max={100} unit="%" onChange={onWetChange} />
      </div>
      <button className="danger-button save-calibration-button" type="button" onClick={onSave}>
        Save Changes
      </button>
    </Panel>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  unit,
  onChange,
  onCommit,
  step = 1,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  onChange: (value: number) => void;
  onCommit?: () => void;
  step?: number;
}) {
  return (
    <label className="slider-row">
      <span>{label}</span>
      <strong>
        {value}
        {unit}
      </strong>
      <input
        min={min}
        max={max}
        step={step}
        type="range"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        onMouseUp={onCommit}
        onTouchEnd={onCommit}
      />
    </label>
  );
}

function Switch({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <button className={classNames('switch', checked && 'switch-on')} type="button" onClick={() => onChange(!checked)}>
      <span />
    </button>
  );
}

function SegmentedTabs({ tabs, active, onChange }: { tabs: string[]; active: string; onChange: (tab: string) => void }) {
  return (
    <div className="segmented-tabs">
      {tabs.map((tab) => (
        <button className={tab === active ? 'tab-button active' : 'tab-button'} key={tab} type="button" onClick={() => onChange(tab)}>
          {tab}
        </button>
      ))}
    </div>
  );
}

function CropArtwork() {
  return (
    <div className="crop-artwork" aria-label="Maize crop artwork">
      <div className="crop-sky" />
      <div className="crop-field">
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}

function CheckList({ items }: { items: string[] }) {
  return (
    <div className="check-list">
      {items.map((item) => (
        <div className="check-item" key={item}>
          <Check size={16} />
          <span>{item}</span>
        </div>
      ))}
    </div>
  );
}

function InputStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="input-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ChartPanel({
  title,
  color,
  dataKey,
  history,
}: {
  title: string;
  color: string;
  dataKey: keyof HistoricalData;
  history: HistoricalData[];
}) {
  return (
    <Panel>
      <h2>{title}</h2>
      <ResponsiveContainer width="100%" height={210}>
        <LineChart data={history}>
          <CartesianGrid stroke="#edf0f4" vertical={false} />
          <XAxis dataKey="date" tickLine={false} axisLine={false} fontSize={11} />
          <YAxis tickLine={false} axisLine={false} fontSize={11} />
          <Tooltip />
          <Line type="monotone" dataKey={dataKey as string} stroke={color} strokeWidth={3} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </Panel>
  );
}

function InsightCard({ tone, icon, title, text }: { tone: string; icon: ReactNode; title: string; text: string }) {
  return (
    <div className={`insight-card insight-${tone}`}>
      {icon}
      <div>
        <strong>{title}</strong>
        <p>{text}</p>
      </div>
    </div>
  );
}

function AlertIcon({ type }: { type: AlertType }) {
  if (type === 'critical') {
    return <AlertTriangle className="alert-icon critical" size={26} />;
  }
  if (type === 'warning') {
    return <AlertTriangle className="alert-icon warning" size={26} />;
  }
  return <Info className="alert-icon info" size={26} />;
}

function InfoField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="info-field">
      <span>{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="read-only-field">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function sensorLabel(type: SensorType) {
  if (type === 'soil_moisture') return 'Soil Moisture';
  if (type === 'temperature') return 'Temperature';
  return 'Humidity';
}

export default App;
