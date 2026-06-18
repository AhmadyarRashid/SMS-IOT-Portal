import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { format, formatDistanceToNowStrict } from 'date-fns';
import {
  AlertOctagon, Search, X, RotateCcw, Filter,
  Building2, RadioTower, Check, CheckCheck, Loader2, Video as VideoIcon,
} from 'lucide-react';
import { useAssets, useAlarms, useUpdateAlarmStatus } from '../hooks/useAssets';
import {
  pickSites, pickTowersForSite,
  findGatewayForAsset, findSiteForAsset,
} from '../utils/gateways';
import {
  getAssetDisplayName, getCustomAssetType, getAssetTypeLabel, normalizeAssetType,
} from '../utils/assetIcons';
import { getAlarmClipUrl, getAlarmEventId } from '../utils/alarms';
import useSecureOpsStore from '../store/secureOpsStore';
import { LoadingSpinner } from '../components/ui';
import AlarmClipModal from '../components/cameras/AlarmClipModal';
import './secureops.css';

/* ==========================================================================
   Alerts (/alarms) — actionable inbox.

   Different from the Audit page on purpose:
     • Audit  = every historical event (raised + transitions + tower logs),
                full history, pagination, CSV export.
     • Alerts = only OPEN alarms that need action right now. Ack/Resolve
                buttons on every row. Once an operator acts, the alarm
                disappears from this view (it remains visible in Audit).

   Sources only `useAlarms({ status: 'OPEN' })`. Scoped by the global site
   dropdown. Two filters on top:
     • Severity — multi-select High (CRITICAL+HIGH) · Medium · Low.
     • Tower    — multi-select of towers in the current site scope.
   Plus a free-text search across title / site / tower / device.
   ========================================================================== */

const PAGE_SIZE = 30;
const VISIBLE_BUMP = 30;

const SEVERITY_GROUPS = [
  { id: 'HIGH',   label: 'High',   color: 'var(--color-danger-400)',  matches: ['CRITICAL', 'HIGH'] },
  { id: 'MEDIUM', label: 'Medium', color: 'var(--color-warning-400)', matches: ['MEDIUM'] },
  { id: 'LOW',    label: 'Low',    color: 'var(--color-ink-2)',       matches: ['LOW'] },
];

const SEVERITY_META = {
  CRITICAL: { label: 'Critical', color: 'var(--color-danger-400)' },
  HIGH:     { label: 'High',     color: 'var(--color-danger-400)' },
  MEDIUM:   { label: 'Medium',   color: 'var(--color-warning-400)' },
  LOW:      { label: 'Low',      color: 'var(--color-ink-2)' },
};

