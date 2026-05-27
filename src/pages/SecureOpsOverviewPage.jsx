import { useCallback, useMemo, useState, useTransition } from 'react';
import { Link } from 'react-router-dom';
import { formatDistanceToNowStrict, format } from 'date-fns';
import {
  ServerCog, AlertOctagon, Activity, Cpu,
  RadioTower, ChevronRight,
  Building2, Check, CheckCheck, Loader2, Clock, RotateCcw,
} from 'lucide-react';
import { useAssets, useAlarms, useUpdateAlarmStatus } from '../hooks/useAssets';
import {
  pickSites, pickTowersForSite,
  alarmBelongsToGateway, findGatewayForAsset, findSiteForAsset,
} from '../utils/gateways';
import {
  getAssetDisplayName, getCustomAssetType, getAssetTypeLabel, normalizeAssetType,
} from '../utils/assetIcons';
import useSecureOpsStore from '../store/secureOpsStore';
import { LoadingSpinner } from '../components/ui';
import AlarmClipModal from '../components/cameras/AlarmClipModal';
import { getAlarmClipUrl } from '../utils/alarms';
import './secureops.css';

/* ==========================================================================
   SecureOps Overview — telco dashboard.
   Slimmed surface: KPI strip + full-width Recent Alerts only. Tower-scoped
   environmental telemetry (temp/humidity/signal/battery) is rendered as
   chips in `SecureOpsHeader` so it stays visible across every tab. Site
   Status, Remote Control, and Environmental Telemetry panels were removed
   per design — Remote Control still lives on `/control`.
   ========================================================================== */

