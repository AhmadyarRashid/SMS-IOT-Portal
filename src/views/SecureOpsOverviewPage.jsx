import { memo, useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { Link } from '@/lib/router-shim';
import { formatDistanceToNowStrict, format } from 'date-fns';
import {
  ServerCog, AlertOctagon, Activity, Cpu,
  RadioTower, ChevronRight,
  Building2, Check, CheckCheck, Loader2, Clock, RotateCcw,
  Lock, Lightbulb, Volume2, X,
} from 'lucide-react';
import { useAssets, useAlarms, useUpdateAlarmStatus, useWriteAttribute } from '../hooks/useAssets';
import {
  pickSites, pickTowersForSite, pickGatewayChildren,
  findGatewayForAsset, findSiteForAsset,
} from '../utils/gateways';
import {
  getAssetDisplayName, getCustomAssetType, getAssetTypeLabel, normalizeAssetType,
  isAssetActive, getPrimaryControlAttr, nextToggleValue,
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
  const { data: assets = [], isLoading: assetsLoading } = useAssets({});
  // One alarms query — we used to fetch `useAlarms({})` AND `useAlarms({status:'OPEN'})`
  // every 15 s, but the OPEN list is trivially derivable from the full list and
  // the second network round-trip was pure overhead. Derive `openAlarms`
  // client-side so this page only depends on one alarm query.
  const { data: allAlarms = [], isLoading: alarmsLoading } = useAlarms({});
  const openAlarms = useMemo(
    () => allAlarms.filter((al) => (al.status || 'OPEN').toUpperCase() === 'OPEN'),
    [allAlarms]
  );
  const { selectedSiteId } = useSecureOpsStore();

  // Time-range filter — drives the "Active alerts" + "Detections" KPIs and
  // the Recent Alerts list. "Sites online" and "AI uptime" are state-based
  // snapshots and ignore the range. Default `all` so a fresh load surfaces
  // every alert in the realm; operators can narrow via the chip strip. The
  // setter is wrapped in `startTransition` so React keeps the previous list
  // visible during the re-derive instead of flashing an empty intermediate
  // frame.
  const [range, setRange] = useState('all');
  const [isRangePending, startRangeTransition] = useTransition();
  const rangeWindow = useMemo(() => getRangeWindow(range), [range]);

  // Device-summary modal — null when closed; otherwise 'doors' | 'lights' | 'sirens'.
  const [summaryCategory, setSummaryCategory] = useState(null);

  const sites = useMemo(() => pickSites(assets), [assets]);

  // All towers in the realm — independent of the selected site. Used as the
  // domain for the alarm→tower map so an alarm's tower membership is fixed,
  // not affected by which site filter is active.
  const allTowers = useMemo(() => {
    if (sites.length === 0) {
      return assets.filter((a) =>
        a.type === 'GatewayAsset'
        || normalizeAssetType(getCustomAssetType(a)) === 'TowerAsset'
      );
    }
    return sites.flatMap((s) => pickTowersForSite(assets, s.id));
  }, [assets, sites]);

  // Scope towers: those under the picked site, or every tower in the realm
  // when "All Sites" is selected.
  const towers = useMemo(() => {
    if (selectedSiteId) return pickTowersForSite(assets, selectedSiteId);
    return allTowers;
  }, [assets, allTowers, selectedSiteId]);

  /* ----- Shared lookups (built once, reused everywhere) -----
   * Previously every consumer rebuilt its own assetMap and ran nested
   * O(alarms × towers) loops via `alarmBelongsToGateway`. We now precompute:
   *   • `assetMap`        — assetId → asset (also passed down to the panel).
   *   • `alarmTowerMap`   — alarmId → Set<towerId>. An alarm can carry
   *                         multiple linked assets (asset / assets /
   *                         linkedAssets / assetId / sourceId) potentially
   *                         under different towers, so we collect ALL of
   *                         them — mirrors the original
   *                         `alarmBelongsToGateway` "match if ANY linked
   *                         asset lives under the tower" semantics exactly.
   *   • `siteTowerIdSets` — siteId → Set<towerId> (powers per-site rollups).
   *   • `scopeTowerIdSet` — Set<towerId> of currently-scoped towers.
   * Every downstream count/filter then operates with O(1) lookups.
   */
  const assetMap = useMemo(() => {
    const m = new Map();
    for (const a of assets) m.set(a.id, a);
    return m;
  }, [assets]);

  const alarmTowerMap = useMemo(() => {
    const towerIds = new Set(allTowers.map((t) => t.id));
    const m = new Map();
    const collectTower = (assetLike, out) => {
      if (!assetLike) return;
      const id = typeof assetLike === 'string' ? assetLike : assetLike.id;
      if (!id) return;
      const asset = assetMap.get(id) || (typeof assetLike === 'object' ? assetLike : null);
      if (!asset) return;
      // Mirrors findGatewayForAsset: parentId first, then first path hit.
      if (asset.parentId && towerIds.has(asset.parentId)) { out.add(asset.parentId); return; }
      if (Array.isArray(asset.path)) {
        for (const pid of asset.path) if (towerIds.has(pid)) { out.add(pid); return; }
      }
    };
    for (const al of allAlarms) {
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
  }, [allAlarms, allTowers, assetMap]);

  const siteTowerIdSets = useMemo(() => {
    const m = new Map();
    for (const s of sites) {
      m.set(s.id, new Set(pickTowersForSite(assets, s.id).map((t) => t.id)));
    }
    return m;
  }, [sites, assets]);

  const scopeTowerIdSet = useMemo(() => new Set(towers.map((t) => t.id)), [towers]);

  // Per-alarm context — built once over allAlarms so the panel's AlertRow
  // doesn't re-run findGatewayForAsset / findSiteForAsset (each of which
  // allocates a fresh Map<id, asset> on every call) for every row on every
  // render. Storing `clipUrl` here also avoids re-parsing the alarm body
  // per row. Indexed by alarm id; consumers look up via `.get(al.id)`.
  const towerByIdAll = useMemo(() => {
    const m = new Map();
    for (const t of allTowers) m.set(t.id, t);
    return m;
  }, [allTowers]);
  const siteById = useMemo(() => {
    const m = new Map();
    for (const s of sites) m.set(s.id, s);
    return m;
  }, [sites]);

  const alarmContextMap = useMemo(() => {
    const m = new Map();
    for (const al of allAlarms) {
      const linked = Array.isArray(al.asset) && al.asset[0];
      const linkedId = linked?.id || al.assetId || null;
      const asset = linkedId
        ? (assetMap.get(linkedId) || (typeof linked === 'object' ? linked : null))
        : null;
      // Resolve tower from the precomputed alarm→tower set (first entry wins
      // for the breadcrumb — same single-tower display the original used).
      let tower = null;
      const tset = alarmTowerMap.get(al.id);
      if (tset) {
        for (const tid of tset) {
          const t = towerByIdAll.get(tid);
          if (t) { tower = t; break; }
        }
      }
      // Fallback: walk the asset's path when the alarm didn't resolve a
      // tower (rare — e.g. an alarm linked to a site-level asset directly).
      if (!tower && asset) tower = findGatewayForAsset(asset, allTowers);
      let site = null;
      if (tower) {
        if (tower.parentId && siteById.has(tower.parentId)) site = siteById.get(tower.parentId);
        else if (Array.isArray(tower.path)) {
          for (const pid of tower.path) if (siteById.has(pid)) { site = siteById.get(pid); break; }
        }
      } else if (asset) {
        site = findSiteForAsset(asset, sites);
      }
      m.set(al.id, { asset, tower, site, clipUrl: getAlarmClipUrl(al) });
    }
    return m;
  }, [allAlarms, alarmTowerMap, towerByIdAll, siteById, assetMap, allTowers, sites]);

  /* ----- Per-site summary (drives the "Sites online" KPI) ----- */
  const siteSummaries = useMemo(() => {
    if (sites.length === 0) {
      const onlineCount = allTowers.filter(
        (t) => t.attributes?.connected?.value !== false
      ).length;
      let alarmCount = 0;
      for (const al of openAlarms) if (alarmTowerMap.has(al.id)) alarmCount += 1;
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
      const childIds = siteTowerIdSets.get(s.id) || new Set();
      const childTowers = allTowers.filter((t) => childIds.has(t.id));
      const onlineTowerCount = childTowers.filter(
        (t) => t.attributes?.connected?.value !== false
      ).length;
      const explicitlyOffline = s.attributes?.connected?.value === false;
      const allTowersOffline = childTowers.length > 0 && onlineTowerCount === 0;
      let openAlarmsHere = 0;
      for (const al of openAlarms) {
        const tset = alarmTowerMap.get(al.id);
        if (!tset) continue;
        for (const tid of tset) {
          if (childIds.has(tid)) { openAlarmsHere += 1; break; }
        }
      }
      return {
        id: s.id,
        name: getAssetDisplayName(s),
        connected: !explicitlyOffline && !allTowersOffline,
        towerCount: childTowers.length,
        onlineTowerCount,
        openAlarms: openAlarmsHere,
      };
    });
  }, [sites, allTowers, siteTowerIdSets, openAlarms, alarmTowerMap]);

  /* ----- Device summary across scoped towers -----
   * Iterates every tower in scope, collects its children, and partitions
   * them into three categories the sidebar surfaces. Each entry carries
   * the asset, its owning tower, and whether it's currently "active" in
   * the category's sense:
   *   • Doors  — DoorLockAsset / ToggleableDoorLockAsset → active = unlocked
   *   • Lights — LightAsset                              → active = on
   *   • Sirens — AlarmAsset / BuzzerAsset                → active = sounding
   * The "all" array is everything that could appear in the modal (so the
   * operator can lock something that's already locked, etc.); the
   * `activeCount` is what the sidebar badge shows.
   */
  const deviceSummary = useMemo(() => {
    const doors = [];
    const lights = [];
    const sirens = [];
    for (const t of towers) {
      const kids = pickGatewayChildren(assets, t.id);
      for (const a of kids) {
        const ct = normalizeAssetType(getCustomAssetType(a));
        if (ct === 'DoorLockAsset' || ct === 'ToggleableDoorLockAsset') {
          // For doors `isAssetActive` returns "locked"; unlocked = NOT active.
          doors.push({ asset: a, tower: t, active: !isAssetActive(a, ct) });
        } else if (ct === 'LightAsset') {
          lights.push({ asset: a, tower: t, active: isAssetActive(a, ct) });
        } else if (ct === 'AlarmAsset' || ct === 'BuzzerAsset') {
          sirens.push({ asset: a, tower: t, active: isAssetActive(a, ct) });
        }
      }
    }
    return {
      doors:  { all: doors,  activeCount: doors.filter((d) => d.active).length },
      lights: { all: lights, activeCount: lights.filter((d) => d.active).length },
      sirens: { all: sirens, activeCount: sirens.filter((d) => d.active).length },
    };
  }, [towers, assets]);

  /* ----- Range + scope filtered alarm lists (single source of truth for
   *       both the KPI strip AND the Recent Alerts panel).
   *
   * Site/tower scope is applied here so the "Active alerts" KPI mirrors the
   * sum of the panel's severity chip counts exactly — picking a specific
   * site shrinks both surfaces in lockstep instead of leaving the KPI at
   * the realm-wide total.
   */
  const scopeAlarms = useCallback((list) => {
    if (scopeTowerIdSet.size === 0) return list;
    return list.filter((al) => {
      const tset = alarmTowerMap.get(al.id);
      if (!tset) return false;
      for (const tid of tset) if (scopeTowerIdSet.has(tid)) return true;
      return false;
    });
  }, [alarmTowerMap, scopeTowerIdSet]);

  const openAlarmsInScope = useMemo(
    () => scopeAlarms(filterAlarmsByCreatedOn(openAlarms, rangeWindow.start)),
    [openAlarms, rangeWindow.start, scopeAlarms]
  );
  const allAlarmsInScope = useMemo(
    () => scopeAlarms(filterAlarmsByCreatedOn(allAlarms, rangeWindow.start)),
    [allAlarms, rangeWindow.start, scopeAlarms]
  );
  // Previous-window scope-filtered alarms — used only for the Detections
  // KPI delta line. We don't memo the full list, only the count it produces.
  const prevWindowHighPriorityCount = useMemo(() => {
    if (rangeWindow.prevStart == null || rangeWindow.start == null) return null;
    const scoped = scopeTowerIdSet.size > 0;
    let count = 0;
    for (const al of allAlarms) {
      const ts = parseDate(al.createdOn);
      if (ts == null || ts < rangeWindow.prevStart || ts >= rangeWindow.start) continue;
      if (!isHighPrioritySeverity(al.severity)) continue;
      if (scoped) {
        const tset = alarmTowerMap.get(al.id);
        if (!tset) continue;
        let inScope = false;
        for (const tid of tset) if (scopeTowerIdSet.has(tid)) { inScope = true; break; }
        if (!inScope) continue;
      }
      count += 1;
    }
    return count;
  }, [allAlarms, rangeWindow, alarmTowerMap, scopeTowerIdSet]);

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

  // Gate on BOTH assets and alarms — otherwise assets land first, alarms are
  // briefly empty, and the Recent Alerts panel flashes "No alerts in last 24h"
  // before the alarms query resolves. The combined gate keeps the spinner up
  // through the slowest of the two.
  if (assetsLoading || alarmsLoading) {
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

      {/* ===== Recent Alerts (left ~70%) + Device Summary (right ~30%) =====
          Viewport-fit row — the grid takes whatever vertical space is left
          under the time-range bar + KPI strip (`flex-1 min-h-0`) and each
          panel inside it scrolls its own list internally. Stacks
          vertically on small screens (`grid-cols-1`). */}
      <section className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)] gap-4 flex-1 min-h-0">
        <RecentAlertsPanel
          alarms={openAlarmsInScope}
          rangeLabel={rangeWindow.label}
          assetMap={assetMap}
          alarmTowerMap={alarmTowerMap}
          alarmContextMap={alarmContextMap}
          sites={sites}
          towers={towers}
          externalLoading={isRangePending}
        />
        <DeviceSummaryPanel
          summary={deviceSummary}
          onOpenCategory={setSummaryCategory}
        />
      </section>

      {summaryCategory && (
        <DeviceListModal
          category={summaryCategory}
          summary={deviceSummary}
          onClose={() => setSummaryCategory(null)}
        />
      )}
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

const PAGE_SIZE = 30;
const VISIBLE_BUMP = 30;

function RecentAlertsPanel({ alarms, rangeLabel, assetMap, alarmTowerMap, alarmContextMap, sites, towers, externalLoading }) {
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

  // Per-tower count. Mirrors the original `break;` behaviour — when an
  // alarm's linked assets span multiple panel towers, it's counted only
  // against the FIRST tower (in `towers` iteration order) that matches.
  const towerCounts = useMemo(() => {
    const out = new Map();
    for (const t of towers) out.set(t.id, 0);
    for (const al of alarms) {
      const tset = alarmTowerMap.get(al.id);
      if (!tset) continue;
      for (const t of towers) {
        if (tset.has(t.id)) { out.set(t.id, out.get(t.id) + 1); break; }
      }
    }
    return out;
  }, [alarms, towers, alarmTowerMap]);

  // Apply severity + tower filters.
  const filtered = useMemo(() => {
    const sevSet = expandSeverity(severityFilter);
    return alarms.filter((al) => {
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
      return true;
    });
  }, [alarms, severityFilter, towerFilter, alarmTowerMap]);

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

  /* ----- Infinite scroll -----
   * Render the first PAGE_SIZE rows; an IntersectionObserver on a sentinel
   * at the bottom bumps `visibleCount` as the operator scrolls. Resets to
   * PAGE_SIZE only when the operator changes a panel filter (severity /
   * tower) — uses the project's "reset state when a value changes"
   * pattern (compare to a stored signature in state, NOT setState in
   * useEffect, per the react-hooks/set-state-in-effect lint rule).
   *
   * Mutations (Ack / Resolve) shrink `alarms` but don't change the
   * filter signature, so visibleCount is preserved — the operator's
   * scroll position survives an ack.
   */
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const filterSig = useMemo(
    () => `sev:${[...severityFilter].sort().join(',')}|tow:${[...towerFilter].sort().join(',')}`,
    [severityFilter, towerFilter]
  );
  const [prevFilterSig, setPrevFilterSig] = useState(filterSig);
  if (prevFilterSig !== filterSig) {
    setPrevFilterSig(filterSig);
    setVisibleCount(PAGE_SIZE);
  }

  const visibleAlarms = useMemo(
    () => sorted.slice(0, visibleCount),
    [sorted, visibleCount]
  );
  const hasMore = visibleCount < sorted.length;

  // Sentinel observer — root is the alert list wrapper (`.so-alert-list-wrap`),
  // which is the actual scrolling container now that the Overview is
  // viewport-fit again. Setting `root: null` (viewport) would never fire
  // because the page itself doesn't scroll.
  const scrollRootRef = useRef(null);
  const sentinelRef = useRef(null);
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore) return undefined;
    const obs = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) {
        setVisibleCount((c) => c + VISIBLE_BUMP);
      }
    }, { root: scrollRootRef.current, rootMargin: '200px 0px', threshold: 0 });
    obs.observe(node);
    return () => obs.disconnect();
  }, [hasMore]);

  /* ----- Stable handlers — keep AlertRow memoized -----
   * Inline closures (`onClick={() => setX(y)}`) create a new function on
   * every render, which would defeat React.memo on AlertRow. Lift them
   * here once with useCallback so prop identity is stable across renders.
   */
  const handleClipClick = useCallback((alarmId) => setClipAlarmId(alarmId), []);
  const handleClipClose = useCallback(() => setClipAlarmId(null), []);
  const handleAck = useCallback((alarm) => {
    update.mutate({
      alarm,
      status: 'ACKNOWLEDGED',
      successMessage: `Alarm acknowledged — ${alarm.title || 'alarm'}`,
      errorMessage: 'Failed to acknowledge alarm',
    });
  }, [update]);
  const handleResolve = useCallback((alarm) => {
    update.mutate({
      alarm,
      status: 'RESOLVED',
      successMessage: `Alarm resolved — ${alarm.title || 'alarm'}`,
      errorMessage: 'Failed to resolve alarm',
    });
  }, [update]);

  // Single id + status pair so each AlertRow can derive its own pending
  // state without us passing the whole React-Query mutation object (which
  // changes identity on every fetch tick and would bust memoization).
  const pendingAlarmId = update.isPending ? update.variables?.alarm?.id : null;
  const pendingStatus = update.isPending ? update.variables?.status : null;

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
  // Use the page-level alarmContextMap as the primary source — it already
  // resolved asset / tower / site once over allAlarms, so the modal queue
  // reuses that work instead of re-running findGatewayForAsset per item.
  const resolveAlarmContext = useCallback((al) => {
    if (!al) return null;
    const ctx = alarmContextMap.get(al.id);
    if (ctx) return { alarm: al, asset: ctx.asset, tower: ctx.tower, site: ctx.site };
    // Fallback for an alarm that wasn't in the map (shouldn't happen for
    // anything from the parent's scoped list, but guard anyway).
    const linked = Array.isArray(al.asset) && al.asset[0];
    const asset = linked?.id
      ? (assetMap.get(linked.id) || linked)
      : (al.assetId ? assetMap.get(al.assetId) : null);
    const tower = asset ? findGatewayForAsset(asset, towers) : null;
    const site = tower
      ? findSiteForAsset(tower, sites)
      : (asset ? findSiteForAsset(asset, sites) : null);
    return { alarm: al, asset, tower, site };
  }, [alarmContextMap, assetMap, towers, sites]);

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
      .filter((al) => alarmTowerMap.get(al.id)?.has(tower.id))
      .filter((al) => alarmContextMap.get(al.id)?.clipUrl)
      .sort((a, b) => new Date(b.createdOn || 0) - new Date(a.createdOn || 0))
      .map(resolveAlarmContext);
    const index = queue.findIndex((c) => c.alarm.id === clipAlarmId);
    return { current, queue, index };
  }, [clipAlarmId, alarms, resolveAlarmContext, alarmTowerMap, alarmContextMap]);

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
              ? `${visibleAlarms.length}/${sorted.length} of ${alarms.length} active`
              : (hasMore
                ? `${visibleAlarms.length} of ${sorted.length} active`
                : `${sorted.length} active`)}
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

      <div ref={scrollRootRef} className="so-alert-list-wrap" data-loading={loading}>
        {sorted.length === 0 ? (
          <p className="text-sm text-[var(--color-ink-2)] py-6 text-center">
            {activeFilterCount > 0
              ? 'No alerts match these filters.'
              : (rangeLabel ? `No alerts in ${rangeLabel.toLowerCase()}.` : 'All clear in this scope.')}
          </p>
        ) : (
          <div className="so-alert-list">
            {visibleAlarms.map((al) => {
              // Destructure at the call site so AlertRow receives stable
              // individual refs (asset/tower/site come from cached Maps —
              // assetMap, towerByIdAll, siteById — and only change when
              // the underlying asset list does, not on each alarm poll).
              // Passing the whole `context` object would create a fresh
              // reference each poll and bust React.memo on every row.
              const ctx = alarmContextMap.get(al.id);
              return (
                <AlertRow
                  key={al.id}
                  alarm={al}
                  asset={ctx?.asset || null}
                  tower={ctx?.tower || null}
                  site={ctx?.site || null}
                  clipUrl={ctx?.clipUrl || null}
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
                <span>Loading more… ({sorted.length - visibleAlarms.length} remaining)</span>
              </div>
            )}
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
          onClose={handleClipClose}
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

/**
 * Row in the Recent Alerts list. Pure render — every input it needs is
 * precomputed at the parent (asset/tower/site/clipUrl, pendingStatus) so
 * it can stay memoized and skip re-render when its alarm hasn't changed.
 *
 * IMPORTANT: props are individual primitives / stable refs, NOT a wrapping
 * `context` object — `React.memo` does a shallow compare, and a fresh
 * `{...}` per render would always look "changed" even when the underlying
 * data is identical. Each prop here is either:
 *   • a primitive (clipUrl string, pendingStatus string)
 *   • a stable ref from a cached Map at the parent (asset/tower/site)
 *   • a stable useCallback handler (onClipClick / onAck / onResolve)
 *   • the alarm itself — React Query preserves object identity across
 *     polls when the alarm payload hasn't changed (structural sharing).
 */
const AlertRow = memo(function AlertRow({ alarm, asset, tower, site, clipUrl, pendingStatus, onClipClick, onAck, onResolve }) {
  const sev = (alarm.severity || 'LOW').toUpperCase();
  const sevMeta = SEVERITY_META[sev] || SEVERITY_META.LOW;

  const typeLabel = asset ? getAssetTypeLabel(getCustomAssetType(asset)) : null;
  const assetName = asset ? getAssetDisplayName(asset) : null;
  const createdAt = alarm.createdOn ? new Date(alarm.createdOn) : null;

  const status = (alarm.status || 'OPEN').toUpperCase();
  const canAck = status === 'OPEN';
  const canResolve = status === 'OPEN' || status === 'ACKNOWLEDGED' || status === 'IN_PROGRESS';

  const ackPending = pendingStatus === 'ACKNOWLEDGED';
  const resolvePending = pendingStatus === 'RESOLVED';
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
            {canAck && (
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
                <span>{ackPending ? 'Acking…' : 'Ack'}</span>
              </button>
            )}
            {canResolve && (
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
                <span>{resolvePending ? 'Resolving…' : 'Resolve'}</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

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

/* ==========================================================================
   Device summary sidebar
   ========================================================================== */

const SUMMARY_CATEGORIES = [
  {
    key: 'doors',
    label: 'Doors unlocked',
    icon: Lock,
    color: 'var(--color-warning-400)',
    activeVerb: 'unlocked',
    idleVerb: 'locked',
  },
  {
    key: 'lights',
    label: 'Lights on',
    icon: Lightbulb,
    color: 'var(--color-accent-400)',
    activeVerb: 'on',
    idleVerb: 'off',
  },
  {
    key: 'sirens',
    label: 'Sirens active',
    icon: Volume2,
    color: 'var(--color-danger-400)',
    activeVerb: 'sounding',
    idleVerb: 'idle',
  },
];

function DeviceSummaryPanel({ summary, onOpenCategory }) {
  return (
    <section className="panel p-4 md:p-5 so-panel-fit">
      <div className="so-panel-head">
        <div className="so-panel-title">
          <Activity className="so-panel-icon" strokeWidth={2} />
          Device summary
        </div>
        <span className="so-panel-meta">Click a row to manage</span>
      </div>
      <div className="mt-2 flex flex-col gap-2 overflow-y-auto" style={{ flex: 1, minHeight: 0 }}>
        {SUMMARY_CATEGORIES.map((c) => {
          const bucket = summary[c.key];
          const total = bucket.all.length;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => total > 0 && onOpenCategory(c.key)}
              disabled={total === 0}
              className="text-left rounded-xl px-3 py-2.5 flex items-center gap-3 transition-colors"
              style={{
                background: 'color-mix(in srgb, var(--color-ink-0) 4%, transparent)',
                border: '1px solid color-mix(in srgb, var(--color-ink-0) 10%, transparent)',
                cursor: total === 0 ? 'not-allowed' : 'pointer',
                opacity: total === 0 ? 0.55 : 1,
              }}
              title={total === 0 ? `No ${c.label.toLowerCase()} in this scope` : `Manage ${c.label.toLowerCase()}`}
            >
              <span
                className="inline-flex items-center justify-center rounded-lg w-9 h-9 flex-shrink-0"
                style={{
                  background: `color-mix(in srgb, ${c.color} 14%, transparent)`,
                  color: c.color,
                }}
              >
                <c.icon className="w-4.5 h-4.5" strokeWidth={2} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-[var(--color-ink-0)] truncate">
                  {c.label}
                </p>
                <p className="text-[11px] text-[var(--color-ink-2)] tabular-nums">
                  {bucket.activeCount} {c.activeVerb} · {total - bucket.activeCount} {c.idleVerb} · {total} total
                </p>
              </div>
              <span
                className="text-2xl font-bold tabular-nums"
                style={{ color: bucket.activeCount > 0 ? c.color : 'var(--color-ink-3)' }}
              >
                {bucket.activeCount}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/* ==========================================================================
   Device list modal — click a summary row → manage every device in that
   category, grouped by tower, with inline toggles wired through
   `useWriteAttribute`.
   ========================================================================== */

function DeviceListModal({ category, summary, onClose }) {
  const meta = SUMMARY_CATEGORIES.find((c) => c.key === category) || SUMMARY_CATEGORIES[0];
  const bucket = summary[category];

  // Group items by their tower id, preserving order.
  const groups = useMemo(() => {
    const m = new Map();
    for (const item of bucket.all) {
      if (!m.has(item.tower.id)) m.set(item.tower.id, { tower: item.tower, items: [] });
      m.get(item.tower.id).items.push(item);
    }
    return [...m.values()];
  }, [bucket]);

  // Esc-to-close.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'color-mix(in srgb, black 60%, transparent)' }}
      onClick={onClose}
    >
      <div
        className="panel w-[min(720px,96vw)] max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b" style={{ borderColor: 'color-mix(in srgb, var(--color-ink-0) 10%, transparent)' }}>
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="inline-flex items-center justify-center rounded-lg w-8 h-8"
              style={{ background: `color-mix(in srgb, ${meta.color} 14%, transparent)`, color: meta.color }}
            >
              <meta.icon className="w-4 h-4" strokeWidth={2} />
            </span>
            <h2 className="text-lg font-bold text-[var(--color-ink-0)]">{meta.label}</h2>
            <span className="text-[12px] text-[var(--color-ink-2)] tabular-nums ml-1">
              {bucket.activeCount}/{bucket.all.length}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-lg text-[var(--color-ink-2)] hover:text-[var(--color-ink-0)]"
            style={{ background: 'color-mix(in srgb, var(--color-ink-0) 6%, transparent)' }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-y-auto p-5 space-y-4">
          {groups.length === 0 ? (
            <p className="text-sm text-[var(--color-ink-2)] text-center py-6">
              No matching devices in this scope.
            </p>
          ) : (
            groups.map((g) => (
              <div key={g.tower.id}>
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-ink-3)] mb-1.5">
                  <RadioTower className="w-3 h-3" strokeWidth={2} />
                  {getAssetDisplayName(g.tower)}
                </p>
                <div className="flex flex-col gap-2">
                  {g.items.map((item) => (
                    <DeviceToggleRow key={item.asset.id} asset={item.asset} active={item.active} color={meta.color} />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function DeviceToggleRow({ asset, active, color }) {
  const customType = getCustomAssetType(asset);
  const write = useWriteAttribute();
  const pending = write.isPending && write.variables?.assetId === asset.id;
  const name = getAssetDisplayName(asset);
  const typeLabel = getAssetTypeLabel(customType);

  const toggle = () => {
    const attr = getPrimaryControlAttr(asset, customType);
    write.mutate({
      assetId: asset.id,
      attributeName: attr,
      value: nextToggleValue(asset, attr),
    });
  };

  return (
    <div
      className="rounded-xl px-3 py-2.5 flex items-center gap-3"
      style={{
        background: 'color-mix(in srgb, var(--color-ink-0) 4%, transparent)',
        border: `1px solid color-mix(in srgb, ${active ? color : 'var(--color-ink-0)'} ${active ? 35 : 10}%, transparent)`,
      }}
    >
      <span
        className="inline-block w-2 h-2 rounded-full"
        style={{ background: active ? color : 'var(--color-ink-3)' }}
      />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-[var(--color-ink-0)] truncate">{name}</p>
        <p className="text-[11px] text-[var(--color-ink-2)]">{typeLabel}</p>
      </div>
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        className="px-3 py-1.5 rounded-lg text-[12px] font-semibold inline-flex items-center gap-1.5"
        style={{
          background: active
            ? `color-mix(in srgb, ${color} 18%, transparent)`
            : 'color-mix(in srgb, var(--color-ink-0) 8%, transparent)',
          color: active ? color : 'var(--color-ink-1)',
          border: `1px solid color-mix(in srgb, ${active ? color : 'var(--color-ink-0)'} ${active ? 40 : 15}%, transparent)`,
          opacity: pending ? 0.65 : 1,
        }}
      >
        {pending && <Loader2 className="w-3 h-3 spin-slow" />}
        {active ? 'Turn off' : 'Turn on'}
      </button>
    </div>
  );
}
