import { useEffect, useMemo, useState } from 'react';
import { format, formatDistanceToNowStrict } from 'date-fns';
import {
  Video as VideoIcon, Search, X, Filter, RotateCcw,
  RadioTower, ShieldAlert, History, Play,
} from 'lucide-react';
import { useAssets } from '../hooks/useAssets';
import {
  pickSites, pickTowersForSite, pickGatewayChildren,
} from '../utils/gateways';
import {
  getAssetDisplayName, getCustomAssetType, normalizeAssetType,
} from '../utils/assetIcons';
import CameraStream from '../components/cameras/CameraStream';
import useSecureOpsStore from '../store/secureOpsStore';
import { LoadingSpinner } from '../components/ui';
import './secureops.css';

/* ==========================================================================
   Video (/video)

   The "operator wall": every CameraAsset in the current site scope shown as
   a live tile. Two filter axes:

     • Tower      — multi-select chips for towers in the selected site scope.
     • Detection  — chips for `human · animal · other`. A camera matches when
                    its most-recent history[] entry's `detection` matches one
                    of the selected types (within last 24 h to avoid keeping
                    cameras lit up forever based on ancient detections).

   Plus a free-text search across camera name + tower name.

   Click a tile → opens a side-drawer-style modal with:
     • Live stream player (auto-restored when a clip ends)
     • Scrollable `history[]` list on the right, filterable by the same
       detection chips, with click-to-play.

   Sources:
     • CameraAsset.liveStreamUrl
     • CameraAsset.history → [{ id, url, date, detection }]
   ========================================================================== */

const DETECTION_TYPES = [
  { id: 'human',  label: 'Human',  color: 'var(--color-danger-400)' },
  { id: 'animal', label: 'Animal', color: 'var(--color-warning-400)' },
  { id: 'other',  label: 'Other',  color: 'var(--color-ink-2)' },
];

const RECENT_ALERT_WINDOW_MS = 5 * 60 * 1000;     // 5 min for the on-tile ALERT pill
const RECENT_FILTER_WINDOW_MS = 24 * 3600 * 1000; // 24 h for the detection chip filter