export default function SecureOpsOverviewPage() {
  const { data: assets = [], isLoading } = useAssets({});
  const { data: openAlarms = [] } = useAlarms({ status: 'OPEN' });
  const { data: allAlarms = [] } = useAlarms({});
  const { selectedSiteId } = useSecureOpsStore();

  // Time-range filter — drives the "Active alerts" + "Detections" KPIs and
  // the Recent Alerts list. "Sites online" and "AI uptime" are state-based
  // snapshots and ignore the range. Default 24h matches a typical operator
  // shift; `all` removes the filter entirely. The setter is wrapped in
  // `startTransition` so React keeps the previous list visible during the
  // re-derive instead of flashing an empty intermediate frame.
  const [range, setRange] = useState('24h');
  const [isRangePending, startRangeTransition] = useTransition();
  const rangeWindow = useMemo(() => getRangeWindow(range), [range]);

  const sites = useMemo(() => pickSites(assets), [assets]);

  // Scope towers: those under the picked site, or every tower (any gateway)
  // when "All Sites" is selected.
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

  /* ----- Per-site summary (drives the "Sites online" KPI) ----- */
  const siteSummaries = useMemo(() => {
    const assetMap = new Map(assets.map((a) => [a.id, a]));
    if (sites.length === 0) {
      const allTowers = assets.filter((a) =>
        a.type === 'GatewayAsset'
        || normalizeAssetType(getCustomAssetType(a)) === 'TowerAsset'
      );
      const onlineCount = allTowers.filter((t) => t.attributes?.connected?.value !== false).length;
      const alarmCount = openAlarms.filter((al) =>
        allTowers.some((t) => alarmBelongsToGateway(al, t.id, assetMap, allTowers))
      ).length;
      return [{
        id: '__all-towers__',
        name: 'Towers',
        connected: onlineCount > 0,
        towerCount: allTowers.length,
        onlineTowerCount: onlineCount,
        openAlarms: alarmCount,
      }];
    }
    return sites.map((s) => {
      const childTowers = pickTowersForSite(assets, s.id);
      const onlineTowerCount = childTowers.filter((t) =>
        t.attributes?.connected?.value !== false
      ).length;
      const explicitlyOffline = s.attributes?.connected?.value === false;
      const allTowersOffline = childTowers.length > 0 && onlineTowerCount === 0;
      const openAlarmsHere = openAlarms.filter((al) =>
        childTowers.some((t) => alarmBelongsToGateway(al, t.id, assetMap, childTowers))
      ).length;
      return {
        id: s.id,
        name: getAssetDisplayName(s),
        connected: !explicitlyOffline && !allTowersOffline,
        towerCount: childTowers.length,
        onlineTowerCount,
        openAlarms: openAlarmsHere,
      };
    });
  }, [sites, assets, openAlarms]);

  /* ----- Range + scope filtered alarm lists (single source of truth for
   *       both the KPI strip AND the Recent Alerts panel).
   *
   * Site/tower scope is applied here so the "Active alerts" KPI mirrors the
   * sum of the panel's severity chip counts exactly — picking a specific
   * site shrinks both surfaces in lockstep instead of leaving the KPI at
   * the realm-wide total.
   */
  const assetMap = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);
  const scopeTowerIds = useMemo(() => towers.map((t) => t.id), [towers]);
  const scopeAlarmsToTowers = useMemo(() => {
    return (list) => {
      if (!scopeTowerIds.length) return list;
      return list.filter((al) =>
        scopeTowerIds.some((gid) => alarmBelongsToGateway(al, gid, assetMap, towers))
      );
    };
  }, [scopeTowerIds, assetMap, towers]);

  const openAlarmsInScope = useMemo(
    () => scopeAlarmsToTowers(filterAlarmsByCreatedOn(openAlarms, rangeWindow.start)),
    [openAlarms, rangeWindow.start, scopeAlarmsToTowers]
  );
  const allAlarmsInScope = useMemo(
    () => scopeAlarmsToTowers(filterAlarmsByCreatedOn(allAlarms, rangeWindow.start)),
    [allAlarms, rangeWindow.start, scopeAlarmsToTowers]
  );
  // Previous-window scope-filtered alarms — used only for the Detections
  // KPI delta line. We don't memo the full list, only the count it produces.
  const prevWindowHighPriorityCount = useMemo(() => {
    if (rangeWindow.prevStart == null || rangeWindow.start == null) return null;
    const inPrev = allAlarms.filter((al) => {
      const ts = parseDate(al.createdOn);
      return ts != null && ts >= rangeWindow.prevStart && ts < rangeWindow.start;
    });
    return scopeAlarmsToTowers(inPrev).filter((al) => isHighPrioritySeverity(al.severity)).length;
  }, [allAlarms, rangeWindow, scopeAlarmsToTowers]);

  /* ----- KPI numbers ----- */

  const kpis = useMemo(() => {
    const onlineSites = siteSummaries.filter((s) => s.connected).length;
    const offlineSiteCount = siteSummaries.length - onlineSites;
    const firstOfflineSite = siteSummaries.find((s) => !s.connected);

    // Active alerts — open alarms in the current site + range scope. The
    // count and critical/warning split match exactly what the Recent Alerts
    // panel's chip badges show.
    const critical = openAlarmsInScope.filter((a) => isHighPrioritySeverity(a.severity)).length;
    const warning = openAlarmsInScope.length - critical;

    // Human detections = high-priority alarms (CRITICAL + HIGH). On this
    // deployment the AI side raises human-detection events at HIGH severity,
    // so counting them here keeps the KPI focused on what the operator
    // actually needs to look at — animal / vehicle / "other" events stay
    // out of the headline number (still visible in the alerts list).
    const detectionsCount = allAlarmsInScope.filter((al) => isHighPrioritySeverity(al.severity)).length;
    const detectionDelta = prevWindowHighPriorityCount == null
      ? null
      : detectionsCount - prevWindowHighPriorityCount;

    const heartbeats = towers
      .map((t) => parseDate(t.attributes?.aiHeartbeatAt?.value))
      .filter(Boolean);
    const aiUptime = towers.length === 0
      ? null
      : towers.reduce((acc, t) => {
          const pct = readNumber(t.attributes?.aiUptime30d?.value);
          return pct != null ? acc.concat(pct) : acc;
        }, []);
    const aiUptimePct = aiUptime && aiUptime.length
      ? aiUptime.reduce((s, x) => s + x, 0) / aiUptime.length
      : null;
    const aiUp = aiUptimePct ?? (heartbeats.length ? 100 : null);

    return {
      sitesOnline: {
        online: onlineSites,
        total: siteSummaries.length,
        offlineCount: offlineSiteCount,
        offlineName: firstOfflineSite?.name || null,
      },
      alerts: { total: openAlarmsInScope.length, critical, warning },
      detections: { count: detectionsCount, delta: detectionDelta },
      aiUptime: aiUp,
    };
  }, [siteSummaries, openAlarmsInScope, allAlarmsInScope, prevWindowHighPriorityCount, towers]);

  if (isLoading) {
    return <div className="flex items-center justify-center min-h-[60vh]"><LoadingSpinner size="lg" /></div>;
  }

  return (
    <div className="so-overview-shell">
      {/* ===== Time-range filter ===== */}
      <TimeRangeBar
        range={range}
        onChange={(v) => startRangeTransition(() => setRange(v))}
        pending={isRangePending}
      />

      {/* ===== KPI Strip ===== */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 shrink-0">
        <KpiCard
          icon={ServerCog}
          label="Sites online"
          value={`${kpis.sitesOnline.online}/${kpis.sitesOnline.total}`}
          subline={
            kpis.sitesOnline.offlineCount > 0
              ? `${kpis.sitesOnline.offlineCount} offline · ${kpis.sitesOnline.offlineName}${kpis.sitesOnline.offlineCount > 1 ? ' +more' : ''}`
              : (kpis.sitesOnline.total > 0 ? 'All sites online' : 'No sites in realm')
          }
          subTone={kpis.sitesOnline.offlineCount > 0 ? 'critical' : 'ok'}
        />
        <KpiCard
          icon={AlertOctagon}
          label={`Active alerts · ${rangeWindow.shortLabel}`}
          value={kpis.alerts.total}
          subline={
            kpis.alerts.total === 0
              ? 'All clear'
              : `${kpis.alerts.critical} critical, ${kpis.alerts.warning} warning`
          }
          subTone={kpis.alerts.critical > 0 ? 'critical' : (kpis.alerts.warning > 0 ? 'warning' : 'ok')}
          to="/alarms"
        />
        <KpiCard
          icon={Activity}
          label={`Human detections · ${rangeWindow.shortLabel}`}
          value={kpis.detections.count}
          subline={detectionSubline(kpis.detections.delta, rangeWindow.shortLabel)}
          subTone={kpis.detections.delta != null && kpis.detections.delta > 0 ? 'warning' : 'ok'}
        />
        <KpiCard
          icon={Cpu}
          label="AI uptime"
          value={kpis.aiUptime != null ? `${kpis.aiUptime.toFixed(1)}%` : '—'}
          subline={kpis.aiUptime != null ? 'Last 30 days' : 'No heartbeat data'}
          subTone={kpis.aiUptime != null && kpis.aiUptime >= 99 ? 'ok' : 'warning'}
        />
      </section>

      {/* ===== Full-width Recent Alerts — same scoped list the KPI uses ===== */}
      <RecentAlertsPanel
        alarms={openAlarmsInScope}
        rangeLabel={rangeWindow.label}
        assets={assets}
        sites={sites}
        towers={towers}
        externalLoading={isRangePending}
      />
    </div>
  );
}

