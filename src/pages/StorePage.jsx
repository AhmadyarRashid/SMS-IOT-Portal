import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import {
  ArrowLeft, Clock, Video, Bell, BellOff, Lock, LockOpen, Siren,
  Lightbulb, LightbulbOff, Activity, AlertTriangle, AlertCircle, Info,
  Check,
} from 'lucide-react';
import { formatDistanceToNowStrict, format } from 'date-fns';
import {
  useAssets, useAsset, useAlarms, useWriteAttribute, useUpdateAlarmStatus,
} from '../hooks/useAssets';
import {
  pickGatewayChildren, pickGateways, alarmBelongsToGateway, getFloorMapUrl,
} from '../utils/gateways';
import {
  getCustomAssetType, getAssetDisplayName, isAssetActive, isAssetAlarming,
} from '../utils/assetIcons';
import AssetTile from '../components/tiles/AssetTile';
import useActivityStore, { SESSION_START } from '../store/activityStore';
import { LoadingSpinner } from '../components/ui';
import './alarms.css';

/* ==========================================================================
   Store (Site) Control page — /store/:id
   Clickable landing from the Control Centre overview. Live KPI strip, sensor
   grid with type-chip filter, bulk quick-access controls, per-site activity +
   alarm feed. All data is derived from cached queries — no extra requests.
   ========================================================================== */

/* ---------------- Category chip definitions ---------------- */

const CATEGORIES = [
  { id: 'all',         label: 'All',         types: null }, // special: no filter
  { id: 'security',    label: 'Security',    types: ['AlarmAsset'] },
  { id: 'emergency',   label: 'Emergency',   types: ['SOSAsset'] },
  { id: 'smoke',       label: 'Smoke',       types: ['SmokeSensorAsset'] },
  { id: 'doors',       label: 'Doors',       types: ['DoorLockAsset', 'DoorSensorAsset'] },
  { id: 'presence',    label: 'Presence',    types: ['MotionSensorAsset', 'HumanPresenceSensorAsset'] },
  { id: 'temperature', label: 'Temperature', types: ['HeatSensorAsset'] },
  { id: 'vibration',   label: 'Vibration',   types: ['VibrationSensorAsset'] },
  { id: 'cameras',     label: 'Cameras',     types: ['CameraAsset'] },
  { id: 'lights',      label: 'Lights',      types: ['LightAsset'] },
  { id: 'plugs',       label: 'Plugs',       types: ['PlugAsset'] },
  { id: 'fans',        label: 'Fans',        types: ['FanAsset'] },
];

/* ==========================================================================
   Page
   ========================================================================== */

