import { useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Server, Cpu, Bell, Wifi, WifiOff,
} from 'lucide-react';
import { useAsset, useGatewayChildren, useAlarms } from '../hooks/useAssets';
import { groupByCustomType, summariseGateway } from '../utils/gateways';
import { getAssetTypeLabel } from '../utils/assetIcons';
import AssetTile from '../components/tiles/AssetTile';
import AssetGlyph from '../components/tiles/AssetGlyph';
import { LoadingSpinner, EmptyState } from '../components/ui';

/**
 * Lovelace-style display order. Security-critical groups first, then lighting
 * and switches, then panels. This is the same order HA recommends for a home
 * dashboard (safety > comfort > utility).
 */
const GROUP_ORDER = [
  'AlarmAsset', 'SOSAsset', 'SmokeSensorAsset',
  'CameraAsset',
  'DoorLockAsset', 'DoorSensorAsset',
  'MotionSensorAsset', 'HumanPresenceSensorAsset',
  'HeatSensorAsset', 'VibrationSensorAsset',
  'LightAsset', 'PlugAsset', 'FanAsset',
  'PanelAsset',
];

/** Human-friendly section title per customAssetType. */
const GROUP_TITLE = {
  AlarmAsset: 'Security',
  SOSAsset: 'Emergency',
  SmokeSensorAsset: 'Smoke',
  CameraAsset: 'Cameras',
  DoorLockAsset: 'Locks',
  DoorSensorAsset: 'Doors',
  MotionSensorAsset: 'Motion',
  HumanPresenceSensorAsset: 'Presence',
  HeatSensorAsset: 'Temperature',
  VibrationSensorAsset: 'Vibration',
  LightAsset: 'Lights',
  PlugAsset: 'Plugs',
  FanAsset: 'Fans',
  PanelAsset: 'Panels',
};

export default function GatewayPage() {
  const { id } = useParams();
  const { data: gateway, isLoading: gLoad } = useAsset(id);
  const { data: children = [], isLoading: cLoad } = useGatewayChildren(id);
  const { data: alarms = [] } = useAlarms({ status: 'OPEN' });

  const grouped = useMemo(() => groupByCustomType(children), [children]);
  const groupKeys = useMemo(() => {
    const keys = Object.keys(grouped);
    return keys.sort((a, b) => {
      const ai = GROUP_ORDER.indexOf(a);
      const bi = GROUP_ORDER.indexOf(b);
      if (ai === -1 && bi === -1) return a.localeCompare(b);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
  }, [grouped]);

  const summary = summariseGateway(children);
  const gatewayAlarms = (alarms || []).filter(
    (a) => children.some((c) => c.id === a.assetId) || a.assetId === id
  );

  if (gLoad || cLoad) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!gateway) {
    return (
      <div className="p-6">
        <EmptyState
          icon={Server}
          title="Site not found"
          message="This gateway may have been removed or you don't have access."
          action={
            <Link to="/" className="text-sm text-[var(--color-accent-400)] hover:text-[var(--color-accent-300)]">
              Back to overview
            </Link>
          }
        />
      </div>
    );
  }

  const connected = gateway.attributes?.connected?.value !== false;

  return (
    <div className="p-4 md:p-6 max-w-[1280px] mx-auto space-y-6">
      <Link to="/sites" className="inline-flex items-center gap-1.5 text-xs text-[var(--color-ink-2)] hover:text-[var(--color-ink-0)]">
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to sites
      </Link>

      {/* Header — compact like HA lovelace */}
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
               style={{
                 background: 'color-mix(in srgb, var(--color-accent-500) 16%, transparent)',
                 color: 'var(--color-accent-400)',
               }}>
            <Server className="w-6 h-6" strokeWidth={1.75} />
          </div>
          <div>
            <h1 className="text-[22px] font-bold text-[var(--color-ink-0)] leading-tight">{gateway.name}</h1>
            <p className="text-xs text-[var(--color-ink-2)] mt-0.5 flex items-center gap-1.5">
              {connected ? (
                <>
                  <Wifi className="w-3.5 h-3.5 text-[var(--color-accent-400)]" />
                  <span>Connected</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3.5 h-3.5 text-[var(--color-ink-3)]" />
                  <span>Offline</span>
                </>
              )}
              <span>·</span>
              <span>{summary.total} device{summary.total === 1 ? '' : 's'}</span>
            </p>
          </div>
        </div>

        {/* Compact stat pills */}
        <div className="flex items-center gap-2 flex-wrap">
          <StatPill icon={Cpu} label="Online" value={`${summary.online}/${summary.total}`} tone={summary.offline === 0 ? 'ok' : 'default'} />
          <StatPill icon={Bell} label="Alarms" value={gatewayAlarms.length} tone={gatewayAlarms.length ? 'alarm' : 'default'} />
        </div>
      </header>

      {/* Empty state or the lovelace grid */}
      {children.length === 0 ? (
        <EmptyState
          icon={Cpu}
          title="No devices yet"
          message="Devices linked to this gateway will appear here once registered."
        />
      ) : (
        <motion.div
          initial="hidden"
          animate="show"
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.02 } } }}
          className="space-y-7"
        >
          {groupKeys.map((key) => {
            const items = grouped[key] || [];
            return (
              <motion.section
                key={key}
                variants={{ hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0 } }}
              >
                <SectionHeader
                  title={GROUP_TITLE[key] || getAssetTypeLabel(key)}
                  count={items.length}
                  customType={key}
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-2.5">
                  {items.map((asset) => (
                    <AssetTile key={asset.id} asset={asset} />
                  ))}
                </div>
              </motion.section>
            );
          })}
        </motion.div>
      )}
    </div>
  );
}

function SectionHeader({ title, count, customType }) {
  return (
    <div className="flex items-center justify-between mb-2.5 px-1">
      <div className="flex items-center gap-2 text-[var(--color-ink-2)]">
        <AssetGlyph customType={customType} className="w-3.5 h-3.5" strokeWidth={2} />
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-ink-1)]">
          {title}
        </h2>
        <span className="text-[11px] text-[var(--color-ink-3)] tabular-nums">{count}</span>
      </div>
    </div>
  );
}

function StatPill({ icon: Icon, label, value, tone = 'default' }) {
  const color =
    tone === 'ok'    ? 'var(--color-accent-400)' :
    tone === 'alarm' ? 'var(--color-danger-400)' :
    'var(--color-ink-1)';
  const bg =
    tone === 'alarm'
      ? 'color-mix(in srgb, var(--color-danger-500) 14%, transparent)'
      : tone === 'ok'
        ? 'color-mix(in srgb, var(--color-accent-500) 12%, transparent)'
        : 'color-mix(in srgb, var(--color-ink-0) 6%, transparent)';
  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full"
         style={{ background: bg, color }}>
      <Icon className="w-3.5 h-3.5" strokeWidth={2} />
      <span className="text-[11px] uppercase tracking-wide text-[var(--color-ink-2)]">{label}</span>
      <span className="text-sm font-bold tabular-nums" style={{ color }}>{value}</span>
    </div>
  );
}
