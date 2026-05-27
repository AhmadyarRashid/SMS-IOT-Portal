import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { format, formatDistanceToNowStrict } from 'date-fns';
import {
  ScrollText, Search, X, Filter, ChevronLeft, ChevronRight,
  Building2, RadioTower, AlertOctagon, Check, CheckCheck,
  Download, RotateCcw, ChevronsLeft, ChevronsRight, Video as VideoIcon,
} from 'lucide-react';
import { useAssets, useAlarms } from '../hooks/useAssets';
import {
  pickSites, pickTowersForSite, alarmBelongsToGateway,
} from '../utils/gateways';
import {
  getAssetDisplayName, getCustomAssetType, getAssetTypeLabel, normalizeAssetType,
} from '../utils/assetIcons';
import { alarmAuditEvents, towerAuditEvents } from '../utils/auditEvents';
import useSecureOpsStore from '../store/secureOpsStore';
import { LoadingSpinner } from '../components/ui';
import { downloadCsv } from '../utils/csv';
import CameraHistoryModal from '../components/cameras/CameraHistoryModal';
import AlarmClipModal from '../components/cameras/AlarmClipModal';
import { findGatewayForAsset } from '../utils/gateways';
import './secureops.css';

/* ==========================================================================
   Full audit trail page (/audit).

   Filters (all client-side, derived from the cached useAssets + useAlarms):
     • Search       — free text against the row title and breadcrumb
     • Severity     — High (CRITICAL + HIGH) · Medium · Low
     • Status       — Open · Acknowledged · Resolved / Closed
     • Tower        — multi-select within the global site scope
     • Time range   — Today · Last 24h · Last 7 days · Last 30 days · All

   Site scope is inherited from the global SecureOps dropdown (the
   `SecureOpsHeader`'s All Sites / specific site selection).

   Pagination is client-side (25 rows per page). With the alarm history
   capped at whatever OR returns from /alarm, this is plenty fast.

   Export: "Download CSV" emits every filtered row (not just the current page)
   using the existing `toCsv` / `downloadCsv` helpers — same RFC 4180 + UTF-8
   BOM treatment as the Dashboard reports section.
   ========================================================================== */

const PAGE_SIZE = 25;

const TIME_RANGES = [
  { id: 'today', label: 'Today',       window: () => sinceStartOfDay() },
  { id: '24h',   label: 'Last 24h',    window: () => new Date().getTime() - 24 * 3600 * 1000 },
  { id: '7d',    label: 'Last 7 days', window: () => new Date().getTime() - 7 * 24 * 3600 * 1000 },
  { id: '30d',   label: 'Last 30 days',window: () => new Date().getTime() - 30 * 24 * 3600 * 1000 },
  { id: 'all',   label: 'All time',    window: () => 0 },
];

const SEVERITY_GROUPS = [
  { id: 'HIGH',   label: 'High',   color: 'var(--color-danger-400)',  matches: ['CRITICAL', 'HIGH'] },
  { id: 'MEDIUM', label: 'Medium', color: 'var(--color-warning-400)', matches: ['MEDIUM'] },
  { id: 'LOW',    label: 'Low',    color: 'var(--color-ink-2)',       matches: ['LOW'] },
];

const STATUS_GROUPS = [
  { id: 'OPEN',         label: 'Open',         color: 'var(--color-danger-400)',  matches: ['OPEN'] },
  { id: 'ACKNOWLEDGED', label: 'Acknowledged', color: 'var(--color-warning-400)', matches: ['ACKNOWLEDGED', 'IN_PROGRESS'] },
  { id: 'RESOLVED',     label: 'Resolved',     color: 'var(--color-ok-500)',      matches: ['RESOLVED', 'CLOSED'] },
];

