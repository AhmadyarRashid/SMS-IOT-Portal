import { useEffect, useMemo, useState } from 'react';
import { Link } from '@/lib/router-shim';
import { motion, AnimatePresence } from 'framer-motion';
import {
  User, Sun, Moon, Bell, Wifi, WifiOff, Download, Trash2, LogOut,
  ShieldCheck, Check, Sparkles, Rows3, Rows2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import useAuthStore from '../store/authStore';
import useAppStore from '../store/appStore';
import usePwaStore from '../store/pwaStore';
import { useAlarmNotifications, fireAlarmNotification } from '../hooks/useAlarmNotifications';
import { useAssets } from '../hooks/useAssets';
import { clearAllPrefs } from '../utils/prefs';
import { formatRelativeTime } from '../utils/helpers';
import './settings.css';

const APP_VERSION = '1.0.0';

export default function SettingsPage() {
  const { user, logout } = useAuthStore();
  const { theme, setTheme, density, setDensity } = useAppStore();
  const { dataUpdatedAt, isFetching } = useAssets({});

  const displayName = user?.name || user?.preferred_username || 'Client';
  const initials = displayName.slice(0, 2).toUpperCase();

  // Cadence ticker so "synced 4s ago" stays fresh without re-rendering the
  // whole subtree every second.
  const [, tick] = useState(0);
  useEffect(() => {
    const h = setInterval(() => tick((t) => t + 1), 3000);
    return () => clearInterval(h);
  }, []);

  return (
    <div className="settings-page p-4 md:p-6 max-w-3xl mx-auto space-y-5">
      {/* Hero profile card */}
      <ProfileHero
        name={displayName}
        email={user?.email || ''}
        initials={initials}
        connected={!!dataUpdatedAt}
        isFetching={isFetching}
      />

      {/* Appearance */}
      <SectionCard
        icon={Sparkles}
        title="Appearance"
        description="Tune how the portal looks and feels."
        tone="accent"
      >
        <Row label="Theme" hint="Dark is default. Light mode mirrors the same palette.">
          <ThemeSegmented theme={theme} onChange={setTheme} />
        </Row>
        <Row label="Density" hint="Compact tightens padding on every card for smaller screens.">
          <DensitySegmented density={density} onChange={setDensity} />
        </Row>
      </SectionCard>

      {/* Notifications */}
      <NotificationsSection />

      {/* Connection status */}
      <ConnectionSection
        lastSyncedAt={dataUpdatedAt}
        isFetching={isFetching}
      />

      {/* Install as app (conditional) */}
      <InstallSection />

      {/* Data & privacy */}
      <DataPrivacySection onSignOut={logout} />

      {/* About */}
      <AboutSection version={APP_VERSION} />
    </div>
  );
}

/* ==================================================================
   Profile hero
   ================================================================== */

function ProfileHero({ name, email, initials, connected, isFetching }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="st-hero"
    >
      <span className="st-hero-halo" aria-hidden="true" />
      <div className="relative z-[1] flex items-center gap-4 flex-wrap">
        <motion.div
          whileHover={{ rotate: [0, -4, 4, 0] }}
          transition={{ duration: 0.6 }}
          className="st-avatar"
        >
          {initials}
        </motion.div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-accent-400)] font-semibold">
            Signed in
          </p>
          <h1 className="text-[26px] font-bold leading-tight text-[var(--color-ink-0)] truncate mt-0.5">
            {name}
          </h1>
          <p className="text-[13px] text-[var(--color-ink-2)] truncate">{email || 'No email on record'}</p>
        </div>
        <div
          className={`st-status ${connected ? 'st-status-ok' : 'st-status-off'}`}
          title={isFetching ? 'Refreshing…' : 'Live'}
        >
          <span className={`st-status-dot ${isFetching ? 'pulse' : ''}`} />
          {connected ? 'Connected' : 'Offline'}
        </div>
      </div>
    </motion.div>
  );
}

/* ==================================================================
   Shared section shell
   ================================================================== */

function SectionCard({ icon: Icon, title, description, tone = 'accent', children, action }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ type: 'spring', stiffness: 260, damping: 24 }}
      className={`st-card st-card-${tone}`}
    >
      <header className="flex items-start gap-3 mb-4">
        <span className={`st-badge st-badge-${tone}`}>
          <Icon className="w-4 h-4" strokeWidth={1.75} />
        </span>
        <div className="flex-1 min-w-0">
          <h2 className="text-[15px] font-semibold text-[var(--color-ink-0)] leading-tight">
            {title}
          </h2>
          {description && (
            <p className="text-[12px] text-[var(--color-ink-2)] mt-0.5">{description}</p>
          )}
        </div>
        {action}
      </header>
      <div className="space-y-1">{children}</div>
    </motion.section>
  );
}

