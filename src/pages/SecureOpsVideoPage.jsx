import { useEffect, useMemo, useState } from 'react';
import { format, formatDistanceToNowStrict } from 'date-fns';
import {
  Video as VideoIcon, Search, X, Filter, RotateCcw,
  RadioTower, ShieldAlert, History, Play, RefreshCw, Loader2,
} from 'lucide-react';
import { useAssets } from '../hooks/useAssets';
import { useCameraEvents } from '../hooks/useCameraEvents';
import {
  pickSites, pickTowersForSite, pickGatewayChildren, getCameraStreamUrl,
} from '../utils/gateways';
import {
  getAssetDisplayName, getCustomAssetType, normalizeAssetType,
} from '../utils/assetIcons';
import CameraStream from '../components/cameras/CameraStream';
import useSecureOpsStore from '../store/secureOpsStore';
import { LoadingSpinner } from '../components/ui';
import {
  getEventClipUrl, getEventSnapshotUrl, normalizeEventLabel,
} from '../constants/events';
import './secureops.css';

/* ==========================================================================
   Video (/video)

   The "operator wall": every CameraAsset in the current site scope is shown
   as a small live-stream tile (same pattern as the Control page's Cameras
   panel). Click a tile to open the full-view modal with the same live
   stream PLUS a scrollable history sidebar.

   Filtering:
     • Tower  — multi-select chips for towers in the selected site scope.
     • Search — free-text across camera name + tower name.

   Click a tile → modal with:
     • Live stream player (auto-restored when a clip ends).
     • Scrollable `history[]` list on the right with click-to-play.

   Sources:
     • CameraAsset.liveStreamUrl (or streamUrl — getCameraStreamUrl accepts both)
     • CameraAsset.history → [{ id, url, date, detection }]
   ========================================================================== */

const DETECTION_TYPES = [
  { id: 'human',  label: 'Human',  color: 'var(--color-danger-400)' },
  { id: 'animal', label: 'Animal', color: 'var(--color-warning-400)' },
  { id: 'other',  label: 'Other',  color: 'var(--color-ink-2)' },
];

const RECENT_ALERT_WINDOW_MS = 5 * 60 * 1000;     // 5 min for the on-tile ALERT pill

// Time windows for the modal's history fetch. Smaller windows are the
// default — the OR datapoints endpoint has no cursor, so "pagination" here
// means "fetch a narrower window first, widen on demand". The operator
// re-runs the query (and pays the bandwidth) only when they ask for more.
const TIME_WINDOWS = [
  { id: '24h', label: '24h', ms: 24 * 60 * 60 * 1000 },
  { id: '7d',  label: '7d',  ms: 7 * 24 * 60 * 60 * 1000 },
  { id: '30d', label: '30d', ms: 30 * 24 * 60 * 60 * 1000 },
];

