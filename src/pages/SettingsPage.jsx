import { useState } from 'react';
import toast from 'react-hot-toast';
import {
  User, Server, Bell, Monitor, Save, RefreshCw, Wifi, Sun, Moon,
} from 'lucide-react';
import useAuthStore from '../store/authStore';
import useAppStore from '../store/appStore';

const STORAGE_KEY = 'dashboard_settings';
const DEFAULTS = {
  refreshInterval: 30,
  notifications: true,
  emailAlerts: true,
  pushAlerts: true,
  criticalOnly: false,
  autoRefresh: true,
};

export default function SettingsPage() {
  const { user } = useAuthStore();
  const { theme, setTheme, density, setDensity } = useAppStore();

  const serverUrl =
    import.meta.env.VITE_SMS_IOT_URL ||
    import.meta.env.VITE_OPENREMOTE_URL ||
    '';
  const realm =
    import.meta.env.VITE_SMS_IOT_REALM ||
    import.meta.env.VITE_OPENREMOTE_REALM ||
    'master';

  const [settings, setSettings] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) return { ...DEFAULTS, ...JSON.parse(stored) };
    } catch { /* noop */ }
    return { ...DEFAULTS };
  });

  const update = (k, v) => setSettings((s) => ({ ...s, [k]: v }));
  const save = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    toast.success('Settings saved');
  };
  const reset = () => {
    setSettings({ ...DEFAULTS });
    localStorage.removeItem(STORAGE_KEY);
    toast.success('Reset to defaults');
  };

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-[var(--color-ink-0)]">Settings</h1>
        <p className="text-sm text-[var(--color-ink-2)] mt-1">Preferences for your client portal.</p>
      </header>

      {/* Profile */}
      <section className="panel p-5 flex items-center gap-4">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
             style={{ background: 'linear-gradient(135deg, var(--color-accent-500), var(--color-brand-700))' }}>
          <User className="w-7 h-7 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold text-[var(--color-ink-0)]">
            {user?.name || user?.preferred_username || 'Client'}
          </h2>
          <p className="text-sm text-[var(--color-ink-2)] truncate">{user?.email || ''}</p>
          <p className="text-xs text-[var(--color-ink-3)] mt-0.5">Realm: {realm}</p>
        </div>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
              style={{
                background: 'color-mix(in srgb, var(--color-accent-500) 14%, transparent)',
                color: 'var(--color-accent-400)',
              }}>
          <Wifi className="w-3.5 h-3.5" />
          Connected
        </span>
      </section>

      {/* Theme */}
      <Section icon={Monitor} title="Appearance">
        <Row label="Theme">
          <div className="flex items-center gap-1 p-1 rounded-xl"
               style={{ background: 'color-mix(in srgb, var(--color-ink-0) 6%, transparent)' }}>
            <ThemeBtn active={theme === 'light'} onClick={() => setTheme('light')} icon={Sun} label="Light" />
            <ThemeBtn active={theme === 'dark'} onClick={() => setTheme('dark')} icon={Moon} label="Dark" />
          </div>
        </Row>
        <Toggle
          label="Compact view"
          value={density === 'compact'}
          onChange={(v) => setDensity(v ? 'compact' : 'comfortable')}
        />
      </Section>

      {/* Notifications */}
      <Section icon={Bell} title="Notifications">
        <Toggle label="Enable notifications" value={settings.notifications} onChange={(v) => update('notifications', v)} />
        <Toggle label="Email alerts" value={settings.emailAlerts} onChange={(v) => update('emailAlerts', v)} />
        <Toggle label="Push alerts" value={settings.pushAlerts} onChange={(v) => update('pushAlerts', v)} />
        <Toggle label="Critical only" value={settings.criticalOnly} onChange={(v) => update('criticalOnly', v)} />
      </Section>

      {/* Connection */}
      <Section icon={Server} title="Connection">
        <Row label="Server">
          <span className="text-sm text-[var(--color-ink-1)] truncate">{serverUrl}</span>
        </Row>
        <Row label="Realm">
          <span className="text-sm text-[var(--color-ink-1)]">{realm}</span>
        </Row>
        <Row label="Refresh interval (s)">
          <input
            type="number"
            min="5" max="300"
            value={settings.refreshInterval}
            onChange={(e) => update('refreshInterval', Number(e.target.value))}
            className="w-20 px-3 py-1.5 rounded-lg text-sm outline-none text-right"
            style={{
              background: 'var(--color-surface-0)',
              color: 'var(--color-ink-0)',
              border: '1px solid color-mix(in srgb, var(--color-ink-0) 8%, transparent)',
            }}
          />
        </Row>
      </Section>

      <div className="flex justify-end gap-2">
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm"
          style={{ color: 'var(--color-ink-2)' }}
        >
          <RefreshCw className="w-4 h-4" /> Reset
        </button>
        <button
          onClick={save}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white"
          style={{ background: 'var(--color-accent-500)' }}
        >
          <Save className="w-4 h-4" /> Save
        </button>
      </div>
    </div>
  );
}

function Section({ icon: Icon, title, children }) {
  return (
    <section className="panel p-5">
      <div className="flex items-center gap-2 mb-4">
        <Icon className="w-4 h-4 text-[var(--color-accent-400)]" />
        <h3 className="text-sm font-semibold text-[var(--color-ink-0)]">{title}</h3>
      </div>
      <div className="divide-y"
           style={{ borderColor: 'color-mix(in srgb, var(--color-ink-0) 6%, transparent)' }}>
        {children}
      </div>
    </section>
  );
}

function Row({ label, children }) {
  return (
    <div className="flex items-center justify-between py-3 first:pt-0 last:pb-0 gap-4">
      <span className="text-sm text-[var(--color-ink-1)]">{label}</span>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

function Toggle({ label, value, onChange }) {
  return (
    <Row label={label}>
      <button
        onClick={() => onChange(!value)}
        className={`toggle-track ${value ? 'toggle-track-on' : 'toggle-track-off'}`}
        aria-label={label}
      >
        <span className={`toggle-thumb ${value ? 'toggle-thumb-on' : 'toggle-thumb-off'}`} />
      </button>
    </Row>
  );
}

function ThemeBtn({ active, onClick, icon: Icon, label }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
        active ? 'text-[var(--color-accent-400)]' : 'text-[var(--color-ink-2)] hover:text-[var(--color-ink-0)]'
      }`}
      style={active ? { background: 'color-mix(in srgb, var(--color-accent-500) 14%, transparent)' } : {}}
    >
      <Icon className="w-3.5 h-3.5" /> {label}
    </button>
  );
}
