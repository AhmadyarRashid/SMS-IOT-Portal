import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import {
  ArrowLeft, Server, Cpu, Bell, Wifi, WifiOff,
  AlertTriangle, Search, X, LayoutGrid,
} from 'lucide-react';
import { useAsset, useGatewayChildren, useAlarms } from '../hooks/useAssets';
import { summariseGateway } from '../utils/gateways';
import {
  getCustomAssetType, getAssetTypeLabel, isAssetAlarming, getAssetDisplayName,
} from '../utils/assetIcons';
import AssetTile from '../components/tiles/AssetTile';
import AssetGlyph from '../components/tiles/AssetGlyph';
import { EmptyState, Skeleton } from '../components/ui';

/** Safety-first display order, same as before. Drives the chip order and
 * the default "All" flat-grid sort. */
const GROUP_ORDER = [
  'AlarmAsset', 'SOSAsset', 'SmokeSensorAsset',
  'CameraAsset',
  'DoorLockAsset', 'DoorSensorAsset',
  'MotionSensorAsset', 'HumanPresenceSensorAsset',
  'HeatSensorAsset', 'VibrationSensorAsset',
  'LightAsset', 'PlugAsset', 'FanAsset',
  'PanelAsset',
];

const GROUP_TITLE = {
  AlarmAsset: 'Security',
  SOSAsset: 'Emergency',
  SmokeSensorAsset: 'Smoke',
  CameraAsset: 'Cameras',
  DoorLockAsset: 'Locks',
  DoorSensorAsset: 'Doors',
  MotionSensorAsset: 'Motion',
  HumanPresenceSensorAsset: 'Presence',
  HeatSensorAsset: 'Temperature',
  VibrationSensorAsset: 'Vibration',
  LightAsset: 'Lights',
  PlugAsset: 'Plugs',
  FanAsset: 'Fans',
  PanelAsset: 'Panels',
};

const ALL = '__all__';
const ATTENTION = '__attention__';

