import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNowStrict, format } from 'date-fns';
import {
  ServerCog, AlertOctagon, Activity, Cpu,
  Video as VideoIcon, RefreshCw,
  RadioTower, ShieldAlert, ChevronRight,
  Lock, Siren, Lightbulb, Mic,
  Thermometer, Droplets, Signal, BatteryCharging,
  ScrollText, X, Building2, Check, CheckCheck, Loader2,
  ChevronsRight,
} from 'lucide-react';
import { useAssets, useAlarms, useWriteAttribute, useUpdateAlarmStatus } from '../hooks/useAssets';
import {
  pickSites, pickTowersForSite, pickGatewayChildren,
  alarmBelongsToGateway, findGatewayForAsset, findSiteForAsset,
  getWeatherAssetForTower, getCameraStreamUrl,
} from '../utils/gateways';
import {
  getAssetDisplayName, getCustomAssetType, getAssetTypeLabel,
  isAssetActive, getPrimaryControlAttr, nextToggleValue, normalizeAssetType,
} from '../utils/assetIcons';
import useSecureOpsStore from '../store/secureOpsStore';
import { LoadingSpinner } from '../components/ui';
import CameraStream from '../components/cameras/CameraStream';
import CameraFullView from '../components/cameras/CameraFullView';
import ClipModal from '../components/cameras/ClipModal';
import { alarmAuditEvents, towerAuditEvents } from '../utils/auditEvents';
import { getAlarmClipUrl } from '../utils/alarms';
import './secureops.css';

/* ==========================================================================
   SecureOps Overview — telco dashboard, every block derived from
   useAssets + useAlarms (no extra endpoints). Mirrors the prototype 1:1.
   ========================================================================== */