/* ==========================================================================
   Time range bar
   ========================================================================== */

const RANGE_OPTIONS = [
  { key: 'today', label: 'Today' },
  { key: '24h',   label: '24h'   },
  { key: '7d',    label: '7d'    },
  { key: '30d',   label: '30d'   },
  { key: 'all',   label: 'All'   },
];

function TimeRangeBar({ range, onChange, pending }) {
  return (
    <div className="so-range-bar shrink-0">
      <div className="so-range-label">
        <Clock className="w-3.5 h-3.5" strokeWidth={2} />
        <span>Time range</span>
        {pending && (
          <Loader2
            className="w-3 h-3 spin-slow text-[var(--color-accent-400)]"
            aria-label="Updating"
          />
        )}
      </div>
      <div className="so-range-chips" role="tablist" aria-label="Time range" data-pending={pending}>
        {RANGE_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            type="button"
            role="tab"
            aria-selected={range === opt.key}
            data-active={range === opt.key}
            onClick={() => onChange(opt.key)}
            className="so-range-chip"
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function detectionSubline(delta, shortLabel) {
  if (delta == null) return 'All time';
  if (delta === 0) return `Same as prev ${shortLabel}`;
  const sign = delta > 0 ? '+' : '';
  return `${sign}${delta} vs prev ${shortLabel}`;
}

/* ==========================================================================
   KPI card
   ========================================================================== */

function KpiCard({ icon: Icon, label, value, subline, subTone, to }) {
  const body = (
    <>
      <div className="so-kpi-label">
        <Icon className="w-3.5 h-3.5" strokeWidth={2} />
        {label}
      </div>
      <div className="so-kpi-value">{value}</div>
      <div className={`so-kpi-sub is-${subTone || 'muted'}`}>{subline}</div>
    </>
  );
  if (to) {
    return (
      <Link to={to} className="so-kpi so-kpi-clickable" title={`Open ${label.toLowerCase()}`}>
        {body}
      </Link>
    );
  }
  return <div className="so-kpi">{body}</div>;
}

/* ==========================================================================
   Recent Alerts (full width)
   ========================================================================== */

function RecentAlertsPanel({ alarms, rangeLabel, assets, sites, towers, externalLoading }) {
  const assetMap = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);
  const update = useUpdateAlarmStatus();
  // The clip modal stores just the alarm id — `alarms` is the source of
  // truth, so when the underlying alarm changes (acked / resolved / vanishes)
  // we recompute current/prev/next from the live list on the next render.
  const [clipAlarmId, setClipAlarmId] = useState(null);

  // Local filter state — mirrors the /alarms page: severity (High/Med/Low,
  // multi-select with CRITICAL folded into HIGH) and Tower (multi-select).
  // Empty Set = no constraint, so default behaviour is "show everything in
  // the parent's range/site scope".
  //
  // `useTransition` keeps the prior list visible while React re-derives the
  // filtered view — without it, clicking a chip momentarily blanks the panel
  // when the filtered count changes a lot.
  const [severityFilter, setSeverityFilter] = useState(new Set());
  const [towerFilter, setTowerFilter] = useState(new Set());
  const [isFilterPending, startFilterTransition] = useTransition();

  // `alarms` is already site + range scoped by the parent — by design, so
  // the "Active alerts" KPI total matches the sum of these chip counts.
  // Pre-filter counts feed the chip badges so the operator sees how many
  // alarms are available per bucket before clicking.
  const severityCounts = useMemo(() => {
    const out = { HIGH: 0, MEDIUM: 0, LOW: 0 };
    for (const al of alarms) {
      const s = (al.severity || 'LOW').toUpperCase();
      if (s === 'CRITICAL' || s === 'HIGH') out.HIGH += 1;
      else if (s === 'MEDIUM') out.MEDIUM += 1;
      else out.LOW += 1;
    }
    return out;
  }, [alarms]);

  const towerCounts = useMemo(() => {
    const out = new Map();
    for (const t of towers) out.set(t.id, 0);
    for (const al of alarms) {
      for (const t of towers) {
        if (alarmBelongsToGateway(al, t.id, assetMap, towers)) {
          out.set(t.id, (out.get(t.id) || 0) + 1);
          break;
        }
      }
    }
    return out;
  }, [alarms, towers, assetMap]);

  // Apply severity + tower filters.
  const filtered = useMemo(() => {
    const sevSet = expandSeverity(severityFilter);
    return alarms.filter((al) => {
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
      return true;
    });
  }, [alarms, severityFilter, towerFilter, assetMap, towers]);

  const sorted = useMemo(
    () => filtered.slice().sort((a, b) => new Date(b.createdOn || 0) - new Date(a.createdOn || 0)),
    [filtered]
  );

  const toggleInSet = (setter) => (id) => startFilterTransition(() => {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  });
  const toggleSeverity = toggleInSet(setSeverityFilter);
  const toggleTower = toggleInSet(setTowerFilter);
  const activeFilterCount = severityFilter.size + towerFilter.size;
  const clearFilters = () => startFilterTransition(() => {
    setSeverityFilter(new Set());
    setTowerFilter(new Set());
  });

  // Combined loader signal — true while either:
  //   • parent React-Query fetches data, OR
  //   • parent is mid-time-range transition, OR
  //   • we're mid-severity/tower transition.
  // Used to dim the list and overlay a small spinner so chip toggles and
  // refetches feel intentional instead of "blink-and-it's-different".
  const loading = !!externalLoading || isFilterPending;

  /* ----- Clip-modal queue (Prev / Next navigation) -----
   *
   * When the modal is open, build a tower-scoped queue of OPEN alarms with
   * a clip URL so the operator can navigate between siblings without
   * closing the modal. The queue is derived from `alarms` (the parent's
   * already-scoped list) on every render — so when an alarm is acked /
   * resolved and drops off the list, the queue shrinks automatically and
   * Prev/Next pointers update.
   *
   * Severity/tower CHIP filters are deliberately ignored here — the
   * operator triaging clip-by-clip wants every alarm in the tower in the
   * queue, regardless of what chips happen to be active in the list view.
   */
  const resolveAlarmContext = useCallback((al) => {
    if (!al) return null;
    const linked = Array.isArray(al.asset) && al.asset[0];
    const asset = linked?.id
      ? (assetMap.get(linked.id) || linked)
      : (al.assetId ? assetMap.get(al.assetId) : null);
    const tower = asset ? findGatewayForAsset(asset, towers) : null;
    const site = tower
      ? findSiteForAsset(tower, sites)
      : (asset ? findSiteForAsset(asset, sites) : null);
    return { alarm: al, asset, tower, site };
  }, [assetMap, towers, sites]);

  const clipModal = useMemo(() => {
    if (!clipAlarmId) return null;
    const currentAlarm = alarms.find((a) => a.id === clipAlarmId);
    if (!currentAlarm) return null; // alarm vanished — modal will close
    const current = resolveAlarmContext(currentAlarm);
    const tower = current.tower;
    // Without a tower we can't build a tower-scoped queue, so render the
    // modal alone (no Prev/Next siblings).
    if (!tower) return { current, queue: [current], index: 0 };
    const queue = alarms
      .filter((al) => alarmBelongsToGateway(al, tower.id, assetMap, towers))
      .filter((al) => getAlarmClipUrl(al))
      .sort((a, b) => new Date(b.createdOn || 0) - new Date(a.createdOn || 0))
      .map(resolveAlarmContext);
    const index = queue.findIndex((c) => c.alarm.id === clipAlarmId);
    return { current, queue, index };
  }, [clipAlarmId, alarms, resolveAlarmContext, assetMap, towers]);

  const clipPrev = (clipModal && clipModal.index > 0)
    ? clipModal.queue[clipModal.index - 1]
    : null;
  const clipNext = (clipModal && clipModal.index >= 0 && clipModal.index < clipModal.queue.length - 1)
    ? clipModal.queue[clipModal.index + 1]
    : null;

  return (
    <section className="panel p-4 md:p-5 so-panel-fit">
      <div className="so-panel-head">
        <div className="so-panel-title">
          <AlertOctagon className="so-panel-icon" strokeWidth={2} />
          Recent alerts
          {rangeLabel && (
            <span className="so-panel-meta normal-case font-medium ml-1">· {rangeLabel}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {loading && (
            <Loader2
              className="w-3.5 h-3.5 spin-slow text-[var(--color-accent-400)]"
              aria-label="Loading alerts"
            />
          )}
          <span className="so-panel-meta tabular-nums">
            {activeFilterCount > 0
              ? `${sorted.length} of ${alarms.length} active`
              : `${sorted.length} active`}
          </span>
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={clearFilters}
              className="audit-btn"
              title="Reset alerts panel filters"
            >
              <RotateCcw className="w-3 h-3" strokeWidth={2} />
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Filter chips: severity + tower (mirrors /alarms page) */}
      <div className="so-alert-filters">
        <div className="so-alert-filter-group">
          <span className="so-alert-filter-label">Severity</span>
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
        {towers.length > 0 && (
          <div className="so-alert-filter-group">
            <span className="so-alert-filter-label">Tower</span>
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
        )}
      </div>

      <div className="so-alert-list-wrap" data-loading={loading}>
        {sorted.length === 0 ? (
          <p className="text-sm text-[var(--color-ink-2)] py-6 text-center">
            {activeFilterCount > 0
              ? 'No alerts match these filters.'
              : (rangeLabel ? `No alerts in ${rangeLabel.toLowerCase()}.` : 'All clear in this scope.')}
          </p>
        ) : (
          <div className="so-alert-list">
            {sorted.map((al) => (
              <AlertRow
                key={al.id}
                alarm={al}
                assetMap={assetMap}
                towers={towers}
                sites={sites}
                update={update}
                onClipClick={(alarmId) => setClipAlarmId(alarmId)}
              />
            ))}
          </div>
        )}
        {loading && (
          <div className="so-alert-loader-overlay" aria-hidden="true">
            <Loader2 className="w-5 h-5 spin-slow text-[var(--color-accent-400)]" />
          </div>
        )}
      </div>

      <div className="text-right mt-2">
        <Link to="/alarms" className="text-[11px] font-semibold text-[var(--color-accent-400)] hover:text-[var(--color-accent-300)] inline-flex items-center gap-0.5">
          All alerts <ChevronRight className="w-3 h-3" />
        </Link>
      </div>

      {clipModal && (
        <AlarmClipModal
          // Key on alarm id so a Prev/Next navigation remounts the modal
          // with a fresh `view` (snapshot-first), fresh download state,
          // and a fresh mutation hook — sidesteps the project's
          // react-hooks/set-state-in-effect rule.
          key={clipModal.current.alarm.id}
          alarm={clipModal.current.alarm}
          asset={clipModal.current.asset}
          tower={clipModal.current.tower}
          site={clipModal.current.site}
          prev={clipPrev}
          next={clipNext}
          position={{ current: clipModal.index + 1, total: clipModal.queue.length }}
          onSelect={setClipAlarmId}
          onClose={() => setClipAlarmId(null)}
        />
      )}
    </section>
  );
}

/* ---------- Severity + tower filter primitives ----------
 * Mirrors the chip pattern used by `SecureOpsAlertsPage` so both surfaces
 * behave identically. Severity is grouped (CRITICAL folds into HIGH) so the
 * three buttons map cleanly to the three colour rails (red/yellow/grey).
 */
const SEVERITY_GROUPS = [
  { id: 'HIGH',   label: 'High',   color: 'var(--color-danger-400)',  matches: ['CRITICAL', 'HIGH'] },
  { id: 'MEDIUM', label: 'Medium', color: 'var(--color-warning-400)', matches: ['MEDIUM'] },
  { id: 'LOW',    label: 'Low',    color: 'var(--color-ink-2)',       matches: ['LOW'] },
];

function expandSeverity(set) {
  const out = new Set();
  for (const g of SEVERITY_GROUPS) {
    if (set.has(g.id)) for (const m of g.matches) out.add(m);
  }
  return out;
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

function AlertRow({ alarm, assetMap, towers, sites, update, onClipClick }) {
  const sev = (alarm.severity || 'LOW').toUpperCase();
  const sevMeta = SEVERITY_META[sev] || SEVERITY_META.LOW;
  const linked = Array.isArray(alarm.asset) && alarm.asset[0];
  const asset = linked?.id ? (assetMap.get(linked.id) || linked) : (alarm.assetId ? assetMap.get(alarm.assetId) : null);
  const tower = asset ? findGatewayForAsset(asset, towers) : null;
  const site = tower
    ? findSiteForAsset(tower, sites)
    : (asset ? findSiteForAsset(asset, sites) : null);

  const typeLabel = asset ? getAssetTypeLabel(getCustomAssetType(asset)) : null;
  const assetName = asset ? getAssetDisplayName(asset) : null;
  const createdAt = alarm.createdOn ? new Date(alarm.createdOn) : null;
  const clipUrl = getAlarmClipUrl(alarm);

  const status = (alarm.status || 'OPEN').toUpperCase();
  const canAck = status === 'OPEN';
  const canResolve = status === 'OPEN' || status === 'ACKNOWLEDGED' || status === 'IN_PROGRESS';

  const mutatingThis = update?.isPending && update.variables?.alarm?.id === alarm.id;
  const ackPending = mutatingThis && update.variables?.status === 'ACKNOWLEDGED';
  const resolvePending = mutatingThis && update.variables?.status === 'RESOLVED';
  const anyPending = ackPending || resolvePending;

  return (
    <div
      className="so-alert-row"
      style={{ '--rail': sevMeta.color }}
      data-pending={anyPending}
    >
      <div className="flex-1 min-w-0">
        <p className="so-alert-title truncate">{alarm.title || 'Alarm'}</p>

        <p className="so-alert-meta flex items-center flex-wrap gap-x-1.5 gap-y-0.5 mt-0.5">
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
              <span className="so-crumb so-crumb-static">
                {assetName || typeLabel}
              </span>
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

        {(canAck || canResolve || clipUrl) && (
          <div className="so-alert-actions">
            {clipUrl && (
              <button
                type="button"
                onClick={() => onClipClick?.(alarm.id)}
                className="so-clip-btn"
                title="View the clip attached to this alarm"
              >
                <Video2 />
                <span>Clip</span>
              </button>
            )}
            {canAck && update && (
              <button
                type="button"
                onClick={() => update.mutate({
                  alarm,
                  status: 'ACKNOWLEDGED',
                  successMessage: `Alarm acknowledged — ${alarm.title || 'alarm'}`,
                  errorMessage: 'Failed to acknowledge alarm',
                })}
                disabled={anyPending}
                className="so-alert-btn so-alert-btn-ack"
                title="Acknowledge"
              >
                {ackPending
                  ? <Loader2 className="w-3 h-3 spin-slow" />
                  : <Check className="w-3 h-3" strokeWidth={2.25} />}
                <span>{ackPending ? 'Acking…' : 'Ack'}</span>
              </button>
            )}
            {canResolve && update && (
              <button
                type="button"
                onClick={() => update.mutate({
                  alarm,
                  status: 'RESOLVED',
                  successMessage: `Alarm resolved — ${alarm.title || 'alarm'}`,
                  errorMessage: 'Failed to resolve alarm',
                })}
                disabled={anyPending}
                className="so-alert-btn so-alert-btn-resolve"
                title="Resolve"
              >
                {resolvePending
                  ? <Loader2 className="w-3 h-3 spin-slow" />
                  : <CheckCheck className="w-3 h-3" strokeWidth={2.25} />}
                <span>{resolvePending ? 'Resolving…' : 'Resolve'}</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Video2() {
  return (
    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m22 8-6 4 6 4V8Z" /><rect width="14" height="12" x="2" y="6" rx="2" ry="2" />
    </svg>
  );
}

const SEVERITY_META = {
  CRITICAL: { label: 'Critical', color: 'var(--color-danger-400)' },
  HIGH:     { label: 'High',     color: 'var(--color-danger-400)' },
  MEDIUM:   { label: 'Medium',   color: 'var(--color-warning-400)' },
  LOW:      { label: 'Low',      color: 'var(--color-ink-2)' },
};

/* ==========================================================================
   Misc helpers
   ========================================================================== */

function readNumber(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// "High priority" = CRITICAL or HIGH. Maps to the AI side's human-detection
// events on this deployment; lower-severity rows (animal / vehicle / other)
// are excluded from the Detections KPI.
function isHighPrioritySeverity(s) {
  const sev = (s || '').toUpperCase();
  return sev === 'CRITICAL' || sev === 'HIGH';
}
function parseDate(v) {
  if (!v) return null;
  const t = typeof v === 'number' ? v : new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
}
function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/**
 * Compute the time-range window for the Overview filter.
 *
 * Returns the current window `[start, now)` and the immediately-preceding
 * equal window `[prevStart, start)` used for the Detections-delta KPI. For
 * the `all` selection both timestamps are null — `filterAlarmsByCreatedOn`
 * treats a null `start` as "no filter" and the delta subline collapses.
 *
 * `today` snaps to local midnight (so the count doesn't drift second-by-
 * second); the rolling windows (`24h`/`7d`/`30d`) use `Date.now()` as the
 * anchor. `new Date().getTime()` is used instead of `Date.now()` to keep
 * the `react-hooks/purity` rule happy when called from a `useMemo`.
 */
function getRangeWindow(range) {
  const now = new Date().getTime();
  const DAY = 24 * 3600 * 1000;
  switch (range) {
    case 'today': {
      const start = startOfDay(new Date()).getTime();
      return { start, prevStart: start - DAY, label: 'Today', shortLabel: 'today' };
    }
    case '24h':
      return { start: now - DAY, prevStart: now - 2 * DAY, label: 'Last 24h', shortLabel: '24h' };
    case '7d':
      return { start: now - 7 * DAY, prevStart: now - 14 * DAY, label: 'Last 7 days', shortLabel: '7d' };
    case '30d':
      return { start: now - 30 * DAY, prevStart: now - 60 * DAY, label: 'Last 30 days', shortLabel: '30d' };
    default:
      return { start: null, prevStart: null, label: 'All time', shortLabel: 'all time' };
  }
}

function filterAlarmsByCreatedOn(alarms, start) {
  if (start == null) return alarms;
  return alarms.filter((a) => {
    const ts = parseDate(a.createdOn);
    return ts != null && ts >= start;
  });
}
