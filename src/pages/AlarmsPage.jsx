import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import {
  Bell, AlertTriangle, AlertCircle, Info, Clock, Cpu, Building2,
  Search, X, ArrowDownUp, Check, CheckCheck, MapPin, ExternalLink,
} from 'lucide-react';
import { format, formatDistanceToNowStrict, subDays, startOfDay, isSameDay } from 'date-fns';
import { useAlarms, useUpdateAlarmStatus, useAssets } from '../hooks/useAssets';
import { formatRelativeTime } from '../utils/helpers';
import {
  getCustomAssetType, getAssetTypeLabel, getAssetDisplayName,
} from '../utils/assetIcons';
import { findGatewayForAsset, pickGateways } from '../utils/gateways';
import AssetGlyph from '../components/tiles/AssetGlyph';
import { Skeleton } from '../components/ui';
import './alarms.css';

const SEVERITY_META = {
  CRITICAL: { icon: AlertTriangle, klass: 'sev-critical', label: 'Critical' },
  HIGH:     { icon: AlertTriangle, klass: 'sev-high',     label: 'High' },
  MEDIUM:   { icon: AlertCircle,   klass: 'sev-medium',   label: 'Medium' },
  LOW:      { icon: Info,          klass: 'sev-low',      label: 'Low' },
};
const SEVERITY_ORDER = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

const STATUSES = ['OPEN', 'ACKNOWLEDGED', 'RESOLVED'];
const STATUS_LABEL = {
  OPEN: 'Open',
  ACKNOWLEDGED: 'Acknowledged',
  IN_PROGRESS: 'In progress',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
};

const SORT_OPTIONS = [
  { id: 'newest',   label: 'Newest first' },
  { id: 'oldest',   label: 'Oldest first' },
  { id: 'severity', label: 'By severity' },
];

/**
 * Resolve the asset linked to an alarm directly from the alarm payload.
 *
 * SMS IoT ships alarms with `alarm.asset` as an **ARRAY of full asset
 * objects** (despite the singular name) — see the real wire payload. We
 * prefer that first. If the field is missing entirely (e.g. a MANUAL
 * testing alarm with no link), we fall back to id-carrying fields and
 * look them up in the cached asset map so older/variant OR versions
 * still work.
 *
 * Returns the asset object (or null if it can't be resolved).
 */
function resolveAlarmAsset(alarm, assetMap) {
  if (!alarm) return null;

  // --- Primary: alarm.asset is an array of full asset objects -----------
  if (Array.isArray(alarm.asset) && alarm.asset.length > 0) {
    const first = alarm.asset[0];
    if (first && typeof first === 'object' && first.id) return first;
  }

  // --- Other shapes (defensive fallbacks for variant OR versions) -------
  if (alarm.asset && typeof alarm.asset === 'object' && !Array.isArray(alarm.asset) && alarm.asset.id) {
    return alarm.asset;
  }
  if (Array.isArray(alarm.assets) && alarm.assets.length > 0) {
    const first = alarm.assets[0];
    if (first && typeof first === 'object' && first.id) return first;
  }
  if (Array.isArray(alarm.linkedAssets) && alarm.linkedAssets.length > 0) {
    const first = alarm.linkedAssets[0];
    if (first && typeof first === 'object' && first.id) return first;
  }

  // --- Id-only fields → look up in the cached asset map -----------------
  const ids = [];
  if (typeof alarm.assetId === 'string') ids.push(alarm.assetId);
  if ((alarm.source === 'INTERNAL' || alarm.source === 'CLIENT') && alarm.sourceId) {
    ids.push(alarm.sourceId);
  }
  if (Array.isArray(alarm.assetIds)) ids.push(...alarm.assetIds);
  if (Array.isArray(alarm.linkedAssets)) {
    for (const l of alarm.linkedAssets) {
      if (typeof l === 'string') ids.push(l);
      else if (l && typeof l === 'object' && (l.assetId || l.id)) ids.push(l.assetId || l.id);
    }
  }
  if (Array.isArray(alarm.assetLinks)) {
    for (const l of alarm.assetLinks) if (l?.assetId) ids.push(l.assetId);
  }

  for (const id of ids) {
    if (assetMap && assetMap.has(id)) return assetMap.get(id);
  }
  return null;
}