export default function AuditLogPage() {
  const { data: assets = [], isLoading: assetsLoading } = useAssets({});
  const { data: allAlarms = [], isLoading: alarmsLoading } = useAlarms({});
  const { selectedSiteId, setSite, setTower } = useSecureOpsStore();
  const [cameraInView, setCameraInView] = useState(null);
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
  const assetMap = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);

  /* ---- Filter state ---- */
  const [query, setQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState(new Set());     // Set<'HIGH'|'MEDIUM'|'LOW'>
  const [statusFilter, setStatusFilter] = useState(new Set());          // Set<'OPEN'|'ACKNOWLEDGED'|'RESOLVED'>
  const [towerFilter, setTowerFilter] = useState(new Set());            // Set<towerId>
  const [timeRange, setTimeRange] = useState('7d');
  const [page, setPage] = useState(1);

  /* ---- Build event list ---- */
  const allEvents = useMemo(() => {
    const scopeTowerIds = towers.map((t) => t.id);
    const ctx = { assetMap, sites, towers };
    const fromAlarms = (allAlarms || [])
      .filter((al) => {
        if (!scopeTowerIds.length) return true;
        return scopeTowerIds.some((gid) => alarmBelongsToGateway(al, gid, assetMap, towers));
      })
      .flatMap((al) => alarmAuditEvents(al, ctx));
    const fromTowerLogs = (towers || []).flatMap((t) => {
      // Hand the parent site through so tower-log rows can render the
      // breadcrumb even though the helper itself doesn't know about sites.
      const log = towerAuditEvents(t);
      return log.map((e) => ({ ...e, site: parentSiteOf(t, sites) }));
    });
    return [...fromAlarms, ...fromTowerLogs].sort((a, b) => b.ts - a.ts);
  }, [allAlarms, towers, sites, assetMap]);

  /* ---- Apply filters ---- */
  const filtered = useMemo(() => {
    const range = TIME_RANGES.find((r) => r.id === timeRange) || TIME_RANGES[2];
    const since = range.window();
    const sevSet = expandSeverity(severityFilter);
    const statusSet = expandStatus(statusFilter);
    const q = query.trim().toLowerCase();

    return allEvents.filter((e) => {
      if (since > 0 && e.ts < since) return false;
      if (sevSet.size > 0 && (!e.severity || !sevSet.has(e.severity))) return false;
      if (statusSet.size > 0) {
        // Tower-log rows have no status; exclude when status filter is active.
        if (!e.status) return false;
        if (!statusSet.has(e.status)) return false;
      }
      if (towerFilter.size > 0) {
        if (!e.tower || !towerFilter.has(e.tower.id)) return false;
      }
      if (q) {
        const hay = [
          e.title, e.detail, e.actor,
          e.site && getAssetDisplayName(e.site),
          e.tower && getAssetDisplayName(e.tower),
          e.asset && getAssetDisplayName(e.asset),
        ].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    // Reset page when filters meaningfully change is handled below in effect.
  }, [allEvents, timeRange, severityFilter, statusFilter, towerFilter, query]);

  /* ---- Pagination ---- */
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const pageRows = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  /* ---- Filter chip counts ---- */
  const severityCounts = useMemo(() => {
    const out = { HIGH: 0, MEDIUM: 0, LOW: 0 };
    for (const e of allEvents) {
      if (!e.severity) continue;
      if (e.severity === 'CRITICAL' || e.severity === 'HIGH') out.HIGH += 1;
      else if (e.severity === 'MEDIUM') out.MEDIUM += 1;
      else if (e.severity === 'LOW') out.LOW += 1;
    }
    return out;
  }, [allEvents]);

  const statusCounts = useMemo(() => {
    const out = { OPEN: 0, ACKNOWLEDGED: 0, RESOLVED: 0 };
    for (const e of allEvents) {
      if (!e.status) continue;
      if (e.status === 'OPEN') out.OPEN += 1;
      else if (e.status === 'ACKNOWLEDGED' || e.status === 'IN_PROGRESS') out.ACKNOWLEDGED += 1;
      else if (e.status === 'RESOLVED' || e.status === 'CLOSED') out.RESOLVED += 1;
    }
    return out;
  }, [allEvents]);

  /* ---- Helpers ---- */
  const toggleInSet = (setter) => (id) => setter((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    setPage(1);
    return next;
  });
  const toggleSeverity = toggleInSet(setSeverityFilter);
  const toggleStatus = toggleInSet(setStatusFilter);
  const toggleTower = toggleInSet(setTowerFilter);

  const clearFilters = () => {
    setQuery('');
    setSeverityFilter(new Set());
    setStatusFilter(new Set());
    setTowerFilter(new Set());
    setTimeRange('7d');
    setPage(1);
  };

  const activeFilterCount =
    (query ? 1 : 0) + severityFilter.size + statusFilter.size + towerFilter.size + (timeRange !== '7d' ? 1 : 0);

  const exportCsv = () => {
    // Column definitions matching the toCsv/downloadCsv contract:
    //   { key, label?, get?(row) → cellValue }
    // We materialise the labels here so the exported file uses friendly
    // titles regardless of how the event shape evolves.
    const columns = [
      { key: 'timestamp', label: 'Timestamp', get: (e) => new Date(e.ts).toISOString() },
      { key: 'localTime', label: 'Local time', get: (e) => format(new Date(e.ts), 'yyyy-MM-dd HH:mm:ss') },
      { key: 'title',     label: 'Event',     get: (e) => e.title },
      { key: 'detail',    label: 'Detail',    get: (e) => e.detail || '' },
      { key: 'severity',  label: 'Severity',  get: (e) => e.severity || '' },
      { key: 'status',    label: 'Status',    get: (e) => e.status || '' },
      { key: 'site',      label: 'Site',      get: (e) => (e.site ? getAssetDisplayName(e.site) : '') },
      { key: 'tower',     label: 'Tower',     get: (e) => (e.tower ? getAssetDisplayName(e.tower) : '') },
      { key: 'device',    label: 'Device',    get: (e) => (e.asset ? getAssetDisplayName(e.asset) : '') },
      { key: 'actor',     label: 'Actor',     get: (e) => e.actor || '' },
      { key: 'tag',       label: 'Tag',       get: (e) => e.tag || '' },
      { key: 'source',    label: 'Source',    get: (e) => e.source || '' },
    ];
    const filename = `audit-${format(new Date(), 'yyyyMMdd-HHmm')}.csv`;
    downloadCsv(filename, filtered, columns);
  };

  if (assetsLoading || alarmsLoading) {
    return <div className="flex items-center justify-center min-h-[60vh]"><LoadingSpinner size="lg" /></div>;
  }

  return (
    <div className="p-4 md:p-6 max-w-[1500px] mx-auto space-y-4">
      {/* ===== Header ===== */}
      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-ink-0)] flex items-center gap-2">
            <ScrollText className="w-5 h-5 text-[var(--color-accent-400)]" strokeWidth={2} />
            Audit log
          </h1>
          <p className="text-xs text-[var(--color-ink-2)] mt-0.5">
            Persistent activity across {towers.length || 'all'} tower{towers.length === 1 ? '' : 's'}
            {selectedSiteId
              ? ` in ${getAssetDisplayName(sites.find((s) => s.id === selectedSiteId)) || 'this site'}`
              : ' (all sites)'}
            {' · '}
            sourced from alarm history and tower auditLog attributes
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={exportCsv}
            disabled={filtered.length === 0}
            className="audit-btn"
            title="Download all filtered rows as CSV"
          >
            <Download className="w-3.5 h-3.5" strokeWidth={2} />
            Export CSV
          </button>
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
        </div>
      </header>

      {/* ===== Filters ===== */}
      <section className="panel p-4 md:p-5 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="audit-search">
            <Search className="w-3.5 h-3.5 text-[var(--color-ink-3)] flex-shrink-0" />
            <input
              type="text"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setPage(1); }}
              placeholder="Search title, site, tower or device…"
              className="bg-transparent border-0 outline-0 flex-1 text-sm text-[var(--color-ink-0)] placeholder:text-[var(--color-ink-3)]"
            />
            {query && (
              <button onClick={() => setQuery('')} className="text-[var(--color-ink-3)] hover:text-[var(--color-ink-0)]">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <select
            value={timeRange}
            onChange={(e) => { setTimeRange(e.target.value); setPage(1); }}
            className="so-tower-select"
          >
            {TIME_RANGES.map((r) => (
              <option key={r.id} value={r.id}>{r.label}</option>
            ))}
          </select>

          <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-[var(--color-ink-2)] font-semibold">
            <Filter className="w-3 h-3" />
            {filtered.length.toLocaleString()} of {allEvents.length.toLocaleString()} events
          </span>
        </div>

        {/* Filter rows: severity / status / tower */}
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

          <FilterLabel>Status</FilterLabel>
          <div className="flex items-center gap-1.5 flex-wrap">
            {STATUS_GROUPS.map((g) => (
              <ToggleChip
                key={g.id}
                active={statusFilter.has(g.id)}
                onClick={() => toggleStatus(g.id)}
                color={g.color}
                count={statusCounts[g.id]}
                icon={g.id === 'OPEN' ? AlertOctagon : g.id === 'ACKNOWLEDGED' ? Check : CheckCheck}
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
                icon={RadioTower}
              >
                {getAssetDisplayName(t)}
              </ToggleChip>
            ))}
          </div>
        </div>
      </section>

      {/* ===== Table ===== */}
      <section className="panel p-0 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-[var(--color-ink-2)]">
            No audit events match these filters.
          </div>
        ) : (
          <table className="audit-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Event</th>
                <th>Location</th>
                <th>Severity</th>
                <th>Status</th>
                <th>Tag</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((e, i) => (
                <EventRow
                  key={`${e.ts}-${e.source}-${i}`}
                  event={e}
                  onSiteClick={(s) => setSite(s.id)}
                  onTowerClick={(t) => setTower(t.id)}
                  onCameraClick={(c) => setCameraInView(c)}
                  onClipClick={(p) => setClipInView(p)}
                />
              ))}
            </tbody>
          </table>
        )}

        {filtered.length > 0 && (
          <Pagination
            page={safePage}
            pageCount={pageCount}
            pageSize={PAGE_SIZE}
            total={filtered.length}
            onPage={setPage}
          />
        )}
      </section>

      {cameraInView && (
        <CameraHistoryModal
          camera={cameraInView}
          tower={findGatewayForAsset(cameraInView, towers)}
          onClose={() => setCameraInView(null)}
        />
      )}
      {clipInView && (
        <AlarmClipModal
          alarm={clipInView.alarm}
          asset={clipInView.asset}
          tower={clipInView.tower}
          site={clipInView.site}
          onClose={() => setClipInView(null)}
        />
      )}
    </div>
  );
}