// Client-side page size for the sidebar list. Inside the already-fetched
// window we reveal events in chunks so a busy camera doesn't render
// hundreds of rows on first paint.
const PAGE_SIZE = 20;

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
  const [openCam, setOpenCam] = useState(null);

  const toggleTower = (id) => setTowerFilter((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const clearFilters = () => {
    setQuery('');
    setTowerFilter(new Set());
  };
  const activeFilterCount = (query ? 1 : 0) + towerFilter.size;

  /* ---- Tower chip counts ---- */
  const towerCounts = useMemo(() => {
    const out = new Map();
    for (const t of towers) out.set(t.id, 0);
    for (const { tower } of allCameras) out.set(tower.id, (out.get(tower.id) || 0) + 1);
    return out;
  }, [allCameras, towers]);

  /* ---- Apply filters ---- */
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allCameras.filter(({ camera, tower }) => {
      if (towerFilter.size > 0 && !towerFilter.has(tower.id)) return false;
      if (q) {
        const hay = `${getAssetDisplayName(camera)} ${getAssetDisplayName(tower)}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [allCameras, query, towerFilter]);

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
  // Plays the live stream inline (same pattern as the Control page's
  // CameraTile). The click only opens the full-view modal — the stream
  // is already running here.
  const url = getCameraStreamUrl(camera);
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

  const liveUrl = getCameraStreamUrl(camera);
  const offline = camera.attributes?.connected?.value === false;

  // Time-window selector + anchor. Anchor is "now at modal open" by
  // default; the refresh button bumps it. Putting `now` in state (not
  // computing it inline at render-time) keeps the React Query key stable
  // so the 60s poll doesn't refetch on every render.
  const [windowId, setWindowId] = useState('24h');
  const [anchor, setAnchor] = useState(() => new Date().getTime());
  const range = useMemo(() => {
    const w = TIME_WINDOWS.find((x) => x.id === windowId) || TIME_WINDOWS[0];
    return { from: anchor - w.ms, to: anchor };
  }, [anchor, windowId]);

  const {
    data: rawPoints, isLoading, isFetching, isError, refetch,
  } = useCameraEvents(camera.id, range);

  // Local filter chips inside the modal — independent from the page-level
  // filter so the operator can drill in deeper without losing the wall scope.
  const [drawerDetection, setDrawerDetection] = useState(new Set());

  // Client-side pagination within the fetched window. Reset whenever the
  // underlying filter/window changes so the operator always sees the most
  // recent N events first. We use the "reset state when a value changes"
  // pattern (React's recommended replacement for a setState-in-useEffect)
  // — `filterSignature` collapses every reset trigger into one string.
  const filterSignature = `${windowId}|${[...drawerDetection].sort().join(',')}|${rawPoints?.length ?? 0}`;
  const [resetSignature, setResetSignature] = useState(filterSignature);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  if (resetSignature !== filterSignature) {
    setResetSignature(filterSignature);
    setVisibleCount(PAGE_SIZE);
  }

  // Normalise OR datapoints into the existing clip shape the sidebar
  // already knows how to render. The OR datapoints endpoint can ship
  // points in several shapes depending on server version:
  //   • `{ x: ts, y: value }`           — most common
  //   • `[ ts, value ]`                 — older versions / chart-style
  // And the value itself can arrive as any of:
  //   • `[{ id, label }]`               — list of single object (what the
  //                                       user sees in the OR datapoints
  //                                       table for the Event id attribute)
  //   • `{ id, label }`                 — already unwrapped
  //   • `'{"id":"…","label":"…"}'`      — JSON-encoded string (OR will
  //                                       stringify complex types for some
  //                                       attribute kinds)
  //   • `'1779269865.828876-zcx508'`    — bare event id string
  const history = useMemo(() => {
    if (!Array.isArray(rawPoints)) return [];
    return rawPoints
      .map((pt, i) => {
        let ts, rawValue;
        if (Array.isArray(pt)) {
          [ts, rawValue] = pt;
        } else {
          ts = pt?.x ?? pt?.timestamp;
          rawValue = pt?.y ?? pt?.value;
        }
        const tsNum = typeof ts === 'number' ? ts : new Date(ts).getTime();
        if (!Number.isFinite(tsNum)) return null;

        const entry = unwrapEventValue(rawValue);
        const eventId = entry?.id;
        if (!eventId) return null;

        return {
          // Stable React key — fall back to the datapoint index when the
          // backend somehow ships two events with the same id in the window.
          id: `${eventId}-${i}`,
          eventId,
          ts: tsNum,
          detection: normalizeEventLabel(entry?.label),
          rawLabel: entry?.label,
          url: getEventClipUrl(eventId),
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.ts - a.ts);
  }, [rawPoints]);

  const filteredHistory = useMemo(() => {
    if (drawerDetection.size === 0) return history;
    return history.filter((h) => drawerDetection.has(h.detection));
  }, [history, drawerDetection]);

  const visibleHistory = filteredHistory.slice(0, visibleCount);
  const hasMore = filteredHistory.length > visibleCount;

  // Player state — three modes:
  //   • `activeClip == null`              → live stream
  //   • `activeClip && !isPlaying`        → snapshot.jpg preview + center play button
  //   • `activeClip && isPlaying`         → clip.mp4 playing
  //
  // The snapshot-first preview means a sidebar click is a low-cost peek
  // (no video bytes loaded), and the operator opts into the full clip
  // playback explicitly. Useful on slow links + when scanning many events.
  const [activeClip, setActiveClip] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);

  let playerUrl;
  if (!activeClip) playerUrl = liveUrl;
  else if (isPlaying) playerUrl = activeClip.url;
  else playerUrl = getEventSnapshotUrl(activeClip.eventId);
  // Force the player to re-mount whenever the URL changes so the source
  // reloads cleanly (otherwise React reuses the same element with old src).
  const playerKey = playerUrl || 'empty';
  const showPlayOverlay = !!activeClip && !isPlaying;

  // Reset playback whenever the user picks a different clip — every new
  // selection starts on the snapshot preview, not mid-playback of the
  // previous clip.
  const handleSelectClip = (clip) => {
    setActiveClip(clip);
    setIsPlaying(false);
  };
  const handleBackToLive = () => {
    setActiveClip(null);
    setIsPlaying(false);
  };

  const detectionCounts = useMemo(() => {
    const out = { human: 0, animal: 0, other: 0 };
    for (const h of history) if (h.detection in out) out[h.detection] += 1;
    return out;
  }, [history]);

  const handleRefresh = () => {
    setAnchor(new Date().getTime());
    refetch();
  };

  const handleWindowChange = (id) => {
    setWindowId(id);
    // Re-anchor so the new window ends at "right now", not at the moment
    // the modal opened — operators expect "Last 7d" to mean "right now
    // minus 7d", not "from when I opened the modal".
    setAnchor(new Date().getTime());
    // If the currently-playing clip falls outside the new window the
    // sidebar would briefly highlight nothing — clear active selection
    // so the player snaps back to live.
    setActiveClip(null);
    setIsPlaying(false);
  };

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
              {activeClip && <> · <strong className="text-[var(--color-accent-300)]">{isPlaying ? 'playing clip' : 'clip preview'} · {format(activeClip.ts, 'HH:mm dd MMM')}</strong></>}
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
            <div className="so-cam-full flex-1 relative">
              <CameraStream key={playerKey} url={playerUrl} offline={!activeClip && offline} />
              {showPlayOverlay && (
                <button
                  type="button"
                  onClick={() => setIsPlaying(true)}
                  className="so-play-overlay"
                  title="Play clip"
                  aria-label="Play clip"
                >
                  <span className="so-play-overlay-disc">
                    <Play className="w-7 h-7 ml-1" strokeWidth={2} fill="currentColor" />
                  </span>
                </button>
              )}
            </div>
            {activeClip && (
              <div className="flex items-center gap-2 mt-2">
                <button
                  type="button"
                  onClick={handleBackToLive}
                  className="audit-btn"
                >
                  ← Back to live
                </button>
                {isPlaying && (
                  <button
                    type="button"
                    onClick={() => setIsPlaying(false)}
                    className="audit-btn"
                    title="Show snapshot preview again"
                  >
                    Show snapshot
                  </button>
                )}
              </div>
            )}
          </div>

          {/* History sidebar */}
          <aside className="flex flex-col min-h-0 panel p-3 bg-[color-mix(in_srgb,var(--color-ink-0)_3%,transparent)]">
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-[12px] font-bold text-[var(--color-ink-0)] inline-flex items-center gap-1.5">
                <History className="w-3.5 h-3.5" />
                History
              </p>
              <div className="flex items-center gap-2">
                <span className="text-[10px] tabular-nums text-[var(--color-ink-2)]">
                  {isLoading
                    ? 'loading…'
                    : `${visibleHistory.length} of ${filteredHistory.length}`}
                </span>
                <button
                  type="button"
                  onClick={handleRefresh}
                  disabled={isFetching}
                  className="text-[var(--color-ink-3)] hover:text-[var(--color-ink-0)] disabled:opacity-40"
                  title="Refresh history"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`}
                    strokeWidth={2}
                  />
                </button>
              </div>
            </div>

            {/* Time window selector */}
            <div className="flex items-center gap-1.5 mb-1.5">
              {TIME_WINDOWS.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => handleWindowChange(w.id)}
                  data-active={windowId === w.id}
                  className="audit-chip"
                  style={windowId === w.id ? {
                    background: 'color-mix(in srgb, var(--color-accent-400) 18%, transparent)',
                    borderColor: 'color-mix(in srgb, var(--color-accent-400) 55%, transparent)',
                    color: 'var(--color-accent-300)',
                  } : {}}
                >
                  Last {w.label}
                </button>
              ))}
            </div>

            {/* Detection chips */}
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

            {isLoading ? (
              <div className="flex-1 flex items-center justify-center text-[12px] text-[var(--color-ink-2)] gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Loading events…
              </div>
            ) : isError ? (
              <div className="text-[12px] text-[var(--color-ink-2)] py-6 text-center px-3">
                No history data found for this camera.
              </div>
            ) : visibleHistory.length === 0 ? (
              <div className="text-[12px] text-[var(--color-ink-2)] py-6 text-center px-3">
                {history.length === 0
                  ? 'No history data found for this camera.'
                  : 'No events match the selected detection types.'}
              </div>
            ) : (
              <div className="flex-1 min-h-0 flex flex-col">
                <ul className="space-y-1.5 overflow-y-auto pr-1 flex-1">
                  {visibleHistory.map((h) => {
                    const meta = DETECTION_TYPES.find((d) => d.id === h.detection)
                      || { label: 'Other', color: 'var(--color-ink-2)' };
                    const isActive = activeClip?.id === h.id;
                    return (
                      <li key={h.id}>
                        <button
                          type="button"
                          onClick={() => handleSelectClip(h)}
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

                {hasMore && (
                  <button
                    type="button"
                    onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
                    className="audit-btn mt-2 self-center"
                    title={`Show next ${Math.min(PAGE_SIZE, filteredHistory.length - visibleCount)} events`}
                  >
                    Load more ({filteredHistory.length - visibleCount} remaining)
                  </button>
                )}
              </div>
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

// Unwrap a datapoint value into `{ id, label }`. The OR datapoints table
// for "Event id" shows the value column as a list of single object, but
// the API can ship it in any of the shapes documented at the call site.
function unwrapEventValue(raw) {
  if (raw == null) return null;
  let v = raw;
  if (typeof v === 'string') {
    // Bare event id string — no label, default to 'other'.
    if (!v.startsWith('{') && !v.startsWith('[')) {
      return { id: v, label: undefined };
    }
    try { v = JSON.parse(v); }
    catch { return { id: raw, label: undefined }; }
  }
  if (Array.isArray(v)) v = v[0];
  if (!v || typeof v !== 'object') return null;
  return { id: v.id ?? v.eventId ?? v.event_id, label: v.label ?? v.type ?? v.category };
}