/** Best-effort extract of [lat, lng] from an asset's location attribute. */
function extractLatLng(asset) {
  const loc = asset?.attributes?.location?.value;
  if (!loc) return null;
  if (loc.type === 'Point' && Array.isArray(loc.coordinates) && loc.coordinates.length >= 2) {
    const [lng, lat] = loc.coordinates;
    if (Number.isFinite(lat) && Number.isFinite(lng)) return [lat, lng];
  }
  if (Number.isFinite(loc.lat) && Number.isFinite(loc.lng)) return [loc.lat, loc.lng];
  if (Number.isFinite(loc.latitude) && Number.isFinite(loc.longitude)) return [loc.latitude, loc.longitude];
  return null;
}

export default function AlarmsPage() {
  const { data: alarms = [], isLoading } = useAlarms();
  const { data: assets = [] } = useAssets({});
  const update = useUpdateAlarmStatus();

  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [sev, setSev] = useState('all');
  const [status, setStatus] = useState('OPEN'); // default to Open so the page is triage-focused
  const [sortBy, setSortBy] = useState('newest');

  // Index assets by id so each alarm can resolve its device + site in O(1).
  const assetMap = useMemo(() => {
    const m = new Map();
    for (const a of assets) m.set(a.id, a);
    return m;
  }, [assets]);
  const gateways = useMemo(() => pickGateways(assets), [assets]);

  const list = useMemo(() => (Array.isArray(alarms) ? alarms : []), [alarms]);

  // Severity counts drive the chip counts.
  const sevCounts = useMemo(() => {
    const c = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
    for (const a of list) {
      if (a.status !== 'OPEN') continue;
      if (c[a.severity] !== undefined) c[a.severity]++;
    }
    return c;
  }, [list]);

  const statusCounts = useMemo(() => {
    const c = {};
    for (const a of list) c[a.status] = (c[a.status] || 0) + 1;
    return c;
  }, [list]);

  const resolvedToday = useMemo(() => {
    const today = startOfDay(new Date()).getTime();
    return list.filter((a) =>
      (a.status === 'RESOLVED' || a.status === 'CLOSED')
      && (a.lastModified || a.createdOn || 0) >= today
    ).length;
  }, [list]);

  // 7-day trend for the sparkline — one bar per day, opened alarms only.
  const trend = useMemo(() => {
    const today = startOfDay(new Date());
    const days = Array.from({ length: 7 }, (_, i) => subDays(today, 6 - i));
    return days.map((d) => ({
      date: d,
      count: list.filter((a) => a.createdOn && isSameDay(new Date(a.createdOn), d)).length,
    }));
  }, [list]);
  const trendMax = Math.max(1, ...trend.map((d) => d.count));

  // ---- filtering + sorting ------------------------------------------------
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let pool = list.filter((a) => {
      if (sev !== 'all' && a.severity !== sev) return false;
      if (status !== 'all' && a.status !== status) return false;
      if (q) {
        const asset = resolveAlarmAsset(a, assetMap);
        const hay = [
          a.title, a.content, a.sourceName,
          asset ? getAssetDisplayName(asset) : '',
          asset ? getAssetTypeLabel(getCustomAssetType(asset)) : '',
        ].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    pool = [...pool].sort((a, b) => {
      if (sortBy === 'severity') {
        const ds = (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9);
        if (ds !== 0) return ds;
        return (b.createdOn || 0) - (a.createdOn || 0);
      }
      if (sortBy === 'oldest') return (a.createdOn || 0) - (b.createdOn || 0);
      return (b.createdOn || 0) - (a.createdOn || 0);
    });
    return pool;
  }, [list, sev, status, search, sortBy, assetMap]);

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 max-w-[1200px] mx-auto space-y-5">
        <Skeleton.Box h={32} w={200} rounded={10} />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton.Box key={i} h={72} rounded={16} />)}
        </div>
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton.Box key={i} h={120} rounded={16} />
        ))}
      </div>
    );
  }

  return (
    <div className="alarms-page p-4 md:p-6 max-w-[1200px] mx-auto space-y-5">
      {/* Hero */}
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <span className={`alarm-live-dot ${sevCounts.CRITICAL > 0 ? 'alarm-live-dot-critical' : ''}`} />
            <h1 className="text-3xl md:text-[34px] font-bold leading-tight text-[var(--color-ink-0)] tracking-tight">
              Alarms
            </h1>
          </div>
          <SummaryLine
            sevCounts={sevCounts}
            openCount={statusCounts.OPEN || 0}
            resolvedToday={resolvedToday}
          />
        </div>

        <Sparkline data={trend} max={trendMax} />
      </header>

      {/* Filter + sort bar */}
      <div className="flex items-center gap-2">
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar flex-1 min-w-0 pr-1">
          <SeverityChip active={sev === 'all'} onClick={() => setSev('all')} label="All" count={list.length} tone="default" />
          <SeverityChip active={sev === 'CRITICAL'} onClick={() => setSev('CRITICAL')} label="Critical" count={sevCounts.CRITICAL} tone="critical" />
          <SeverityChip active={sev === 'HIGH'} onClick={() => setSev('HIGH')} label="High" count={sevCounts.HIGH} tone="high" />
          <SeverityChip active={sev === 'MEDIUM'} onClick={() => setSev('MEDIUM')} label="Medium" count={sevCounts.MEDIUM} tone="medium" />
          <SeverityChip active={sev === 'LOW'} onClick={() => setSev('LOW')} label="Low" count={sevCounts.LOW} tone="low" />
          <span className="alarm-chip-divider" />
          <StatusChip active={status === 'all'} onClick={() => setStatus('all')} label="All" />
          {STATUSES.map((s) => (
            <StatusChip
              key={s}
              active={status === s}
              onClick={() => setStatus(s)}
              label={STATUS_LABEL[s]}
              count={statusCounts[s] || 0}
            />
          ))}
        </div>

        <SortMenu value={sortBy} onChange={setSortBy} />
        <InlineSearch value={search} onChange={setSearch} open={searchOpen} setOpen={setSearchOpen} />
      </div>

      {/* Feed */}
      {filtered.length === 0 ? (
        <AllClearEmpty hasFilters={!!search || sev !== 'all' || status !== 'all'} />
      ) : (
        <LayoutGroup>
          <motion.ul layout className="space-y-2.5">
            <AnimatePresence mode="popLayout" initial={false}>
              {filtered.map((al, idx) => (
                <AlarmCard
                  key={al.id}
                  alarm={al}
                  assetMap={assetMap}
                  gateways={gateways}
                  update={update}
                  enterDelay={Math.min(idx * 0.02, 0.12)}
                />
              ))}
            </AnimatePresence>
          </motion.ul>
        </LayoutGroup>
      )}
    </div>
  );
}

