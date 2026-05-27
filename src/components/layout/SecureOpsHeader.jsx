import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutGrid, Video, Bell, SlidersHorizontal, ScrollText, Settings,
  ChevronDown, Check, Thermometer, Droplets, Signal, BatteryCharging,
} from 'lucide-react';
import { useAssets } from '../../hooks/useAssets';
import { pickSites, pickTowersForSite, getWeatherAssetForTower } from '../../utils/gateways';
import { getAssetDisplayName, getCustomAssetType, normalizeAssetType } from '../../utils/assetIcons';
import useSecureOpsStore from '../../store/secureOpsStore';

const TABS = [
  { to: '/',         label: 'Overview',   icon: LayoutGrid, end: true },
  { to: '/video',    label: 'Video',      icon: Video },
  { to: '/alarms',   label: 'Alerts',     icon: Bell },
  { to: '/control',  label: 'Control',    icon: SlidersHorizontal },
  { to: '/audit',    label: 'Audit log',  icon: ScrollText },
  { to: '/settings', label: 'Settings',   icon: Settings },
];

/**
 * SecureOps top bar — fixed shell across every tab.
 *
 *   ┌──────────────────────────────────────────────────────────────────────┐
 *   │  ◐  SecureOps Platform                            ● Live   ▾ All Sites│
 *   │     Digital Security Management Console                              │
 *   ├──────────────────────────────────────────────────────────────────────┤
 *   │  Overview · Video · Alerts · Control · Audit log · Settings · 🌡 31°·💧55%│
 *   └──────────────────────────────────────────────────────────────────────┘
 *
 * Temp / humidity chips show the **selected tower's** environmental telemetry,
 * pulled from `temperature` and `humidity` attributes. Chips hide when the
 * tower does not declare those attributes (per the no-placeholder rule).
 */
