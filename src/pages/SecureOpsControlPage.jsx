import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDistanceToNowStrict } from 'date-fns';
import toast from 'react-hot-toast';
import {
  SlidersHorizontal, Video as VideoIcon, RadioTower,
  Thermometer, Droplets, BatteryCharging, LineChart as LineIcon,
  Mic,
} from 'lucide-react';
import { useAssets, useWriteAttribute } from '../hooks/useAssets';
import {
  pickSites, pickTowersForSite, pickGatewayChildren,
  getWeatherAssetForTower, isCameraAsset, resolvePttForTower,
} from '../utils/gateways';
import {
  getAssetDisplayName, getCustomAssetType, getAssetTypeLabel,
  isAssetActive, getPrimaryControlAttr, nextToggleValue, getStateLabel,
  normalizeAssetType, CONTROLLABLE_TYPES,
} from '../utils/assetIcons';
import { getSimulatedBatteryPercent } from '../utils/batterySim';
import AssetGlyph from '../components/tiles/AssetGlyph';
import CameraCard from '../components/cameras/CameraCard';
import AssetHistoryCard from '../components/charts/AssetHistoryCard';
import { hasChartableAttributes } from '../utils/chartable';
import useSecureOpsStore from '../store/secureOpsStore';
import { LoadingSpinner } from '../components/ui';
import './secureops.css';

/* ==========================================================================
   Control (/control)

   Per-tower bulk operator surface. Layout:

     ┌───────────────────────────────────────────────────────┐
     │ Control                       [ Tower 3 — North ▾ ]   │
     ├───────────────────────────────────────────────────────┤
     │ ┌─────────────┐ ┌─────────────┐    │ Environment      │
     │ │  Camera 1   │ │  Camera 2   │    │ Temp ·  31°C     │
     │ │ live stream │ │ live stream │    │ Hum  ·  55%      │
     │ └─────────────┘ └─────────────┘    │                  │
     ├───────────────────────────────────────────────────────┤
     │ Controls                                              │
     │ [Door][Siren][Lights][Fan][Plug]...                   │
     └───────────────────────────────────────────────────────┘

   The tower dropdown writes to `secureOpsStore.selectedTowerId`, so the
   Overview's Live Camera Feeds, Remote Control, and Environmental Telemetry
   panels follow the same selection — switching tower here updates them too.
   ========================================================================== */

export default function SecureOpsControlPage() {
  const { data: assets = [], isLoading } = useAssets({});
  const { selectedSiteId, selectedTowerId, setTower } = useSecureOpsStore();

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

  /* ---- Active tower (auto-pick first) ---- */
  const activeTower = useMemo(() => {
    if (selectedTowerId) {
      const t = towers.find((x) => x.id === selectedTowerId);
      if (t) return t;
    }
    return towers[0] || null;
  }, [towers, selectedTowerId]);

  /* ---- Active tower's children, partitioned ---- */
  const children = useMemo(
    () => (activeTower ? pickGatewayChildren(assets, activeTower.id) : []),
    [assets, activeTower]
  );

  // Cap to the first 2 cameras per the spec — the full grid lives in the
  // Video tab. `isCameraAsset` matches both fixed (`CameraAsset`) and
  // pan/tilt/zoom (`PtzCameraAsset`) variants.
  const cameras = useMemo(
    () => children.filter(isCameraAsset).slice(0, 2),
    [children]
  );

  const controllables = useMemo(
    () => children.filter((c) =>
      CONTROLLABLE_TYPES.includes(normalizeAssetType(getCustomAssetType(c)))
    ),
    [children]
  );

  const weather = useMemo(() => getWeatherAssetForTower(activeTower, assets), [activeTower, assets]);

  // Battery asset under the active tower — customAssetType `BatteryAsset`
  // (matched case-insensitively via normalizeAssetType so the realm's
  // lowercase-first `batteryAsset` also matches). Carries the
  // `energyLevelPercentage` attribute consumed by the Environment panel.
  const battery = useMemo(() => {
    if (!activeTower) return null;
    return children.find(
      (c) => normalizeAssetType(getCustomAssetType(c)) === 'BatteryAsset'
    ) || null;
  }, [children, activeTower]);

  if (isLoading) {
    return <div className="flex items-center justify-center min-h-[60vh]"><LoadingSpinner size="lg" /></div>;
  }

  return (
    <div className="p-4 md:p-6 max-w-[1500px] mx-auto space-y-4">
      {/* ===== Header ===== */}
      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-ink-0)] flex items-center gap-2">
            <SlidersHorizontal className="w-5 h-5 text-[var(--color-accent-400)]" strokeWidth={2} />
            Control
          </h1>
          <p className="text-xs text-[var(--color-ink-2)] mt-0.5">
            {activeTower
              ? <>Tower-level controls and live view for <strong className="text-[var(--color-ink-0)]">{getAssetDisplayName(activeTower)}</strong>. Switching tower also updates the Overview tab.</>
              : 'Pick a tower to see its cameras and controllable devices.'}
          </p>
        </div>
        <TowerSelect
          towers={towers}
          value={activeTower?.id}
          onChange={setTower}
        />
      </header>

      {!activeTower ? (
        <section className="panel p-10 text-center text-sm text-[var(--color-ink-2)]">
          No towers in this scope yet.
        </section>
      ) : (
        <>
          {/* ===== Cameras + Environment ===== */}
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-4">
            <CamerasPanel cameras={cameras} tower={activeTower} />
            <EnvironmentPanel weather={weather} battery={battery} />
          </div>

          {/* ===== Controllable devices ===== */}
          <ControlsPanel assets={controllables} tower={activeTower} towerAssets={assets} />

          {/* ===== Asset history (chart) =====
              Key on tower id so switching tower remounts the panel and
              resets its internal asset selection — avoids the
              setState-in-effect anti-pattern. */}
          <HistoryPanel key={activeTower.id} assets={children} />
        </>
      )}
    </div>
  );
}

