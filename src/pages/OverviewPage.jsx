import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Search, X, Building2, Thermometer, Bell, Video, Lock,
  AlertTriangle, AlertCircle, Info, MapPin, Clock, ChevronRight,
  Check, CheckCheck,
} from 'lucide-react';
import { format, formatDistanceToNowStrict } from 'date-fns';
import { useAssets, useAlarms, useUpdateAlarmStatus } from '../hooks/useAssets';
import {
  pickGateways, pickGatewayChildren, findGatewayForAsset, alarmBelongsToGateway,
} from '../utils/gateways';
import {
  getAssetDisplayName, getCustomAssetType, getAssetTypeLabel, isAssetActive,
} from '../utils/assetIcons';
import AssetGlyph from '../components/tiles/AssetGlyph';
import useAppStore from '../store/appStore';
import { LoadingSpinner } from '../components/ui';
import './alarms.css';

/* ==========================================================================
   Control Centre — live map + site roster + recent alarms.
   All data is derived from the cached useAssets / useAlarms queries; no extra
   network calls. Metrics that have no backing attribute in the SMS IoT backend
   (footfall, battery, etc.) are intentionally omitted.
   ========================================================================== */

const DEFAULT_CENTER = [30.3753, 69.3451];
const DEFAULT_ZOOM = 5;

/* ---------------- Leaflet DivIcon per health category ---------------- */

const PIN_COLORS = {
  critical: { bg: 'var(--color-danger-500)', ring: 'var(--color-danger-400)' },
  warning:  { bg: 'var(--color-warning-500)', ring: 'var(--color-warning-400)' },
  stable:   { bg: 'var(--color-accent-500)', ring: 'var(--color-accent-400)' },
  offline:  { bg: 'var(--color-ink-3)',       ring: 'var(--color-ink-2)' },
};