/* ==================================================================
   Hero pieces
   ================================================================== */

function SummaryLine({ sevCounts, openCount, resolvedToday }) {
  const parts = [];
  parts.push(
    <span key="open">
      <strong className="text-[var(--color-ink-0)] tabular-nums">{openCount}</strong>{' '}
      open
    </span>
  );
  if (sevCounts.CRITICAL > 0) {
    parts.push(
      <span key="crit" className="text-[var(--color-danger-400)] font-semibold">
        {sevCounts.CRITICAL} critical
      </span>
    );
  }
  if (sevCounts.HIGH > 0) {
    parts.push(
      <span key="high" className="text-[var(--color-warning-400)] font-semibold">
        {sevCounts.HIGH} high
      </span>
    );
  }
  if (resolvedToday > 0) {
    parts.push(
      <span key="res" className="text-[var(--color-accent-400)] font-semibold">
        {resolvedToday} resolved today
      </span>
    );
  }
  if (openCount === 0 && sevCounts.CRITICAL === 0) {
    parts.push(<span key="quiet" className="text-[var(--color-accent-400)] font-semibold">All quiet</span>);
  }
  return (
    <p className="text-sm text-[var(--color-ink-2)] mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
      {parts.map((p, i) => (
        <span key={i} className="inline-flex items-center gap-2.5">
          {i > 0 && <span className="text-[var(--color-ink-3)]">·</span>}
          {p}
        </span>
      ))}
    </p>
  );
}