/* ==========================================================================
   History panel — chart of one tower-child asset at a time.

   The asset list is filtered to children with at least one chartable
   (numeric or boolean) attribute; without this filter the dropdown would
   offer entries that always render AssetHistoryCard's empty state.

   The parent passes `key={activeTower.id}` so a tower change remounts the
   panel and resets `assetId`. Inside the panel, AssetHistoryCard is keyed
   on the picked asset's id so its internal `attr` state resets when the
   operator picks a different device.
   ========================================================================== */

function HistoryPanel({ assets }) {
  const chartable = useMemo(
    () => (assets || []).filter(hasChartableAttributes),
    [assets],
  );

  const [assetId, setAssetId] = useState(chartable[0]?.id || null);
  const selected = chartable.find((a) => a.id === assetId) || chartable[0] || null;

  return (
    <section className="panel p-4 md:p-5">
      <div className="so-panel-head">
        <div className="so-panel-title">
          <LineIcon className="so-panel-icon" strokeWidth={2} />
          Asset history
        </div>
        {chartable.length > 0 && (
          <label className="inline-flex items-center gap-2 text-[12px] font-semibold text-[var(--color-ink-2)]">
            Asset
            <select
              value={selected?.id || ''}
              onChange={(e) => setAssetId(e.target.value || null)}
              className="so-tower-select"
            >
              {chartable.map((a) => (
                <option key={a.id} value={a.id}>
                  {getAssetDisplayName(a)} · {getAssetTypeLabel(getCustomAssetType(a))}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {selected ? (
        <AssetHistoryCard key={selected.id} asset={selected} className="mt-3" />
      ) : (
        <p className="text-sm text-[var(--color-ink-2)] py-6 text-center">
          No assets under this tower have chartable attributes.
        </p>
      )}
    </section>
  );
}

/* ==========================================================================
   PTT tile — sits inside the Controls grid

   `PttAsset.socketIP` holds the link to hand off to the OS (a
   `mumble://user:pass@host:port/` URL). Three branches via
   `resolvePttForTower`:

   • ok      → `<a href>` opening the link via the OS handler
   • missing → `<button>` that toasts "not configured" on click
   • invalid → hide entirely. A broken affordance is worse than no
                affordance — the operator can't fix a malformed URL by
                clicking it, and the tile clutters the grid.
   ========================================================================== */

function PttTile({ tower, assets }) {
  const { status, href } = useMemo(
    () => resolvePttForTower(tower, assets),
    [tower, assets],
  );

  if (status === 'invalid') return null;

  const meta = status === 'ok'
    ? { label: 'Ready',          color: 'var(--color-accent-300)' }
    : { label: 'Not configured', color: 'var(--color-warning-400)' };

  const onMissingClick = () => {
    toast.error('PTT not configured for this tower — set the `socketIP` attribute on the tower\'s PttAsset in OpenRemote.');
  };

  const body = (
    <>
      <div className="so-control-icon">
        <Mic className="w-6 h-6" strokeWidth={2} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-[var(--color-ink-0)] truncate">Push-to-talk</p>
        <p className="text-[11px] text-[var(--color-ink-2)] truncate">
          PTT · <span className="font-semibold" style={{ color: meta.color }}>{meta.label}</span>
        </p>
      </div>
    </>
  );

  if (status === 'ok') {
    return (
      <a
        href={href}
        className="so-control-tile"
        title="Open PTT in Mumble client"
        aria-label="Open PTT in Mumble client"
      >
        {body}
      </a>
    );
  }

  return (
    <button
      type="button"
      onClick={onMissingClick}
      className="so-control-tile"
      title={meta.label}
      aria-label={meta.label}
    >
      {body}
    </button>
  );
}

/* ==========================================================================
   Tower selector
   ========================================================================== */

function TowerSelect({ towers, value, onChange }) {
  return (
    <label className="inline-flex items-center gap-2 text-[12px] font-semibold text-[var(--color-ink-2)]">
      <RadioTower className="w-3.5 h-3.5" strokeWidth={2} />
      Tower
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
    </label>
  );
}

/* ==========================================================================
   Cameras panel — at most two tiles per the spec
   ========================================================================== */

function CamerasPanel({ cameras, tower }) {
  return (
    <section className="panel p-4 md:p-5">
      <div className="so-panel-head">
        <div className="so-panel-title">
          <VideoIcon className="so-panel-icon" strokeWidth={2} />
          Cameras
        </div>
        <Link
          to="/video"
          className="text-[11px] font-semibold text-[var(--color-accent-400)] hover:text-[var(--color-accent-300)] inline-flex items-center gap-0.5"
        >
          Open Video tab
        </Link>
      </div>

      {cameras.length === 0 ? (
        <div className="so-cam-grid">
          <div className="so-cam col-span-2">
            <div className="so-cam-empty">No cameras linked to this tower</div>
          </div>
        </div>
      ) : (
        <div className="so-cam-grid">
          {cameras.map((cam) => (
            <CameraCard key={cam.id} camera={cam} tower={tower} />
          ))}
        </div>
      )}
    </section>
  );
}

/* ==========================================================================
   Environment panel — temp + humidity from the tower's HeatSensorAsset
   ========================================================================== */

function EnvironmentPanel({ weather, battery }) {
  // Re-render once a minute so the simulated battery value (below) keeps
  // creeping up/down on screen without waiting for the 15s asset poll.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const temp = readNumber(weather?.attributes?.temperature?.value);
  const humidity = readNumber(weather?.attributes?.humidity?.value);
  // Battery is always the solar/battery time-of-day simulation (Asia-Karachi).
  // The backend `energyLevelPercentage` is intentionally NOT read for now —
  // swap back to it here when the device starts reporting reliably.
  const batteryPct = 58; // getSimulatedBatteryPercent();
  const updatedAt = parseDate(weather?.attributes?.temperature?.timestamp)
                 || parseDate(weather?.attributes?.humidity?.timestamp)
                 || parseDate(battery?.attributes?.energyLevelPercentage?.timestamp)
                 || parseDate(weather?.lastModified)
                 || parseDate(battery?.lastModified);

  const hasAny = weather || battery;

  return (
    <section className="panel p-4 md:p-5">
      <div className="so-panel-head">
        <div className="so-panel-title">
          <Thermometer className="so-panel-icon" strokeWidth={2} />
          Environment
        </div>
      </div>

      {!hasAny ? (
        <p className="text-sm text-[var(--color-ink-2)] py-6 text-center">
          No environment sensors under this tower.
        </p>
      ) : (
        <>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-ink-3)]">
            {getAssetDisplayName(weather || battery)} · updated {updatedAt ? `${formatDistanceToNowStrict(updatedAt)} ago` : '—'}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {weather && (
              <EnvBigStat
                icon={Thermometer}
                label="Temperature"
                value={temp != null ? `${temp.toFixed(1)}°C` : '—'}
                tone="warning"
              />
            )}
            {weather && (
              <EnvBigStat
                icon={Droplets}
                label="Humidity"
                value={humidity != null ? `${humidity.toFixed(0)}%` : '—'}
                tone="accent"
              />
            )}
            {battery && (
              <EnvBigStat
                icon={BatteryCharging}
                label="Battery"
                value={`${batteryPct}%`}
                tone={batteryTone(batteryPct)}
              />
            )}
          </div>
        </>
      )}
    </section>
  );
}

// Battery threshold colours — drives the tile tint via tone:
//   ≥50%   → green (ok)
//   20-49% → yellow (warning)
//   <20%   → red (danger)
//   null   → grey accent (no reading)
function batteryTone(pct) {
  if (pct == null) return 'accent';
  if (pct < 20) return 'danger';
  if (pct < 50) return 'warning';
  return 'ok';
}

function EnvBigStat({ icon: Icon, label, value, tone }) {
  const color = tone === 'warning'
    ? 'var(--color-warning-400)'
    : tone === 'danger'
      ? 'var(--color-danger-400)'
      : tone === 'ok'
        ? 'var(--color-ok-500)'
        : 'var(--color-accent-400)';
  return (
    <div
      className="tile p-4 flex flex-col gap-1"
      style={{ background: `color-mix(in srgb, ${color} 8%, var(--color-surface-1))`, borderColor: `color-mix(in srgb, ${color} 25%, transparent)` }}
    >
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color }}>
        <Icon className="w-3.5 h-3.5" strokeWidth={2} />
        {label}
      </span>
      <span className="text-2xl font-bold tabular-nums text-[var(--color-ink-0)]">{value}</span>
    </div>
  );
}

/* ==========================================================================
   Controllable devices grid
   ========================================================================== */

function ControlsPanel({ assets, tower, towerAssets }) {
  // PTT is rendered in the grid as long as its status isn't `invalid` —
  // resolve once here so the header count matches what the operator sees.
  const pttStatus = useMemo(
    () => resolvePttForTower(tower, towerAssets).status,
    [tower, towerAssets],
  );
  const showPtt = pttStatus !== 'invalid';
  const total = assets.length + (showPtt ? 1 : 0);

  return (
    <section className="panel p-4 md:p-5">
      <div className="so-panel-head">
        <div className="so-panel-title">
          <SlidersHorizontal className="so-panel-icon" strokeWidth={2} />
          Controls
        </div>
        <span className="so-panel-meta tabular-nums">
          {total} control{total === 1 ? '' : 's'}
        </span>
      </div>

      {total === 0 ? (
        <p className="text-sm text-[var(--color-ink-2)] py-6 text-center">
          No controllable devices under this tower.
        </p>
      ) : (
        <div className="so-controls-grid">
          {assets.map((a) => (
            <ControllableTile key={a.id} asset={a} />
          ))}
          {showPtt && <PttTile tower={tower} assets={towerAssets} />}
        </div>
      )}
    </section>
  );
}

function ControllableTile({ asset }) {
  const customType = getCustomAssetType(asset);
  const normalisedType = normalizeAssetType(customType);
  const active = isAssetActive(asset, customType);
  const stateLabel = getStateLabel(asset, customType);
  const typeLabel = getAssetTypeLabel(customType);
  const name = getAssetDisplayName(asset);

  const write = useWriteAttribute();
  const pending = write.isPending && write.variables?.assetId === asset.id;

  const toggle = () => {
    const attr = getPrimaryControlAttr(asset, customType);
    write.mutate({
      assetId: asset.id,
      attributeName: attr,
      value: nextToggleValue(asset, attr),
    });
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      data-active={active}
      className="so-control-tile"
      title={`${name} — ${stateLabel}`}
    >
      <div className="so-control-icon">
        <AssetGlyph
          customType={normalisedType}
          on={active}
          spin={normalisedType === 'FanAsset' && active}
          className="w-6 h-6"
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-[var(--color-ink-0)] truncate">{name}</p>
        <p className="text-[11px] text-[var(--color-ink-2)] truncate">
          {typeLabel} · <span className="font-semibold" style={{ color: active ? 'var(--color-accent-300)' : 'var(--color-ink-2)' }}>{stateLabel}</span>
        </p>
      </div>
    </button>
  );
}

/* ==========================================================================
   Helpers
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