function makePinIcon(category, label) {
  const { bg, ring } = PIN_COLORS[category] || PIN_COLORS.stable;
  const pulse = category === 'critical'
    ? `<span style="position:absolute;inset:-6px;border-radius:50%;border:2px solid ${ring};animation:overview-pin-pulse 1.8s ease-out infinite;"></span>`
    : '';
  return L.divIcon({
    className: 'overview-pin',
    html: `
      <div style="position:relative;display:flex;align-items:center;justify-content:center;width:42px;height:42px;">
        ${pulse}
        <div style="
          position:relative;
          width:36px;height:36px;border-radius:50%;
          background:${bg};
          color:#fff;
          font-size:11px;font-weight:700;
          display:flex;align-items:center;justify-content:center;
          box-shadow:0 0 0 3px ${ring}33, 0 8px 18px rgba(0,0,0,0.28);
          letter-spacing:0.02em;
        ">${escapeHtml(label)}</div>
      </div>`,
    iconSize: [42, 42],
    iconAnchor: [21, 21],
    popupAnchor: [0, -18],
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/* ---------------- Map helpers (mirror MapPage) ---------------- */

function extractLocation(asset) {
  const loc = asset?.attributes?.location?.value;
  if (!loc) return null;
  if (loc.type === 'Point' && Array.isArray(loc.coordinates) && loc.coordinates.length >= 2) {
    const [lng, lat] = loc.coordinates;
    if (typeof lat === 'number' && typeof lng === 'number') return [lat, lng];
  }
  if (typeof loc.lat === 'number' && typeof loc.lng === 'number') return [loc.lat, loc.lng];
  if (typeof loc.latitude === 'number' && typeof loc.longitude === 'number') return [loc.latitude, loc.longitude];
  return null;
}

function FitBoundsOnce({ positions }) {
  const map = useMap();
  const fittedRef = useRef(false);
  useEffect(() => {
    if (fittedRef.current || positions.length === 0) return;
    map.fitBounds(L.latLngBounds(positions), { padding: [40, 40], maxZoom: 14 });
    fittedRef.current = true;
  }, [positions, map]);
  return null;
}

function FocusSelected({ selection, markerRefs }) {
  const map = useMap();
  useEffect(() => {
    if (!selection) return;
    map.flyTo(selection.pos, Math.max(map.getZoom(), 15), { duration: 0.8 });
    const t = setTimeout(() => {
      const ref = markerRefs.current.get(selection.id);
      if (ref) ref.openPopup();
    }, 350);
    return () => clearTimeout(t);
  }, [selection, map, markerRefs]);
  return null;
}

/* ---------------- Short site code (for pin label) ---------------- */

function siteCode(name, idx) {
  if (!name) return `S${String(idx + 1).padStart(2, '0')}`;
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

/* ---------------- Site health derivation ---------------- */

function siteHealth(site) {
  // offline wins over alarms
  if (!site.connected) return 'offline';
  if (site.openCrit > 0) return 'critical';
  if (site.openAlarms > 0) return 'warning';
  return 'stable';
}

function healthPercent(site) {
  // A qualitative percent — 100 stable, drops with open alarms + offline devices.
  // Not persisted anywhere; purely for the gradient indicator position.
  if (!site.connected) return 0;
  const total = site.deviceCount || 1;
  const offlineDevicePenalty = Math.min(40, ((total - site.onlineCount) / total) * 60);
  const alarmPenalty = Math.min(60, site.openCrit * 30 + site.openWarn * 10);
  return Math.max(0, Math.round(100 - alarmPenalty - offlineDevicePenalty));
}

/* ==========================================================================
   Page
   ========================================================================== */

export default function OverviewPage() {
  const { data: assets = [], isLoading } = useAssets({});
  const { data: openAlarms = [] } = useAlarms({ status: 'OPEN' });
  const { theme } = useAppStore();

  const gateways = useMemo(() => pickGateways(assets), [assets]);
  const assetById = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);

  // Build a per-site summary once. Each entry = everything the right panel,
  // the map marker, and the filter chips need.
  const sites = useMemo(() => {
    const gwList = gateways.map((g, idx) => {
      const children = pickGatewayChildren(assets, g.id);
      const connected = g.attributes?.connected?.value !== false;
      const onlineCount = children.filter((d) => d.attributes?.connected?.value !== false).length;

      const temps = children
        .filter((a) => getCustomAssetType(a) === 'HeatSensorAsset')
        .map((h) => Number(h.attributes?.temperature?.value))
        .filter(Number.isFinite);
      const tempAvg = temps.length
        ? temps.reduce((a, b) => a + b, 0) / temps.length
        : null;

      const cameras = children.filter((a) => getCustomAssetType(a) === 'CameraAsset');
      const camerasOnline = cameras.filter((c) => c.attributes?.connected?.value !== false).length;

      const doors = children.filter((a) => getCustomAssetType(a) === 'DoorLockAsset');
      // Per project convention: isAssetActive === true means "Locked".
      const doorsUnlocked = doors.filter((d) => !isAssetActive(d, 'DoorLockAsset')).length;

      const alarmsHere = openAlarms.filter((al) => alarmBelongsToGateway(al, g.id, assetById, gateways));
      const openCrit = alarmsHere.filter((a) => a.severity === 'CRITICAL' || a.severity === 'HIGH').length;
      const openWarn = alarmsHere.length - openCrit;

      const pos = extractLocation(g);

      return {
        id: g.id,
        gateway: g,
        name: getAssetDisplayName(g),
        code: siteCode(getAssetDisplayName(g), idx),
        connected,
        deviceCount: children.length,
        onlineCount,
        tempAvg,
        cameras: cameras.length,
        camerasOnline,
        doors: doors.length,
        doorsUnlocked,
        openAlarms: alarmsHere.length,
        openCrit,
        openWarn,
        pos,
      };
    });

    return gwList.map((s) => ({
      ...s,
      health: siteHealth(s),
      healthPct: healthPercent(s),
    }));
  }, [assets, gateways, openAlarms, assetById]);

  /* ---- Filter + search ---- */

  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const filterCounts = useMemo(() => ({
    all:      sites.length,
    critical: sites.filter((s) => s.health === 'critical').length,
    warning:  sites.filter((s) => s.health === 'warning').length,
    stable:   sites.filter((s) => s.health === 'stable').length,
    offline:  sites.filter((s) => s.health === 'offline').length,
  }), [sites]);

  const visibleSites = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sites.filter((s) => {
      if (filter !== 'all' && s.health !== filter) return false;
      if (!q) return true;
      return s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q);
    });
  }, [sites, filter, query]);

  /* ---- Map selection (mirror MapPage behaviour) ---- */

  const [selection, setSelection] = useState(null);
  const markerRefs = useRef(new Map());

  const selectSite = (id) => {
    const s = sites.find((x) => x.id === id);
    if (!s?.pos) return;
    setSelection({ id: s.id, pos: s.pos });
  };

  /* ---- Tile theme ---- */

  const tileUrl = useMemo(
    () => (theme === 'light'
      ? 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
      : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'),
    [theme]
  );

  /* ---- Derived summary for page subtitle ---- */

  const summary = useMemo(() => {
    const total = sites.length;
    const totalDevices = sites.reduce((s, x) => s + x.deviceCount, 0);
    const onlineDevices = sites.reduce((s, x) => s + x.onlineCount, 0);
    return { total, totalDevices, onlineDevices };
  }, [sites]);

  const positions = useMemo(() => sites.filter((s) => s.pos).map((s) => s.pos), [sites]);

  // All alarms, unhandled first (OPEN → ACK/IN_PROGRESS → RESOLVED/CLOSED).
  // Within each bucket: newer first.
  // Only OPEN alarms are shown. Newer first.
  const openAlarmsSorted = useMemo(
    () => [...openAlarms].sort((a, b) => new Date(b.createdOn || 0) - new Date(a.createdOn || 0)),
    [openAlarms]
  );

  if (isLoading) {
    return <div className="flex items-center justify-center min-h-[60vh]"><LoadingSpinner size="lg" /></div>;
  }

  return (
    <div className="p-4 md:p-6 max-w-[1500px] mx-auto space-y-5 overview-control-centre">
      <style>{`
        @keyframes overview-pin-pulse {
          0%   { transform: scale(0.85); opacity: 0.85; }
          70%  { transform: scale(1.55); opacity: 0; }
          100% { transform: scale(1.55); opacity: 0; }
        }
      `}</style>

      <TopBar summary={summary} />

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-4">
        {/* ===== Left column: Map + Alarms ===== */}
        <div className="space-y-4 min-w-0">
          <section className="panel p-4 md:p-5">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <h2 className="text-lg font-bold text-[var(--color-ink-0)]">Map</h2>
                <p className="text-xs text-[var(--color-ink-2)] mt-0.5">
                  Geolocations of your sites. Click a site to focus it on the map.
                </p>
              </div>
              <MapLegend />
            </div>

            <div
              className="rounded-xl overflow-hidden relative"
              style={{ height: 480, isolation: 'isolate', zIndex: 0 }}
            >
              <MapContainer
                center={positions[0] || DEFAULT_CENTER}
                zoom={DEFAULT_ZOOM}
                style={{ height: '100%', width: '100%' }}
                scrollWheelZoom
              >
                <TileLayer url={tileUrl} attribution="&copy; OpenStreetMap contributors, &copy; CARTO" />
                <FitBoundsOnce positions={positions} />
                <FocusSelected selection={selection} markerRefs={markerRefs} />
                {sites.filter((s) => s.pos).map((s) => (
                  <Marker
                    key={s.id}
                    position={s.pos}
                    icon={makePinIcon(s.health, s.code)}
                    ref={(el) => {
                      if (el) markerRefs.current.set(s.id, el);
                      else markerRefs.current.delete(s.id);
                    }}
                    eventHandlers={{ click: () => selectSite(s.id) }}
                  >
                    <Popup>
                      <SitePopup site={s} />
                    </Popup>
                  </Marker>
                ))}
              </MapContainer>
            </div>
          </section>

          <AlarmsSection
            alarms={openAlarmsSorted}
            assets={assets}
            gateways={gateways}
          />
        </div>

        {/* ===== Right column: All Store Overview ===== */}
        <aside className="panel p-4 md:p-5 flex flex-col max-h-[calc(100vh-120px)] lg:sticky lg:top-4 self-start">
          <header className="mb-3">
            <h2 className="text-base font-bold text-[var(--color-ink-0)]">All Store Overview</h2>
            <p className="text-xs text-[var(--color-ink-2)] mt-0.5">
              Select a store to view live operations
            </p>
          </header>

          <SiteSearch value={query} onChange={setQuery} open={searchOpen} setOpen={setSearchOpen} />
          <FilterChips value={filter} onChange={setFilter} counts={filterCounts} />

          <LayoutGroup>
            <ul className="space-y-2.5 mt-3 overflow-y-auto pr-1 min-h-0 flex-1">
              <AnimatePresence initial={false} mode="popLayout">
                {visibleSites.length === 0 && (
                  <motion.li
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="text-center py-10 text-sm text-[var(--color-ink-3)]"
                  >
                    {sites.length === 0 ? 'No sites registered yet.' : 'No sites match this filter.'}
                  </motion.li>
                )}
                {visibleSites.map((site) => (
                  <motion.li
                    key={site.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={{ layout: { type: 'spring', stiffness: 320, damping: 30 } }}
                  >
                    <SiteCard
                      site={site}
                      active={selection?.id === site.id}
                      onFocus={() => selectSite(site.id)}
                    />
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </LayoutGroup>
        </aside>
      </div>
    </div>
  );
}

/* ==========================================================================
   TopBar — title + live clock. No branch dropdown (no data source).
   ========================================================================== */

function TopBar({ summary }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-ink-0)]">Control Centre</h1>
        <p className="text-xs text-[var(--color-ink-2)] mt-0.5">
          {summary.total} site{summary.total === 1 ? '' : 's'}
          {summary.totalDevices > 0 && ` · ${summary.onlineDevices}/${summary.totalDevices} devices online`}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <div className="panel px-3 py-1.5 flex items-center gap-2" style={{ borderRadius: 999 }}>
          <Clock className="w-3.5 h-3.5 text-[var(--color-ink-2)]" strokeWidth={1.75} />
          <span className="text-sm font-semibold tabular-nums text-[var(--color-ink-0)]">
            {format(now, 'HH : mm : ss')}
          </span>
        </div>
      </div>
    </header>
  );
}

/* ==========================================================================
   Map legend
   ========================================================================== */

function MapLegend() {
  const items = [
    { key: 'critical', label: 'Critical', color: 'var(--color-danger-500)' },
    { key: 'warning',  label: 'Warning',  color: 'var(--color-warning-500)' },
    { key: 'stable',   label: 'Stable',   color: 'var(--color-accent-500)' },
  ];
  return (
    <div className="flex items-center gap-3 flex-shrink-0">
      {items.map((i) => (
        <span key={i.key} className="inline-flex items-center gap-1.5 text-[11px] text-[var(--color-ink-2)]">
          <span className="w-2 h-2 rounded-full" style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

/* ==========================================================================
   Map popup
   ========================================================================== */

function SitePopup({ site }) {
  return (
    <div className="min-w-[220px]">
      <p className="font-semibold text-sm mb-1">{site.name}</p>
      <p className="text-[11px] text-slate-500 mb-2">
        {site.connected ? 'Connected' : 'Offline'} · {site.deviceCount} device{site.deviceCount === 1 ? '' : 's'}
      </p>
      <div className="grid grid-cols-3 gap-2 text-center mb-2">
        <div>
          <p className="text-[10px] text-slate-500">Online</p>
          <p className="text-sm font-semibold text-emerald-600">{site.onlineCount}</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-500">Alarms</p>
          <p className={`text-sm font-semibold ${site.openAlarms > 0 ? 'text-red-600' : 'text-slate-600'}`}>
            {site.openAlarms}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-slate-500">Cameras</p>
          <p className="text-sm font-semibold">{site.cameras ? `${site.camerasOnline}/${site.cameras}` : '—'}</p>
        </div>
      </div>
      <Link to={`/store/${site.id}`} className="text-xs font-semibold text-cyan-600 hover:underline">
        Enter site →
      </Link>
    </div>
  );
}

/* ==========================================================================
   Site search (inline)
   ========================================================================== */

function SiteSearch({ value, onChange }) {
  return (
    <div className="relative">
      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-3)]" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search store name, city or branch"
        className="w-full pl-9 pr-8 py-2.5 rounded-xl text-sm
          bg-[color-mix(in_srgb,var(--color-ink-0)_4%,transparent)]
          border border-[color-mix(in_srgb,var(--color-ink-0)_10%,transparent)]
          text-[var(--color-ink-0)] placeholder:text-[var(--color-ink-3)]
          focus:outline-none focus:border-[color-mix(in_srgb,var(--color-accent-500)_50%,transparent)]
          transition-colors"
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-[var(--color-ink-3)] hover:text-[var(--color-ink-0)]"
          aria-label="Clear search"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

/* ==========================================================================
   Filter chips — counts are cross-filtered against search implicitly
   (we only count by health category; search then narrows the list further).
   ========================================================================== */

function FilterChips({ value, onChange, counts }) {
  const chips = [
    { id: 'all',      label: 'All' },
    { id: 'critical', label: 'Critical' },
    { id: 'warning',  label: 'Warning' },
    { id: 'stable',   label: 'Stable' },
    { id: 'offline',  label: 'Offline' },
  ];
  return (
    <div className="flex items-center gap-2 mt-3 overflow-x-auto pb-1 -mx-1 px-1">
      {chips.map((c) => {
        const active = value === c.id;
        const n = counts[c.id] || 0;
        return (
          <button
            key={c.id}
            onClick={() => onChange(c.id)}
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
              {n}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ==========================================================================
   Site card
   ========================================================================== */

function SiteCard({ site, active, onFocus }) {
  const healthTone = site.health;
  const toneColor = {
    critical: 'var(--color-danger-400)',
    warning:  'var(--color-warning-400)',
    stable:   'var(--color-accent-400)',
    offline:  'var(--color-ink-2)',
  }[healthTone];

  return (
    <div
      className="tile p-4"
      style={active ? {
        background: 'linear-gradient(135deg, color-mix(in srgb, var(--color-accent-500) 10%, var(--color-surface-1)) 0%, var(--color-surface-1) 100%)',
        borderColor: 'color-mix(in srgb, var(--color-accent-500) 45%, transparent)',
        boxShadow: '0 0 0 1px color-mix(in srgb, var(--color-accent-500) 25%, transparent)',
      } : {}}
    >
      {/* Top: icon + name + Enter site */}
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={onFocus}
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors"
          style={{
            background: site.connected
              ? 'color-mix(in srgb, var(--color-accent-500) 14%, transparent)'
              : 'color-mix(in srgb, var(--color-ink-0) 8%, transparent)',
            color: site.connected ? 'var(--color-accent-400)' : 'var(--color-ink-2)',
          }}
          aria-label={`Focus ${site.name} on map`}
        >
          <Building2 className="w-5 h-5" strokeWidth={1.75} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-[var(--color-ink-0)] truncate">{site.name}</p>
            <Link
              to={`/store/${site.id}`}
              className="text-[11px] font-semibold text-[var(--color-accent-400)] hover:text-[var(--color-accent-300)] inline-flex items-center gap-0.5 whitespace-nowrap"
            >
              Enter site <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          <p className="text-[11px] text-[var(--color-ink-2)] mt-0.5 flex items-center gap-1.5">
            <span
              className="inline-block w-1.5 h-1.5 rounded-full"
              style={{
                background: site.connected ? 'var(--color-accent-500)' : 'var(--color-ink-3)',
                boxShadow: site.connected ? '0 0 6px color-mix(in srgb, var(--color-accent-500) 70%, transparent)' : 'none',
              }}
            />
            {site.connected ? 'Connected' : 'Offline'}
            {site.deviceCount > 0 && ` — ${site.deviceCount} device${site.deviceCount === 1 ? '' : 's'}`}
          </p>
        </div>
      </div>

      {/* Health bar — single-tone fill coloured by category. Width = score. */}
      <div className="mt-3">
        <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide">
          <span className="text-[var(--color-ink-3)]">Health</span>
          <span className="tabular-nums" style={{ color: toneColor }}>
            {site.connected ? `${site.healthPct}%` : 'Offline'}
          </span>
        </div>
        <div
          className="mt-1 h-1.5 rounded-full overflow-hidden"
          style={{ background: 'color-mix(in srgb, var(--color-ink-0) 8%, transparent)' }}
        >
          <div
            className="h-full rounded-full"
            style={{
              width: site.connected ? `${Math.max(4, site.healthPct)}%` : '100%',
              background: toneColor,
              boxShadow: `0 0 8px color-mix(in srgb, ${toneColor} 45%, transparent)`,
              transition: 'width 400ms ease, background 200ms ease',
              opacity: site.connected ? 1 : 0.35,
            }}
          />
        </div>
      </div>

      {/* Metrics row — only metrics we can source. Missing ones are omitted. */}
      <div className="mt-3 flex items-center gap-1.5 flex-wrap">
        {site.tempAvg != null && (
          <MetricPill
            icon={Thermometer}
            label={`${site.tempAvg.toFixed(1)}°`}
            tone="warning"
          />
        )}
        <MetricPill
          icon={Bell}
          label={site.openAlarms}
          tone={site.openAlarms > 0 ? 'alarm' : 'muted'}
        />
        {site.cameras > 0 && (
          <MetricPill
            icon={Video}
            label={`${site.camerasOnline}/${site.cameras}`}
            tone="muted"
          />
        )}
        {site.doors > 0 && (
          <MetricPill
            icon={Lock}
            label={`${site.doorsUnlocked}/${site.doors}`}
            tone={site.doorsUnlocked > 0 ? 'warning' : 'muted'}
          />
        )}
        <span className="ml-auto text-[10px] uppercase tracking-wide font-semibold" style={{ color: toneColor }}>
          {healthTone === 'stable' ? 'Stable'
            : healthTone === 'warning' ? 'Warning'
            : healthTone === 'critical' ? 'Critical'
            : 'Offline'}
        </span>
      </div>
    </div>
  );
}

function MetricPill({ icon: Icon, label, tone }) {
  const map = {
    alarm:   { color: 'var(--color-danger-400)',  bg: 'color-mix(in srgb, var(--color-danger-500) 16%, transparent)' },
    warning: { color: 'var(--color-warning-400)', bg: 'color-mix(in srgb, var(--color-warning-500) 16%, transparent)' },
    ok:      { color: 'var(--color-accent-400)',  bg: 'color-mix(in srgb, var(--color-accent-500) 14%, transparent)' },
    muted:   { color: 'var(--color-ink-1)',       bg: 'color-mix(in srgb, var(--color-ink-0) 6%, transparent)' },
  };
  const t = map[tone] || map.muted;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold tabular-nums"
      style={{ background: t.bg, color: t.color }}
    >
      <Icon className="w-3.5 h-3.5" strokeWidth={2} />
      {label}
    </span>
  );
}

/* ==========================================================================
   Alarms section — lightweight version of AlarmsPage cards. Links out to the
   full triage page for Ack/Resolve.
   ========================================================================== */

const SEVERITY_META = {
  CRITICAL: { icon: AlertTriangle, klass: 'sev-critical', label: 'Critical' },
  HIGH:     { icon: AlertTriangle, klass: 'sev-high',     label: 'High' },
  MEDIUM:   { icon: AlertCircle,   klass: 'sev-medium',   label: 'Medium' },
  LOW:      { icon: Info,          klass: 'sev-low',      label: 'Low' },
};

function AlarmsSection({ alarms, assets, gateways }) {
  const update = useUpdateAlarmStatus();

  if (alarms.length === 0) {
    return (
      <section className="panel p-5">
        <h2 className="text-lg font-bold text-[var(--color-ink-0)]">Alarms</h2>
        <p className="text-sm text-[var(--color-ink-2)] py-8 text-center">All clear — no open alarms.</p>
      </section>
    );
  }

  const assetMap = new Map(assets.map((a) => [a.id, a]));

  return (
    <section className="panel p-4 md:p-5">
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-[var(--color-ink-0)]">Alarms</h2>
          <p className="text-[11px] text-[var(--color-ink-2)] mt-0.5">
            <span className="font-semibold text-[var(--color-ink-0)] tabular-nums">{alarms.length}</span> open
          </p>
        </div>
        <Link
          to="/alarms"
          className="text-[11px] font-semibold text-[var(--color-accent-400)] hover:text-[var(--color-accent-300)] inline-flex items-center gap-0.5"
        >
          Open triage <ChevronRight className="w-3 h-3" />
        </Link>
      </div>
      <ul className="space-y-2">
        {alarms.map((al) => (
          <li key={al.id}>
            <AlarmRow alarm={al} assetMap={assetMap} gateways={gateways} update={update} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function AlarmRow({ alarm, assetMap, gateways, update }) {
  const linked = Array.isArray(alarm.asset) && alarm.asset[0];
  const asset = linked?.id
    ? (assetMap.get(linked.id) || linked)
    : (alarm.assetId ? assetMap.get(alarm.assetId) : null);
  const gateway = asset ? findGatewayForAsset(asset, gateways) : null;
  const meta = SEVERITY_META[alarm.severity] || SEVERITY_META.LOW;
  const SevIcon = meta.icon;

  const siteName = gateway ? getAssetDisplayName(gateway) : '—';
  const deviceLabel = asset ? getAssetTypeLabel(getCustomAssetType(asset)) : (alarm.sourceName || alarm.source || '—');
  const deviceName = asset ? getAssetDisplayName(asset) : '';
  const loc = extractLocation(asset) || extractLocation(gateway);
  const createdAt = alarm.createdOn ? new Date(alarm.createdOn) : null;

  // Pending state for the in-flight mutation, per-button.
  const mutatingThis = update?.isPending && update.variables?.alarm?.id === alarm.id;
  const ackPending = mutatingThis && update.variables?.status === 'ACKNOWLEDGED';
  const resolvePending = mutatingThis && update.variables?.status === 'RESOLVED';

  // Left rail keeps the severity hint without tinting the row body.
  const railColor = alarm.severity === 'CRITICAL' ? 'var(--color-danger-500)'
    : alarm.severity === 'HIGH'   ? 'var(--color-warning-500)'
    : alarm.severity === 'MEDIUM' ? 'var(--color-warning-400)'
    :                                'var(--color-accent-500)';

  return (
    <div
      className="tile flex flex-col sm:flex-row sm:items-center gap-3 p-3 border-l-4"
      style={{ borderLeftColor: railColor }}
    >
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{
            background: 'color-mix(in srgb, currentColor 14%, transparent)',
            color: alarm.severity === 'CRITICAL' ? 'var(--color-danger-400)'
              : alarm.severity === 'HIGH'     ? 'var(--color-warning-400)'
              : alarm.severity === 'MEDIUM'   ? 'var(--color-warning-400)'
              :                                  'var(--color-ink-1)',
          }}
        >
          {asset ? (
            <AssetGlyph customType={getCustomAssetType(asset)} alarm className="w-4 h-4" />
          ) : (
            <SevIcon className="w-4 h-4" strokeWidth={2} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-[var(--color-ink-0)] truncate">
              {alarm.title || 'Alarm'}
            </p>
            <span
              className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
              style={{
                background: 'color-mix(in srgb, currentColor 14%, transparent)',
                borderColor: 'color-mix(in srgb, currentColor 40%, transparent)',
                border: '1px solid',
                color: alarm.severity === 'CRITICAL' ? 'var(--color-danger-400)'
                  : alarm.severity === 'HIGH'     ? 'var(--color-warning-400)'
                  : alarm.severity === 'MEDIUM'   ? 'var(--color-warning-400)'
                  :                                  'var(--color-ink-1)',
              }}
            >
              {meta.label}
            </span>
          </div>
          <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
            <InfoCell icon={Building2} label="Site" value={siteName} to={gateway ? `/store/${gateway.id}` : null} />
            <InfoCell icon={null} customIcon={asset ? <AssetGlyph customType={getCustomAssetType(asset)} className="w-3.5 h-3.5" /> : null} label={deviceLabel} value={deviceName} to={asset ? `/a/${asset.id}` : null} />
            <InfoCell
              icon={MapPin}
              label="Location"
              value={loc ? `${loc[0].toFixed(4)}, ${loc[1].toFixed(4)}` : '—'}
            />
            <InfoCell
              icon={Clock}
              label="Raised"
              value={createdAt ? `${formatDistanceToNowStrict(createdAt)} ago` : '—'}
            />
          </div>
        </div>
      </div>

      {update && (
        <div className="alarm-actions self-stretch sm:self-center">
          <button
            onClick={() => update.mutate({ alarm, status: 'ACKNOWLEDGED' })}
            disabled={ackPending || resolvePending}
            className="alarm-action alarm-action-accent"
          >
            <Check className="w-3.5 h-3.5" strokeWidth={2.25} />
            <span>{ackPending ? '…' : 'Ack'}</span>
          </button>
          <button
            onClick={() => update.mutate({ alarm, status: 'RESOLVED' })}
            disabled={ackPending || resolvePending}
            className="alarm-action alarm-action-ok"
          >
            <CheckCheck className="w-3.5 h-3.5" strokeWidth={2.25} />
            <span>{resolvePending ? '…' : 'Resolve'}</span>
          </button>
        </div>
      )}
    </div>
  );
}

function InfoCell({ icon: Icon, customIcon, label, value, to }) {
  const body = (
    <>
      <p className="text-[10px] uppercase tracking-wide text-[var(--color-ink-3)] font-semibold flex items-center gap-1">
        {customIcon || (Icon && <Icon className="w-3 h-3" strokeWidth={1.75} />)}
        {label}
      </p>
      <p className="text-[12px] text-[var(--color-ink-0)] font-medium truncate">{value || '—'}</p>
    </>
  );
  return to ? (
    <Link to={to} className="block min-w-0 hover:text-[var(--color-accent-400)]">{body}</Link>
  ) : (
    <div className="min-w-0">{body}</div>
  );
}