function Sparkline({ data, max }) {
  return (
    <div className="alarm-spark" title="Alarms per day over the last 7 days">
      {data.map((d, i) => {
        const h = Math.max(4, Math.round((d.count / max) * 36));
        return (
          <motion.span
            key={i}
            className="alarm-spark-bar"
            initial={{ scaleY: 0 }}
            animate={{ scaleY: 1 }}
            transition={{ delay: i * 0.04, type: 'spring', stiffness: 240, damping: 22 }}
            style={{ height: h }}
            data-today={isSameDay(d.date, new Date()) ? 'true' : undefined}
            aria-label={`${format(d.date, 'EEE')}: ${d.count} alarms`}
          />
        );
      })}
    </div>
  );
}

/* ==================================================================
   Filter chips
   ================================================================== */

function SeverityChip({ active, onClick, label, count, tone }) {
  return (
    <motion.button
      layout
      onClick={onClick}
      whileTap={{ scale: 0.96 }}
      className={`alarm-chip alarm-chip-${tone} ${active ? 'alarm-chip-active' : ''}`}
      aria-pressed={active}
    >
      <span>{label}</span>
      <span className="alarm-chip-count">{count}</span>
    </motion.button>
  );
}

function StatusChip({ active, onClick, label, count }) {
  return (
    <motion.button
      layout
      onClick={onClick}
      whileTap={{ scale: 0.96 }}
      className={`alarm-chip alarm-chip-status ${active ? 'alarm-chip-status-active' : ''}`}
      aria-pressed={active}
    >
      <span>{label}</span>
      {typeof count === 'number' && <span className="alarm-chip-count">{count}</span>}
    </motion.button>
  );
}

/* ==================================================================
   Sort menu
   ================================================================== */

