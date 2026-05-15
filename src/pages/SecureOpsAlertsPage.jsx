import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { format, formatDistanceToNowStrict } from 'date-fns';
import {
  AlertOctagon, Search, X, RotateCcw, Filter,
  Building2, RadioTower, Check, CheckCheck, Loader2,
} from 'lucide-react';
import { useAssets, useAlarms, useUpdateAlarmStatus } from '../hooks/useAssets';
import {
  pickSites, pickTowersForSite, alarmBelongsToGateway,
  findGatewayForAsset, findSiteForAsset,
} from '../utils/gateways';
import {
  getAssetDisplayName, getCustomAssetType, getAssetTypeLabel, normalizeAssetType,
} from '../utils/assetIcons';
import useSecureOpsStore from '../store/secureOpsStore';
import { LoadingSpinner } from '../components/ui';
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
  const { data: openAlarms = [], isLoading: alarmsLoading } = useAlarms({ status: 'OPEN' });
  const { selectedSiteId } = useSecureOpsStore();
  const update = useUpdateAlarmStatus();

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
  const assetMap = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);

  /* ---- Filter state ---- */
  const [query, setQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState(new Set());
  const [towerFilter, setTowerFilter] = useState(new Set());

  /* ---- Strict OPEN-only alarms in site scope ---- */
  const scoped = useMemo(() => {
    const scopeTowerIds = towers.map((t) => t.id);
    return (openAlarms || []).filter((al) => {
      // Defensive: also strip anything that somehow isn't OPEN — the alarm
      // hook already filters by status:'OPEN', but the second-guess keeps the
      // panel honest if OR ever returns ACKNOWLEDGED entries in the same call.
      if ((al.status || 'OPEN').toUpperCase() !== 'OPEN') return false;
      if (!scopeTowerIds.length) return true;
      return scopeTowerIds.some((gid) => alarmBelongsToGateway(al, gid, assetMap, towers));
    });
  }, [openAlarms, towers, assetMap]);

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
      for (const t of towers) {
        if (alarmBelongsToGateway(al, t.id, assetMap, towers)) {
          out.set(t.id, (out.get(t.id) || 0) + 1);
          break;
        }
      }
    }
    return out;
  }, [scoped, towers, assetMap]);

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
          const hit = [...towerFilter].some((tid) =>
            alarmBelongsToGateway(al, tid, assetMap, towers)
          );
          if (!hit) return false;
        }
        if (q) {
          const linked = Array.isArray(al.asset) && al.asset[0];
          const asset = linked?.id
            ? (assetMap.get(linked.id) || linked)
            : (al.assetId ? assetMap.get(al.assetId) : null);
          const tower = asset ? findGatewayForAsset(asset, towers) : null;
          const site = tower
            ? findSiteForAsset(tower, sites)
            : (asset ? findSiteForAsset(asset, sites) : null);
          const hay = [
            al.title, al.content,
            site && getAssetDisplayName(site),
            tower && getAssetDisplayName(tower),
            asset && getAssetDisplayName(asset),
          ].filter(Boolean).join(' ').toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => new Date(b.createdOn || 0) - new Date(a.createdOn || 0));
  }, [scoped, severityFilter, towerFilter, query, assetMap, towers, sites]);

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
            {filtered.map((al) => (
              <AlertRow
                key={al.id}
                alarm={al}
                assetMap={assetMap}
                towers={towers}
                sites={sites}
                update={update}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/* ==========================================================================
   Row
   ========================================================================== */

function AlertRow({ alarm, assetMap, towers, sites, update }) {
  const sev = (alarm.severity || 'LOW').toUpperCase();
  const sevMeta = SEVERITY_META[sev] || SEVERITY_META.LOW;

  const linked = Array.isArray(alarm.asset) && alarm.asset[0];
  const asset = linked?.id
    ? (assetMap.get(linked.id) || linked)
    : (alarm.assetId ? assetMap.get(alarm.assetId) : null);
  const tower = asset ? findGatewayForAsset(asset, towers) : null;
  const site = tower
    ? findSiteForAsset(tower, sites)
    : (asset ? findSiteForAsset(asset, sites) : null);

  const typeLabel = asset ? getAssetTypeLabel(getCustomAssetType(asset)) : null;
  const assetName = asset ? getAssetDisplayName(asset) : null;
  const createdAt = alarm.createdOn ? new Date(alarm.createdOn) : null;

  const mutatingThis = update?.isPending && update.variables?.alarm?.id === alarm.id;
  const ackPending = mutatingThis && update.variables?.status === 'ACKNOWLEDGED';
  const resolvePending = mutatingThis && update.variables?.status === 'RESOLVED';
  const anyPending = ackPending || resolvePending;

  return (
    <div className="so-alert-row" style={{ '--rail': sevMeta.color }}>
      <div className="flex-1 min-w-0">
        <p className="so-alert-title">{alarm.title || 'Alarm'}</p>
        {alarm.content && (
          <p className="so-alert-meta mt-0.5 truncate">{alarm.content}</p>
        )}

        <p className="so-alert-meta flex items-center flex-wrap gap-x-1.5 gap-y-0.5 mt-1">
          {site && (
            <Link to="/sites" className="so-crumb">
              <Building2 className="w-3 h-3" strokeWidth={2} />
              {getAssetDisplayName(site)}
            </Link>
          )}
          {tower && (
            <>
              {site && <span className="so-crumb-sep">›</span>}
              <Link to={`/store/${tower.id}`} className="so-crumb">
                <RadioTower className="w-3 h-3" strokeWidth={2} />
                {getAssetDisplayName(tower)}
              </Link>
            </>
          )}
          {asset && (
            <>
              {(tower || site) && <span className="so-crumb-sep">›</span>}
              <Link to={`/a/${asset.id}`} className="so-crumb">
                {assetName || typeLabel}
              </Link>
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

        {update && (
          <div className="so-alert-actions">
            <button
              type="button"
              onClick={() => update.mutate({ alarm, status: 'ACKNOWLEDGED' })}
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
              onClick={() => update.mutate({ alarm, status: 'RESOLVED' })}
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
        )}
      </div>
    </div>
  );
}

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
