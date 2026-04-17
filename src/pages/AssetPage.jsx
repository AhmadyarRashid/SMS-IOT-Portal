import { useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Gauge, SlidersHorizontal, LineChart as LineIcon, Bell, Info, Power,
} from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Area, AreaChart,
} from 'recharts';
import { format } from 'date-fns';
import {
  useAsset, useAssetDatapoints, useAlarms, useWriteAttribute, useGateways,
} from '../hooks/useAssets';
import { findGatewayForAsset } from '../utils/gateways';
import {
  getCustomAssetType, getAssetTypeLabel, isAssetActive, isAssetAlarming,
  getPrimaryControlAttr, getPrimaryReadingAttr, getStateLabel,
  nextToggleValue, CONTROLLABLE_TYPES,
} from '../utils/assetIcons';
import { formatRelativeTime, getTimeRanges } from '../utils/helpers';
import { LoadingSpinner, EmptyState } from '../components/ui';
import AssetGlyph from '../components/tiles/AssetGlyph';

const TABS = [
  { id: 'state',    label: 'State',    icon: Gauge },
  { id: 'controls', label: 'Controls', icon: SlidersHorizontal },
  { id: 'history',  label: 'History',  icon: LineIcon },
  { id: 'alarms',   label: 'Alarms',   icon: Bell },
];

export default function AssetPage() {
  const { id } = useParams();
  const { data: asset, isLoading } = useAsset(id);
  const { data: gateways = [] } = useGateways();
  const [tab, setTab] = useState('state');

  const gateway = useMemo(() => findGatewayForAsset(asset, gateways), [asset, gateways]);
  const backTo = gateway ? `/g/${gateway.id}` : '/sites';

  if (isLoading) {
    return <div className="flex items-center justify-center min-h-[60vh]"><LoadingSpinner size="lg" /></div>;
  }
  if (!asset) {
    return (
      <div className="p-6">
        <EmptyState
          icon={Info}
          title="Asset not found"
          message="This device may have been removed or you don't have access."
          action={<Link to="/" className="text-sm text-[var(--color-accent-400)] hover:text-[var(--color-accent-300)]">Back to overview</Link>}
        />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-[1100px] mx-auto space-y-5">
      <Link
        to={backTo}
        className="inline-flex items-center gap-1.5 text-xs text-[var(--color-ink-2)] hover:text-[var(--color-ink-0)]"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        {gateway ? `Back to ${gateway.name}` : 'Back to sites'}
      </Link>

      <Hero asset={asset} />

      {/* Tabs */}
      <div className="flex gap-1 border-b overflow-x-auto no-scrollbar"
           style={{ borderColor: 'color-mix(in srgb, var(--color-ink-0) 8%, transparent)' }}>
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`relative flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors whitespace-nowrap
                ${active ? 'text-[var(--color-accent-400)]' : 'text-[var(--color-ink-2)] hover:text-[var(--color-ink-0)]'}`}
            >
              <t.icon className="w-4 h-4" strokeWidth={1.75} />
              {t.label}
              {active && <span className="absolute -bottom-px left-3 right-3 h-0.5 rounded bg-[var(--color-accent-500)]" />}
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {tab === 'state'    && <StateTab asset={asset} />}
          {tab === 'controls' && <ControlsTab asset={asset} />}
          {tab === 'history'  && <HistoryTab asset={asset} />}
          {tab === 'alarms'   && <AlarmsTab asset={asset} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/* ---------------- Hero ---------------- */

function Hero({ asset }) {
  const customType = getCustomAssetType(asset);
  const active = isAssetActive(asset, customType);
  const alarm = isAssetAlarming(asset, customType);
  const label = getStateLabel(asset, customType);
  const controllable = CONTROLLABLE_TYPES.includes(customType);
  const primaryAttr = getPrimaryControlAttr(asset, customType);
  const write = useWriteAttribute();

  const tone = alarm ? 'alarm' : active ? 'on' : 'off';

  const handleIconClick = () => {
    if (!controllable || !primaryAttr) return;
    write.mutate({
      assetId: asset.id,
      attributeName: primaryAttr,
      value: nextToggleValue(asset, primaryAttr),
    });
  };

  const bgStyle = alarm
    ? {
        background: 'radial-gradient(60% 80% at 50% 20%, color-mix(in srgb, var(--color-danger-500) 22%, transparent), transparent 70%), var(--color-surface-1)',
        borderColor: 'color-mix(in srgb, var(--color-danger-500) 40%, transparent)',
      }
    : active
      ? {
          background: 'radial-gradient(60% 80% at 50% 20%, color-mix(in srgb, var(--color-accent-500) 22%, transparent), transparent 70%), var(--color-surface-1)',
          borderColor: 'color-mix(in srgb, var(--color-accent-500) 40%, transparent)',
          boxShadow: '0 0 0 1px color-mix(in srgb, var(--color-accent-500) 15%, transparent), 0 16px 48px -20px color-mix(in srgb, var(--color-accent-500) 55%, transparent)',
        }
      : {};

  return (
    <div className="panel px-6 py-8 text-center relative overflow-hidden" style={bgStyle}>
      <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink-2)] mb-4">
        {getAssetTypeLabel(customType)}
      </p>

      {/* Big clickable icon — primary control for controllable devices */}
      <div className="flex justify-center mb-5">
        <motion.button
          onClick={handleIconClick}
          disabled={!controllable || write.isPending}
          whileHover={controllable ? { scale: 1.04 } : {}}
          whileTap={controllable ? { scale: 0.94 } : {}}
          transition={{ type: 'spring', stiffness: 340, damping: 20 }}
          className={`ha-hero-icon ha-hero-icon-${tone} ${controllable ? 'ha-hero-icon-btn' : ''}`}
          aria-label={controllable ? `Toggle ${asset.name}` : asset.name}
          aria-pressed={controllable ? active : undefined}
        >
          <motion.div
            key={`${tone}-${active}`}
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 20 }}
          >
            <AssetGlyph
              customType={customType}
              on={active}
              alarm={alarm}
              className="w-14 h-14"
              strokeWidth={1.5}
              spin={customType === 'FanAsset' && active}
              pulse={alarm}
            />
          </motion.div>
        </motion.button>
      </div>

      <h1 className="text-2xl font-bold text-[var(--color-ink-0)]">{asset.name}</h1>
      <p className={`mt-1.5 text-base font-semibold ${
        alarm ? 'text-[var(--color-danger-400)]'
          : active ? 'text-[var(--color-accent-400)]'
          : 'text-[var(--color-ink-2)]'
      }`}>
        {label}
      </p>

      {controllable && primaryAttr && (
        <p className="mt-3 text-[11px] text-[var(--color-ink-3)] inline-flex items-center gap-1.5">
          <Power className="w-3 h-3" /> Tap the icon to turn {active ? 'off' : 'on'}
        </p>
      )}
    </div>
  );
}