function SortMenu({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    window.addEventListener('click', onClick);
    return () => window.removeEventListener('click', onClick);
  }, []);

  const currentLabel = SORT_OPTIONS.find((o) => o.id === value)?.label || 'Sort';

  return (
    <div className="relative flex-shrink-0" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="alarm-sort-btn"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <ArrowDownUp className="w-3.5 h-3.5" strokeWidth={2} />
        <span>{currentLabel}</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="alarm-sort-menu"
            role="menu"
          >
            {SORT_OPTIONS.map((o) => {
              const active = value === o.id;
              return (
                <button
                  key={o.id}
                  onClick={() => { onChange(o.id); setOpen(false); }}
                  className={`alarm-sort-item ${active ? 'alarm-sort-item-active' : ''}`}
                  role="menuitem"
                >
                  {active && <Check className="w-3.5 h-3.5" strokeWidth={2.25} />}
                  <span className={active ? '' : 'pl-5'}>{o.label}</span>
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ==================================================================
   Inline expanding search
   ================================================================== */

function InlineSearch({ value, onChange, open, setOpen }) {
  const inputRef = useRef(null);
  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);

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
                placeholder="Search alarms…"
                className="alarm-search-input"
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
            className="alarm-search-toggle"
            aria-label="Search alarms"
          >
            <Search className="w-4 h-4" />
          </motion.button>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ==================================================================
   Alarm card
   ================================================================== */

function AlarmCard({ alarm, assetMap, gateways, update, enterDelay }) {
  // Resolve the linked asset straight from the alarm object — no extra HTTP.
  // When the alarm carries only an id, we resolve it against the cached
  // asset map that useAssets() already keeps fresh in the background.
  const asset = resolveAlarmAsset(alarm, assetMap);
  const gateway = asset ? findGatewayForAsset(asset, gateways) : null;

  // Location can live on the device OR on its parent gateway — prefer the
  // device (more precise) and fall back to the site.
  const latLng = extractLatLng(asset) || extractLatLng(gateway);

  const meta = SEVERITY_META[alarm.severity] || SEVERITY_META.LOW;
  const SevIcon = meta.icon;
  const isResolved = alarm.status === 'RESOLVED' || alarm.status === 'CLOSED';
  const isAcked = alarm.status === 'ACKNOWLEDGED' || alarm.status === 'IN_PROGRESS';
  const assetName = asset
    ? getAssetDisplayName(asset)
    : (alarm.sourceName || alarm.source || '—');
  const assetType = asset ? getCustomAssetType(asset) : null;
  const siteName = gateway ? getAssetDisplayName(gateway) : null;
  const createdAt = alarm.createdOn ? new Date(alarm.createdOn) : null;
  const isCritical = alarm.severity === 'CRITICAL' && alarm.status === 'OPEN';

  const openOnMap = () => {
    if (!latLng && !gateway?.id) return;
    // Prefer the in-app /map scoped to this site so the user stays in the
    // portal experience. MapPage reads ?focus=<gatewayId> to auto-select.
    const url = gateway?.id ? `/map?focus=${encodeURIComponent(gateway.id)}` : '/map';
    window.open(url, '_blank', 'noopener');
  };

  const ackPending = update.isPending
    && update.variables?.alarm?.id === alarm.id
    && update.variables?.status === 'ACKNOWLEDGED';
  const resolvePending = update.isPending
    && update.variables?.alarm?.id === alarm.id
    && update.variables?.status === 'RESOLVED';

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      whileHover={{ y: -2 }}
      // Split transitions: the staggered delay is for the initial fade-in
      // only — layout repositions (when filters/sort reshuffle the list)
      // use a snappier spring with zero delay, so surviving cards don't
      // pause before gliding to their new slot.
      transition={{
        default: { type: 'spring', stiffness: 320, damping: 28, delay: enterDelay },
        layout:  { type: 'spring', stiffness: 420, damping: 38, mass: 0.6 },
      }}
      className={`alarm-card alarm-card-${meta.klass.replace('sev-', '')} ${isCritical ? 'alarm-card-critical' : ''} ${isResolved ? 'alarm-card-resolved' : ''}`}
    >
      {/* Severity left rail */}
      <span className="alarm-card-rail" aria-hidden="true" />

      <div className="alarm-card-body">
        {/* Top row: icon + title + severity + status */}
        <div className="flex items-start gap-3">
          <div className={`alarm-card-badge ${meta.klass}`}>
            <SevIcon className="w-4 h-4" strokeWidth={2} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-[14.5px] font-semibold text-[var(--color-ink-0)] leading-tight">
                {alarm.title || 'Alarm'}
              </h3>
              <span className={`alarm-sev-pill ${meta.klass}`}>{meta.label}</span>
              <span className={`alarm-status-pill alarm-status-${alarm.status?.toLowerCase() || 'open'}`}>
                {isAcked && <Check className="w-3 h-3" strokeWidth={2.5} />}
                {isResolved && <CheckCheck className="w-3 h-3" strokeWidth={2.5} />}
                {STATUS_LABEL[alarm.status] || alarm.status}
              </span>
            </div>
            {alarm.content && (
              <p className="text-[12.5px] text-[var(--color-ink-2)] mt-1 leading-snug">
                {alarm.content}
              </p>
            )}
          </div>

          {/* Actions */}
          {!isResolved && (
            <div className="alarm-actions">
              {alarm.status === 'OPEN' && (
                <ActionBtn
                  pending={ackPending}
                  onClick={() => update.mutate({ alarm, status: 'ACKNOWLEDGED' })}
                  icon={Check}
                >
                  Ack
                </ActionBtn>
              )}
              <ActionBtn
                pending={resolvePending}
                onClick={() => update.mutate({ alarm, status: 'RESOLVED' })}
                icon={CheckCheck}
                tone="ok"
              >
                Resolve
              </ActionBtn>
            </div>
          )}
        </div>

        {/* Info grid: site + device + location + when */}
        <div className={`alarm-info-grid ${latLng || gateway ? 'alarm-info-grid-4' : ''}`}>
          <InfoCell
            icon={Building2}
            label="Site"
            href={gateway ? `/g/${gateway.id}` : null}
            value={siteName || 'Unassigned'}
            muted={!gateway}
          />
          <InfoCell
            glyphType={assetType}
            fallbackIcon={Cpu}
            label={assetType ? getAssetTypeLabel(assetType) : 'Device'}
            href={asset?.id ? `/a/${asset.id}` : null}
            value={assetName}
            muted={!asset}
          />
          {(latLng || gateway) && (
            <InfoCell
              icon={MapPin}
              label="Location"
              value={latLng
                ? `${latLng[0].toFixed(4)}°, ${latLng[1].toFixed(4)}°`
                : 'View on map'}
              sub={latLng ? 'Tap to open map' : null}
              onClick={openOnMap}
              trailingIcon={ExternalLink}
            />
          )}
          <InfoCell
            icon={Clock}
            label="Raised"
            value={createdAt ? formatRelativeTime(createdAt.getTime()) : '—'}
            hint={createdAt ? `${format(createdAt, 'PP')} · ${format(createdAt, 'p')}` : null}
            sub={createdAt && alarm.status === 'OPEN'
              ? `open for ${formatDistanceToNowStrict(createdAt)}`
              : null}
          />
        </div>
      </div>
    </motion.li>
  );
}

function InfoCell({
  icon: Icon, glyphType, fallbackIcon: Fallback, trailingIcon: Trailing,
  label, value, sub, href, muted, hint, onClick,
}) {
  const content = (
    <>
      <span className="alarm-info-icon">
        {glyphType
          ? <AssetGlyph customType={glyphType} className="w-3.5 h-3.5" strokeWidth={2} />
          : Icon
            ? <Icon className="w-3.5 h-3.5" strokeWidth={2} />
            : Fallback
              ? <Fallback className="w-3.5 h-3.5" strokeWidth={2} />
              : null}
      </span>
      <span className="alarm-info-text min-w-0">
        <span className="alarm-info-label">{label}</span>
        <span className={`alarm-info-value ${muted ? 'alarm-info-muted' : ''}`} title={hint || undefined}>
          {value}
        </span>
        {sub && <span className="alarm-info-sub">{sub}</span>}
      </span>
      {Trailing && (
        <Trailing className="alarm-info-trailing w-3.5 h-3.5" strokeWidth={2} />
      )}
    </>
  );

  if (href) {
    return <Link to={href} className="alarm-info-cell alarm-info-link">{content}</Link>;
  }
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="alarm-info-cell alarm-info-link alarm-info-action"
      >
        {content}
      </button>
    );
  }
  return <div className="alarm-info-cell">{content}</div>;
}

/* ==================================================================
   Action button
   ================================================================== */

function ActionBtn({ children, onClick, pending = false, icon: Icon, tone = 'accent' }) {
  return (
    <motion.button
      onClick={onClick}
      disabled={pending}
      whileTap={{ scale: 0.94 }}
      transition={{ type: 'spring', stiffness: 500, damping: 22 }}
      className={`alarm-action alarm-action-${tone}`}
    >
      {Icon && <Icon className="w-3.5 h-3.5" strokeWidth={2.25} />}
      <span>{pending ? '…' : children}</span>
    </motion.button>
  );
}

/* ==================================================================
   Empty state
   ================================================================== */

function AllClearEmpty({ hasFilters }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="alarm-empty">
        <span className="alarm-empty-ring alarm-empty-r1" />
        <span className="alarm-empty-ring alarm-empty-r2" />
        <span className="alarm-empty-ring alarm-empty-r3" />
        <span className="alarm-empty-core">
          <Bell className="w-6 h-6 text-[var(--color-accent-400)]" strokeWidth={1.5} />
        </span>
      </div>
      <h3 className="text-lg font-semibold text-[var(--color-ink-0)] mt-6">
        {hasFilters ? 'Nothing matches' : 'All clear'}
      </h3>
      <p className="text-sm text-[var(--color-ink-2)] mt-1 max-w-sm">
        {hasFilters
          ? 'Try a different filter or clear the search.'
          : 'No alarms are active right now. We’ll let you know when one fires.'}
      </p>
    </div>
  );
}

