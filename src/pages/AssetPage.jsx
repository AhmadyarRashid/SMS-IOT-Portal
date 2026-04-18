import { useMemo, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  ArrowLeft, Gauge, SlidersHorizontal, LineChart as LineIcon, Bell, Info, Power,
  Pencil, Check, X as XIcon,
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
  getAssetDisplayName, DISPLAY_NAME_ATTR, canRenameAsset,
} from '../utils/assetIcons';
import { formatRelativeTime, getTimeRanges } from '../utils/helpers';
import { LoadingSpinner, EmptyState, Tip, Skeleton } from '../components/ui';
import AssetGlyph from '../components/tiles/AssetGlyph';
import './asset-detail.css';

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
  const isControllable = asset
    ? CONTROLLABLE_TYPES.includes(getCustomAssetType(asset))
    : false;

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 max-w-[1100px] mx-auto space-y-5">
        <Skeleton.Box h={12} w={80} rounded={4} />
        <Skeleton.Hero />
        <Skeleton.Box h={52} w={380} rounded={14} />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton.Box key={i} h={88} rounded={16} />
          ))}
        </div>
      </div>
    );
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
        {gateway ? `Back to ${getAssetDisplayName(gateway)}` : 'Back to sites'}
      </Link>

      <Hero asset={asset} gateway={gateway} />

      <PrimaryControlPanel asset={asset} />

      {isControllable && (
        <Tip id="asset-icon-tap" title="Quick tip">
          Tap the big circular icon above to toggle this device. Sensors and cameras open this
          same view but are read-only.
        </Tip>
      )}

      {/* Pill tabs */}
      <div className="ad-tabs no-scrollbar">
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`ad-tab ${active ? 'ad-tab-active' : ''}`}
              aria-pressed={active}
            >
              <t.icon className="w-4 h-4" strokeWidth={1.75} />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      <AnimatePresence>
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18 }}
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

function Hero({ asset, gateway }) {
  const customType = getCustomAssetType(asset);
  const active = isAssetActive(asset, customType);
  const alarm = isAssetAlarming(asset, customType);
  const label = getStateLabel(asset, customType);
  const controllable = CONTROLLABLE_TYPES.includes(customType);
  const primaryAttr = getPrimaryControlAttr(asset, customType);
  const write = useWriteAttribute();

  const mood = alarm ? 'alarm' : active ? 'on' : 'off';
  const tone = mood;

  const handleIconClick = () => {
    if (!controllable || !primaryAttr) return;
    write.mutate({
      assetId: asset.id,
      attributeName: primaryAttr,
      value: nextToggleValue(asset, primaryAttr),
    });
  };

  const connected = asset.attributes?.connected?.value !== false;
  // Last-updated = most recent timestamp across all attributes.
  const lastUpdated = useMemo(() => {
    const ts = Object.values(asset.attributes || {})
      .map((a) => a?.timestamp)
      .filter((t) => Number.isFinite(t));
    return ts.length ? Math.max(...ts) : null;
  }, [asset.attributes]);

  return (
    <div className={`ad-hero ad-hero-${mood}`} data-mood={mood}>
      {/* Drifting mood halo */}
      <span className="ad-hero-halo" aria-hidden="true" />

      {/* Info strip — type · connection · updated · site */}
      <div className="ad-hero-strip">
        <span className="ad-hero-type">{getAssetTypeLabel(customType)}</span>
        <span className="ad-hero-sep">·</span>
        <span className="inline-flex items-center gap-1.5">
          <span className={`status-dot ${connected ? 'status-dot-on' : 'status-dot-off'}`} />
          <span className={connected ? 'text-[var(--color-accent-400)]' : 'text-[var(--color-ink-3)]'}>
            {connected ? 'Connected' : 'Offline'}
          </span>
        </span>
        {lastUpdated && (
          <>
            <span className="ad-hero-sep">·</span>
            <span className="text-[var(--color-ink-2)]">Updated {formatRelativeTime(lastUpdated)}</span>
          </>
        )}
        {gateway && (
          <>
            <span className="ad-hero-sep">·</span>
            <Link
              to={`/g/${gateway.id}`}
              className="text-[var(--color-ink-2)] hover:text-[var(--color-ink-0)] transition-colors truncate max-w-[160px]"
            >
              {getAssetDisplayName(gateway)}
            </Link>
          </>
        )}
      </div>

      {/* Big clickable icon — primary control for controllable devices */}
      <div className="flex justify-center my-5">
        <motion.button
          onClick={handleIconClick}
          disabled={!controllable || write.isPending}
          whileHover={controllable ? { scale: 1.04 } : {}}
          whileTap={controllable ? { scale: 0.94 } : {}}
          transition={{ type: 'spring', stiffness: 340, damping: 20 }}
          className={`ha-hero-icon ha-hero-icon-${tone} ${controllable ? 'ha-hero-icon-btn' : ''}`}
          aria-label={controllable ? `Toggle ${getAssetDisplayName(asset)}` : getAssetDisplayName(asset)}
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

      <EditableName asset={asset} />
      <motion.p
        key={label}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className={`ad-hero-state ${
          alarm ? 'ad-hero-state-alarm'
            : active ? 'ad-hero-state-on'
            : 'ad-hero-state-off'
        }`}
      >
        {label}
      </motion.p>

      {controllable && primaryAttr && (
        <div className="mt-3 flex justify-center">
          <span className="ad-hero-hint">
            <Power className="w-3 h-3" />
            Tap the icon to turn {active ? 'off' : 'on'}
          </span>
        </div>
      )}
    </div>
  );
}