export default function StorePage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const { data: assets = [], isLoading: assetsLoading } = useAssets({});
  const { data: gateway, isLoading: gatewayLoading } = useAsset(id);
  const { data: openAlarms = [] } = useAlarms({ status: 'OPEN' });

  const gateways = useMemo(() => pickGateways(assets), [assets]);
  const children = useMemo(() => pickGatewayChildren(assets, id), [assets, id]);
  const assetById = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);

  /* ---- Alarms scoped to this site ---- */

  const siteAlarms = useMemo(
    () => openAlarms.filter((al) => alarmBelongsToGateway(al, id, assetById, gateways)),
    [openAlarms, assetById, gateways, id]
  );

  const topAlarm = useMemo(() => {
    const sevRank = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    return [...siteAlarms]
      .sort((a, b) => (sevRank[a.severity] ?? 9) - (sevRank[b.severity] ?? 9)
        || new Date(b.createdOn || 0) - new Date(a.createdOn || 0))[0] || null;
  }, [siteAlarms]);

  /* ---- KPI derivations (all from cached children) ---- */

  const kpis = useMemo(() => {
    const cameras = children.filter((a) => getCustomAssetType(a) === 'CameraAsset');
    const camerasOnline = cameras.filter((c) => c.attributes?.connected?.value !== false).length;

    const doors = children.filter((a) => getCustomAssetType(a) === 'DoorLockAsset');
    const doorsLocked = doors.filter((d) => isAssetActive(d, 'DoorLockAsset')).length;

    // Last KPI tracks every asset at the site.
    const devicesOffline = children.filter((a) => a.attributes?.connected?.value === false).length;
    const devicesAlarming = children.filter((a) => {
      const t = getCustomAssetType(a);
      return isAssetAlarming(a, t);
    }).length;
    const devicesHealthy = children.length - devicesOffline - devicesAlarming;

    const critAlarms = siteAlarms.filter((a) => a.severity === 'CRITICAL' || a.severity === 'HIGH').length;

    return {
      cameras: { total: cameras.length, online: camerasOnline, offline: cameras.length - camerasOnline },
      alerts:  { total: siteAlarms.length, critical: critAlarms },
      doors:   { total: doors.length, locked: doorsLocked, unlocked: doors.length - doorsLocked },
      devices: { total: children.length, healthy: devicesHealthy, alarming: devicesAlarming, offline: devicesOffline },
    };
  }, [children, siteAlarms]);

  /* ---- Sensor grid: chip + list ---- */

  const [chip, setChip] = useState('all');

  const visibleChips = useMemo(() => {
    const presentTypes = new Set(children.map((a) => getCustomAssetType(a)));
    return CATEGORIES.filter((c) => {
      if (c.id === 'all') return true;
      return c.types.some((t) => presentTypes.has(t));
    });
  }, [children]);

  const visibleDevices = useMemo(() => {
    if (chip === 'all') return children;
    const cat = CATEGORIES.find((c) => c.id === chip);
    if (!cat?.types) return children;
    return children.filter((a) => cat.types.includes(getCustomAssetType(a)));
  }, [children, chip]);

  /* ---- Activity feed filtered to this site ---- */

  const events = useActivityStore((s) => s.events);
  const siteAssetIds = useMemo(() => new Set(children.map((a) => a.id)), [children]);
  const sessionEvents = useMemo(
    () => events
      .filter((e) => e.timestamp >= SESSION_START && e.kind !== 'alarm')
      .filter((e) => !e.assetId || siteAssetIds.has(e.assetId))
      .slice(0, 8),
    [events, siteAssetIds]
  );

  const lastUpdate = useMemo(() => {
    const latest = [...sessionEvents, ...siteAlarms.map((a) => ({
      timestamp: a.createdOn ? new Date(a.createdOn).getTime() : 0,
    }))].reduce((m, e) => Math.max(m, e.timestamp || 0), 0);
    return latest || null;
  }, [sessionEvents, siteAlarms]);

  /* ---- Bulk quick-access controls ---- */

  const write = useWriteAttribute();
  const bulkWrite = (types, value) => {
    const targets = children.filter((a) => types.includes(getCustomAssetType(a)));
    targets.forEach((asset) => {
      const type = getCustomAssetType(asset);
      const attr = type === 'FanAsset' ? 'Fan' : 'onOff';
      write.mutate({ assetId: asset.id, attributeName: attr, value });
    });
  };

  const alarmUpdate = useUpdateAlarmStatus();

  /* ---- Loading / not-found states ---- */

  if (assetsLoading || gatewayLoading) {
    return <div className="flex items-center justify-center min-h-[60vh]"><LoadingSpinner size="lg" /></div>;
  }
  if (!gateway) {
    return (
      <div className="p-6 max-w-[800px] mx-auto">
        <p className="text-sm text-[var(--color-ink-2)]">Site not found.</p>
        <Link to="/" className="text-sm text-[var(--color-accent-400)] mt-2 inline-block">← Back to Control Centre</Link>
      </div>
    );
  }

  const siteName = getAssetDisplayName(gateway);
  const connected = gateway.attributes?.connected?.value !== false;

  return (
    <div className="p-4 md:p-6 max-w-[1500px] mx-auto space-y-4">
      {/* Top: back link + critical banner */}
      <div className="flex items-stretch gap-3 flex-wrap">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold
            bg-[color-mix(in_srgb,var(--color-ink-0)_5%,transparent)]
            border border-[color-mix(in_srgb,var(--color-ink-0)_10%,transparent)]
            text-[var(--color-ink-1)] hover:text-[var(--color-ink-0)] transition-colors flex-shrink-0"
        >
          <ArrowLeft className="w-4 h-4" strokeWidth={2} />
          Close Store
        </button>
        {topAlarm && <CriticalBanner alarm={topAlarm} />}
      </div>

      {/* Site title bar */}
      <header className="flex items-center gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-ink-0)]">{siteName}</h1>
          <p className="text-xs text-[var(--color-ink-2)] mt-0.5 flex items-center gap-1.5">
            <span
              className="inline-block w-1.5 h-1.5 rounded-full"
              style={{
                background: connected ? 'var(--color-accent-500)' : 'var(--color-ink-3)',
                boxShadow: connected ? '0 0 6px color-mix(in srgb, var(--color-accent-500) 70%, transparent)' : 'none',
              }}
            />
            {connected ? 'Connected' : 'Offline'}
            {children.length > 0 && ` — ${children.length} device${children.length === 1 ? '' : 's'}`}
          </p>
        </div>
      </header>

      {/* KPI strip */}
      <KpiStrip kpis={kpis} />

      {/* Main layout: [Floor Map + Sensors] (≈70%) | [Quick Access + Live] (≈30%)
          — the right column auto-stretches to match the left column height. */}
      <div className="grid grid-cols-1 lg:grid-cols-[7fr_3fr] gap-4 items-stretch">
        <div className="space-y-4 min-w-0">
          <FloorMap url={getFloorMapUrl(gateway)} siteName={siteName} />
          <section className="panel p-4 md:p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-[var(--color-ink-0)]">Sensors</h2>
            <span className="text-[11px] text-[var(--color-ink-3)] tabular-nums">
              {visibleDevices.length} shown
            </span>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            {visibleChips.map((c) => {
              const count = c.id === 'all'
                ? children.length
                : children.filter((a) => c.types.includes(getCustomAssetType(a))).length;
              const active = chip === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => setChip(c.id)}
                  className="alarm-chip flex-shrink-0"
                  style={active ? {
                    color: 'var(--color-accent-400)',
                    background: 'color-mix(in srgb, var(--color-accent-500) 14%, transparent)',
                    borderColor: 'color-mix(in srgb, var(--color-accent-500) 50%, transparent)',
                  } : {}}
                  aria-pressed={active}
                >
                  <span>{c.label}</span>
                  <span
                    className="alarm-chip-count"
                    style={active ? { background: 'color-mix(in srgb, var(--color-accent-500) 22%, transparent)', color: 'var(--color-accent-300)' } : {}}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {visibleDevices.length === 0 ? (
            <div className="text-sm text-[var(--color-ink-3)] text-center py-10">
              {children.length === 0 ? 'No devices registered at this site.' : 'No devices match this filter.'}
            </div>
          ) : (
            <LayoutGroup>
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
                <AnimatePresence initial={false} mode="popLayout">
                  {visibleDevices.map((asset) => (
                    <motion.div
                      key={asset.id}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.98 }}
                      transition={{ layout: { type: 'spring', stiffness: 320, damping: 30 } }}
                    >
                      <AssetTile asset={asset} />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </LayoutGroup>
          )}
          </section>
        </div>
        <aside className="flex flex-col gap-4 min-w-0 min-h-0">
          <QuickAccess children_={children} onBulk={bulkWrite} busy={write.isPending} />
          <div className="flex-1 min-h-0">
            <LivePanel
              sessionEvents={sessionEvents}
              siteAlarms={siteAlarms}
              lastUpdate={lastUpdate}
              alarmUpdate={alarmUpdate}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}

/* ==========================================================================
   Floor map — image from `floorMap` attribute on the gateway, with inline
   SVG fallback when the attribute is unset or the image fails to load.
   ========================================================================== */

function FloorMap({ url, siteName }) {
  const [broken, setBroken] = useState(false);
  const showFallback = !url || broken;

  return (
    <section className="panel p-3 md:p-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <h2 className="text-sm font-bold text-[var(--color-ink-0)]">Floor Map</h2>
          {showFallback && (
            <p className="text-[11px] text-[var(--color-ink-3)] mt-0.5">
              Default plan · set a floorMap URL on the site asset to customise.
            </p>
          )}
        </div>
        {showFallback && (
          <span
            className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
            style={{
              background: 'color-mix(in srgb, var(--color-ink-0) 8%, transparent)',
              color: 'var(--color-ink-2)',
              border: '1px solid color-mix(in srgb, var(--color-ink-0) 14%, transparent)',
            }}
          >
            Default
          </span>
        )}
      </div>

      <div
        className="rounded-xl overflow-hidden relative"
        style={{
          aspectRatio: '16 / 9',
          background: 'color-mix(in srgb, var(--color-ink-0) 4%, transparent)',
          border: '1px solid color-mix(in srgb, var(--color-ink-0) 8%, transparent)',
        }}
      >
        {showFallback ? (
          <FloorPlanFallback />
        ) : (
          <img
            src={url}
            alt={`Floor plan of ${siteName}`}
            onError={() => setBroken(true)}
            className="w-full h-full"
            style={{ objectFit: 'contain', display: 'block' }}
          />
        )}
      </div>
    </section>
  );
}

/** Inline placeholder — themes via CSS variables so it matches light + dark. */
function FloorPlanFallback() {
  return (
    <svg
      viewBox="0 0 320 180"
      preserveAspectRatio="xMidYMid meet"
      className="w-full h-full"
      role="img"
      aria-label="Default floor plan placeholder"
    >
      <defs>
        <pattern id="floor-grid" width="16" height="16" patternUnits="userSpaceOnUse">
          <path d="M 16 0 L 0 0 0 16" fill="none"
                stroke="color-mix(in srgb, currentColor 7%, transparent)"
                strokeWidth="1" />
        </pattern>
      </defs>
      <g style={{ color: 'var(--color-ink-0)' }}>
        <rect width="320" height="180" fill="url(#floor-grid)" />

        {/* Outer wall */}
        <rect x="24" y="24" width="272" height="132" rx="4"
              fill="color-mix(in srgb, var(--color-ink-0) 3%, transparent)"
              stroke="color-mix(in srgb, var(--color-ink-0) 22%, transparent)"
              strokeWidth="2" />

        {/* Interior walls */}
        <line x1="130" y1="24" x2="130" y2="96"
              stroke="color-mix(in srgb, var(--color-ink-0) 22%, transparent)" strokeWidth="2" />
        <line x1="130" y1="110" x2="130" y2="156"
              stroke="color-mix(in srgb, var(--color-ink-0) 22%, transparent)" strokeWidth="2" />
        <line x1="220" y1="24" x2="220" y2="156"
              stroke="color-mix(in srgb, var(--color-ink-0) 22%, transparent)" strokeWidth="2" />
        <line x1="24" y1="100" x2="116" y2="100"
              stroke="color-mix(in srgb, var(--color-ink-0) 22%, transparent)" strokeWidth="2" />
        <line x1="220" y1="80" x2="296" y2="80"
              stroke="color-mix(in srgb, var(--color-ink-0) 22%, transparent)" strokeWidth="2" />

        {/* Room labels */}
        <g fill="color-mix(in srgb, var(--color-ink-0) 45%, transparent)"
           fontSize="9" fontFamily="system-ui, sans-serif" fontWeight="600"
           letterSpacing="1.5" style={{ textTransform: 'uppercase' }}>
          <text x="77"  y="68"  textAnchor="middle">Zone A</text>
          <text x="77"  y="132" textAnchor="middle">Zone B</text>
          <text x="175" y="94"  textAnchor="middle">Lobby</text>
          <text x="258" y="56"  textAnchor="middle">Zone C</text>
          <text x="258" y="124" textAnchor="middle">Zone D</text>
        </g>

        {/* Door gaps (visual hint) */}
        <rect x="126" y="98"  width="8" height="4" fill="var(--color-surface-1)" />
        <rect x="216" y="78"  width="8" height="4" fill="var(--color-surface-1)" />
        <rect x="118" y="98"  width="8" height="4" fill="var(--color-surface-1)" />

        {/* Caption */}
        <text x="160" y="170" textAnchor="middle"
              fill="color-mix(in srgb, var(--color-ink-0) 40%, transparent)"
              fontSize="9" fontFamily="system-ui, sans-serif" fontWeight="500">
          No floor plan set for this site
        </text>
      </g>
    </svg>
  );
}

/* ==========================================================================
   Critical banner — severity pill + alarm title + live elapsed timer
   ========================================================================== */

function CriticalBanner({ alarm }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const sev = alarm.severity || 'LOW';
  const isHot = sev === 'CRITICAL' || sev === 'HIGH';
  const color = sev === 'CRITICAL' ? 'var(--color-danger-400)'
    : sev === 'HIGH'    ? 'var(--color-warning-400)'
    : sev === 'MEDIUM'  ? 'var(--color-warning-400)'
    :                      'var(--color-ink-1)';
  const bg = sev === 'CRITICAL' ? 'color-mix(in srgb, var(--color-danger-500) 14%, transparent)'
    : sev === 'HIGH'    ? 'color-mix(in srgb, var(--color-warning-500) 14%, transparent)'
    : sev === 'MEDIUM'  ? 'color-mix(in srgb, var(--color-warning-500) 10%, transparent)'
    :                      'color-mix(in srgb, var(--color-ink-0) 6%, transparent)';

  const createdAt = alarm.createdOn ? new Date(alarm.createdOn) : null;
  const elapsed = createdAt ? formatElapsed(now - createdAt.getTime()) : '—';

  return (
    <div
      className="flex-1 min-w-0 flex items-center gap-3 px-4 py-2.5 rounded-xl border"
      style={{
        background: bg,
        borderColor: `color-mix(in srgb, ${color} 35%, transparent)`,
        animation: isHot ? 'alarm-breathe 2.6s ease-in-out infinite' : undefined,
      }}
    >
      <span
        className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide flex-shrink-0"
        style={{
          background: color,
          color: '#fff',
        }}
      >
        {sev}
      </span>
      <p className="flex-1 min-w-0 text-sm font-semibold truncate" style={{ color }}>
        {alarm.title || 'Alarm'}
      </p>
      <span className="tabular-nums text-sm font-semibold flex-shrink-0 inline-flex items-center gap-1.5" style={{ color }}>
        <Clock className="w-3.5 h-3.5" strokeWidth={2} />
        {elapsed}
      </span>
    </div>
  );
}

function formatElapsed(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/* ==========================================================================
   KPI strip
   ========================================================================== */

function KpiStrip({ kpis }) {
  const cameraState = kpis.cameras.total === 0 ? 'muted'
    : kpis.cameras.offline === 0 ? 'ok' : 'warning';
  const alertsState = kpis.alerts.critical > 0 ? 'alarm'
    : kpis.alerts.total > 0 ? 'warning' : 'ok';
  const doorsState = kpis.doors.total === 0 ? 'muted'
    : kpis.doors.unlocked === 0 ? 'ok' : 'warning';
  const devicesState = kpis.devices.total === 0 ? 'muted'
    : kpis.devices.alarming > 0 ? 'alarm'
    : kpis.devices.offline > 0 ? 'warning'
    : 'ok';

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <KpiCard
        icon={Video}
        label="Cameras"
        value={kpis.cameras.total > 0 ? `${kpis.cameras.online}/${kpis.cameras.total}` : '—'}
        sub={kpis.cameras.total === 0 ? 'None at this site'
          : kpis.cameras.offline === 0 ? 'All feeds live'
          : `${kpis.cameras.offline} offline`}
        badge={kpis.cameras.total === 0 ? null : kpis.cameras.offline === 0 ? 'ONLINE' : 'OFFLINE'}
        tone={cameraState}
      />
      <KpiCard
        icon={Bell}
        label="Active Alerts"
        value={kpis.alerts.total}
        sub={kpis.alerts.critical > 0 ? `${kpis.alerts.critical} critical`
          : kpis.alerts.total > 0 ? 'Needs attention'
          : 'All clear'}
        badge={kpis.alerts.critical > 0 ? 'ALERT' : kpis.alerts.total > 0 ? 'WARN' : 'OK'}
        tone={alertsState}
      />
      <KpiCard
        icon={Lock}
        label="Doors Locked"
        value={kpis.doors.total > 0 ? `${kpis.doors.locked}/${kpis.doors.total}` : '—'}
        sub={kpis.doors.total === 0 ? 'No locks at this site'
          : kpis.doors.unlocked === 0 ? 'Secure'
          : `${kpis.doors.unlocked} unlocked`}
        badge={kpis.doors.total === 0 ? null : kpis.doors.unlocked === 0 ? 'SECURE' : 'OPEN'}
        tone={doorsState}
      />
      <KpiCard
        icon={Activity}
        label="Devices"
        value={kpis.devices.total > 0 ? `${kpis.devices.healthy}/${kpis.devices.total}` : '—'}
        sub={kpis.devices.total === 0 ? 'No devices at this site'
          : kpis.devices.alarming > 0 ? `${kpis.devices.alarming} alarming`
          : kpis.devices.offline > 0 ? `${kpis.devices.offline} offline`
          : 'All healthy'}
        badge={kpis.devices.total === 0 ? null
          : kpis.devices.alarming > 0 ? 'ALARM'
          : kpis.devices.offline > 0 ? 'WARN'
          : 'HEALTHY'}
        tone={devicesState}
      />
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, sub, badge, tone, title }) {
  const toneMap = {
    ok:      { color: 'var(--color-accent-400)',  bg: 'color-mix(in srgb, var(--color-accent-500) 12%, transparent)',  ring: 'color-mix(in srgb, var(--color-accent-500) 35%, transparent)' },
    warning: { color: 'var(--color-warning-400)', bg: 'color-mix(in srgb, var(--color-warning-500) 14%, transparent)', ring: 'color-mix(in srgb, var(--color-warning-500) 35%, transparent)' },
    alarm:   { color: 'var(--color-danger-400)',  bg: 'color-mix(in srgb, var(--color-danger-500) 14%, transparent)',  ring: 'color-mix(in srgb, var(--color-danger-500) 35%, transparent)' },
    muted:   { color: 'var(--color-ink-1)',       bg: 'color-mix(in srgb, var(--color-ink-0) 6%, transparent)',        ring: 'color-mix(in srgb, var(--color-ink-0) 12%, transparent)' },
  };
  const t = toneMap[tone] || toneMap.muted;
  return (
    <div
      className="panel p-4 relative"
      style={{ background: t.bg, borderColor: t.ring }}
      title={title}
    >
      <div className="flex items-start justify-between">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: 'color-mix(in srgb, currentColor 14%, transparent)', color: t.color }}
        >
          <Icon className="w-4 h-4" strokeWidth={1.75} />
        </div>
        {badge && (
          <span
            className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
            style={{ background: 'color-mix(in srgb, currentColor 16%, transparent)', color: t.color }}
          >
            {badge}
          </span>
        )}
      </div>
      <p className="text-2xl md:text-3xl font-bold tabular-nums mt-3" style={{ color: t.color }}>
        {value}
      </p>
      <div className="flex items-end justify-between mt-0.5 gap-2">
        <p className="text-[11px] uppercase tracking-wide text-[var(--color-ink-2)]">{label}</p>
        <p className="text-[11px] text-[var(--color-ink-3)] truncate">{sub}</p>
      </div>
    </div>
  );
}

/* ==========================================================================
   Quick Access — bulk writes. Only shows a button if the site has that type.
   ========================================================================== */

function QuickAccess({ children_, onBulk, busy }) {
  const has = (type) => children_.some((a) => getCustomAssetType(a) === type);
  const hasDoor = has('DoorLockAsset');
  const hasLight = has('LightAsset');
  const hasAlarm = has('AlarmAsset');

  if (!hasDoor && !hasLight && !hasAlarm) {
    return null;
  }

  const buttons = [];
  if (hasLight) {
    buttons.push({
      key: 'lights-on', label: 'Turn On Lights', icon: Lightbulb, tone: 'accent',
      onClick: () => onBulk(['LightAsset'], true),
    });
    buttons.push({
      key: 'lights-off', label: 'Turn Off Lights', icon: LightbulbOff, tone: 'muted',
      onClick: () => onBulk(['LightAsset'], false),
    });
  }
  if (hasDoor) {
    buttons.push({
      key: 'lock', label: 'Lock All Doors', icon: Lock, tone: 'ok',
      onClick: () => onBulk(['DoorLockAsset'], true),
    });
    buttons.push({
      key: 'unlock', label: 'Open All Doors', icon: LockOpen, tone: 'warning',
      onClick: () => onBulk(['DoorLockAsset'], false),
    });
  }
  if (hasAlarm) {
    buttons.push({
      key: 'trigger', label: 'Trigger Alarm', icon: Siren, tone: 'alarm',
      onClick: () => onBulk(['AlarmAsset'], true),
    });
    buttons.push({
      key: 'silent', label: 'Silent Alarms', icon: BellOff, tone: 'muted',
      onClick: () => onBulk(['AlarmAsset'], false),
    });
  }

  return (
    <section className="panel p-4">
      <h3 className="text-sm font-bold text-[var(--color-ink-0)] mb-3">Quick Access</h3>
      <div className="grid grid-cols-2 gap-2">
        {buttons.map((b) => (
          <QuickButton
            key={b.key}
            icon={b.icon}
            label={b.label}
            tone={b.tone}
            onClick={b.onClick}
            busy={busy}
          />
        ))}
      </div>
    </section>
  );
}

function QuickButton({ icon: Icon, label, tone, onClick, busy }) {
  const toneMap = {
    accent:  { color: 'var(--color-accent-400)',  bg: 'color-mix(in srgb, var(--color-accent-500) 12%, transparent)',  border: 'color-mix(in srgb, var(--color-accent-500) 40%, transparent)' },
    ok:      { color: 'var(--color-accent-400)',  bg: 'color-mix(in srgb, var(--color-accent-500) 10%, transparent)',  border: 'color-mix(in srgb, var(--color-accent-500) 35%, transparent)' },
    warning: { color: 'var(--color-warning-400)', bg: 'color-mix(in srgb, var(--color-warning-500) 12%, transparent)', border: 'color-mix(in srgb, var(--color-warning-500) 40%, transparent)' },
    alarm:   { color: 'var(--color-danger-400)',  bg: 'color-mix(in srgb, var(--color-danger-500) 12%, transparent)',  border: 'color-mix(in srgb, var(--color-danger-500) 40%, transparent)' },
    muted:   { color: 'var(--color-ink-1)',       bg: 'color-mix(in srgb, var(--color-ink-0) 5%, transparent)',        border: 'color-mix(in srgb, var(--color-ink-0) 12%, transparent)' },
  };
  const t = toneMap[tone] || toneMap.muted;
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold
        transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      style={{ background: t.bg, color: t.color, border: `1px solid ${t.border}` }}
    >
      <Icon className="w-3.5 h-3.5" strokeWidth={2} />
      <span className="truncate">{label}</span>
    </button>
  );
}

