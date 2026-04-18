import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Building2, Zap, Bell, Activity, Sun, Moon,
  ChevronRight, AlertTriangle, Lightbulb, Unlock,
  Thermometer, FileDown,
} from 'lucide-react';
import {
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';
import { format, subDays, startOfDay, isSameDay } from 'date-fns';
import { useAssets, useAlarms } from '../hooks/useAssets';
import { pickGateways, pickAllDevices, pickGatewayChildren, summariseGateway } from '../utils/gateways';
import {
  getCustomAssetType, isAssetActive, isAssetAlarming, getStateLabel,
  getAssetDisplayName,
} from '../utils/assetIcons';
import useAuthStore from '../store/authStore';
import useActivityStore from '../store/activityStore';
import { downloadCsv } from '../utils/csv';
import { formatRelativeTime } from '../utils/helpers';
import { LoadingSpinner } from '../components/ui';
import AssetGlyph from '../components/tiles/AssetGlyph';

export default function OverviewPage() {
  const { data: assets = [], isLoading } = useAssets({});
  const { data: openAlarms = [] } = useAlarms({ status: 'OPEN' });
  const { data: allAlarms = [] } = useAlarms({});
  const { user } = useAuthStore();

  const gateways = useMemo(() => pickGateways(assets), [assets]);
  const allDevices = useMemo(() => pickAllDevices(assets), [assets]);

  // ---- Derived reports (no extra API calls) --------------------------------

  // Live aggregate readings across all recognised devices.
  const readings = useMemo(() => {
    const plugs = allDevices.filter((a) => getCustomAssetType(a) === 'PlugAsset');
    const power = plugs.reduce((s, p) => {
      const v = Number(p.attributes?.power?.value);
      return Number.isFinite(v) ? s + v : s;
    }, 0);

    const heats = allDevices.filter((a) => getCustomAssetType(a) === 'HeatSensorAsset');
    const temps = heats
      .map((h) => Number(h.attributes?.temperature?.value))
      .filter(Number.isFinite);
    const temp = temps.length
      ? { avg: temps.reduce((a, b) => a + b, 0) / temps.length, min: Math.min(...temps), max: Math.max(...temps), count: temps.length }
      : null;

    const doors = allDevices.filter((a) => getCustomAssetType(a) === 'DoorLockAsset');
    // DoorLock convention: isAssetActive === true means "Locked".
    // So a door is unlocked when it is NOT active.
    const doorsUnlocked = doors.filter((d) => !isAssetActive(d, 'DoorLockAsset')).length;

    return { power, temp, doorsUnlocked, doorsTotal: doors.length };
  }, [allDevices]);

  // Alarm severity + pipeline status breakdowns.
  const alarmBreakdown = useMemo(() => {
    const bySev = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
    const byStatus = { OPEN: 0, ACKNOWLEDGED: 0, IN_PROGRESS: 0, RESOLVED: 0, CLOSED: 0 };
    for (const a of allAlarms || []) {
      if (bySev[a.severity] !== undefined) bySev[a.severity]++;
      if (byStatus[a.status] !== undefined) byStatus[a.status]++;
    }
    return { bySev, byStatus };
  }, [allAlarms]);

  const stats = useMemo(() => {
    const online = allDevices.filter((d) => d.attributes?.connected?.value !== false).length;
    const active = allDevices.filter((d) => {
      const t = getCustomAssetType(d);
      return isAssetActive(d, t);
    }).length;
    return {
      sites: gateways.length,
      devices: allDevices.length,
      online,
      alarms: (openAlarms || []).length,
      active,
    };
  }, [gateways, allDevices, openAlarms]);

  // Device type distribution for the donut chart (top 6 + "Other").
  const typeDistribution = useMemo(() => {
    const counts = {};
    for (const a of allDevices) {
      const t = getCustomAssetType(a) || 'Other';
      counts[t] = (counts[t] || 0) + 1;
    }
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const top = entries.slice(0, 6);
    const rest = entries.slice(6).reduce((s, [, n]) => s + n, 0);
    if (rest) top.push(['Other', rest]);
    return top.map(([name, value]) => ({ name, value }));
  }, [allDevices]);

  // 7-day alarm bar chart.
  const alarmTrend = useMemo(() => {
    const today = startOfDay(new Date());
    const days = Array.from({ length: 7 }, (_, i) => subDays(today, 6 - i));
    return days.map((d) => ({
      day: format(d, 'EEE'),
      date: d,
      count: (allAlarms || []).filter((a) => a.createdOn && isSameDay(new Date(a.createdOn), d)).length,
    }));
  }, [allAlarms]);

  // Currently-active controllable devices (lights/plugs/fans that are on).
  const activeControllables = useMemo(() => {
    return allDevices.filter((a) => {
      const t = getCustomAssetType(a);
      if (!['LightAsset', 'PlugAsset', 'FanAsset'].includes(t)) return false;
      return isAssetActive(a, t);
    }).slice(0, 5);
  }, [allDevices]);

  // Triggered sensors (doors open, motion detected, smoke, etc.).
  const triggeredSensors = useMemo(() => {
    return allDevices.filter((a) => {
      const t = getCustomAssetType(a);
      if (['LightAsset', 'PlugAsset', 'FanAsset', 'DoorLockAsset', 'AlarmAsset', 'CameraAsset', 'PanelAsset'].includes(t)) return false;
      return isAssetActive(a, t) || isAssetAlarming(a, t);
    }).slice(0, 5);
  }, [allDevices]);

  const recentOpenAlarms = (openAlarms || []).slice(0, 5);

  if (isLoading) {
    return <div className="flex items-center justify-center min-h-[60vh]"><LoadingSpinner size="lg" /></div>;
  }

  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto space-y-6">
      <Greeting user={user} />

      {/* KPI row */}
      <motion.div
        initial="hidden" animate="show"
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }}
        className="grid grid-cols-2 md:grid-cols-4 gap-3"
      >
        <KpiTile icon={Building2} label="Sites"         value={stats.sites}  tone="brand"  href="/sites" />
        <KpiTile icon={Zap}       label="Devices online" value={`${stats.online}/${stats.devices}`}
                 sub={stats.devices ? `${Math.round((stats.online / stats.devices) * 100)}% healthy` : '—'}
                 tone="ok" />
        <KpiTile icon={Bell}      label="Open alarms"    value={stats.alarms}
                 tone={stats.alarms ? 'alarm' : 'default'} href="/alarms"
                 sub={stats.alarms ? 'Needs attention' : 'All clear'} />
        <KpiTile icon={Activity}  label="Currently active" value={stats.active}
                 tone="accent" sub="Lights · Plugs · Sensors" />
      </motion.div>

      {/* Live readings strip — real-time aggregates from current device state */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <ReadingTile
          icon={Zap}
          label="Power draw"
          value={readings.power > 0 ? `${readings.power.toFixed(0)} W` : '—'}
          sub={readings.power > 0 ? 'Across all plugs' : 'No active plugs'}
          tone={readings.power > 0 ? 'accent' : 'default'}
        />
        <ReadingTile
          icon={Thermometer}
          label="Temperature"
          value={readings.temp ? `${readings.temp.avg.toFixed(1)}°C` : '—'}
          sub={readings.temp ? `${readings.temp.min.toFixed(1)}° – ${readings.temp.max.toFixed(1)}° · ${readings.temp.count} sensors` : 'No sensors'}
          tone={readings.temp ? 'orange' : 'default'}
        />
        <ReadingTile
          icon={Unlock}
          label="Doors unlocked"
          value={readings.doorsTotal ? `${readings.doorsUnlocked}/${readings.doorsTotal}` : '—'}
          sub={readings.doorsUnlocked > 0 ? 'Check security' : 'All locked'}
          tone={readings.doorsUnlocked > 0 ? 'warning' : 'ok'}
        />
      </div>

      {/* Alarm pipeline — OPEN → ACK → IN_PROGRESS → RESOLVED → CLOSED */}
      <AlarmPipeline
        byStatus={alarmBreakdown.byStatus}
        bySev={alarmBreakdown.bySev}
        total={allAlarms?.length || 0}
      />

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="panel p-5 lg:col-span-1">
          <SectionHead title="Device mix" subtitle={`${stats.devices} total`} />
          {typeDistribution.length === 0 ? (
            <p className="text-xs text-[var(--color-ink-3)] py-8 text-center">No devices yet.</p>
          ) : (
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} debounce={50}>
                <PieChart>
                  <Pie
                    data={typeDistribution}
                    dataKey="value"
                    cx="50%" cy="50%"
                    innerRadius="55%" outerRadius="85%"
                    paddingAngle={3}
                    strokeWidth={0}
                  >
                    {typeDistribution.map((_, i) => (
                      <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(v, n) => [`${v}`, prettyName(n)]}
                  />
                  <Legend
                    verticalAlign="bottom" height={36}
                    iconType="circle" iconSize={8}
                    formatter={(v) => <span style={{ color: 'var(--color-ink-2)', fontSize: 11 }}>{prettyName(v)}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="panel p-5 lg:col-span-2">
          <SectionHead title="Alarms · Last 7 days"
                       subtitle={`${alarmTrend.reduce((s, d) => s + d.count, 0)} total`} />
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} debounce={50}>
              <BarChart data={alarmTrend}>
                <defs>
                  <linearGradient id="barFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor="var(--color-danger-500)" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="var(--color-danger-500)" stopOpacity={0.35} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="color-mix(in srgb, currentColor 8%, transparent)" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: 'var(--color-ink-2)' }} stroke="var(--color-ink-3)" />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--color-ink-2)' }} stroke="var(--color-ink-3)" />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'color-mix(in srgb, var(--color-ink-0) 5%, transparent)' }} />
                <Bar dataKey="count" fill="url(#barFill)" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Live state + recent alarms */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <LiveList
          title="Currently on"
          icon={Lightbulb}
          accent="accent"
          items={activeControllables}
          emptyLabel="No devices are on"
        />
        <LiveList
          title="Triggered sensors"
          icon={AlertTriangle}
          accent="warning"
          items={triggeredSensors}
          emptyLabel="All sensors quiet"
        />
        <div className="panel p-5">
          <SectionHead title="Recent alarms" link={{ to: '/alarms', label: 'See all' }} />
          {recentOpenAlarms.length === 0 ? (
            <p className="text-sm text-[var(--color-ink-2)] py-6 text-center">All clear — nothing active.</p>
          ) : (
            <ul className="space-y-2 mt-2">
              {recentOpenAlarms.map((al) => (
                <li key={al.id} className="flex items-start gap-2.5 p-2 rounded-lg hover:bg-[color-mix(in_srgb,var(--color-ink-0)_4%,transparent)] transition-colors">
                  <span className="status-dot status-dot-alarm pulse mt-1.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-[var(--color-ink-0)] truncate">{al.title || 'Alarm'}</p>
                    <p className="text-[11px] text-[var(--color-ink-2)] truncate">{al.sourceName || ''}</p>
                  </div>
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold"
                        style={{
                          background: 'color-mix(in srgb, var(--color-danger-500) 18%, transparent)',
                          color: 'var(--color-danger-400)',
                        }}>
                    {al.severity}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Recent activity */}
      <ActivityStrip />

      {/* Reports & exports */}
      <Reports alarms={allAlarms} devices={allDevices} />

      {/* Sites strip */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-[var(--color-ink-0)]">Your sites</h2>
          <Link to="/sites" className="text-xs font-semibold text-[var(--color-accent-400)] hover:text-[var(--color-accent-300)] inline-flex items-center gap-0.5">
            Manage sites <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
        {gateways.length === 0 ? (
          <div className="panel p-6 text-center text-sm text-[var(--color-ink-2)]">
            No sites yet — contact SMS to register a gateway.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {gateways.slice(0, 6).map((g) => {
              const children = pickGatewayChildren(assets, g.id);
              const s = summariseGateway(children);
              const connected = g.attributes?.connected?.value !== false;
              return (
                <Link
                  key={g.id}
                  to={`/g/${g.id}`}
                  className="tile flex items-center gap-3 hover:border-[color-mix(in_srgb,var(--color-accent-500)_40%,transparent)]"
                >
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                       style={{
                         background: connected
                           ? 'color-mix(in srgb, var(--color-accent-500) 14%, transparent)'
                           : 'color-mix(in srgb, var(--color-ink-0) 8%, transparent)',
                         color: connected ? 'var(--color-accent-400)' : 'var(--color-ink-2)',
                       }}>
                    <Building2 className="w-5 h-5" strokeWidth={1.75} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[var(--color-ink-0)] truncate">{getAssetDisplayName(g)}</p>
                    <p className="text-[11px] text-[var(--color-ink-2)] truncate">
                      {s.total} device{s.total === 1 ? '' : 's'} · {s.online} online
                      {s.alarming > 0 && ` · ${s.alarming} alarm`}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[var(--color-ink-3)]" />
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

/* ---------------- Greeting ---------------- */

function Greeting({ user }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  const hour = now.getHours();
  const greeting =
    hour < 5  ? 'Good night'
    : hour < 12 ? 'Good morning'
    : hour < 17 ? 'Good afternoon'
    : hour < 22 ? 'Good evening'
    : 'Good night';
  const Icon = hour >= 6 && hour < 18 ? Sun : Moon;
  const name = user?.name || user?.preferred_username || 'there';
  const firstName = name.split(/[.\s_]/)[0];

  return (
    <div className="panel p-5 md:p-6 flex items-center gap-4 relative overflow-hidden"
         style={{
           background: 'radial-gradient(800px 200px at 0% 0%, color-mix(in srgb, var(--color-accent-500) 16%, transparent), transparent 70%), var(--color-surface-1)',
         }}>
      <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
           style={{
             background: 'color-mix(in srgb, var(--color-accent-500) 16%, transparent)',
             color: 'var(--color-accent-400)',
           }}>
        <Icon className="w-6 h-6" strokeWidth={1.75} />
      </div>
      <div className="flex-1 min-w-0">
        <h1 className="text-xl md:text-2xl font-bold text-[var(--color-ink-0)] capitalize">
          {greeting}, {firstName}
        </h1>
        <p className="text-xs text-[var(--color-ink-2)] mt-0.5">
          {format(now, 'EEEE, dd MMMM · HH:mm')}
        </p>
      </div>
    </div>
  );
}

/* ---------------- KPI tile ---------------- */

function KpiTile({ icon: Icon, label, value, sub, tone = 'default', href }) {
  const toneMap = {
    brand:   { color: 'var(--color-brand-300)',   glow: 'color-mix(in srgb, var(--color-brand-500) 18%, transparent)' },
    accent:  { color: 'var(--color-accent-400)',  glow: 'color-mix(in srgb, var(--color-accent-500) 18%, transparent)' },
    ok:      { color: 'var(--color-accent-400)',  glow: 'color-mix(in srgb, var(--color-accent-500) 18%, transparent)' },
    alarm:   { color: 'var(--color-danger-400)',  glow: 'color-mix(in srgb, var(--color-danger-500) 22%, transparent)' },
    default: { color: 'var(--color-ink-1)',       glow: 'color-mix(in srgb, var(--color-ink-0) 8%, transparent)' },
  };
  const t = toneMap[tone];

  const content = (
    <motion.div
      variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
      whileHover={href ? { y: -2 } : {}}
      className="panel p-4 relative overflow-hidden h-full"
    >
      <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full blur-2xl opacity-80"
           style={{ background: t.glow }} />
      <div className="relative">
        <div className="flex items-center justify-between">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center"
               style={{ background: t.glow, color: t.color }}>
            <Icon className="w-[18px] h-[18px]" strokeWidth={1.75} />
          </div>
          {href && <ChevronRight className="w-4 h-4 text-[var(--color-ink-3)]" />}
        </div>
        <p className="text-[11px] uppercase tracking-wide text-[var(--color-ink-2)] mt-3">{label}</p>
        <p className="text-2xl md:text-3xl font-bold tabular-nums mt-0.5" style={{ color: t.color }}>
          {value}
        </p>
        {sub && <p className="text-[11px] text-[var(--color-ink-3)] mt-1">{sub}</p>}
      </div>
    </motion.div>
  );
  return href ? <Link to={href} className="block">{content}</Link> : content;
}

/* ---------------- Section header ---------------- */

function SectionHead({ title, subtitle, link }) {
  return (
    <div className="flex items-end justify-between mb-3">
      <div>
        <h3 className="text-sm font-semibold text-[var(--color-ink-0)]">{title}</h3>
        {subtitle && <p className="text-[11px] text-[var(--color-ink-3)]">{subtitle}</p>}
      </div>
      {link && (
        <Link to={link.to} className="text-[11px] font-semibold text-[var(--color-accent-400)] hover:text-[var(--color-accent-300)] inline-flex items-center gap-0.5">
          {link.label} <ChevronRight className="w-3 h-3" />
        </Link>
      )}
    </div>
  );
}

/* ---------------- Live list ---------------- */

function LiveList({ title, icon: Icon, items, emptyLabel, accent }) {
  const color = accent === 'warning' ? 'var(--color-warning-400)' : 'var(--color-accent-400)';
  return (
    <div className="panel p-5">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4" style={{ color }} strokeWidth={1.75} />
        <h3 className="text-sm font-semibold text-[var(--color-ink-0)]">{title}</h3>
        <span className="ml-auto text-[11px] text-[var(--color-ink-3)] tabular-nums">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-[var(--color-ink-2)] py-6 text-center">{emptyLabel}</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((a) => {
            const t = getCustomAssetType(a);
            const active = isAssetActive(a, t);
            const alarm = isAssetAlarming(a, t);
            return (
              <li key={a.id}>
                <Link to={`/a/${a.id}`}
                      className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-[color-mix(in_srgb,var(--color-ink-0)_4%,transparent)] transition-colors">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                       style={{
                         background: alarm ? 'color-mix(in srgb, var(--color-danger-500) 18%, transparent)'
                                   : active ? 'color-mix(in srgb, var(--color-accent-500) 18%, transparent)'
                                   : 'color-mix(in srgb, var(--color-ink-0) 6%, transparent)',
                         color: alarm ? 'var(--color-danger-400)'
                              : active ? 'var(--color-accent-400)'
                              : 'var(--color-ink-2)',
                       }}>
                    <AssetGlyph customType={t} on={active} alarm={alarm} className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-[var(--color-ink-0)] truncate">{getAssetDisplayName(a)}</p>
                    <p className="text-[11px] text-[var(--color-ink-2)] truncate">{getStateLabel(a, t)}</p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ---------------- Reading tile (live aggregate) ---------------- */

function ReadingTile({ icon: Icon, label, value, sub, tone = 'default', href }) {
  const toneMap = {
    accent:  { color: 'var(--color-accent-400)',  bg: 'color-mix(in srgb, var(--color-accent-500) 16%, transparent)' },
    ok:      { color: 'var(--color-accent-400)',  bg: 'color-mix(in srgb, var(--color-accent-500) 14%, transparent)' },
    warning: { color: 'var(--color-warning-400)', bg: 'color-mix(in srgb, var(--color-warning-500) 18%, transparent)' },
    alarm:   { color: 'var(--color-danger-400)',  bg: 'color-mix(in srgb, var(--color-danger-500) 20%, transparent)' },
    orange:  { color: '#fb923c',                  bg: 'color-mix(in srgb, #f97316 18%, transparent)' },
    default: { color: 'var(--color-ink-1)',       bg: 'color-mix(in srgb, var(--color-ink-0) 7%, transparent)' },
  };
  const t = toneMap[tone];
  const content = (
    <div className="panel p-4 h-full">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center"
             style={{ background: t.bg, color: t.color }}>
          <Icon className="w-4 h-4" strokeWidth={1.75} />
        </div>
        <p className="text-[11px] uppercase tracking-wide text-[var(--color-ink-2)]">{label}</p>
      </div>
      <p className="text-2xl font-bold mt-2 tabular-nums" style={{ color: t.color }}>{value}</p>
      {sub && <p className="text-[11px] text-[var(--color-ink-3)] mt-0.5">{sub}</p>}
    </div>
  );
  return href ? <Link to={href} className="block">{content}</Link> : content;
}

/* ---------------- Alarm pipeline ---------------- */

function AlarmPipeline({ byStatus, bySev, total }) {
  const steps = [
    { key: 'OPEN',         label: 'Open',         tone: 'alarm' },
    { key: 'ACKNOWLEDGED', label: 'Acknowledged', tone: 'warning' },
    { key: 'IN_PROGRESS',  label: 'In progress',  tone: 'warning' },
    { key: 'RESOLVED',     label: 'Resolved',     tone: 'ok' },
    { key: 'CLOSED',       label: 'Closed',       tone: 'default' },
  ];
  const severities = [
    { key: 'CRITICAL', cls: 'sev-critical' },
    { key: 'HIGH',     cls: 'sev-high' },
    { key: 'MEDIUM',   cls: 'sev-medium' },
    { key: 'LOW',      cls: 'sev-low' },
  ];

  if (total === 0) return null;

  return (
    <section className="panel p-5">
      <SectionHead title="Alarm pipeline" subtitle={`${total} total alarms`}
                   link={{ to: '/alarms', label: 'View all' }} />
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
        {steps.map((s) => {
          const count = byStatus[s.key] || 0;
          const color =
            s.tone === 'alarm'   ? 'var(--color-danger-400)' :
            s.tone === 'warning' ? 'var(--color-warning-400)' :
            s.tone === 'ok'      ? 'var(--color-accent-400)' :
            'var(--color-ink-1)';
          const bg =
            s.tone === 'alarm'   ? 'color-mix(in srgb, var(--color-danger-500) 10%, transparent)' :
            s.tone === 'warning' ? 'color-mix(in srgb, var(--color-warning-500) 10%, transparent)' :
            s.tone === 'ok'      ? 'color-mix(in srgb, var(--color-accent-500) 10%, transparent)' :
            'color-mix(in srgb, var(--color-ink-0) 4%, transparent)';
          return (
            <div key={s.key} className="rounded-xl px-3 py-2.5"
                 style={{ background: bg, border: `1px solid color-mix(in srgb, ${color} 24%, transparent)` }}>
              <p className="text-[10px] uppercase tracking-wide text-[var(--color-ink-2)]">{s.label}</p>
              <p className="text-xl font-bold tabular-nums mt-0.5" style={{ color }}>{count}</p>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2">
        <p className="text-[11px] uppercase tracking-wide text-[var(--color-ink-2)] mr-2 self-center">By severity</p>
        {severities.map((s) => (
          <span key={s.key} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${s.cls}`}>
            {s.key}
            <span className="font-bold tabular-nums">{bySev[s.key] || 0}</span>
          </span>
        ))}
      </div>
    </section>
  );
}

/* ---------------- Activity strip ---------------- */

function ActivityStrip() {
  const events = useActivityStore((s) => s.events);
  const recent = events.slice(0, 5);
  if (recent.length === 0) return null;
  return (
    <section className="panel p-5">
      <SectionHead title="Recent activity" link={{ to: '/live', label: 'See all' }} />
      <ul className="divide-y" style={{ borderColor: 'color-mix(in srgb, var(--color-ink-0) 6%, transparent)' }}>
        {recent.map((e) => (
          <li key={e.id} className="flex items-center gap-3 py-2.5">
            <span
              className={`status-dot ${e.kind === 'alarm' ? 'status-dot-alarm pulse' : e.kind === 'control' ? 'status-dot-on' : 'status-dot-off'}`}
            />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-[var(--color-ink-0)] truncate">{e.title}</p>
              <p className="text-[11px] text-[var(--color-ink-3)] truncate">
                {e.assetName || e.assetId || ''}
              </p>
            </div>
            <span className="text-[11px] text-[var(--color-ink-3)] whitespace-nowrap">
              {formatRelativeTime(e.timestamp)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ---------------- Reports ---------------- */

function Reports({ alarms, devices }) {
  const [busy, setBusy] = useState(null);

  const run = async (kind) => {
    setBusy(kind);
    try {
      if (kind === 'alarms') {
        downloadCsv(
          `alarms-${format(new Date(), 'yyyy-MM-dd')}.csv`,
          alarms || [],
          [
            { key: 'id',         label: 'ID' },
            { key: 'title',      label: 'Title' },
            { key: 'content',    label: 'Description' },
            { key: 'severity',   label: 'Severity' },
            { key: 'status',     label: 'Status' },
            { key: 'assetId',    label: 'Asset ID' },
            { key: 'sourceName', label: 'Source' },
            { key: 'createdOn',  label: 'Created', get: (r) => r.createdOn ? format(new Date(r.createdOn), 'yyyy-MM-dd HH:mm:ss') : '' },
            { key: 'lastModified', label: 'Last modified', get: (r) => r.lastModified ? format(new Date(r.lastModified), 'yyyy-MM-dd HH:mm:ss') : '' },
          ]
        );
      }
      if (kind === 'devices') {
        downloadCsv(
          `devices-${format(new Date(), 'yyyy-MM-dd')}.csv`,
          devices || [],
          [
            { key: 'id',         label: 'ID' },
            { key: 'name',       label: 'Name' },
            { key: 'type',       label: 'Asset type', get: (r) => getCustomAssetType(r) },
            { key: 'parentId',   label: 'Parent ID' },
            { key: 'connected',  label: 'Connected', get: (r) => r.attributes?.connected?.value !== false ? 'yes' : 'no' },
            { key: 'state',      label: 'State', get: (r) => getStateLabel(r, getCustomAssetType(r)) },
          ]
        );
      }
    } finally {
      setBusy(null);
    }
  };

  const reports = [
    { kind: 'alarms',  label: 'Alarm history', desc: `${(alarms || []).length} records`, icon: Bell },
    { kind: 'devices', label: 'Device status', desc: `${(devices || []).length} devices`, icon: Lightbulb },
  ];

  return (
    <section className="panel p-5">
      <SectionHead title="Reports"
                   subtitle="Download CSV snapshots of your portal data" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {reports.map((r) => (
          <button
            key={r.kind}
            onClick={() => run(r.kind)}
            disabled={busy === r.kind}
            className="tile text-left flex items-center gap-3 hover:border-[color-mix(in_srgb,var(--color-accent-500)_40%,transparent)] transition-colors disabled:opacity-60"
          >
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                 style={{
                   background: 'color-mix(in srgb, var(--color-accent-500) 14%, transparent)',
                   color: 'var(--color-accent-400)',
                 }}>
              <r.icon className="w-5 h-5" strokeWidth={1.75} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[var(--color-ink-0)]">{r.label}</p>
              <p className="text-[11px] text-[var(--color-ink-2)]">{r.desc}</p>
            </div>
            <FileDown className="w-4 h-4 text-[var(--color-ink-3)]" />
          </button>
        ))}
      </div>
    </section>
  );
}

/* ---------------- helpers ---------------- */

const DONUT_COLORS = [
  '#06b6d4', // cyan
  '#22d3ee', // light cyan
  '#3b82f6', // blue
  '#8b5cf6', // purple
  '#f59e0b', // amber
  '#ef4444', // red
  '#64748b', // slate
];

const TOOLTIP_STYLE = {
  background: 'var(--color-surface-2)',
  border: '1px solid var(--color-surface-3)',
  borderRadius: 12,
  color: 'var(--color-ink-0)',
  fontSize: 12,
};

function prettyName(name) {
  return String(name)
    .replace(/Asset$/, '')
    .replace(/Sensor$/, ' Sensor')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
}