/* ==========================================================================
   Row
   ========================================================================== */

function EventRow({ event: e, onSiteClick, onTowerClick, onCameraClick, onClipClick }) {
  const sevMeta = severityMeta(e.severity);
  const statusMeta = statusBadge(e.status);
  const at = new Date(e.ts);
  const isCamera = e.asset && normalizeAssetType(getCustomAssetType(e.asset)) === 'CameraAsset';

  return (
    <tr>
      <td className="audit-when">
        <div className="font-semibold text-[var(--color-ink-0)] tabular-nums">{format(at, 'HH:mm:ss')}</div>
        <div className="text-[10px] text-[var(--color-ink-3)] tabular-nums">{format(at, 'dd MMM yyyy')}</div>
        <div className="text-[10px] text-[var(--color-ink-3)] tabular-nums">{formatDistanceToNowStrict(at)} ago</div>
      </td>
      <td>
        <div className="flex items-start gap-2">
          <e.icon className="w-3.5 h-3.5 mt-0.5 text-[var(--color-ink-2)] flex-shrink-0" strokeWidth={2} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-[var(--color-ink-0)] truncate">{e.title}</span>
              {e.clipUrl && (
                <button
                  type="button"
                  onClick={() => onClipClick?.({
                    alarm: e.alarm,
                    asset: e.asset,
                    tower: e.tower,
                    site: e.site,
                  })}
                  className="so-clip-btn-icon"
                  title="View the clip attached to this alarm"
                >
                  <VideoIcon className="w-3.5 h-3.5" strokeWidth={2} />
                </button>
              )}
            </div>
          </div>
        </div>
      </td>
      <td>
        <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-[11px]">
          {e.site && (
            <button type="button" onClick={() => onSiteClick?.(e.site)} className="so-crumb" title={`Scope to ${getAssetDisplayName(e.site)}`}>
              <Building2 className="w-3 h-3" />
              {getAssetDisplayName(e.site)}
            </button>
          )}
          {e.tower && (
            <>
              {e.site && <span className="so-crumb-sep">›</span>}
              <button type="button" onClick={() => onTowerClick?.(e.tower)} className="so-crumb" title={`Select ${getAssetDisplayName(e.tower)}`}>
                <RadioTower className="w-3 h-3" />
                {getAssetDisplayName(e.tower)}
              </button>
            </>
          )}
          {e.asset && (
            <>
              {(e.site || e.tower) && <span className="so-crumb-sep">›</span>}
              {isCamera ? (
                <button type="button" onClick={() => onCameraClick?.(e.asset)} className="so-crumb" title={`Open ${getAssetDisplayName(e.asset)} full view`}>
                  {getAssetDisplayName(e.asset)}
                </button>
              ) : (
                <span className="so-crumb" title={getAssetTypeLabel(getCustomAssetType(e.asset))}>
                  {getAssetDisplayName(e.asset)}
                </span>
              )}
            </>
          )}
          {!e.site && !e.tower && !e.asset && (
            <span className="text-[var(--color-ink-3)]">—</span>
          )}
        </div>
      </td>
      <td>
        {sevMeta ? (
          <span className="audit-pill" style={sevPillStyle(sevMeta.color)}>{sevMeta.label}</span>
        ) : <span className="text-[var(--color-ink-3)] text-[11px]">—</span>}
      </td>
      <td>
        {statusMeta ? (
          <span className="audit-pill" style={sevPillStyle(statusMeta.color)}>{statusMeta.label}</span>
        ) : <span className="text-[var(--color-ink-3)] text-[11px]">—</span>}
      </td>
      <td>
        <span className={`so-audit-tag is-${e.tagTone}`}>{e.tag}</span>
      </td>
    </tr>
  );
}