/* ==========================================================================
   Live panel — THIS SESSION (activity store) + ALARMS (open at this site)
   ========================================================================== */

const SEVERITY_META = {
  CRITICAL: { icon: AlertTriangle, color: 'var(--color-danger-400)' },
  HIGH:     { icon: AlertTriangle, color: 'var(--color-warning-400)' },
  MEDIUM:   { icon: AlertCircle,   color: 'var(--color-warning-400)' },
  LOW:      { icon: Info,          color: 'var(--color-ink-1)' },
};

function LivePanel({ sessionEvents, siteAlarms, lastUpdate, alarmUpdate }) {
  return (
    <section className="panel p-4 flex flex-col h-full min-h-[320px]">
      <div className="flex items-center gap-2 mb-1 flex-shrink-0">
        <span className="alarm-live-dot" aria-hidden="true" />
        <h3 className="text-sm font-bold text-[var(--color-ink-0)]">Live</h3>
      </div>
      <p className="text-[11px] text-[var(--color-ink-3)] mb-3 flex-shrink-0">
        {lastUpdate
          ? `Last update: ${formatDistanceToNowStrict(new Date(lastUpdate))} ago`
          : 'No updates yet'}
      </p>

      {/* Scrollable region fills the remaining vertical space. */}
      <div className="flex-1 min-h-0 overflow-y-auto pr-1">
        <p className="text-[10px] uppercase tracking-wide font-semibold text-[var(--color-ink-3)] mb-1.5">This session</p>
        {sessionEvents.length === 0 ? (
          <p className="text-xs text-[var(--color-ink-3)] py-3">Nothing yet — still watching.</p>
        ) : (
          <ul className="space-y-1.5">
            {sessionEvents.map((e) => (
              <li key={e.id} className="flex items-start gap-2 p-2 rounded-lg hover:bg-[color-mix(in_srgb,var(--color-ink-0)_4%,transparent)]">
                <span
                  className="status-dot mt-1.5"
                  style={{
                    background: e.kind === 'control' ? 'var(--color-accent-500)'
                      : 'var(--color-ink-3)',
                    boxShadow: e.kind === 'control' ? '0 0 6px color-mix(in srgb, var(--color-accent-500) 70%, transparent)' : 'none',
                  }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-semibold text-[var(--color-ink-0)] truncate">{e.title}</p>
                  {e.assetName && <p className="text-[10px] text-[var(--color-ink-3)] truncate">{e.assetName}</p>}
                </div>
                <span className="text-[10px] text-[var(--color-ink-3)] tabular-nums flex-shrink-0 mt-0.5">
                  {format(new Date(e.timestamp), 'HH:mm')}
                </span>
              </li>
            ))}
          </ul>
        )}

        {siteAlarms.length > 0 && (
          <>
            <p className="text-[10px] uppercase tracking-wide font-semibold text-[var(--color-ink-3)] mt-4 mb-1.5">Alarms</p>
            <ul className="space-y-1.5">
              {siteAlarms.map((al) => {
                const meta = SEVERITY_META[al.severity] || SEVERITY_META.LOW;
                const SevIcon = meta.icon;
                const ackPending = alarmUpdate?.isPending
                  && alarmUpdate.variables?.alarm?.id === al.id
                  && alarmUpdate.variables?.status === 'ACKNOWLEDGED';
                const isOpen = al.status === 'OPEN';
                return (
                  <li key={al.id} className="flex items-start gap-2 p-2 rounded-lg hover:bg-[color-mix(in_srgb,var(--color-ink-0)_4%,transparent)]">
                    <SevIcon className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: meta.color }} strokeWidth={2} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-semibold text-[var(--color-ink-0)] truncate">{al.title || 'Alarm'}</p>
                      <p className="text-[10px] text-[var(--color-ink-3)] truncate">
                        {al.sourceName || (Array.isArray(al.asset) && al.asset[0]?.name) || 'Unknown source'}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <span className="text-[10px] text-[var(--color-ink-3)] tabular-nums">
                        {al.createdOn ? format(new Date(al.createdOn), 'HH:mm') : '—'}
                      </span>
                      {alarmUpdate && isOpen && (
                        <button
                          type="button"
                          onClick={() => alarmUpdate.mutate({ alarm: al, status: 'ACKNOWLEDGED' })}
                          disabled={ackPending}
                          className="alarm-action alarm-action-accent"
                          style={{ padding: '3px 8px', fontSize: 10.5 }}
                        >
                          <Check className="w-3 h-3" strokeWidth={2.25} />
                          <span>{ackPending ? '…' : 'Ack'}</span>
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
