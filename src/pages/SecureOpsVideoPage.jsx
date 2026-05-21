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

   The "operator wall": every CameraAsset / PtzCameraAsset in the current
   site scope is shown as a small live-stream tile via the shared
   `CameraCard`. Click a tile to open the unified `CameraHistoryModal` —
   live stream + scrollable detection-history sidebar — the same modal that
   opens from Overview's Live Camera Feeds and Control's Cameras panel.

   Filtering:
     • Tower  — multi-select chips for towers in the selected site scope.
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

  /* ---- All cameras across the scope (CameraAsset + PtzCameraAsset) ---- */
  const allCameras = useMemo(() => {
    const out = [];
    for (const t of towers) {
      const kids = pickGatewayChildren(assets, t.id).filter(isCameraAsset);
      for (const c of kids) out.push({ camera: c, tower: t });
    }
    return out;
  }, [towers, assets]);

  /* ---- Filter state ---- */
  const [query, setQuery] = useState('');
  const [towerFilter, setTowerFilter] = useState(new Set());

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