export default function SecureOpsAlertsPage() {
  const { data: assets = [], isLoading: assetsLoading } = useAssets({});
  // Share the cache key with Overview (`useAlarms({})`) so navigating from
  // Overview → Alerts is instant — same React Query slot, no extra fetch.
  // Derive the OPEN subset client-side; the defensive status filter in the
  // `scoped` memo below keeps the page honest if a non-OPEN alarm slips
  // through.
  const { data: allAlarms = [], isLoading: alarmsLoading } = useAlarms({});
  const openAlarms = useMemo(
    () => allAlarms.filter((al) => (al.status || 'OPEN').toUpperCase() === 'OPEN'),
    [allAlarms]
  );
  const { selectedSiteId } = useSecureOpsStore();
  const update = useUpdateAlarmStatus();
  const [clipInView, setClipInView] = useState(null);

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
  /* ---- Shared lookups (built once, reused everywhere) ----
   * Same pattern as Overview: precompute assetMap + alarmTowerMap +
   * alarmContextMap so each AlertRow can stay memoized and skip the
   * expensive findGatewayForAsset / findSiteForAsset Map allocations
   * it used to do per-row, per-render.
   *
   *   • alarmTowerMap   — alarmId → Set<towerId> (mirrors original
   *                       "match if ANY linked asset lives under the
   *                       tower" semantics; safe with multi-asset alarms).
   *   • alarmContextMap — alarmId → { asset, tower, site, clipUrl } for
   *                       row breadcrumb + search + clip modal seed.
   */
  const assetMap = useMemo(() => {
    const m = new Map();
    for (const a of assets) m.set(a.id, a);
    return m;
  }, [assets]);

  const towerById = useMemo(() => {
    const m = new Map();
    for (const t of towers) m.set(t.id, t);
    return m;
  }, [towers]);
  const siteById = useMemo(() => {
    const m = new Map();
    for (const s of sites) m.set(s.id, s);
    return m;
  }, [sites]);

  const alarmTowerMap = useMemo(() => {
    const towerIds = new Set(towers.map((t) => t.id));
    const m = new Map();
    const collectTower = (assetLike, out) => {
      if (!assetLike) return;
      const id = typeof assetLike === 'string' ? assetLike : assetLike.id;
      if (!id) return;
      const asset = assetMap.get(id) || (typeof assetLike === 'object' ? assetLike : null);
      if (!asset) return;
      if (asset.parentId && towerIds.has(asset.parentId)) { out.add(asset.parentId); return; }
      if (Array.isArray(asset.path)) {
        for (const pid of asset.path) if (towerIds.has(pid)) { out.add(pid); return; }
      }
    };
    for (const al of openAlarms) {
      const found = new Set();
      if (Array.isArray(al.asset)) {
        for (const a of al.asset) collectTower(a, found);
      } else if (al.asset && typeof al.asset === 'object') {
        collectTower(al.asset, found);
      }
      if (Array.isArray(al.assets)) for (const a of al.assets) collectTower(a, found);
      if (Array.isArray(al.linkedAssets)) for (const a of al.linkedAssets) collectTower(a, found);
      if (al.assetId) collectTower(al.assetId, found);
      if ((al.source === 'INTERNAL' || al.source === 'CLIENT') && al.sourceId) {
        collectTower(al.sourceId, found);
      }
      if (found.size > 0) m.set(al.id, found);
    }
    return m;
  }, [openAlarms, towers, assetMap]);

  const alarmContextMap = useMemo(() => {
    const m = new Map();
    for (const al of openAlarms) {
      const linked = Array.isArray(al.asset) && al.asset[0];
      const linkedId = linked?.id || al.assetId || null;
      const asset = linkedId
        ? (assetMap.get(linkedId) || (typeof linked === 'object' ? linked : null))
        : null;
      let tower = null;
      const tset = alarmTowerMap.get(al.id);
      if (tset) {
        for (const tid of tset) { const t = towerById.get(tid); if (t) { tower = t; break; } }
      }
      if (!tower && asset) tower = findGatewayForAsset(asset, towers);
      let site = null;
      if (tower) {
        if (tower.parentId && siteById.has(tower.parentId)) site = siteById.get(tower.parentId);
        else if (Array.isArray(tower.path)) {
          for (const pid of tower.path) if (siteById.has(pid)) { site = siteById.get(pid); break; }
        }
      } else if (asset) {
        site = findSiteForAsset(asset, sites);
      }
      const clipUrl = getAlarmClipUrl(al, asset);
      // `hasClip` gates the clip icon: an alarm with an event id but no
      // resolvable URL (camera media origin missing) still shows it — the
      // modal then surfaces the config error.
      m.set(al.id, { asset, tower, site, clipUrl, hasClip: !!clipUrl || !!getAlarmEventId(al) });
    }
    return m;
  }, [openAlarms, alarmTowerMap, assetMap, towerById, siteById, towers, sites]);

  /* ---- Filter state ---- */
  const [query, setQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState(new Set());
  const [towerFilter, setTowerFilter] = useState(new Set());

  /* ---- Strict OPEN-only alarms in site scope ---- */
  const scoped = useMemo(() => {
    const scopeTowerIds = new Set(towers.map((t) => t.id));
    return (openAlarms || []).filter((al) => {
      // Defensive: also strip anything that somehow isn't OPEN.
      if ((al.status || 'OPEN').toUpperCase() !== 'OPEN') return false;
      if (scopeTowerIds.size === 0) return true;
      const tset = alarmTowerMap.get(al.id);
      if (!tset) return false;
      for (const tid of tset) if (scopeTowerIds.has(tid)) return true;
      return false;
    });
  }, [openAlarms, towers, alarmTowerMap]);

  /* ---- Filter chips counts ---- */
  const severityCounts = useMemo(() => {
    const out = { HIGH: 0, MEDIUM: 0, LOW: 0 };
    for (const al of scoped) {
      const s = (al.severity || 'LOW').toUpperCase();
      if (s === 'CRITICAL' || s === 'HIGH') out.HIGH += 1;
      else if (s === 'MEDIUM') out.MEDIUM += 1;
      else out.LOW += 1;
    }
    return out;
  }, [scoped]);

  const towerCounts = useMemo(() => {
    const out = new Map();
    for (const t of towers) out.set(t.id, 0);
    for (const al of scoped) {
      const tset = alarmTowerMap.get(al.id);
      if (!tset) continue;
      for (const t of towers) {
        if (tset.has(t.id)) { out.set(t.id, out.get(t.id) + 1); break; }
      }
    }
    return out;
  }, [scoped, towers, alarmTowerMap]);

  /* ---- Apply user filters ---- */
  const filtered = useMemo(() => {
    const sevSet = expandSeverity(severityFilter);
    const q = query.trim().toLowerCase();

    return scoped
      .filter((al) => {
        if (sevSet.size > 0) {
          const sev = (al.severity || 'LOW').toUpperCase();
          if (!sevSet.has(sev)) return false;
        }
        if (towerFilter.size > 0) {
          const tset = alarmTowerMap.get(al.id);
          if (!tset) return false;
          let hit = false;
          for (const tid of towerFilter) if (tset.has(tid)) { hit = true; break; }
          if (!hit) return false;
        }
        if (q) {
          const ctx = alarmContextMap.get(al.id);
          const hay = [
            al.title, al.content,
            ctx?.site && getAssetDisplayName(ctx.site),
            ctx?.tower && getAssetDisplayName(ctx.tower),
            ctx?.asset && getAssetDisplayName(ctx.asset),
          ].filter(Boolean).join(' ').toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => new Date(b.createdOn || 0) - new Date(a.createdOn || 0));
  }, [scoped, severityFilter, towerFilter, query, alarmTowerMap, alarmContextMap]);

  /* ---- Helpers ---- */
  const toggleInSet = (setter) => (id) => setter((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleSeverity = toggleInSet(setSeverityFilter);
  const toggleTower = toggleInSet(setTowerFilter);

  const clearFilters = () => {
    setQuery('');
    setSeverityFilter(new Set());
    setTowerFilter(new Set());
  };
  const activeFilterCount = (query ? 1 : 0) + severityFilter.size + towerFilter.size;

  /* ---- Infinite scroll — render the first PAGE_SIZE rows; IntersectionObserver
   *      bumps the visible count as the operator scrolls. Resets to PAGE_SIZE
   *      only when filters change; mutation-driven shrinkage preserves the
   *      operator's scroll position. Uses the project's "reset state when a
   *      value changes" pattern (no setState in useEffect). */
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const filterSig = useMemo(
    () => `q:${query.trim()}|sev:${[...severityFilter].sort().join(',')}|tow:${[...towerFilter].sort().join(',')}`,
    [query, severityFilter, towerFilter]
  );
  const [prevFilterSig, setPrevFilterSig] = useState(filterSig);
  if (prevFilterSig !== filterSig) {
    setPrevFilterSig(filterSig);
    setVisibleCount(PAGE_SIZE);
  }

  const visibleAlarms = useMemo(
    () => filtered.slice(0, visibleCount),
    [filtered, visibleCount]
  );
  const hasMore = visibleCount < filtered.length;

  // Sentinel observer — root is the VIEWPORT (root: null), not the list
  // section, because the Alerts page itself scrolls (no internal
  // overflow:auto container). Setting `root: <element>` here would make
  // the observer wait for the sentinel to enter the bounds of a non-
  // scrolling element — it would never fire.
  const sentinelRef = useRef(null);
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore) return undefined;
    const obs = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) setVisibleCount((c) => c + VISIBLE_BUMP);
    }, { root: null, rootMargin: '200px 0px', threshold: 0 });
    obs.observe(node);
    return () => obs.disconnect();
  }, [hasMore]);

  /* ---- Stable handlers — keep AlertRow memoized ---- */
  const handleClipClick = useCallback((alarmId) => {
    const ctx = alarmContextMap.get(alarmId);
    const alarm = openAlarms.find((a) => a.id === alarmId);
    if (alarm) setClipInView({ alarm, asset: ctx?.asset, tower: ctx?.tower, site: ctx?.site });
  }, [alarmContextMap, openAlarms]);
  const handleClipClose = useCallback(() => setClipInView(null), []);
  const handleAck = useCallback((alarm) => {
    update.mutate({ alarm, status: 'ACKNOWLEDGED' });
  }, [update]);
  const handleResolve = useCallback((alarm) => {
    update.mutate({ alarm, status: 'RESOLVED' });
  }, [update]);

  // Surface mutation pending state as primitives so AlertRow stays memoized
  // (passing the React-Query `update` object would bust the memo on every
  // background fetch tick — its identity changes).
  const pendingAlarmId = update.isPending ? update.variables?.alarm?.id : null;
  const pendingStatus = update.isPending ? update.variables?.status : null;

  if (assetsLoading || alarmsLoading) {
    return <div className="flex items-center justify-center min-h-[60vh]"><LoadingSpinner size="lg" /></div>;
  }

  return (
    <div className="p-4 md:p-6 max-w-[1200px] mx-auto space-y-4">
      {/* ===== Header ===== */}
      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-ink-0)] flex items-center gap-2">
            <AlertOctagon className="w-5 h-5 text-[var(--color-danger-400)]" strokeWidth={2} />
            Alerts
          </h1>
          <p className="text-xs text-[var(--color-ink-2)] mt-0.5">
            Open alerts awaiting action across {towers.length || 'all'} tower{towers.length === 1 ? '' : 's'}
            {selectedSiteId
              ? ` in ${getAssetDisplayName(sites.find((s) => s.id === selectedSiteId)) || 'this site'}`
              : ' (all sites)'}
            . Acknowledged and resolved alarms appear in the Audit log.
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
              placeholder="Search title, site, tower or device…"
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
            {filtered.length.toLocaleString()} of {scoped.length.toLocaleString()} alerts
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[120px_1fr] gap-x-3 gap-y-1.5 items-center text-[11px]">
          <FilterLabel>Severity</FilterLabel>
          <div className="flex items-center gap-1.5 flex-wrap">
            {SEVERITY_GROUPS.map((g) => (
              <ToggleChip
                key={g.id}
                active={severityFilter.has(g.id)}
                onClick={() => toggleSeverity(g.id)}
                color={g.color}
                count={severityCounts[g.id]}
              >
                {g.label}
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

      {/* ===== List ===== */}
      <section className="panel p-4 md:p-5">
        {filtered.length === 0 ? (
          <div className="py-10 text-center text-sm text-[var(--color-ink-2)]">
            {scoped.length === 0
              ? 'All clear — no open alerts in this scope.'
              : 'No alerts match these filters.'}
          </div>
        ) : (
          <div className="space-y-2">
            {visibleAlarms.map((al) => {
              const ctx = alarmContextMap.get(al.id);
              return (
                <AlertRow
                  key={al.id}
                  alarm={al}
                  asset={ctx?.asset || null}
                  tower={ctx?.tower || null}
                  site={ctx?.site || null}
                  hasClip={ctx?.hasClip || false}
                  pendingStatus={pendingAlarmId === al.id ? pendingStatus : null}
                  onClipClick={handleClipClick}
                  onAck={handleAck}
                  onResolve={handleResolve}
                />
              );
            })}
            {hasMore && (
              <div
                ref={sentinelRef}
                className="flex items-center justify-center gap-2 py-3 text-[11px] text-[var(--color-ink-2)]"
                aria-hidden="true"
              >
                <Loader2 className="w-3.5 h-3.5 spin-slow" strokeWidth={2} />
                <span>Loading more… ({filtered.length - visibleAlarms.length} remaining)</span>
              </div>
            )}
          </div>
        )}
      </section>

      {clipInView && (
        <AlarmClipModal
          alarm={clipInView.alarm}
          asset={clipInView.asset}
          tower={clipInView.tower}
          site={clipInView.site}
          onClose={handleClipClose}
        />
      )}
    </div>
  );
}

/* ==========================================================================
   Row
   ========================================================================== */

/**
 * Row in the Alerts list. Pure render — every input is precomputed at the
 * parent (asset/tower/site/clipUrl, pendingStatus) so the row can stay
 * memoized and skip re-render when its alarm hasn't changed. Props are
 * individual primitives / stable refs (NOT a wrapping context object)
 * so React.memo's shallow compare actually skips work on background polls.
 */
const AlertRow = memo(function AlertRow({ alarm, asset, tower, site, hasClip, pendingStatus, onClipClick, onAck, onResolve }) {
  const sev = (alarm.severity || 'LOW').toUpperCase();
  const sevMeta = SEVERITY_META[sev] || SEVERITY_META.LOW;

  const typeLabel = asset ? getAssetTypeLabel(getCustomAssetType(asset)) : null;
  const assetName = asset ? getAssetDisplayName(asset) : null;
  const createdAt = alarm.createdOn ? new Date(alarm.createdOn) : null;

  const ackPending = pendingStatus === 'ACKNOWLEDGED';
  const resolvePending = pendingStatus === 'RESOLVED';
  const anyPending = ackPending || resolvePending;

  return (
    <div className="so-alert-row" style={{ '--rail': sevMeta.color }}>
      <div className="flex-1 min-w-0">
        <p className="so-alert-title">{alarm.title || 'Alarm'}</p>

        {/* Site → Tower → Camera breadcrumb is display-only on alert rows.
            Only the Clip icon button is interactive. */}
        <p className="so-alert-meta flex items-center flex-wrap gap-x-1.5 gap-y-0.5 mt-1">
          {site && (
            <span className="so-crumb so-crumb-static">
              <Building2 className="w-3 h-3" strokeWidth={2} />
              {getAssetDisplayName(site)}
            </span>
          )}
          {tower && (
            <>
              {site && <span className="so-crumb-sep">›</span>}
              <span className="so-crumb so-crumb-static">
                <RadioTower className="w-3 h-3" strokeWidth={2} />
                {getAssetDisplayName(tower)}
              </span>
            </>
          )}
          {asset && (
            <>
              {(tower || site) && <span className="so-crumb-sep">›</span>}
              <span className="so-crumb so-crumb-static">{assetName || typeLabel}</span>
            </>
          )}
        </p>

        {createdAt && (
          <p className="so-alert-meta mt-0.5 tabular-nums">
            {format(createdAt, 'HH:mm')} · {formatDistanceToNowStrict(createdAt)} ago
          </p>
        )}
      </div>

      <div className="so-alert-right">
        <span
          className="so-alert-sev"
          style={{
            background: `color-mix(in srgb, ${sevMeta.color} 14%, transparent)`,
            color: sevMeta.color,
            border: `1px solid color-mix(in srgb, ${sevMeta.color} 40%, transparent)`,
          }}
        >
          {sevMeta.label}
        </span>

        <div className="so-alert-actions">
          {hasClip && (
            <button
              type="button"
              onClick={() => onClipClick?.(alarm.id)}
              className="so-clip-btn"
              title="View the clip attached to this alarm"
            >
              <VideoIcon className="w-3 h-3" strokeWidth={2} />
              <span>Clip</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => onAck?.(alarm)}
            disabled={anyPending}
            className="so-alert-btn so-alert-btn-ack"
            title="Acknowledge"
          >
            {ackPending
              ? <Loader2 className="w-3 h-3 spin-slow" />
              : <Check className="w-3 h-3" strokeWidth={2.25} />}
            <span>Ack</span>
          </button>
          <button
            type="button"
            onClick={() => onResolve?.(alarm)}
            disabled={anyPending}
            className="so-alert-btn so-alert-btn-resolve"
            title="Resolve"
          >
            {resolvePending
              ? <Loader2 className="w-3 h-3 spin-slow" />
              : <CheckCheck className="w-3 h-3" strokeWidth={2.25} />}
            <span>Resolve</span>
          </button>
        </div>
      </div>
    </div>
  );
});

/* ==========================================================================
   Filter chip primitives (mirror the Audit page styling for consistency)
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

function expandSeverity(set) {
  const out = new Set();
  for (const g of SEVERITY_GROUPS) {
    if (set.has(g.id)) for (const m of g.matches) out.add(m);
  }
  return out;
}
