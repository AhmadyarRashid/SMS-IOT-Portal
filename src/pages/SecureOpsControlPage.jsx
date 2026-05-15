import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDistanceToNowStrict } from 'date-fns';
import {
  SlidersHorizontal, Video as VideoIcon, RadioTower,
  Thermometer, Droplets, Maximize2,
} from 'lucide-react';
import { useAssets, useWriteAttribute } from '../hooks/useAssets';
import {
  pickSites, pickTowersForSite, pickGatewayChildren,
  getWeatherAssetForTower, getCameraStreamUrl,
} from '../utils/gateways';
import {
  getAssetDisplayName, getCustomAssetType, getAssetTypeLabel,
  isAssetActive, getPrimaryControlAttr, nextToggleValue, getStateLabel,
  normalizeAssetType, CONTROLLABLE_TYPES,
} from '../utils/assetIcons';
import AssetGlyph from '../components/tiles/AssetGlyph';
import CameraStream from '../components/cameras/CameraStream';
import CameraFullView from '../components/cameras/CameraFullView';
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
  // Video tab.
  const cameras = useMemo(
    () => children.filter((c) => normalizeAssetType(getCustomAssetType(c)) === 'CameraAsset').slice(0, 2),
    [children]
  );

  const controllables = useMemo(
    () => children.filter((c) =>
      CONTROLLABLE_TYPES.includes(normalizeAssetType(getCustomAssetType(c)))
    ),
    [children]
  );

  const weather = useMemo(() => getWeatherAssetForTower(activeTower, assets), [activeTower, assets]);

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
            <CamerasPanel cameras={cameras} towerId={activeTower.id} />
            <EnvironmentPanel weather={weather} />
          </div>

          {/* ===== Controllable devices ===== */}
          <ControlsPanel assets={controllables} />
        </>
      )}
    </div>
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

function CamerasPanel({ cameras }) {
  const [fullCam, setFullCam] = useState(null);

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
            <CameraTile key={cam.id} camera={cam} onOpen={setFullCam} />
          ))}
        </div>
      )}

      {fullCam && (
        <CameraFullView camera={fullCam} onClose={() => setFullCam(null)} />
      )}
    </section>
  );
}

function CameraTile({ camera, onOpen }) {
  const url = getCameraStreamUrl(camera);
  const offline = camera.attributes?.connected?.value === false;
  const code = shortCamCode(camera);
  const name = getAssetDisplayName(camera);

  // Button instead of Link — clicking opens the full-view modal owned by
  // the parent panel rather than navigating away to the asset detail page.
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
        <span className="so-cam-pill is-rec">Rec</span>
      </div>
      <div className="so-cam-foot truncate flex items-center justify-between gap-2">
        <span className="truncate">{name}</span>
        <span className="inline-flex items-center gap-1 text-[10px] opacity-80">
          <Maximize2 className="w-3 h-3" />
        </span>
      </div>
    </button>
  );
}

function shortCamCode(camera) {
  const m = (camera?.name || '').match(/CAM[-\s_]?(\d{1,3})/i);
  if (m) return `CAM-${m[1].padStart(2, '0')}`;
  return 'CAM';
}

/* ==========================================================================
   Environment panel — temp + humidity from the tower's HeatSensorAsset
   ========================================================================== */

function EnvironmentPanel({ weather }) {
  const temp = readNumber(weather?.attributes?.temperature?.value);
  const humidity = readNumber(weather?.attributes?.humidity?.value);
  const updatedAt = parseDate(weather?.attributes?.temperature?.timestamp)
                 || parseDate(weather?.attributes?.humidity?.timestamp)
                 || parseDate(weather?.lastModified);

  return (
    <section className="panel p-4 md:p-5">
      <div className="so-panel-head">
        <div className="so-panel-title">
          <Thermometer className="so-panel-icon" strokeWidth={2} />
          Environment
        </div>
      </div>

      {!weather ? (
        <p className="text-sm text-[var(--color-ink-2)] py-6 text-center">
          No HeatSensorAsset under this tower.
        </p>
      ) : (
        <>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-ink-3)]">
            {getAssetDisplayName(weather)} · updated {updatedAt ? `${formatDistanceToNowStrict(updatedAt)} ago` : '—'}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <EnvBigStat
              icon={Thermometer}
              label="Temperature"
              value={temp != null ? `${temp.toFixed(1)}°C` : '—'}
              tone="warning"
            />
            <EnvBigStat
              icon={Droplets}
              label="Humidity"
              value={humidity != null ? `${humidity.toFixed(0)}%` : '—'}
              tone="accent"
            />
          </div>
        </>
      )}
    </section>
  );
}

function EnvBigStat({ icon: Icon, label, value, tone }) {
  const color = tone === 'warning' ? 'var(--color-warning-400)' : 'var(--color-accent-400)';
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

function ControlsPanel({ assets }) {
  return (
    <section className="panel p-4 md:p-5">
      <div className="so-panel-head">
        <div className="so-panel-title">
          <SlidersHorizontal className="so-panel-icon" strokeWidth={2} />
          Controls
        </div>
        <span className="so-panel-meta tabular-nums">
          {assets.length} device{assets.length === 1 ? '' : 's'}
        </span>
      </div>

      {assets.length === 0 ? (
        <p className="text-sm text-[var(--color-ink-2)] py-6 text-center">
          No controllable devices under this tower.
        </p>
      ) : (
        <div className="so-controls-grid">
          {assets.map((a) => (
            <ControllableTile key={a.id} asset={a} />
          ))}
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