export default function SecureOpsHeader() {
  const { data: assets = [] } = useAssets({});
  const { selectedSiteId, selectedTowerId, setSite } = useSecureOpsStore();

  const sites = useMemo(() => pickSites(assets), [assets]);

  // "Scope towers" = all towers in the selected site, or every tower across
  // all sites when no site is picked.
  const scopeTowers = useMemo(() => {
    if (selectedSiteId) return pickTowersForSite(assets, selectedSiteId);
    return sites.flatMap((s) => pickTowersForSite(assets, s.id));
  }, [assets, sites, selectedSiteId]);

  // Active tower — used to fetch the env telemetry chips.
  const activeTower = useMemo(() => {
    if (selectedTowerId) {
      const t = scopeTowers.find((x) => x.id === selectedTowerId);
      if (t) return t;
    }
    return scopeTowers[0] || null;
  }, [scopeTowers, selectedTowerId]);

  // Environmental telemetry chips for the active tower:
  //   • Temp + humidity come from the tower's HeatSensorAsset child (a
  //     packaged weather sensor inside the IP67 box).
  //   • Signal + battery live on the TowerAsset itself.
  // Each chip hides when its attribute isn't declared (no-placeholder rule).
  const weather = useMemo(() => getWeatherAssetForTower(activeTower, assets), [activeTower, assets]);
  const temp = readNumber(weather?.attributes?.temperature?.value);
  const humidity = readNumber(weather?.attributes?.humidity?.value);
  const signal = readNumber(activeTower?.attributes?.signalStrength?.value);
  const battery = readNumber(activeTower?.attributes?.batteryLevel?.value);

  return (
    <div
      className="border-b sticky top-0 z-30"
      style={{
        background: 'var(--color-surface-1)',
        borderColor: 'color-mix(in srgb, var(--color-ink-0) 8%, transparent)',
      }}
    >
      {/* Row 1: brand + live + city dropdown */}
      <div className="flex items-center justify-between gap-3 px-4 md:px-6 py-3">
        <NavLink to="/" end className="flex items-center min-w-0 shrink-0" aria-label="SMS Sentinel AI — Overview">
          <img
            src="/telco-logo.jpeg"
            alt="SMS Sentinel AI — Intelligence that protects"
            className="h-10 md:h-12 w-auto object-contain"
          />
        </NavLink>

        <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
          <LivePill />
          <SiteDropdown
            sites={sites}
            selectedSiteId={selectedSiteId}
            onSelect={setSite}
            allCount={sites.length || pickAllTowerCount(assets)}
          />
        </div>
      </div>

      {/* Row 2: tab strip + telemetry chips */}
      <div className="flex items-center justify-between gap-2 px-2 md:px-4 overflow-x-auto">
        <nav className="flex items-center gap-0.5">
          {TABS.map((t) => (
            <TabLink key={t.to} {...t} />
          ))}
        </nav>
        <div className="flex items-center gap-2 flex-shrink-0 pl-2 py-2">
          {temp != null && (
            <span className="secureops-chip" title={`Tower ${getAssetDisplayName(activeTower)} temperature`}>
              <Thermometer className="w-3.5 h-3.5" strokeWidth={2} />
              <span className="tabular-nums">{temp.toFixed(0)}°C</span>
            </span>
          )}
          {humidity != null && (
            <span className="secureops-chip" title="Humidity">
              <Droplets className="w-3.5 h-3.5" strokeWidth={2} />
              <span className="tabular-nums">{humidity.toFixed(0)}%</span>
            </span>
          )}
          {signal != null && (
            <span className="secureops-chip" title="Signal strength (4G)">
              <Signal className="w-3.5 h-3.5" strokeWidth={2} />
              <span className="tabular-nums">{signal} dBm</span>
            </span>
          )}
          {battery != null && (
            <span className="secureops-chip" title="Battery backup">
              <BatteryCharging className="w-3.5 h-3.5" strokeWidth={2} />
              <span className="tabular-nums">{battery.toFixed(0)}%</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function TabLink({ to, label, icon: Icon, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `inline-flex items-center gap-1.5 px-3 py-2.5 text-[13px] font-semibold border-b-2 transition-colors whitespace-nowrap ${
          isActive
            ? 'text-[var(--color-accent-400)] border-[var(--color-accent-500)]'
            : 'text-[var(--color-ink-2)] border-transparent hover:text-[var(--color-ink-0)]'
        }`
      }
    >
      <Icon className="w-4 h-4" strokeWidth={1.75} />
      {label}
    </NavLink>
  );
}

function LivePill() {
  return (
    <span
      className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold"
      style={{
        background: 'color-mix(in srgb, var(--color-danger-500) 14%, transparent)',
        color: 'var(--color-danger-400)',
        border: '1px solid color-mix(in srgb, var(--color-danger-500) 40%, transparent)',
      }}
    >
      <span className="inline-block w-1.5 h-1.5 rounded-full pulse" style={{ background: 'currentColor' }} />
      Live
    </span>
  );
}

function SiteDropdown({ sites, selectedSiteId, onSelect, allCount }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const selected = sites.find((s) => s.id === selectedSiteId);
  const label = selected ? getAssetDisplayName(selected) : `All Sites (${allCount})`;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-semibold"
        style={{
          background: 'color-mix(in srgb, var(--color-ink-0) 6%, transparent)',
          border: '1px solid color-mix(in srgb, var(--color-ink-0) 10%, transparent)',
          color: 'var(--color-ink-0)',
        }}
      >
        <span className="truncate max-w-[180px]">{label}</span>
        <ChevronDown className="w-3.5 h-3.5 text-[var(--color-ink-2)]" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 top-full mt-1 z-40 min-w-[220px] panel"
            style={{ padding: 6 }}
          >
            <SiteOption
              label={`All Sites (${allCount})`}
              active={!selectedSiteId}
              onClick={() => { onSelect(null); setOpen(false); }}
            />
            {sites.length === 0 && (
              <p className="px-3 py-2 text-[11px] text-[var(--color-ink-3)]">
                No SiteAssets configured. Showing every tower as "All Sites".
              </p>
            )}
            {sites.map((s) => (
              <SiteOption
                key={s.id}
                label={getAssetDisplayName(s)}
                active={selectedSiteId === s.id}
                onClick={() => { onSelect(s.id); setOpen(false); }}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SiteOption({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-left text-sm transition-colors"
      style={{
        background: active ? 'color-mix(in srgb, var(--color-accent-500) 14%, transparent)' : 'transparent',
        color: active ? 'var(--color-accent-300)' : 'var(--color-ink-1)',
      }}
    >
      <span className="truncate">{label}</span>
      {active && <Check className="w-3.5 h-3.5" />}
    </button>
  );
}

function readNumber(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Fallback "All Sites" count when there are no CityAssets in the realm —
 * we count every tower (gateway) so the dropdown isn't blank.
 */
function pickAllTowerCount(assets) {
  let n = 0;
  for (const a of assets || []) {
    if (a.type === 'GatewayAsset') { n += 1; continue; }
    if (normalizeAssetType(getCustomAssetType(a)) === 'TowerAsset') n += 1;
  }
  return n;
}