export default function GatewayPage() {
  const { id } = useParams();
  const { data: gateway, isLoading: gLoad } = useAsset(id);
  const { data: children = [], isLoading: cLoad } = useGatewayChildren(id);
  const { data: alarms = [] } = useAlarms({ status: 'OPEN' });

  const [activeChip, setActiveChip] = useState(ALL);
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);

  // --- Flatten children, compute per-type counts + "needs attention" set ----
  const summary = summariseGateway(children);
  const gatewayAlarms = (alarms || []).filter(
    (a) => children.some((c) => c.id === a.assetId) || a.assetId === id
  );

  const typedChildren = useMemo(() => children.map((c) => ({
    asset: c,
    customType: getCustomAssetType(c),
  })), [children]);

  const countsByType = useMemo(() => {
    const m = new Map();
    for (const { customType } of typedChildren) {
      if (!customType) continue;
      m.set(customType, (m.get(customType) || 0) + 1);
    }
    return m;
  }, [typedChildren]);

  const attentionAssets = useMemo(() => typedChildren.filter(({ asset, customType }) => {
    if (asset.attributes?.connected?.value === false) return true;
    return isAssetAlarming(asset, customType);
  }), [typedChildren]);

  const chipOrder = useMemo(() => {
    const present = Array.from(countsByType.keys());
    return present.sort((a, b) => {
      const ai = GROUP_ORDER.indexOf(a);
      const bi = GROUP_ORDER.indexOf(b);
      if (ai === -1 && bi === -1) return a.localeCompare(b);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
  }, [countsByType]);

  // --- Active filter pipeline ------------------------------------------------
  const filteredAssets = useMemo(() => {
    let pool;
    if (activeChip === ATTENTION) pool = attentionAssets.map((x) => x.asset);
    else if (activeChip === ALL) pool = typedChildren.map((x) => x.asset);
    else pool = typedChildren.filter((x) => x.customType === activeChip).map((x) => x.asset);

    const q = search.trim().toLowerCase();
    if (q) pool = pool.filter((a) => (a.name || '').toLowerCase().includes(q));

    // Stable sort: safety-first by customType, then name.
    return [...pool].sort((a, b) => {
      const at = getCustomAssetType(a);
      const bt = getCustomAssetType(b);
      const ai = GROUP_ORDER.indexOf(at);
      const bi = GROUP_ORDER.indexOf(bt);
      if (ai !== bi) {
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      }
      return (a.name || '').localeCompare(b.name || '');
    });
  }, [activeChip, typedChildren, attentionAssets, search]);

  if (gLoad || cLoad) {
    return (
      <div className="p-4 md:p-6 max-w-[1280px] mx-auto space-y-5">
        <Skeleton.Box h={12} w={80} rounded={4} />
        <div className="flex items-start gap-4">
          <Skeleton.Circle size={48} />
          <div className="flex-1 flex flex-col gap-2">
            <Skeleton.Box h={22} w={240} rounded={6} />
            <Skeleton.Box h={12} w={320} rounded={4} />
          </div>
        </div>
        <div className="flex gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton.Box key={i} h={32} w={96} rounded={999} />
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-2.5">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton.Box key={i} h={72} rounded={16} />
          ))}
        </div>
      </div>
    );
  }

  if (!gateway) {
    return (
      <div className="p-6">
        <EmptyState
          icon={Server}
          title="Site not found"
          message="This gateway may have been removed or you don't have access."
          action={
            <Link to="/" className="text-sm text-[var(--color-accent-400)] hover:text-[var(--color-accent-300)]">
              Back to overview
            </Link>
          }
        />
      </div>
    );
  }

  const connected = gateway.attributes?.connected?.value !== false;
  const needsAttentionCount = attentionAssets.length + gatewayAlarms.length;

  return (
    <div className="p-4 md:p-6 max-w-[1280px] mx-auto space-y-5">
      <Link
        to="/sites"
        className="inline-flex items-center gap-1.5 text-xs text-[var(--color-ink-2)] hover:text-[var(--color-ink-0)]"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to sites
      </Link>

      {/* Minimal header — icon + name + one-line summary */}
      <header className="flex items-start gap-4 flex-wrap">
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
          style={{
            background: 'color-mix(in srgb, var(--color-accent-500) 16%, transparent)',
            color: 'var(--color-accent-400)',
          }}
        >
          <Server className="w-6 h-6" strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-[26px] md:text-[28px] font-bold text-[var(--color-ink-0)] leading-tight truncate">
            {getAssetDisplayName(gateway)}
          </h1>
          <p className="text-[13px] text-[var(--color-ink-2)] mt-1 flex items-center gap-2 flex-wrap">
            {connected ? (
              <span className="inline-flex items-center gap-1.5">
                <Wifi className="w-3.5 h-3.5 text-[var(--color-accent-400)]" />
                Connected
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <WifiOff className="w-3.5 h-3.5 text-[var(--color-ink-3)]" />
                Offline gateway
              </span>
            )}
            <span className="text-[var(--color-ink-3)]">·</span>
            <span>
              <strong className="text-[var(--color-ink-0)] tabular-nums">{summary.online}/{summary.total}</strong>{' '}
              devices online
            </span>
            {gatewayAlarms.length > 0 && (
              <>
                <span className="text-[var(--color-ink-3)]">·</span>
                <span className="text-[var(--color-danger-400)] font-semibold inline-flex items-center gap-1">
                  <Bell className="w-3 h-3" />
                  {gatewayAlarms.length} alarm{gatewayAlarms.length === 1 ? '' : 's'}
                </span>
              </>
            )}
          </p>
        </div>
      </header>

      {/* Chip filter + inline search */}
      {children.length > 0 && (
        <div className="flex items-center gap-2">
          <div className="flex gap-2 overflow-x-auto no-scrollbar flex-1 min-w-0 pr-1 -mx-1 px-1">
            <Chip
              active={activeChip === ALL}
              onClick={() => setActiveChip(ALL)}
              icon={LayoutGrid}
              label="All"
              count={children.length}
            />
            {needsAttentionCount > 0 && (
              <Chip
                active={activeChip === ATTENTION}
                onClick={() => setActiveChip(ATTENTION)}
                icon={AlertTriangle}
                label="Needs attention"
                count={attentionAssets.length}
                tone="alarm"
              />
            )}
            {chipOrder.map((type) => (
              <Chip
                key={type}
                active={activeChip === type}
                onClick={() => setActiveChip(type)}
                glyphType={type}
                label={GROUP_TITLE[type] || getAssetTypeLabel(type)}
                count={countsByType.get(type) || 0}
              />
            ))}
          </div>
          {children.length > 6 && (
            <InlineSearch
              value={search}
              onChange={setSearch}
              open={searchOpen}
              setOpen={setSearchOpen}
            />
          )}
        </div>
      )}

      {/* Grid */}
      {children.length === 0 ? (
        <EmptyState
          icon={Cpu}
          title="No devices yet"
          message="Devices linked to this gateway will appear here once registered."
        />
      ) : filteredAssets.length === 0 ? (
        <EmptyState
          icon={Search}
          title="Nothing matches"
          message={
            search
              ? `No devices found for "${search}".`
              : 'No devices match this filter.'
          }
        />
      ) : (
        <LayoutGroup>
          <motion.div
            layout
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-2.5"
          >
            <AnimatePresence mode="popLayout" initial={false}>
              {filteredAssets.map((asset, idx) => (
                <motion.div
                  key={asset.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{
                    type: 'spring', stiffness: 320, damping: 26,
                    delay: Math.min(idx * 0.015, 0.12),
                  }}
                >
                  <AssetTile asset={asset} />
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        </LayoutGroup>
      )}
    </div>
  );
}

/* ---------------- Chip ---------------- */

function Chip({ active, onClick, icon: Icon, glyphType, label, count, tone = 'default' }) {
  const isAlarm = tone === 'alarm';
  const activeStyle = isAlarm
    ? {
        background: 'color-mix(in srgb, var(--color-danger-500) 18%, transparent)',
        color: 'var(--color-danger-400)',
        borderColor: 'color-mix(in srgb, var(--color-danger-500) 40%, transparent)',
      }
    : {
        background: 'color-mix(in srgb, var(--color-accent-500) 14%, transparent)',
        color: 'var(--color-accent-400)',
        borderColor: 'color-mix(in srgb, var(--color-accent-500) 35%, transparent)',
      };

  const idleStyle = {
    background: 'var(--color-surface-1)',
    color: 'var(--color-ink-1)',
    borderColor: 'color-mix(in srgb, var(--color-ink-0) 10%, transparent)',
  };

  return (
    <motion.button
      layout
      onClick={onClick}
      whileTap={{ scale: 0.96 }}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12.5px] font-semibold border whitespace-nowrap transition-colors"
      style={active ? activeStyle : idleStyle}
      aria-pressed={active}
    >
      {Icon
        ? <Icon className="w-3.5 h-3.5" strokeWidth={2} />
        : glyphType
          ? <AssetGlyph customType={glyphType} className="w-3.5 h-3.5" strokeWidth={2} />
          : null}
      <span>{label}</span>
      <span
        className={`ml-0.5 px-1.5 rounded-full text-[10px] font-bold tabular-nums`}
        style={{
          background: active
            ? 'color-mix(in srgb, currentColor 16%, transparent)'
            : 'color-mix(in srgb, var(--color-ink-0) 8%, transparent)',
          color: 'inherit',
        }}
      >
        {count}
      </span>
    </motion.button>
  );
}

/* ---------------- Inline search ---------------- */

function InlineSearch({ value, onChange, open, setOpen }) {
  const inputRef = useRef(null);
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  return (
    <motion.div layout transition={{ type: 'spring', stiffness: 320, damping: 26 }} className="relative flex items-center flex-shrink-0">
      <AnimatePresence mode="wait" initial={false}>
        {open ? (
          <motion.div
            key="input"
            initial={{ width: 40, opacity: 0 }}
            animate={{ width: 220, opacity: 1 }}
            exit={{ width: 40, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            className="overflow-hidden"
          >
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-3)]" />
              <input
                ref={inputRef}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onBlur={() => { if (!value) setOpen(false); }}
                placeholder="Search devices…"
                className="w-full pl-9 pr-8 py-2 rounded-full text-[12.5px] outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--color-accent-500)_30%,transparent)]"
                style={{
                  background: 'var(--color-surface-1)',
                  color: 'var(--color-ink-0)',
                  border: '1px solid color-mix(in srgb, var(--color-ink-0) 10%, transparent)',
                }}
              />
              {value && (
                <button
                  onClick={() => { onChange(''); setOpen(false); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-[var(--color-ink-3)] hover:text-[var(--color-ink-0)]"
                  aria-label="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </motion.div>
        ) : (
          <motion.button
            key="btn"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            onClick={() => setOpen(true)}
            className="w-9 h-9 rounded-full flex items-center justify-center text-[var(--color-ink-1)] hover:text-[var(--color-ink-0)]"
            style={{
              background: 'var(--color-surface-1)',
              border: '1px solid color-mix(in srgb, var(--color-ink-0) 10%, transparent)',
            }}
            aria-label="Search devices"
          >
            <Search className="w-4 h-4" />
          </motion.button>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