export default function SecureOpsOverviewPage() {
  const { data: assets = [], isLoading } = useAssets({});
  const { data: openAlarms = [] } = useAlarms({ status: 'OPEN' });
  const { data: allAlarms = [] } = useAlarms({});
  const { selectedSiteId, selectedTowerId, setTower, setSite } = useSecureOpsStore();

  const sites = useMemo(() => pickSites(assets), [assets]);

  // Scope towers: those under the picked site, or every tower (any gateway)
  // when "All Sites" is selected.
  const towers = useMemo(() => {
    if (selectedSiteId) return pickTowersForSite(assets, selectedSiteId);
    if (sites.length === 0) {
      // No SiteAssets configured: treat every gateway / TowerAsset as a tower.
      return assets.filter((a) =>
        a.type === 'GatewayAsset'
        || normalizeAssetType(getCustomAssetType(a)) === 'TowerAsset'
      );
    }
    return sites.flatMap((s) => pickTowersForSite(assets, s.id));
  }, [assets, sites, selectedSiteId]);

  // Auto-pick first tower for panels that need a single tower context.
  const activeTower = useMemo(() => {
    if (selectedTowerId) {
      const t = towers.find((x) => x.id === selectedTowerId);
      if (t) return t;
    }
    return towers[0] || null;
  }, [towers, selectedTowerId]);

  // Per-tower derived summary (used by Site Status + KPI strip).
  const towerSummaries = useMemo(
    () => towers.map((t) => summariseTower(t, assets, openAlarms)),
    [towers, assets, openAlarms]
  );

  /* ----- Per-site summary (drives the "Sites online" KPI) -----
   *
   * Offline detection — real-scenario, OpenRemote-native:
   *   • Tower (or any gateway) is OFFLINE when its `connected` attribute is
   *     explicitly `false`. OR's Agent layer sets this when it loses contact
   *     with the physical device (heartbeat / TCP / MQTT, whichever the
   *     agent uses). An undefined attribute is treated as ONLINE — only an
   *     explicit `false` counts as down, so freshly-added assets that
   *     haven't received their first connectivity event don't show as
   *     phantom-offline.
   *   • Site is OFFLINE when:
   *       (a) the SiteAsset itself carries `connected === false`, OR
   *       (b) it has one or more towers and ALL of them are offline.
   *     Sites with no towers fall back to (a) only — an empty container is
   *     considered online unless someone explicitly marked it down.
   *
   * The summary spans EVERY site in the realm regardless of the selected
   * site scope, so the KPI is a realm-wide health indicator. When the realm
   * has no SiteAssets at all we synthesise one entry from the tower list
   * so the card always renders something useful.
   */
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

  /* ----- KPI numbers ----- */

  const kpis = useMemo(() => {
    const onlineSites = siteSummaries.filter((s) => s.connected).length;
    const offlineSiteCount = siteSummaries.length - onlineSites;
    const firstOfflineSite = siteSummaries.find((s) => !s.connected);
    const critical = openAlarms.filter((a) => a.severity === 'CRITICAL' || a.severity === 'HIGH').length;
    const warning = openAlarms.length - critical;

    // "Detections today" = alarms created today. Every detection (human,
    // animal, ANPR, whatever the AI side reports) raises an alarm via the
    // backend rule, so the alarm history is the canonical, persistent count.
    // Source unchanged when an alarm is acked/resolved — that's a status
    // transition, not a deletion, so the daily total stays stable across
    // operator actions.
    const today = startOfDay(new Date()).getTime();
    const yesterday = today - 24 * 3600 * 1000;
    let dToday = 0, dYesterday = 0;
    for (const al of allAlarms) {
      const ts = parseDate(al.createdOn);
      if (!ts) continue;
      if (ts >= today) dToday += 1;
      else if (ts >= yesterday && ts < today) dYesterday += 1;
    }
    const detectionDelta = dToday - dYesterday;

    // AI uptime: % of the last 30 days that an `aiHeartbeatAt` timestamp on any
    // tower in scope was within the 5 min window. Cheap proxy from current
    // heartbeat: if any tower reports a recent heartbeat, count it as up.
    // (Full uptime % would need datapoints — flagged in the design as needing
    // a `aiUptime30d` attribute. Hide the % when no heartbeat anywhere.)
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
      alerts: { total: openAlarms.length, critical, warning },
      detections: { today: dToday, delta: detectionDelta },
      aiUptime: aiUp,
    };
  }, [siteSummaries, openAlarms, allAlarms, towers]);

  if (isLoading) {
    return <div className="flex items-center justify-center min-h-[60vh]"><LoadingSpinner size="lg" /></div>;
  }

  return (
    <div className="p-4 md:p-6 max-w-[1500px] mx-auto space-y-5">
      {/* ===== KPI Strip ===== */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
          label="Active alerts"
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
          label="Detections today"
          value={kpis.detections.today}
          subline={
            kpis.detections.delta === 0
              ? 'Same as yesterday'
              : `${kpis.detections.delta > 0 ? '+' : ''}${kpis.detections.delta} vs yesterday`
          }
          subTone={kpis.detections.delta > 0 ? 'warning' : 'ok'}
        />
        <KpiCard
          icon={Cpu}
          label="AI uptime"
          value={kpis.aiUptime != null ? `${kpis.aiUptime.toFixed(1)}%` : '—'}
          subline={kpis.aiUptime != null ? 'Last 30 days' : 'No heartbeat data'}
          subTone={kpis.aiUptime != null && kpis.aiUptime >= 99 ? 'ok' : 'warning'}
        />
      </section>

      {/* ===== Main two-column grid ===== */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-4">
        {/* ----- Left column ----- */}
        <div className="space-y-4 min-w-0">
          <LiveCameraFeedsPanel
            towers={towers}
            activeTower={activeTower}
            onTowerChange={setTower}
            assets={assets}
          />
          <SiteStatusPanel
            summaries={towerSummaries}
            siteSummaries={siteSummaries}
            activeId={activeTower?.id}
            onPick={setTower}
            onPickSite={setSite}
          />
          <RemoteControlPanel tower={activeTower} assets={assets} />
        </div>

        {/* ----- Right column ----- */}
        <div className="space-y-4 min-w-0">
          <RecentAlertsPanel
            alarms={openAlarms}
            assets={assets}
            sites={sites}
            towers={towers}
            scopeTowerIds={towers.map((t) => t.id)}
          />
          <EnvironmentalTelemetryPanel
            tower={activeTower}
            assets={assets}
            allAlarms={allAlarms}
          />
          <AuditLogPanel
            alarms={allAlarms}
            assets={assets}
            sites={sites}
            towers={towers}
          />
        </div>
      </div>
    </div>
  );
}

/* ==========================================================================
   KPI card
   ========================================================================== */

function KpiCard({ icon: Icon, label, value, subline, subTone, to }) {
  // When `to` is set, render as a Link so clicking the card navigates.
  // The card surface stays visually identical — only the cursor + a subtle
  // hover lift change to hint at interactivity.
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
   Live Camera Feeds
   ========================================================================== */

function LiveCameraFeedsPanel({ towers, activeTower, onTowerChange, assets }) {
  const cameras = useMemo(() => {
    if (!activeTower) return [];
    return pickGatewayChildren(assets, activeTower.id)
      .filter((a) => getCustomAssetType(a) === 'CameraAsset');
  }, [activeTower, assets]);

  // Limit to a 2x2 grid; show ALL cameras when there are more via a "+N" tile
  // (simple cap to match the sketch — full grid lives in the Video tab).
  const display = cameras.slice(0, 4);
  const overflow = Math.max(0, cameras.length - 4);

  // Single piece of state for which camera (if any) is currently in the
  // full-view modal. The modal is owned by the panel — each tile is a button
  // that calls setFullCam(camera) on click.
  const [fullCam, setFullCam] = useState(null);

  return (
    <section className="panel p-4 md:p-5">
      <div className="so-panel-head">
        <div className="so-panel-title">
          <VideoIcon className="so-panel-icon" strokeWidth={2} />
          Live camera feeds
        </div>
        <TowerSelect towers={towers} value={activeTower?.id} onChange={onTowerChange} />
      </div>

      {!activeTower ? (
        <p className="text-sm text-[var(--color-ink-2)] py-10 text-center">
          No towers in this scope yet.
        </p>
      ) : (
        <>
          <div className="so-cam-grid">
            {display.length === 0 && (
              <div className="so-cam col-span-2"><div className="so-cam-empty">No cameras linked to this tower</div></div>
            )}
            {display.map((cam) => (
              <CameraTile key={cam.id} camera={cam} onOpen={setFullCam} />
            ))}
            {overflow > 0 && (
              <Link to="/video" className="so-cam flex items-center justify-center"
                    style={{ background: 'color-mix(in srgb, var(--color-ink-0) 6%, transparent)' }}>
                <div className="text-center text-[var(--color-ink-1)]">
                  <p className="text-2xl font-bold">+{overflow}</p>
                  <p className="text-[11px]">more cameras</p>
                </div>
              </Link>
            )}
          </div>

        </>
      )}

      {fullCam && (
        <CameraFullView camera={fullCam} onClose={() => setFullCam(null)} />
      )}
    </section>
  );
}

function CameraTile({ camera, onOpen }) {
  const url = getCameraStreamUrl(camera);
  const alerting = isCameraAlerting(camera);
  const idx = 0; // index isn't tracked here; consumer wraps with key
  const code = shortCamCode(camera, idx);
  const name = getAssetDisplayName(camera);
  const offline = camera.attributes?.connected?.value === false;

  // The tile is a button — clicking opens the full-view modal (handled by
  // the parent panel) instead of navigating to the asset detail page.
  return (
    <button
      type="button"
      onClick={() => onOpen(camera)}
      className="so-cam block"
      title={`Open ${name} full view`}
    >
      <CameraStream url={url} offline={offline} />
      <div className="so-cam-pills">
        <span className="so-cam-pill is-label">{code}</span>
        {alerting
          ? <span className="so-cam-pill is-alert"><ShieldAlert className="w-2.5 h-2.5" />Alert</span>
          : <span className="so-cam-pill is-rec">Rec</span>}
      </div>
      <div className="so-cam-foot truncate">{name}</div>
    </button>
  );
}

function isCameraAlerting(camera) {
  const hist = camera?.attributes?.history?.value;
  if (!Array.isArray(hist) || hist.length === 0) return false;
  const latest = hist[0];
  const ts = parseDate(latest?.date);
  if (!ts) return false;
  // Recent (last 5 minutes) + human-flagged.
  const recent = new Date().getTime() - ts < 5 * 60 * 1000;
  return recent && latest?.detection === 'human';
}

function shortCamCode(camera, idx) {
  const name = camera?.name || '';
  const m = name.match(/CAM[-\s_]?(\d{1,3})/i);
  if (m) return `CAM-${m[1].padStart(2, '0')}`;
  return `CAM-${String(idx + 1).padStart(2, '0')}`;
}

function TowerSelect({ towers, value, onChange }) {
  return (
    <select
      value={value || ''}
      onChange={(e) => onChange(e.target.value || null)}
      className="so-tower-select"
    >
      {towers.length === 0 && <option value="">No towers</option>}
      {towers.map((t) => (
        <option key={t.id} value={t.id}>{getAssetDisplayName(t)}</option>
      ))}
    </select>
  );
}

/* ==========================================================================
   Site Status
   ========================================================================== */

function SiteStatusPanel({ summaries, siteSummaries, activeId, onPick, onPickSite }) {
  const [showAllSites, setShowAllSites] = useState(false);

  // Sort: offline towers first, then alarming, then online (priority sort).
  // Within the same bucket: highest open-alarm count first, then by name.
  const sorted = useMemo(() => sortByAlertPriority(summaries), [summaries]);

  return (
    <section className="panel p-4 md:p-5">
      <div className="so-panel-head">
        <div className="so-panel-title">
          <RadioTower className="so-panel-icon" strokeWidth={2} />
          Site status
        </div>
        <div className="flex items-center gap-1.5">
          <RefreshButton queryKey={['assets']} title="Refresh tower status" />
          <button
            type="button"
            onClick={() => setShowAllSites(true)}
            className="text-[11px] font-semibold text-[var(--color-accent-400)] hover:text-[var(--color-accent-300)]"
          >
            All sites
          </button>
        </div>
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm text-[var(--color-ink-2)] py-6 text-center">No towers in this scope.</p>
      ) : (
        <div className="space-y-2">
          {sorted.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onPick(s.id)}
              data-active={s.id === activeId}
              className="so-site-row"
            >
              <div className="flex-1 min-w-0">
                <div className="so-site-name truncate">{s.name}</div>
                <div className="so-site-meta">
                  {s.connectionType ? `${s.connectionType} · ` : ''}
                  {s.cameras > 0 ? `${s.cameras} cam${s.cameras === 1 ? '' : 's'}` : 'No cams'}
                  {s.sensors > 0 ? ` · ${s.sensors} sensor${s.sensors === 1 ? '' : 's'}` : ''}
                </div>
              </div>
              <span className={`so-status-badge ${
                !s.connected ? 'is-offline' : s.openAlarms > 0 ? 'is-alert' : 'is-online'
              }`}>
                {!s.connected
                  ? 'Offline'
                  : (s.openAlarms > 0 ? (s.intrusion ? 'Intrusion!' : 'Alert') : 'Online')}
              </span>
            </button>
          ))}
        </div>
      )}

      {showAllSites && (
        <AllSitesModal
          sites={siteSummaries}
          onSelect={(id) => { onPickSite(id); setShowAllSites(false); }}
          onClose={() => setShowAllSites(false)}
        />
      )}
    </section>
  );
}