/* ---------------- Editable name ----------------
 * Inline-rename UI on the hero. Writes the chosen name to the standard OR
 * `notes` attribute via useWriteAttribute — already optimistically patched
 * into the React Query cache, so every tile / card / search result that
 * uses getAssetDisplayName() re-renders instantly with the new label. Name
 * persists server-side, so it syncs across every browser the user signs
 * in from.
 *
 * The underlying asset.name is never mutated — that endpoint needs admin
 * permission this portal doesn't have (and shouldn't need).
 */
function EditableName({ asset }) {
  const currentName = getAssetDisplayName(asset);
  const renameable = canRenameAsset(asset);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(currentName);
  const inputRef = useRef(null);
  const write = useWriteAttribute();

  // Asset types where the backend reuses `notes` for structured data (see
  // NOTES_USED_FOR_DATA in assetIcons.js) — we show the server name without
  // any edit affordance so we can't accidentally overwrite real data.
  if (!renameable) {
    return <h1 className="ad-hero-name">{currentName}</h1>;
  }

  const start = () => {
    setDraft(currentName);
    setEditing(true);
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
  };

  const cancel = () => {
    setEditing(false);
    setDraft(currentName);
  };

  const save = () => {
    const next = draft.trim();
    if (!next || next === currentName) {
      cancel();
      return;
    }
    write.mutate({
      assetId: asset.id,
      attributeName: DISPLAY_NAME_ATTR,
      value: next,
    }, {
      onSuccess: () => toast.success('Name saved'),
    });
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="ad-hero-name-edit">
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); save(); }
            else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
          }}
          maxLength={120}
          className="ad-hero-name-input"
          aria-label="Edit device name"
        />
        <button
          onClick={save}
          disabled={write.isPending}
          aria-label="Save name"
          className="ad-name-btn ad-name-btn-ok"
        >
          <Check className="w-4 h-4" strokeWidth={2.25} />
        </button>
        <button
          onClick={cancel}
          disabled={write.isPending}
          aria-label="Cancel"
          className="ad-name-btn"
        >
          <XIcon className="w-4 h-4" strokeWidth={2.25} />
        </button>
      </div>
    );
  }

  return (
    <div className="ad-hero-name-wrap">
      <h1 className="ad-hero-name">{currentName}</h1>
      <button
        onClick={start}
        aria-label="Edit device name"
        title="Rename"
        className="ad-name-btn ad-name-btn-ghost"
      >
        <Pencil className="w-3.5 h-3.5" strokeWidth={2} />
      </button>
    </div>
  );
}

/* ---------------- Primary control panel ----------------
 * Renders inline below the hero for the most common secondary actions:
 *   LightAsset.brightness → slider
 *   FanAsset.speed        → slider
 * Everything else returns null (hero's tap is the full control). The
 * Controls tab still exposes every writable attribute — this panel is
 * purely a shortcut for the 80% case.
 */
const PRIMARY_SLIDER_ATTR = {
  LightAsset: ['brightness', 'level'],
  FanAsset:   ['speed', 'Fan_speed', 'fanSpeed'],
};

function firstNumericAttr(attrs, candidates) {
  for (const name of candidates) {
    const a = attrs?.[name];
    if (a && typeof a.value === 'number') return [name, a];
  }
  return null;
}