export default function SecureOpsVideoPage() {
  const { data: assets = [], isLoading } = useAssets({});
  const { selectedSiteId } = useSecureOpsStore();

  /* ---- Scope from global site dropdown ---- */
  const sites = useMemo(() => pickSites(assets), [assets]);
  const towers = useMemo(() => {
    if (selectedSiteId) return pickTowersForSite(assets, selectedSiteId);
    if (sites.length === 0) {
      return assets.filter((a) =>
        a.type === 'GatewayAsset'
        || normalizeAssetType(getCustomAssetType(a)) === 'TowerAsset'
      );
    }
    return sites.flatMap((s) => pickTowersForSite(assets, s.id));
  }, [assets, sites, selectedSiteId]);

  /* ---- All cameras across the scope ---- */
  const allCameras = useMemo(() => {
    const out = [];
    for (const t of towers) {
      const kids = pickGatewayChildren(assets, t.id)
        .filter((a) => normalizeAssetType(getCustomAssetType(a)) === 'CameraAsset');
      for (const c of kids) out.push({ camera: c, tower: t });
    }
    return out;
  }, [towers, assets]);

  /* ---- Filter state ---- */
  const [query, setQuery] = useState('');
  const [towerFilter, setTowerFilter] = useState(new Set());
  const [detectionFilter, setDetectionFilter] = useState(new Set());
  const [openCam, setOpenCam] = useState(null);

  const toggleInSet = (setter) => (id) => setter((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleTower = toggleInSet(setTowerFilter);
  const toggleDetection = toggleInSet(setDetectionFilter);
  const clearFilters = () => {
    setQuery('');
    setTowerFilter(new Set());
    setDetectionFilter(new Set());
  };
  const activeFilterCount =
    (query ? 1 : 0) + towerFilter.size + detectionFilter.size;

  /* ---- Counts (for chip badges) ---- */
  const towerCounts = useMemo(() => {
    const out = new Map();
    for (const t of towers) out.set(t.id, 0);
    for (const { tower } of allCameras) out.set(tower.id, (out.get(tower.id) || 0) + 1);
    return out;
  }, [allCameras, towers]);

  const detectionCounts = useMemo(() => {
    const out = { human: 0, animal: 0, other: 0 };
    const since = new Date().getTime() - RECENT_FILTER_WINDOW_MS;
    for (const { camera } of allCameras) {
      const hist = camera.attributes?.history?.value;
      if (!Array.isArray(hist)) continue;
      const seen = new Set();
      for (const h of hist) {
        const ts = parseDate(h?.date);
        if (!ts || ts < since) continue;
        const d = (h.detection || 'other').toLowerCase();
        if (!seen.has(d)) {
          seen.add(d);
          if (d in out) out[d] += 1;
        }
      }
    }
    return out;
  }, [allCameras]);

  /* ---- Apply filters ---- */
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const since = new Date().getTime() - RECENT_FILTER_WINDOW_MS;
    return allCameras.filter(({ camera, tower }) => {
      if (towerFilter.size > 0 && !towerFilter.has(tower.id)) return false;
      if (detectionFilter.size > 0) {
        const hist = camera.attributes?.history?.value;
        if (!Array.isArray(hist) || hist.length === 0) return false;
        const match = hist.some((h) => {
          const ts = parseDate(h?.date);
          if (!ts || ts < since) return false;
          const d = (h?.detection || 'other').toLowerCase();
          return detectionFilter.has(d);
        });
        if (!match) return false;
      }
      if (q) {
        const hay = `${getAssetDisplayName(camera)} ${getAssetDisplayName(tower)}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [allCameras, query, towerFilter, detectionFilter]);

  if (isLoading) {
    return <div className="flex items-center justify-center min-h-[60vh]"><LoadingSpinner size="lg" /></div>;
  }

  return (
    <div className="p-4 md:p-6 max-w-[1500px] mx-auto space-y-4">
      {/* ===== Header ===== */}
      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-ink-0)] flex items-center gap-2">
            <VideoIcon className="w-5 h-5 text-[var(--color-accent-400)]" strokeWidth={2} />
            Video
          </h1>
          <p className="text-xs text-[var(--color-ink-2)] mt-0.5">
            Live wall across {towers.length || 'all'} tower{towers.length === 1 ? '' : 's'}
            {selectedSiteId
              ? ` in ${getAssetDisplayName(sites.find((s) => s.id === selectedSiteId)) || 'this site'}`
              : ' (all sites)'}
            . Click a tile for the live stream + clip history.
          </p>
        </div>
        <button
          type="button"
          onClick={clearFilters}
          disabled={activeFilterCount === 0}
          className="audit-btn"
          title="Reset every filter to its default"
        >
          <RotateCcw className="w-3.5 h-3.5" strokeWidth={2} />
          Reset filters
        </button>
      </header>

      {/* ===== Filters ===== */}
      <section className="panel p-4 md:p-5 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="audit-search">
            <Search className="w-3.5 h-3.5 text-[var(--color-ink-3)] flex-shrink-0" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search camera or tower…"
              className="bg-transparent border-0 outline-0 flex-1 text-sm text-[var(--color-ink-0)] placeholder:text-[var(--color-ink-3)]"
            />
            {query && (
              <button onClick={() => setQuery('')} className="text-[var(--color-ink-3)] hover:text-[var(--color-ink-0)]">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-[var(--color-ink-2)] font-semibold">
            <Filter className="w-3 h-3" />
            {filtered.length.toLocaleString()} of {allCameras.length.toLocaleString()} cameras
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[120px_1fr] gap-x-3 gap-y-1.5 items-center text-[11px]">
          <FilterLabel>Detection</FilterLabel>
          <div className="flex items-center gap-1.5 flex-wrap">
            {DETECTION_TYPES.map((d) => (
              <ToggleChip
                key={d.id}
                active={detectionFilter.has(d.id)}
                onClick={() => toggleDetection(d.id)}
                color={d.color}
                count={detectionCounts[d.id]}
              >
                {d.label}
              </ToggleChip>
            ))}
          </div>

          <FilterLabel>Tower</FilterLabel>
          <div className="flex items-center gap-1.5 flex-wrap">
            {towers.length === 0 && (
              <span className="text-[var(--color-ink-3)]">No towers in scope.</span>
            )}
            {towers.map((t) => (
              <ToggleChip
                key={t.id}
                active={towerFilter.has(t.id)}
                onClick={() => toggleTower(t.id)}
                count={towerCounts.get(t.id) || 0}
                icon={RadioTower}
              >
                {getAssetDisplayName(t)}
              </ToggleChip>
            ))}
          </div>
        </div>
      </section>

      {/* ===== Camera wall ===== */}
      <section>
        {filtered.length === 0 ? (
          <div className="panel p-10 text-center text-sm text-[var(--color-ink-2)]">
            {allCameras.length === 0
              ? 'No cameras in this scope yet.'
              : 'No cameras match these filters.'}
          </div>
        ) : (
          <div className="so-video-wall">
            {filtered.map(({ camera, tower }) => (
              <WallTile
                key={camera.id}
                camera={camera}
                tower={tower}
                onOpen={() => setOpenCam({ camera, tower })}
              />
            ))}
          </div>
        )}
      </section>

      {openCam && (
        <CameraHistoryModal
          camera={openCam.camera}
          tower={openCam.tower}
          onClose={() => setOpenCam(null)}
        />
      )}
    </div>
  );
}

/* ==========================================================================
   Wall tile
   ========================================================================== */

function WallTile({ camera, tower, onOpen }) {
  const url = camera.attributes?.liveStreamUrl?.value;
  const offline = camera.attributes?.connected?.value === false;
  const alerting = isRecentHumanDetection(camera);
  const name = getAssetDisplayName(camera);
  const code = shortCamCode(camera);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="so-cam block"
      title={`Open ${name} — ${getAssetDisplayName(tower)}`}
    >
      <CameraStream url={url} offline={offline} />
      <div className="so-cam-pills">
        <span className="so-cam-pill is-label">{code}</span>
        {alerting
          ? <span className="so-cam-pill is-alert"><ShieldAlert className="w-2.5 h-2.5" />Alert</span>
          : <span className="so-cam-pill is-rec">Rec</span>}
      </div>
      <div className="so-cam-foot">
        <div className="truncate">{name}</div>
        <div className="text-[10px] opacity-75 truncate">
          {getAssetDisplayName(tower)}
        </div>
      </div>
    </button>
  );
}

/* ==========================================================================
   Camera modal — live stream + clip history
   ========================================================================== */

function CameraHistoryModal({ camera, tower, onClose }) {
  // Body scroll lock + ESC close.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const liveUrl = camera.attributes?.liveStreamUrl?.value;
  const offline = camera.attributes?.connected?.value === false;
  const rawHistory = camera.attributes?.history?.value;
  const history = useMemo(() => {
    if (!Array.isArray(rawHistory)) return [];
    return rawHistory
      .map((h, i) => ({
        id: h?.id || `${i}-${h?.date || ''}`,
        url: h?.url,
        ts: parseDate(h?.date),
        detection: (h?.detection || 'other').toLowerCase(),
      }))
      .filter((h) => h.ts && h.url)
      .sort((a, b) => b.ts - a.ts);
  }, [rawHistory]);

  // Local filter chips inside the modal — independent from the page-level
  // filter so the operator can drill in deeper without losing the wall scope.
  const [drawerDetection, setDrawerDetection] = useState(new Set());
  const visibleHistory = useMemo(() => {
    if (drawerDetection.size === 0) return history;
    return history.filter((h) => drawerDetection.has(h.detection));
  }, [history, drawerDetection]);

  // Player state — null = play live, otherwise play this clip's URL.
  const [activeClip, setActiveClip] = useState(null);
  const playerUrl = activeClip ? activeClip.url : liveUrl;
  // Force the <video> to re-mount whenever the URL changes so the source
  // reloads cleanly (otherwise React reuses the same element with old src).
  const playerKey = playerUrl || 'empty';

  const detectionCounts = useMemo(() => {
    const out = { human: 0, animal: 0, other: 0 };
    for (const h of history) if (h.detection in out) out[h.detection] += 1;
    return out;
  }, [history]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3"
      style={{ background: 'rgba(2, 6, 23, 0.85)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        className="panel p-3 w-[min(1280px,96vw)] h-[min(760px,92vh)] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 mb-3 px-1">
          <div className="min-w-0">
            <p className="text-sm font-bold text-[var(--color-ink-0)] truncate">
              {getAssetDisplayName(camera)}
            </p>
            <p className="text-[11px] text-[var(--color-ink-2)] flex items-center gap-1">
              <RadioTower className="w-3 h-3" />
              {getAssetDisplayName(tower)}
              {activeClip && <> · <strong className="text-[var(--color-accent-300)]">playing clip · {format(activeClip.ts, 'HH:mm dd MMM')}</strong></>}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="audit-btn flex-shrink-0"
            title="Close (Esc)"
          >
            <X className="w-3.5 h-3.5" strokeWidth={2} />
            Close
          </button>
        </div>

        {/* Body: player + history sidebar */}
        <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[minmax(0,1.7fr)_minmax(280px,1fr)] gap-3">
          {/* Player */}
          <div className="flex flex-col min-h-0 min-w-0">
            <div className="so-cam-full flex-1">
              <CameraStream key={playerKey} url={playerUrl} offline={!activeClip && offline} />
            </div>
            {activeClip && (
              <button
                type="button"
                onClick={() => setActiveClip(null)}
                className="audit-btn mt-2 self-start"
              >
                ← Back to live
              </button>
            )}
          </div>

          {/* History sidebar */}
          <aside className="flex flex-col min-h-0 panel p-3 bg-[color-mix(in_srgb,var(--color-ink-0)_3%,transparent)]">
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-[12px] font-bold text-[var(--color-ink-0)] inline-flex items-center gap-1.5">
                <History className="w-3.5 h-3.5" />
                History
              </p>
              <span className="text-[10px] tabular-nums text-[var(--color-ink-2)]">
                {visibleHistory.length} of {history.length}
              </span>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap mb-2">
              {DETECTION_TYPES.map((d) => (
                <ToggleChip
                  key={d.id}
                  active={drawerDetection.has(d.id)}
                  onClick={() => setDrawerDetection((prev) => {
                    const next = new Set(prev);
                    if (next.has(d.id)) next.delete(d.id); else next.add(d.id);
                    return next;
                  })}
                  color={d.color}
                  count={detectionCounts[d.id]}
                >
                  {d.label}
                </ToggleChip>
              ))}
            </div>

            {visibleHistory.length === 0 ? (
              <p className="text-[12px] text-[var(--color-ink-2)] py-6 text-center">
                {history.length === 0
                  ? 'No clips recorded for this camera yet.'
                  : 'No clips match the selected detection types.'}
              </p>
            ) : (
              <ul className="space-y-1.5 overflow-y-auto pr-1 flex-1">
                {visibleHistory.map((h) => {
                  const meta = DETECTION_TYPES.find((d) => d.id === h.detection)
                    || { label: 'Other', color: 'var(--color-ink-2)' };
                  const isActive = activeClip?.id === h.id;
                  return (
                    <li key={h.id}>
                      <button
                        type="button"
                        onClick={() => setActiveClip(h)}
                        data-active={isActive}
                        className="so-clip-row"
                      >
                        <div
                          className="so-clip-bullet"
                          style={{ background: meta.color, boxShadow: `0 0 6px color-mix(in srgb, ${meta.color} 60%, transparent)` }}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-[12px] font-semibold text-[var(--color-ink-0)] tabular-nums">
                            {format(h.ts, 'HH:mm:ss')} · {format(h.ts, 'dd MMM')}
                          </div>
                          <div className="text-[10px] text-[var(--color-ink-2)]">
                            {formatDistanceToNowStrict(h.ts)} ago
                          </div>
                        </div>
                        <span
                          className="so-clip-pill"
                          style={{
                            background: `color-mix(in srgb, ${meta.color} 14%, transparent)`,
                            color: meta.color,
                            border: `1px solid color-mix(in srgb, ${meta.color} 40%, transparent)`,
                          }}
                        >
                          {meta.label}
                        </span>
                        <Play className="w-3.5 h-3.5 text-[var(--color-ink-3)] flex-shrink-0" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

/* ==========================================================================
   Helpers + filter primitives (mirror Audit / Alerts pages)
   ========================================================================== */

function FilterLabel({ children }) {
  return (
    <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-ink-3)]">
      {children}
    </div>
  );
}

function ToggleChip({ active, onClick, color, count, icon: Icon, children }) {
  const tint = color || 'var(--color-ink-1)';
  return (
    <button
      type="button"
      onClick={onClick}
      data-active={active}
      className="audit-chip"
      style={active ? {
        background: `color-mix(in srgb, ${tint} 18%, transparent)`,
        borderColor: `color-mix(in srgb, ${tint} 55%, transparent)`,
        color: tint,
      } : {}}
    >
      {Icon && <Icon className="w-3 h-3" strokeWidth={2} />}
      <span>{children}</span>
      {count != null && <span className="audit-chip-count">{count}</span>}
    </button>
  );
}

function shortCamCode(camera) {
  const m = (camera?.name || '').match(/CAM[-\s_]?(\d{1,3})/i);
  if (m) return `CAM-${m[1].padStart(2, '0')}`;
  return 'CAM';
}

function isRecentHumanDetection(camera) {
  const hist = camera?.attributes?.history?.value;
  if (!Array.isArray(hist) || hist.length === 0) return false;
  const latest = hist[0];
  const ts = parseDate(latest?.date);
  if (!ts) return false;
  const recent = new Date().getTime() - ts < RECENT_ALERT_WINDOW_MS;
  return recent && (latest?.detection || '').toLowerCase() === 'human';
}

function parseDate(v) {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : new Date(v).getTime();
  return Number.isFinite(n) ? n : null;
}