/* ==========================================================================
   Filter chip + helpers
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

function Pagination({ page, pageCount, pageSize, total, onPage }) {
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  return (
    <div className="audit-pagination">
      <span className="text-[11px] text-[var(--color-ink-2)] tabular-nums">
        Showing <strong className="text-[var(--color-ink-0)]">{start.toLocaleString()}</strong>–
        <strong className="text-[var(--color-ink-0)]">{end.toLocaleString()}</strong>
        {' '}of <strong className="text-[var(--color-ink-0)]">{total.toLocaleString()}</strong>
      </span>
      <div className="flex items-center gap-1 ml-auto">
        <PagerBtn onClick={() => onPage(1)} disabled={page === 1} aria="First page">
          <ChevronsLeft className="w-3.5 h-3.5" />
        </PagerBtn>
        <PagerBtn onClick={() => onPage(Math.max(1, page - 1))} disabled={page === 1} aria="Previous page">
          <ChevronLeft className="w-3.5 h-3.5" />
        </PagerBtn>
        <span className="px-2 text-[11px] tabular-nums text-[var(--color-ink-1)] font-semibold">
          {page} / {pageCount}
        </span>
        <PagerBtn onClick={() => onPage(Math.min(pageCount, page + 1))} disabled={page === pageCount} aria="Next page">
          <ChevronRight className="w-3.5 h-3.5" />
        </PagerBtn>
        <PagerBtn onClick={() => onPage(pageCount)} disabled={page === pageCount} aria="Last page">
          <ChevronsRight className="w-3.5 h-3.5" />
        </PagerBtn>
      </div>
    </div>
  );
}

function PagerBtn({ onClick, disabled, aria, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={aria}
      className="audit-pager-btn"
    >
      {children}
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
function expandStatus(set) {
  const out = new Set();
  for (const g of STATUS_GROUPS) {
    if (set.has(g.id)) for (const m of g.matches) out.add(m);
  }
  return out;
}

function severityMeta(sev) {
  if (!sev) return null;
  if (sev === 'CRITICAL') return { label: 'Critical', color: 'var(--color-danger-400)' };
  if (sev === 'HIGH')     return { label: 'High',     color: 'var(--color-danger-400)' };
  if (sev === 'MEDIUM')   return { label: 'Medium',   color: 'var(--color-warning-400)' };
  if (sev === 'LOW')      return { label: 'Low',      color: 'var(--color-ink-2)' };
  return null;
}
function statusBadge(status) {
  if (!status) return null;
  if (status === 'OPEN')                          return { label: 'Open',         color: 'var(--color-danger-400)' };
  if (status === 'ACKNOWLEDGED' || status === 'IN_PROGRESS') return { label: 'Acknowledged', color: 'var(--color-warning-400)' };
  if (status === 'RESOLVED')                      return { label: 'Resolved',     color: 'var(--color-ok-500)' };
  if (status === 'CLOSED')                        return { label: 'Closed',       color: 'var(--color-ok-500)' };
  return { label: status, color: 'var(--color-ink-2)' };
}
function sevPillStyle(color) {
  return {
    background: `color-mix(in srgb, ${color} 14%, transparent)`,
    color,
    border: `1px solid color-mix(in srgb, ${color} 40%, transparent)`,
  };
}
function sinceStartOfDay() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
function parentSiteOf(tower, sites) {
  if (!tower || !sites?.length) return null;
  const ids = new Set(sites.map((s) => s.id));
  if (tower.parentId && ids.has(tower.parentId)) {
    return sites.find((s) => s.id === tower.parentId) || null;
  }
  if (Array.isArray(tower.path)) {
    for (const id of tower.path) if (ids.has(id)) return sites.find((s) => s.id === id) || null;
  }
  return null;
}