function PrimaryControlPanel({ asset }) {
  const customType = getCustomAssetType(asset);
  const candidates = PRIMARY_SLIDER_ATTR[customType];
  if (!candidates) return null;
  const match = firstNumericAttr(asset.attributes, candidates);
  if (!match) return null;
  const [attrName, attr] = match;
  return (
    <div className="panel p-4 flex items-center gap-4">
      <div className="flex-1 min-w-0">
        <PrimarySlider
          assetId={asset.id}
          attrName={attrName}
          attr={attr}
          label={attrName === 'brightness' ? 'Brightness' : attrName === 'level' ? 'Level' : 'Speed'}
        />
      </div>
    </div>
  );
}

/**
 * Slider that commits on release (mouseup / touchend / keyboard change-end)
 * and otherwise shows the server value. Pattern avoids setState-in-effect
 * cascade by using a nullable `draft` instead of syncing server → local.
 */
function PrimarySlider({ assetId, attrName, attr, label }) {
  const write = useWriteAttribute();
  const [draft, setDraft] = useState(null);
  const { min = 0, max = 100, unit = '' } = attr?.meta || {};
  const serverValue = Number(attr?.value) || 0;
  const displayValue = draft ?? serverValue;

  const commit = () => {
    if (draft !== null && draft !== serverValue) {
      write.mutate({ assetId, attributeName: attrName, value: draft });
    }
    setDraft(null);
  };

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2.5">
        <p className="text-[13px] font-semibold text-[var(--color-ink-1)]">{label}</p>
        <p className="text-[18px] font-bold text-[var(--color-accent-400)] tabular-nums">
          {displayValue}{unit}
        </p>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={displayValue}
        onChange={(e) => setDraft(Number(e.target.value))}
        onMouseUp={commit}
        onTouchEnd={commit}
        onKeyUp={commit}
        onBlur={commit}
        className="ha-slider w-full"
        aria-label={label}
      />
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

  // Feature the primary reading first, rest follow.
  const primaryEntry = entries.find(([n]) => n === primaryReading);
  const restEntries = entries.filter(([n]) => n !== primaryReading);

  return (
    <div className="space-y-3">
      {primaryEntry && (
        <FeatureTile name={primaryEntry[0]} attr={primaryEntry[1]} />
      )}
      {restEntries.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
          {restEntries.map(([name, attr]) => (
            <AttrTile key={name} name={name} attr={attr} />
          ))}
        </div>
      )}
    </div>
  );
}

function FeatureTile({ name, attr }) {
  const unit = attr?.meta?.unit || '';
  const displayValue = renderValue(attr.value, name);
  // Split value and unit when the value already includes the unit
  const numeric = typeof attr.value === 'number' ? attr.value : null;
  return (
    <div className="ad-feature">
      <div className="ad-feature-accent" aria-hidden="true" />
      <div className="relative z-[1]">
        <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--color-ink-2)] font-semibold">
          {prettyName(name)}
        </p>
        <div className="mt-2 flex items-end gap-2">
          <p className="ad-feature-value">
            {numeric != null ? numeric.toLocaleString(undefined, { maximumFractionDigits: 2 }) : displayValue}
          </p>
          {numeric != null && unit && <span className="ad-feature-unit">{unit}</span>}
        </div>
        {attr.timestamp && (
          <p className="text-[11px] text-[var(--color-ink-3)] mt-2 inline-flex items-center gap-1.5">
            <span className="status-dot status-dot-on" style={{ width: 6, height: 6 }} />
            {formatRelativeTime(attr.timestamp)}
          </p>
        )}
      </div>
    </div>
  );
}

function AttrTile({ name, attr }) {
  const unit = attr?.meta?.unit || '';
  const display = renderValue(attr.value, name);
  return (
    <div className="ad-attr-tile">
      <p className="text-[10px] uppercase tracking-wide text-[var(--color-ink-3)] font-medium truncate">
        {prettyName(name)}
      </p>
      <p className="mt-1.5 text-[17px] font-bold text-[var(--color-ink-0)] leading-tight break-all">
        {display}{typeof attr.value === 'number' && unit ? ` ${unit}` : ''}
      </p>
      {attr.timestamp && (
        <p className="text-[10px] text-[var(--color-ink-3)] mt-1.5">
          {formatRelativeTime(attr.timestamp)}
        </p>
      )}
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
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} debounce={50}>
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
