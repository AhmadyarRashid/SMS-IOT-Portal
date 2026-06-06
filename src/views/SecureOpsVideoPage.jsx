import { useMemo, useState } from 'react';
import {
  Video as VideoIcon, Search, X, Filter, RotateCcw, RadioTower,
} from 'lucide-react';
import { useAssets } from '../hooks/useAssets';
import {
  pickSites, pickTowersForSite, pickGatewayChildren, isCameraAsset,
} from '../utils/gateways';
import {
  getAssetDisplayName, getCustomAssetType, normalizeAssetType,
} from '../utils/assetIcons';
import CameraCard from '../components/cameras/CameraCard';
import useSecureOpsStore from '../store/secureOpsStore';
import { LoadingSpinner } from '../components/ui';
import './secureops.css';

/* ==========================================================================
   Video (/video)

   The "operator wall": cameras for the **active tower** are shown as live
   tiles via the shared `CameraCard`. Tower is single-select (chips +
   `secureOpsStore.selectedTowerId`), default-picks the first tower in
   scope. Showing only one tower at a time keeps the live-stream load
   bounded — a wall of every camera in the realm would otherwise mount N
   concurrent MJPEG/HLS feeds at once.
   Click a tile to open the unified `CameraHistoryModal`.

   Filtering:
     • Tower  — multi-select checkbox-style chips. First tower is checked
                by default on initial load and on site-scope change (so
                only one tower's streams mount until the operator opts in
                to more). Empty Set after the operator unchecks everything
                = show all towers (original semantics). Tracked in LOCAL
                page state, NOT the shared `secureOpsStore.selectedTowerId`
                — the store is persisted to localStorage and shared with
                Control, which would otherwise override the default.
     • Search — free-text across camera name + tower name.

   Sources:
     • CameraAsset / PtzCameraAsset live-stream URL (`getCameraStreamUrl`)
     • `eventId` datapoints — fetched lazily inside the modal.
   ========================================================================== */

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

  /* ---- All cameras across the scope, paired with their tower ---- */
  const allCameras = useMemo(() => {
    const out = [];
    for (const t of towers) {
      const kids = pickGatewayChildren(assets, t.id).filter(isCameraAsset);
      for (const c of kids) out.push({ camera: c, tower: t });
    }
    return out;
  }, [towers, assets]);

  /* ---- Tower chip badge counts (per-tower camera count) ---- */
  const towerCounts = useMemo(() => {
    const out = new Map();
    for (const t of towers) {
      const kids = pickGatewayChildren(assets, t.id).filter(isCameraAsset);
      out.set(t.id, kids.length);
    }
    return out;
  }, [towers, assets]);

  /* ---- Tower filter (multi-select, default = { firstTower }) ----
   * Local state — fresh mount of /video defaults to the first rendered
   * chip checked, so only one tower's streams mount up front. Multi-
   * select toggle: clicking another chip adds it, clicking an active
   * chip removes it. An empty Set after the operator unchecks everything
   * means "show all towers" (original semantics).
   *
   * Re-seeded when `towers` changes (initial load, site switch) via the
   * project's "reset state when a value changes" pattern — comparing a
   * stored signature to current rather than setState-in-useEffect (which
   * the lint config flags). Only re-seeds when the tower list IDENTITY
   * changes; mutation-driven asset polls that return the same tower list
   * preserve the operator's current selection.
   */
  const [towerFilter, setTowerFilter] = useState(new Set());
  const towersSig = useMemo(() => towers.map((t) => t.id).join('|'), [towers]);
  const [prevTowersSig, setPrevTowersSig] = useState('');
  if (prevTowersSig !== towersSig) {
    setPrevTowersSig(towersSig);
    setTowerFilter(towers[0] ? new Set([towers[0].id]) : new Set());
  }
  const toggleTower = (id) => setTowerFilter((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  /* ---- Filter state (search) ---- */
  const [query, setQuery] = useState('');

  // "Active filter" excludes the default-first-tower state — the operator
  // hasn't made a deliberate choice yet, so the Reset button shouldn't
  // light up.
  const isDefaultTowerFilter =
    towerFilter.size === 1 && !!towers[0] && towerFilter.has(towers[0].id);
  const activeFilterCount = (query ? 1 : 0) + (isDefaultTowerFilter ? 0 : 1);
  const clearFilters = () => {
    setQuery('');
    setTowerFilter(towers[0] ? new Set([towers[0].id]) : new Set());
  };

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
            Live wall ·{' '}
            {towerFilter.size === 0
              ? `all ${towers.length} tower${towers.length === 1 ? '' : 's'}`
              : `${towerFilter.size} of ${towers.length} tower${towers.length === 1 ? '' : 's'}`}
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

      {/* ===== Camera wall — cameras for the checked towers ===== */}
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
              <CameraCard
                key={camera.id}
                camera={camera}
                tower={tower}
                showTower
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/* ==========================================================================
   Filter primitives (mirror Audit / Alerts pages)
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