/* ----- All-sites modal (opened from Site Status header) ----- */

function AllSitesModal({ sites, onSelect, onClose }) {
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

  const sorted = useMemo(() => sortByAlertPriority(sites), [sites]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(2, 6, 23, 0.78)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="panel p-4 w-[min(560px,96vw)] max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <p className="text-sm font-bold text-[var(--color-ink-0)]">All sites</p>
            <p className="text-[11px] text-[var(--color-ink-2)]">
              {sorted.length} site{sorted.length === 1 ? '' : 's'} — sorted by health (offline / alerts first)
            </p>
          </div>
          <button onClick={onClose} className="audit-btn flex-shrink-0" title="Close (Esc)">
            <X className="w-3.5 h-3.5" />
            Close
          </button>
        </div>
        {sorted.length === 0 ? (
          <p className="text-sm text-[var(--color-ink-2)] py-8 text-center">No sites in the realm.</p>
        ) : (
          <ul className="space-y-2 overflow-y-auto pr-1 flex-1">
            <li>
              <button
                type="button"
                onClick={() => onSelect(null)}
                className="so-site-row w-full"
                title="Show every site in scope"
              >
                <Building2 className="w-4 h-4 text-[var(--color-accent-400)]" />
                <div className="flex-1 min-w-0">
                  <div className="so-site-name">All Sites</div>
                  <div className="so-site-meta">Clear the site filter</div>
                </div>
                <ChevronsRight className="w-3.5 h-3.5 text-[var(--color-ink-3)]" />
              </button>
            </li>
            {sorted.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => onSelect(s.id)}
                  className="so-site-row w-full"
                >
                  <Building2
                    className="w-4 h-4"
                    style={{
                      color: !s.connected
                        ? 'var(--color-ink-2)'
                        : s.openAlarms > 0
                          ? 'var(--color-danger-400)'
                          : 'var(--color-accent-400)',
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="so-site-name truncate">{s.name}</div>
                    <div className="so-site-meta">
                      {s.onlineTowerCount}/{s.towerCount} tower{s.towerCount === 1 ? '' : 's'} online
                      {s.openAlarms > 0 && ` · ${s.openAlarms} alert${s.openAlarms === 1 ? '' : 's'}`}
                    </div>
                  </div>
                  <span className={`so-status-badge ${
                    !s.connected ? 'is-offline' : s.openAlarms > 0 ? 'is-alert' : 'is-online'
                  }`}>
                    {!s.connected ? 'Offline' : (s.openAlarms > 0 ? 'Alert' : 'Online')}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* Priority sort used by Site Status panel AND the All Sites modal: items
   that the operator should look at first come first. Offline > alarming >
   online. Within the same bucket, more alarms first, then alphabetical. */
function sortByAlertPriority(items) {
  const priority = (s) => {
    if (!s.connected) return 0;
    if ((s.openAlarms || 0) > 0) return 1;
    return 2;
  };
  return [...items].sort((a, b) => {
    const pa = priority(a);
    const pb = priority(b);
    if (pa !== pb) return pa - pb;
    const ad = (b.openAlarms || 0) - (a.openAlarms || 0);
    if (ad !== 0) return ad;
    return (a.name || '').localeCompare(b.name || '');
  });
}

/* Refresh button — invalidates a React Query key and shows a brief spin
   animation. Used in Site Status and Environmental Telemetry headers. */
function RefreshButton({ queryKey, title = 'Refresh' }) {
  const qc = useQueryClient();
  const [spinning, setSpinning] = useState(false);

  const refresh = async () => {
    if (spinning) return;
    setSpinning(true);
    try {
      await qc.invalidateQueries({ queryKey });
    } finally {
      // Hold the spin briefly so the user sees feedback even when the
      // refetch resolves from cache instantly.
      setTimeout(() => setSpinning(false), 600);
    }
  };

  return (
    <button
      type="button"
      onClick={refresh}
      disabled={spinning}
      className="so-refresh-btn"
      title={title}
      aria-label={title}
    >
      <RefreshCw className={`w-3.5 h-3.5 ${spinning ? 'so-spin' : ''}`} strokeWidth={2} />
    </button>
  );
}

/* ==========================================================================
   Remote Control (Door / Siren / Lights / PTT)
   ========================================================================== */

function RemoteControlPanel({ tower, assets }) {
  const children = useMemo(
    () => (tower ? pickGatewayChildren(assets, tower.id) : []),
    [tower, assets]
  );

  // Door is either a DoorLockAsset or the newer ToggleableDoorLockAsset —
  // both behave the same way (toggle `onOff`/`locked`, on = Locked).
  const door = children.find((a) => {
    const t = normalizeAssetType(getCustomAssetType(a));
    return t === 'DoorLockAsset' || t === 'ToggleableDoorLockAsset';
  });
  const siren = children.find((a) => getCustomAssetType(a) === 'BuzzerAsset')
            || children.find((a) => getCustomAssetType(a) === 'AlarmAsset');
  const light = children.find((a) => getCustomAssetType(a) === 'LightAsset');
  // PTT-capable 360 camera under the same tower.
  const pttCamera = children.find((a) =>
    getCustomAssetType(a) === 'CameraAsset'
    && (a.attributes?.cameraVariant?.value === '360' || /360/i.test(a.name || ''))
    && typeof a.attributes?.pttUrl?.value === 'string'
    && a.attributes.pttUrl.value.trim()
  );

  const write = useWriteAttribute();
  const toggle = (asset) => {
    if (!asset) return;
    const attr = getPrimaryControlAttr(asset, getCustomAssetType(asset));
    write.mutate({ assetId: asset.id, attributeName: attr, value: nextToggleValue(asset, attr) });
  };

  const [pttOpen, setPttOpen] = useState(false);

  return (
    <section className="panel p-4 md:p-5">
      <div className="so-panel-head">
        <div className="so-panel-title">
          <SlidersIcon />
          Remote control
        </div>
        <span className="so-panel-meta">
          {tower ? getAssetDisplayName(tower) : '—'}
        </span>
      </div>

      <div className="so-remote-grid">
        <RemoteButton
          icon={Lock}
          label="Door lock"
          stateLabel={door ? (isAssetActive(door, getCustomAssetType(door)) ? 'Locked' : 'Unlocked') : 'No device'}
          active={door ? isAssetActive(door, getCustomAssetType(door)) : false}
          disabled={!door}
          onClick={() => toggle(door)}
        />
        <RemoteButton
          icon={Siren}
          label="Siren"
          stateLabel={siren ? (isAssetActive(siren, getCustomAssetType(siren)) ? 'Active' : 'Silent') : 'No device'}
          active={siren ? isAssetActive(siren, getCustomAssetType(siren)) : false}
          disabled={!siren}
          onClick={() => toggle(siren)}
        />
        <RemoteButton
          icon={Lightbulb}
          label="Lights"
          stateLabel={light ? (isAssetActive(light, 'LightAsset') ? 'On' : 'Off') : 'No device'}
          active={light ? isAssetActive(light, 'LightAsset') : false}
          disabled={!light}
          onClick={() => toggle(light)}
        />
        <RemoteButton
          icon={Mic}
          label="Push to talk"
          stateLabel={pttCamera ? 'Hold to speak' : 'No 360 cam'}
          active={false}
          disabled={!pttCamera}
          onClick={() => setPttOpen(true)}
        />
      </div>

      {pttOpen && pttCamera && (
        <PttModal camera={pttCamera} onClose={() => setPttOpen(false)} />
      )}
    </section>
  );
}

function RemoteButton({ icon: Icon, label, stateLabel, active, disabled, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-active={active}
      className="so-remote-btn"
    >
      <Icon className="w-5 h-5" strokeWidth={1.75} />
      <div>
        <div>{label}</div>
        <div className="so-remote-state">{stateLabel}</div>
      </div>
    </button>
  );
}

function SlidersIcon() {
  // Local stand-in so we don't pull yet another Lucide icon into the file.
  return (
    <svg className="so-panel-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" />
      <line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" />
      <line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" />
      <line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="17" y1="16" x2="23" y2="16" />
    </svg>
  );
}

function PttModal({ camera, onClose }) {
  // Lock body scroll while the modal is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const url = camera.attributes?.pttUrl?.value;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(2, 6, 23, 0.78)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="panel p-3 w-[min(960px,95vw)] h-[min(640px,80vh)] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 mb-2">
          <div>
            <p className="text-sm font-bold">Push to talk — {getAssetDisplayName(camera)}</p>
            <p className="text-[11px] text-[var(--color-ink-2)]">360° feed with bidirectional audio</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[color-mix(in_srgb,var(--color-ink-0)_8%,transparent)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <iframe
          src={url}
          title="Push to talk"
          className="flex-1 w-full rounded-lg border-0"
          allow="microphone; camera; autoplay; encrypted-media"
        />
      </div>
    </div>
  );
}

/* ==========================================================================
   Recent Alerts
   ========================================================================== */

function RecentAlertsPanel({ alarms, assets, sites, towers, scopeTowerIds }) {
  const assetMap = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);
  const update = useUpdateAlarmStatus();
  const [clipInView, setClipInView] = useState(null);
  const scoped = useMemo(() => {
    if (!scopeTowerIds.length) return alarms;
    return alarms.filter((al) =>
      scopeTowerIds.some((gid) => alarmBelongsToGateway(al, gid, assetMap, towers))
    );
  }, [alarms, scopeTowerIds, assetMap, towers]);

  const sorted = useMemo(
    () => scoped.slice().sort((a, b) => new Date(b.createdOn || 0) - new Date(a.createdOn || 0)),
    [scoped]
  );

  // Severity counts for the header chips.
  const counts = useMemo(() => {
    const c = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
    for (const al of sorted) {
      const k = (al.severity || 'LOW').toUpperCase();
      if (k in c) c[k] += 1;
    }
    return c;
  }, [sorted]);

  return (
    <section className="panel p-4 md:p-5">
      <div className="so-panel-head">
        <div className="so-panel-title">
          <AlertOctagon className="so-panel-icon" strokeWidth={2} />
          Recent alerts
        </div>
        <div className="flex items-center gap-1.5">
          {counts.CRITICAL + counts.HIGH > 0 && (
            <SeverityChip count={counts.CRITICAL + counts.HIGH} color="var(--color-danger-400)" label="High" />
          )}
          {counts.MEDIUM > 0 && (
            <SeverityChip count={counts.MEDIUM} color="var(--color-warning-400)" label="Med" />
          )}
          {counts.LOW > 0 && (
            <SeverityChip count={counts.LOW} color="var(--color-ink-2)" label="Low" />
          )}
          <span className="so-panel-meta tabular-nums ml-1">{sorted.length} active</span>
        </div>
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm text-[var(--color-ink-2)] py-6 text-center">All clear in this scope.</p>
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
              onClipClick={(payload) => setClipInView(payload)}
            />
          ))}
        </div>
      )}

      <div className="text-right mt-2">
        <Link to="/alarms" className="text-[11px] font-semibold text-[var(--color-accent-400)] hover:text-[var(--color-accent-300)] inline-flex items-center gap-0.5">
          All alerts <ChevronRight className="w-3 h-3" />
        </Link>
      </div>

      {clipInView && (
        <ClipModal
          title={clipInView.title}
          subtitle={clipInView.subtitle}
          url={clipInView.url}
          onClose={() => setClipInView(null)}
        />
      )}
    </section>
  );
}