function Row({ label, hint, children }) {
  return (
    <div className="st-row">
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-[var(--color-ink-0)]">{label}</p>
        {hint && <p className="text-[11px] text-[var(--color-ink-3)] mt-0.5">{hint}</p>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

/* ==================================================================
   Appearance — theme + density segmented controls
   ================================================================== */

function ThemeSegmented({ theme, onChange }) {
  return (
    <div className="st-seg" role="group" aria-label="Theme">
      <SegBtn active={theme === 'light'} onClick={() => onChange('light')} icon={Sun} label="Light" />
      <SegBtn active={theme === 'dark'} onClick={() => onChange('dark')} icon={Moon} label="Dark" />
    </div>
  );
}

function DensitySegmented({ density, onChange }) {
  return (
    <div className="st-seg" role="group" aria-label="Density">
      <SegBtn active={density !== 'compact'} onClick={() => onChange('comfortable')} icon={Rows3} label="Comfortable" />
      <SegBtn active={density === 'compact'} onClick={() => onChange('compact')} icon={Rows2} label="Compact" />
    </div>
  );
}

function SegBtn({ active, onClick, icon: Icon, label }) {
  return (
    <button
      onClick={onClick}
      className={`st-seg-btn ${active ? 'st-seg-btn-active' : ''}`}
      aria-pressed={active}
    >
      <Icon className="w-3.5 h-3.5" strokeWidth={2} />
      <span>{label}</span>
    </button>
  );
}

/* ==================================================================
   Notifications — real browser alerts
   ================================================================== */

function NotificationsSection() {
  const { supported, permission, enabled, toggle } = useAlarmNotifications();
  const [busy, setBusy] = useState(false);

  const handle = async (next) => {
    setBusy(true);
    const res = await toggle(next);
    setBusy(false);
    if (!res.ok && next) {
      if (res.reason === 'denied') {
        toast.error('Alerts are blocked in your browser settings.');
      } else if (res.reason === 'unsupported') {
        toast.error('Your browser does not support notifications.');
      }
    } else if (res.ok && next) {
      toast.success('Alerts enabled — we\'ll nudge you when alarms fire.');
    } else if (!next) {
      toast('Alerts muted.', { icon: '🔕' });
    }
  };

  let status;
  if (!supported) status = { label: 'Not supported in this browser', tone: 'muted' };
  else if (permission === 'denied') status = { label: 'Blocked in browser settings', tone: 'danger' };
  else if (permission === 'granted' && enabled) status = { label: 'Live — you\'ll be notified', tone: 'ok' };
  else if (permission === 'granted') status = { label: 'Permission granted · not active', tone: 'muted' };
  else status = { label: 'Tap to allow notifications', tone: 'muted' };

  return (
    <SectionCard
      icon={Bell}
      title="Notifications"
      description="Hear from us only when it matters."
      tone="accent"
    >
      <Row
        label="Alert me about new alarms"
        hint="Fires a native notification when a new alarm is raised and this tab isn't in focus."
      >
        <SwitchWithStatus
          checked={enabled && permission === 'granted'}
          onChange={handle}
          disabled={busy || !supported || permission === 'denied'}
          status={status}
        />
      </Row>
      {permission === 'denied' && (
        <p className="st-hint">
          We cannot re-ask once your browser remembers your choice — visit the site's
          notification settings in your browser to unblock.
        </p>
      )}
      {permission === 'granted' && enabled && (
        <Row
          label="Send a test notification"
          hint="Confirms your OS is set to show notifications from this browser. Fires immediately, regardless of tab focus."
        >
          <button
            onClick={() => {
              fireAlarmNotification({
                title: '🚨 Test alarm · SMS IoT',
                body: 'Smoke sensor triggered · Head Office',
                tag: 'sms-iot-test',
                url: '/alarms',
                severity: 'CRITICAL',
                ignoreVisibility: true,
              });
              toast.success('Sent — check your Notification Center.');
            }}
            className="st-ghost-btn"
          >
            Send test
          </button>
        </Row>
      )}
    </SectionCard>
  );
}

function SwitchWithStatus({ checked, onChange, disabled, status }) {
  return (
    <div className="flex items-center gap-3">
      <span className={`st-pill st-pill-${status.tone}`}>{status.label}</span>
      <button
        onClick={() => !disabled && onChange(!checked)}
        className={`toggle-track ${checked ? 'toggle-track-on' : 'toggle-track-off'} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        aria-pressed={!!checked}
        disabled={disabled}
      >
        <span className={`toggle-thumb ${checked ? 'toggle-thumb-on' : 'toggle-thumb-off'}`} />
      </button>
    </div>
  );
}

/* ==================================================================
   Connection status — layman, with optional details
   ================================================================== */

function ConnectionSection({ lastSyncedAt, isFetching }) {
  const syncedLabel = useMemo(() => {
    if (!lastSyncedAt) return 'Never';
    return formatRelativeTime(lastSyncedAt);
  }, [lastSyncedAt]);

  const connected = !!lastSyncedAt;

  return (
    <SectionCard
      icon={connected ? Wifi : WifiOff}
      title="Connection"
      description={connected ? 'Live link to your SMS IoT service.' : 'Unable to reach the service.'}
      tone={connected ? 'ok' : 'warning'}
    >
      <div className="st-conn">
        <div className="flex items-center gap-2">
          <span className={`live-dot ${isFetching ? '' : 'live-dot-still'}`} />
          <p className="text-[14px] font-semibold text-[var(--color-ink-0)]">
            {connected ? 'Connected' : 'Offline'}
          </p>
        </div>
        <p className="text-[12px] text-[var(--color-ink-2)] mt-1">
          {isFetching
            ? 'Refreshing now…'
            : connected
              ? `Last synced ${syncedLabel}`
              : 'No data received yet.'}
        </p>
      </div>
    </SectionCard>
  );
}

/* ==================================================================
   Install as app
   ================================================================== */

function InstallSection() {
  const event = usePwaStore((s) => s.event);
  const installed = usePwaStore((s) => s.installed);
  const install = usePwaStore((s) => s.install);

  const isIOS = useMemo(() => /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream, []);

  if (installed) {
    return (
      <SectionCard icon={Check} title="Install as app" description="This app is already installed on this device." tone="ok">
        <p className="st-hint">Launch it from your home screen or dock.</p>
      </SectionCard>
    );
  }
  if (!event && !isIOS) return null;

  return (
    <SectionCard
      icon={Download}
      title="Install as app"
      description="Launch SMS IoT from your home screen — fullscreen, offline-ready."
      tone="accent"
    >
      {event ? (
        <button
          onClick={async () => {
            const r = await install();
            if (r.ok) toast.success('Installed — find it on your home screen.');
          }}
          className="st-primary-btn"
        >
          <Download className="w-4 h-4" />
          Install SMS IoT
        </button>
      ) : (
        <p className="st-hint">
          On iPhone or iPad: tap the <strong>Share</strong> button in Safari, then
          <strong> Add to Home Screen</strong>.
        </p>
      )}
    </SectionCard>
  );
}

/* ==================================================================
   Data & privacy
   ================================================================== */

function DataPrivacySection({ onSignOut }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const doClear = async () => {
    setBusy(true);
    await clearAllPrefs();
    setBusy(false);
    setConfirming(false);
    toast.success('Local preferences cleared.');
    // Give UI time to settle, then reload so tips / layouts re-seed.
    setTimeout(() => window.location.reload(), 400);
  };

  return (
    <SectionCard
      icon={ShieldCheck}
      title="Data & privacy"
      description="Your preferences live only in this browser. Nothing is synced to a server."
      tone="neutral"
    >
      <div className="st-row">
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-medium text-[var(--color-ink-0)]">Clear local data</p>
          <p className="text-[11px] text-[var(--color-ink-3)] mt-0.5">
            Wipes tips, tutorial progress, quick-access layout, and settings. You stay signed in.
          </p>
        </div>
        <AnimatePresence mode="wait" initial={false}>
          {confirming ? (
            <motion.div
              key="confirm"
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              className="flex items-center gap-2"
            >
              <button onClick={() => setConfirming(false)} className="st-ghost-btn">Cancel</button>
              <button onClick={doClear} disabled={busy} className="st-danger-btn">
                {busy ? 'Clearing…' : 'Yes, clear'}
              </button>
            </motion.div>
          ) : (
            <motion.button
              key="open"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setConfirming(true)}
              className="st-ghost-btn-danger"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear
            </motion.button>
          )}
        </AnimatePresence>
      </div>
      <div className="st-row">
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-medium text-[var(--color-ink-0)]">Sign out</p>
          <p className="text-[11px] text-[var(--color-ink-3)] mt-0.5">
            You'll need to sign in again to access the portal.
          </p>
        </div>
        <button onClick={onSignOut} className="st-ghost-btn-danger">
          <LogOut className="w-3.5 h-3.5" />
          Sign out
        </button>
      </div>
    </SectionCard>
  );
}

/* ==================================================================
   About
   ================================================================== */

function AboutSection({ version }) {
  return (
    <SectionCard
      icon={User}
      title="About"
      description="SMS IoT Client Portal — a minimal, playful monitor for everything that matters."
      tone="neutral"
    >
      <div className="st-row">
        <p className="text-[13px] text-[var(--color-ink-1)]">Version</p>
        <span className="st-pill st-pill-ok">v{version}</span>
      </div>
      <div className="st-row">
        <p className="text-[13px] text-[var(--color-ink-1)]">Need help?</p>
        <a
          href="mailto:support@smsiotpk.com"
          className="text-[12px] font-semibold text-[var(--color-accent-400)] hover:text-[var(--color-accent-300)]"
        >
          Email support →
        </a>
      </div>
      <div className="st-row">
        <p className="text-[13px] text-[var(--color-ink-1)]">Tour the app</p>
        <Link
          to="/tutorial"
          className="text-[12px] font-semibold text-[var(--color-accent-400)] hover:text-[var(--color-accent-300)]"
        >
          Open tutorial →
        </Link>
      </div>
    </SectionCard>
  );
}