/* ---------------- State tab ---------------- */

function StateTab({ asset }) {
  const customType = getCustomAssetType(asset);
  const attrs = asset.attributes || {};
  const entries = Object.entries(attrs).filter(([name, v]) => {
    if (!v || typeof v !== 'object') return false;
    if (name === 'customAssetType') return false; // shown in the hero subtitle
    return true;
  });

  const primaryReading = getPrimaryReadingAttr(asset, customType);

  if (entries.length === 0) {
    return <EmptyState title="No attributes" message="This device has no reportable state." icon={Gauge} />;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {entries.map(([name, attr]) => {
        const isPrimary = name === primaryReading;
        return (
          <div
            key={name}
            className="tile"
            style={isPrimary ? {
              background: 'linear-gradient(135deg, color-mix(in srgb, var(--color-accent-500) 14%, var(--color-surface-1)) 0%, var(--color-surface-1) 100%)',
              borderColor: 'color-mix(in srgb, var(--color-accent-500) 35%, transparent)',
            } : {}}
          >
            <p className="text-[10px] uppercase tracking-wide text-[var(--color-ink-2)]">{prettyName(name)}</p>
            <p className={`mt-1.5 break-all ${isPrimary ? 'text-3xl font-bold text-[var(--color-accent-400)]' : 'text-lg font-semibold text-[var(--color-ink-0)]'}`}>
              {renderValue(attr.value, name)}
            </p>
            {attr.timestamp && (
              <p className="text-[11px] text-[var(--color-ink-3)] mt-1.5">
                {formatRelativeTime(attr.timestamp)}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- Controls tab ---------------- */

function ControlsTab({ asset }) {
  const write = useWriteAttribute();
  const attrs = asset.attributes || {};
  const booleans = Object.entries(attrs).filter(([, v]) => typeof v?.value === 'boolean');
  const numerics = Object.entries(attrs).filter(([n, v]) =>
    typeof v?.value === 'number' && !['timestamp', 'version'].includes(n),
  );

  if (booleans.length === 0 && numerics.length === 0) {
    return <EmptyState title="No controls" message="This device has no writable attributes." icon={SlidersHorizontal} />;
  }

  return (
    <div className="space-y-4">
      {booleans.length > 0 && (
        <div className="panel p-1">
          <div className="px-4 pt-3 pb-2 text-xs uppercase tracking-wide text-[var(--color-ink-2)]">Switches</div>
          <div className="divide-y" style={{ borderColor: 'color-mix(in srgb, var(--color-ink-0) 6%, transparent)' }}>
            {booleans.map(([name, attr]) => (
              <div key={name} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-[var(--color-ink-0)]">{prettyName(name)}</p>
                  <p className={`text-xs mt-0.5 ${attr.value ? 'text-[var(--color-accent-400)]' : 'text-[var(--color-ink-2)]'}`}>
                    {attr.value ? 'On' : 'Off'}
                  </p>
                </div>
                <button
                  onClick={() => write.mutate({ assetId: asset.id, attributeName: name, value: !attr.value })}
                  className={`toggle-track ${attr.value ? 'toggle-track-on' : 'toggle-track-off'}`}
                  aria-label={`Toggle ${name}`}
                  aria-pressed={!!attr.value}
                >
                  <span className={`toggle-thumb ${attr.value ? 'toggle-thumb-on' : 'toggle-thumb-off'}`} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {numerics.length > 0 && (
        <div className="panel p-1">
          <div className="px-4 pt-3 pb-2 text-xs uppercase tracking-wide text-[var(--color-ink-2)]">Values</div>
          <div className="divide-y px-4 pb-4"
               style={{ borderColor: 'color-mix(in srgb, var(--color-ink-0) 6%, transparent)' }}>
            {numerics.map(([name, attr]) => (
              <NumericRow key={name} name={name} attr={attr} assetId={asset.id} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function NumericRow({ name, attr, assetId }) {
  const write = useWriteAttribute();
  const [val, setVal] = useState(attr.value);
  const [dirty, setDirty] = useState(false);
  const { min = 0, max = 100, unit = '' } = attr.meta || {};

  return (
    <div className="py-3 first:pt-4 last:pb-1">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-medium text-[var(--color-ink-0)]">{prettyName(name)}</p>
        <p className="text-base font-bold text-[var(--color-accent-400)] tabular-nums">
          {val}{unit}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={min} max={max}
          value={Number(val) || 0}
          onChange={(e) => { setVal(Number(e.target.value)); setDirty(true); }}
          className="ha-slider flex-1"
        />
        <button
          disabled={!dirty}
          onClick={() => {
            write.mutate({ assetId, attributeName: name, value: Number(val) });
            setDirty(false);
          }}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-40"
          style={{
            background: 'var(--color-accent-500)',
            color: '#fff',
          }}
        >
          Save
        </button>
      </div>
    </div>
  );
}

/* ---------------- History tab ---------------- */

const RANGE_KEYS = ['1h', '6h', '24h', '7d', '30d'];

// SMS IoT attribute "type" values we can put on a chart. Booleans render
// as 0/1 step lines, numbers as a smooth area.
const CHARTABLE_TYPES = new Set([
  'number', 'integer', 'positiveInteger', 'negativeInteger',
  'positiveNumber', 'negativeNumber', 'long', 'double', 'float',
  'boolean',
]);

function isChartableAttr(attr) {
  if (!attr) return false;
  if (typeof attr.type === 'string' && CHARTABLE_TYPES.has(attr.type)) return true;
  const v = attr.value;
  return typeof v === 'number' || typeof v === 'boolean';
}

function HistoryTab({ asset }) {
  const chartableNames = useMemo(
    () => Object.entries(asset.attributes || {})
      .filter(([, v]) => isChartableAttr(v))
      .map(([n]) => n),
    [asset.attributes],
  );
  const customType = getCustomAssetType(asset);
  const preferred = getPrimaryReadingAttr(asset, customType);
  const defaultAttr = (preferred && chartableNames.includes(preferred))
    ? preferred
    : chartableNames[0];

  const [attr, setAttr] = useState(defaultAttr || null);
  const [range, setRange] = useState('24h');

  // CRITICAL: time range must be stable per `range` selection. getTimeRanges()
  // calls Date.now() so calling it every render would change the query key
  // every millisecond and put React Query into an infinite refetch loop.
  const timeRange = useMemo(() => getTimeRanges()[range], [range]);
  const { data: points, isLoading } = useAssetDatapoints(asset.id, attr, timeRange);

  if (chartableNames.length === 0) {
    return <EmptyState title="No chartable data" message="This device has no numeric or boolean attributes with datapoints." icon={LineIcon} />;
  }

  // Selected attribute's declared type — drives whether we render a step line
  // (booleans) or a smooth area (numbers).
  const selectedMeta = attr ? asset.attributes?.[attr] : null;
  const isBoolean = selectedMeta?.type === 'boolean' || typeof selectedMeta?.value === 'boolean';

  // The SMS IoT backend can return datapoints in either {x, y} object form or [ts, v]
  // tuple form depending on the server version — accept both. Booleans are
  // normalised to 0/1 so Recharts can plot them.
  const series = Array.isArray(points)
    ? points.map((p) => {
        let t, raw;
        if (Array.isArray(p)) { t = p[0]; raw = p[1]; }
        else { t = p.x ?? p.timestamp; raw = p.y ?? p.value; }
        const v = typeof raw === 'boolean' ? (raw ? 1 : 0) : Number(raw);
        return { t, v };
      }).filter((p) => p.t != null && Number.isFinite(p.v))
    : [];

  return (
    <div className="panel p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-1 flex-wrap">
          {chartableNames.map((n) => (
            <Chip key={n} label={prettyName(n)} active={attr === n} onClick={() => setAttr(n)} />
          ))}
        </div>
        <div className="flex items-center gap-1">
          {RANGE_KEYS.map((r) => (
            <Chip key={r} label={r} active={range === r} onClick={() => setRange(r)} compact />
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="h-64 flex items-center justify-center"><LoadingSpinner /></div>
      ) : series.length === 0 ? (
        <EmptyState title="No data in this range" message="Try a wider time window — this attribute may not have any stored datapoints yet." icon={LineIcon} />
      ) : (
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-accent-500)" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="var(--color-accent-500)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="color-mix(in srgb, currentColor 8%, transparent)" />
              <XAxis
                dataKey="t"
                tickFormatter={(t) => format(new Date(t), 'HH:mm')}
                tick={{ fontSize: 10, fill: 'var(--color-ink-2)' }}
                stroke="var(--color-ink-3)"
              />
              <YAxis
                tick={{ fontSize: 10, fill: 'var(--color-ink-2)' }}
                stroke="var(--color-ink-3)"
                domain={isBoolean ? [0, 1] : ['auto', 'auto']}
                ticks={isBoolean ? [0, 1] : undefined}
                tickFormatter={isBoolean ? (v) => (v ? 'On' : 'Off') : undefined}
                width={isBoolean ? 40 : 30}
              />
              <Tooltip
                contentStyle={{
                  background: 'var(--color-surface-2)',
                  border: '1px solid var(--color-surface-3)',
                  borderRadius: 12,
                  color: 'var(--color-ink-0)',
                }}
                labelFormatter={(t) => format(new Date(t), 'PPp')}
                formatter={isBoolean ? (v) => [v ? 'On' : 'Off', prettyName(attr)] : undefined}
              />
              <Area
                type={isBoolean ? 'stepAfter' : 'monotone'}
                dataKey="v"
                stroke="var(--color-accent-500)"
                strokeWidth={2}
                fill="url(#areaFill)"
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function Chip({ label, active, onClick, compact }) {
  return (
    <button
      onClick={onClick}
      className={`text-xs font-medium rounded-lg transition-colors ${compact ? 'px-2.5 py-1' : 'px-3 py-1.5'} ${
        active ? 'text-[var(--color-accent-400)]' : 'text-[var(--color-ink-2)] hover:text-[var(--color-ink-0)]'
      }`}
      style={active ? { background: 'color-mix(in srgb, var(--color-accent-500) 14%, transparent)' } : {}}
    >
      {label}
    </button>
  );
}

/* ---------------- Alarms tab ---------------- */

function AlarmsTab({ asset }) {
  const { data: all = [] } = useAlarms();
  const list = useMemo(
    () => (Array.isArray(all) ? all.filter((a) => a.assetId === asset.id) : []),
    [all, asset.id]
  );

  if (list.length === 0) return <EmptyState title="No alarms" message="Everything quiet here." icon={Bell} />;

  return (
    <div className="panel divide-y"
         style={{ borderColor: 'color-mix(in srgb, var(--color-ink-0) 6%, transparent)' }}>
      {list.map((al) => (
        <div key={al.id} className="p-4 flex items-start gap-3">
          <span className={`status-dot ${al.status === 'OPEN' ? 'status-dot-alarm pulse' : 'status-dot-off'} mt-1.5`} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-[var(--color-ink-0)]">{al.title || 'Alarm'}</p>
            <p className="text-xs text-[var(--color-ink-2)]">{al.content || ''}</p>
            <p className="text-[11px] text-[var(--color-ink-3)] mt-1">
              {al.createdOn ? formatRelativeTime(al.createdOn) : ''} • {al.severity} • {al.status}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------------- helpers ---------------- */

function prettyName(name) {
  return name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase());
}

function renderValue(v, name) {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'number') {
    if (/temp/i.test(name))        return `${v.toFixed(1)}°C`;
    if (/power|watt/i.test(name))  return `${v.toFixed(0)} W`;
    if (/brightness|level|percent/i.test(name)) return `${Math.round(v)}%`;
    return String(v);
  }
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