function SeverityChip({ count, color, label }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold tabular-nums"
      style={{
        background: `color-mix(in srgb, ${color} 14%, transparent)`,
        color,
        border: `1px solid color-mix(in srgb, ${color} 40%, transparent)`,
      }}
      title={`${count} ${label.toLowerCase()}-priority`}
    >
      {label} {count}
    </span>
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

  // Status-aware action visibility:
  //  • OPEN              → both Ack and Resolve enabled
  //  • ACKNOWLEDGED      → only Resolve (already acked)
  //  • RESOLVED / CLOSED → nothing actionable (row is informational)
  const status = (alarm.status || 'OPEN').toUpperCase();
  const canAck = status === 'OPEN';
  const canResolve = status === 'OPEN' || status === 'ACKNOWLEDGED' || status === 'IN_PROGRESS';

  const mutatingThis = update?.isPending && update.variables?.alarm?.id === alarm.id;
  const ackPending = mutatingThis && update.variables?.status === 'ACKNOWLEDGED';
  const resolvePending = mutatingThis && update.variables?.status === 'RESOLVED';
  const anyPending = ackPending || resolvePending;

  return (
    <div className="so-alert-row" style={{ '--rail': sevMeta.color }}>
      <div className="flex-1 min-w-0">
        <p className="so-alert-title truncate">{alarm.title || 'Alarm'}</p>

        {/* Site → Tower → Camera breadcrumb is display-only on alert rows
            (each segment is just informational). The clip icon next to the
            actions is the only interactive element. */}
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
                onClick={() => onClipClick?.({
                  url: clipUrl,
                  title: alarm.title || 'Alarm clip',
                  subtitle: createdAt
                    ? `${format(createdAt, 'HH:mm dd MMM')}${assetName ? ` · ${assetName}` : ''}`
                    : assetName,
                })}
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
            )}
            {canResolve && update && (
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
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Video2() {
  // Small inline video glyph — reusing the lucide camera icon by name would
  // require an extra import and Lucide's `Video` is already imported as the
  // panel icon for Live camera feeds. This keeps things self-contained.
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
   Environmental telemetry
   ========================================================================== */

function EnvironmentalTelemetryPanel({ tower, assets, allAlarms }) {
  // Temperature + humidity live on the tower's HeatSensorAsset child
  // (a packaged temp/humidity sensor inside the IP67 box). Signal and
  // battery remain tower-level attributes.
  const weather = useMemo(() => getWeatherAssetForTower(tower, assets), [tower, assets]);
  const temp = readNumber(weather?.attributes?.temperature?.value);
  const humidity = readNumber(weather?.attributes?.humidity?.value);
  const signal = readNumber(tower?.attributes?.signalStrength?.value);
  const battery = readNumber(tower?.attributes?.batteryLevel?.value);
  const updatedAt = parseDate(weather?.attributes?.temperature?.timestamp)
                 || parseDate(tower?.attributes?.connected?.timestamp)
                 || parseDate(tower?.lastModified);

  // Detections past 8 hours, sourced from alarms (every detection raises
  // one — same logic as the "Detections today" KPI). Scoped to this tower
  // so the bars reflect what's been happening at the selected location.
  const buckets = useMemo(() => {
    if (!tower) return Array(8).fill(0);
    const assetMap = new Map(assets.map((a) => [a.id, a]));
    const towerAlarms = (allAlarms || []).filter((al) =>
      alarmBelongsToGateway(al, tower.id, assetMap, [tower])
    );
    const now = new Date().getTime();
    const start = now - 8 * 3600 * 1000;
    const out = Array(8).fill(0);
    for (const al of towerAlarms) {
      const ts = parseDate(al.createdOn);
      if (!ts || ts < start || ts > now) continue;
      const i = Math.min(7, Math.floor((ts - start) / (3600 * 1000)));
      out[i] += 1;
    }
    return out;
  }, [tower, assets, allAlarms]);
  const maxBucket = Math.max(1, ...buckets);
  const totalDetections = buckets.reduce((s, n) => s + n, 0);

  return (
    <section className="panel p-4 md:p-5">
      <div className="so-panel-head">
        <div className="so-panel-title">
          <Thermometer className="so-panel-icon" strokeWidth={2} />
          Environmental telemetry
        </div>
        <RefreshButton queryKey={['assets']} title="Refresh telemetry" />
      </div>

      {!tower ? (
        <p className="text-sm text-[var(--color-ink-2)] py-6 text-center">Select a tower to view telemetry.</p>
      ) : (
        <>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-ink-3)]">
            {getAssetDisplayName(tower)} · updated {updatedAt ? `${formatDistanceToNowStrict(updatedAt)} ago` : '—'}
          </p>

          <div className="mt-3">
            <EnvRow icon={Thermometer} label="Temperature" value={temp != null ? `${temp.toFixed(0)}°C` : '—'} pct={temp != null ? clamp01(temp / 60) : null} />
            <EnvRow icon={Droplets} label="Humidity" value={humidity != null ? `${humidity.toFixed(0)}%` : '—'} pct={humidity != null ? clamp01(humidity / 100) : null} />
            <EnvRow icon={Signal} label="Signal (4G)" value={signal != null ? `${signal} dBm` : '—'} pct={signal != null ? clamp01((signal + 110) / 60) : null} />
            <EnvRow icon={BatteryCharging} label="Battery backup" value={battery != null ? `${battery.toFixed(0)}%` : '—'} pct={battery != null ? clamp01(battery / 100) : null} />
          </div>

          <div className="flex items-end justify-between gap-2 mt-4">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-ink-3)]">
              Detections — past 8 hours
            </p>
            <p className="text-[11px] font-semibold tabular-nums text-[var(--color-ink-1)]">
              {totalDetections} total
            </p>
          </div>
          <div className="so-bars">
            {buckets.map((n, i) => (
              <span
                key={i}
                data-active={i === buckets.length - 1 && n > 0}
                style={{ height: `${Math.max(4, (n / maxBucket) * 100)}%` }}
                title={`${n} detection${n === 1 ? '' : 's'} · ${formatHourLabel(i, buckets.length)}`}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function EnvRow({ icon: Icon, label, value, pct }) {
  return (
    <div className="so-env-row">
      <span className="inline-flex items-center gap-2 text-[var(--color-ink-1)]">
        <Icon className="w-3.5 h-3.5 text-[var(--color-ink-2)]" strokeWidth={2} />
        {label}
      </span>
      <span className="so-env-bar">
        <span style={{ width: pct != null ? `${pct * 100}%` : '0%' }} />
      </span>
      <span className="text-right tabular-nums text-[var(--color-ink-0)] font-semibold">{value}</span>
    </div>
  );
}

/* ==========================================================================
   Audit log
   ========================================================================== */

/**
 * Audit log
 *
 * Persistence: every row is sourced from server-stored data, so the panel is
 * stable across page reloads (no in-memory ring buffer).
 *
 *   1. Alarms — `useAlarms({})` returns the full alarm history. Each alarm
 *      yields one "raised" event at `createdOn` and (when applicable) a
 *      transition event at `lastModified` (Acknowledged / Resolved / Closed).
 *
 *   2. Tower-level `auditLog` attribute — optional. If a tower carries an
 *      `auditLog` array attribute (populated by a backend rule on every
 *      device write — shape: `[{ ts, actor, action, target, tag? }]`), we
 *      surface those entries too. This is how device-state-change rows show
 *      up *persistently*. If the attribute isn't declared on any tower, the
 *      audit log silently falls back to alarms only.
 *
 * Scope: filtered by the global site dropdown only (NOT the selected tower).
 * The `towers` prop is already restricted to the chosen site by the parent;
 * "All Sites" means towers spans every site.
 */
/**
 * Audit log panel — small preview of the full /audit page.
 *
 * Persistence: every row is sourced from server-stored data
 *   (alarms + per-tower `auditLog` attribute) so the list survives reloads.
 *
 * Scope: filtered by the global site dropdown only — NOT the selected tower.
 * The `towers` prop is already restricted to the chosen site by the parent.
 */
function AuditLogPanel({ alarms, assets, sites, towers }) {
  const assetMap = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);
  const scopeTowerIds = useMemo(() => towers.map((t) => t.id), [towers]);

  const rows = useMemo(() => {
    const ctx = { assetMap, sites, towers };
    const fromAlarms = (alarms || [])
      .filter((al) => {
        if (!scopeTowerIds.length) return true;
        return scopeTowerIds.some((gid) => alarmBelongsToGateway(al, gid, assetMap, towers));
      })
      .flatMap((al) => alarmAuditEvents(al, ctx));

    const fromTowerLogs = (towers || []).flatMap((t) => towerAuditEvents(t));

    return [...fromAlarms, ...fromTowerLogs].sort((a, b) => b.ts - a.ts);
  }, [alarms, towers, sites, scopeTowerIds, assetMap]);

  return (
    <section className="panel p-4 md:p-5">
      <div className="so-panel-head">
        <div className="so-panel-title">
          <ScrollText className="so-panel-icon" strokeWidth={2} />
          Audit log
        </div>
        <span className="so-panel-meta tabular-nums">
          {rows.length} event{rows.length === 1 ? '' : 's'}
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-[var(--color-ink-2)] py-6 text-center">
          No audit events yet.
        </p>
      ) : (
        <div className="so-audit-list">
          {rows.map((r, i) => (
            <div key={`${r.ts}-${i}`} className="so-audit-row">
              <span className="so-audit-time">{format(r.ts, 'HH:mm')}</span>
              <r.icon className="w-4 h-4 text-[var(--color-ink-2)]" strokeWidth={1.75} />
              <span className="truncate text-[var(--color-ink-0)]">{r.title}</span>
              <span className={`so-audit-tag is-${r.tagTone}`}>{r.tag}</span>
            </div>
          ))}
        </div>
      )}

      <div className="text-right mt-2">
        <Link
          to="/audit"
          className="text-[11px] font-semibold text-[var(--color-accent-400)] hover:text-[var(--color-accent-300)] inline-flex items-center gap-0.5"
        >
          Full audit trail <ChevronRight className="w-3 h-3" />
        </Link>
      </div>
    </section>
  );
}

/* ==========================================================================
   Per-tower derived summary
   ========================================================================== */

function summariseTower(tower, allAssets, openAlarms) {
  const children = pickGatewayChildren(allAssets, tower.id);
  const cameras = children.filter((c) => getCustomAssetType(c) === 'CameraAsset').length;
  const sensors = children.filter((c) => {
    const t = getCustomAssetType(c);
    return t && t.endsWith('SensorAsset');
  }).length;
  const connected = tower.attributes?.connected?.value !== false;
  const assetIds = new Set(children.map((c) => c.id));
  assetIds.add(tower.id);
  const alarmsHere = (openAlarms || []).filter((al) => {
    if (Array.isArray(al.asset)) return al.asset.some((a) => a && assetIds.has(a.id));
    if (al.assetId) return assetIds.has(al.assetId);
    return false;
  });
  const intrusion = alarmsHere.some((a) => /intrus|unauth|breach|forced/i.test(a.title || ''));
  return {
    id: tower.id,
    name: getAssetDisplayName(tower),
    connected,
    cameras,
    sensors,
    openAlarms: alarmsHere.length,
    intrusion,
    connectionType: tower.attributes?.connectionType?.value || tower.attributes?.network?.value || null,
  };
}

/* ==========================================================================
   Misc helpers
   ========================================================================== */

function readNumber(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
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
function clamp01(x) { return Math.max(0, Math.min(1, x)); }
function formatHourLabel(i, total) {
  // Bucket i covers (now - (total-i) hours, now - (total-i-1) hours].
  const hoursAgo = total - i;
  return hoursAgo === 1 ? 'within the last hour' : `${hoursAgo}h ago → ${hoursAgo - 1}h ago`;
}
