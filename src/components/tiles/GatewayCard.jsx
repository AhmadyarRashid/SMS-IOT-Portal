import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Server, Zap, Thermometer, Unlock, Bell, Activity,
  ArrowRight, Wifi, WifiOff,
} from 'lucide-react';
import { pickGatewayChildren, summariseGateway } from '../../utils/gateways';
import { getCustomAssetType, isAssetActive } from '../../utils/assetIcons';

/**
 * Rich Home Assistant-style site card. Shows:
 *   • connection dot + site name
 *   • coloured health bar (online %)
 *   • 4 live aggregate readings pulled from the site's devices
 *   • "Enter site" CTA
 *
 * Tinted by health — green/cyan when fine, red when alarms exist.
 */
export default function GatewayCard({ gateway, assets = [] }) {
  const children = pickGatewayChildren(assets, gateway.id);
  const { total, online, offline, alarming } = summariseGateway(children);
  const connected = gateway.attributes?.connected?.value !== false;

  // --- Live aggregates across this gateway's child devices ----------------
  const plugs = children.filter((c) => getCustomAssetType(c) === 'PlugAsset');
  const power = plugs.reduce((s, p) => {
    const v = Number(p.attributes?.power?.value);
    return Number.isFinite(v) ? s + v : s;
  }, 0);

  const heats = children.filter((c) => getCustomAssetType(c) === 'HeatSensorAsset');
  const temps = heats.map((h) => Number(h.attributes?.temperature?.value)).filter(Number.isFinite);
  const avgTemp = temps.length ? temps.reduce((a, b) => a + b, 0) / temps.length : null;

  const doorLocks = children.filter((c) => getCustomAssetType(c) === 'DoorLockAsset');
  // DoorLock convention: active === true means "Locked".
  // So a door is unlocked when it is NOT active.
  const doorsUnlocked = doorLocks.filter((d) => !isAssetActive(d, 'DoorLockAsset')).length;

  const activeCount = children.filter((c) => {
    const t = getCustomAssetType(c);
    if (!['LightAsset', 'PlugAsset', 'FanAsset'].includes(t)) return false;
    return isAssetActive(c, t);
  }).length;

  // --- Styling keyed on health -------------------------------------------
  const healthPct = total > 0 ? Math.round((online / total) * 100) : 100;
  const mood = alarming > 0 ? 'alarm' : offline > 0 ? 'warning' : 'ok';

  const moodStyles = {
    ok: {
      accent: 'var(--color-accent-500)',
      accentSoft: 'color-mix(in srgb, var(--color-accent-500) 14%, transparent)',
      border: 'color-mix(in srgb, var(--color-accent-500) 35%, transparent)',
      barBg: 'linear-gradient(90deg, var(--color-accent-500), var(--color-accent-400))',
      halo: 'radial-gradient(600px 160px at 0% 0%, color-mix(in srgb, var(--color-accent-500) 22%, transparent), transparent 60%)',
      glow: '0 16px 40px -20px color-mix(in srgb, var(--color-accent-500) 55%, transparent)',
    },
    warning: {
      accent: 'var(--color-warning-500)',
      accentSoft: 'color-mix(in srgb, var(--color-warning-500) 16%, transparent)',
      border: 'color-mix(in srgb, var(--color-warning-500) 40%, transparent)',
      barBg: 'linear-gradient(90deg, var(--color-warning-500), var(--color-warning-400))',
      halo: 'radial-gradient(600px 160px at 0% 0%, color-mix(in srgb, var(--color-warning-500) 22%, transparent), transparent 60%)',
      glow: '0 16px 40px -20px color-mix(in srgb, var(--color-warning-500) 45%, transparent)',
    },
    alarm: {
      accent: 'var(--color-danger-500)',
      accentSoft: 'color-mix(in srgb, var(--color-danger-500) 18%, transparent)',
      border: 'color-mix(in srgb, var(--color-danger-500) 50%, transparent)',
      barBg: 'linear-gradient(90deg, var(--color-danger-500), var(--color-danger-400))',
      halo: 'radial-gradient(600px 160px at 0% 0%, color-mix(in srgb, var(--color-danger-500) 26%, transparent), transparent 60%)',
      glow: '0 16px 40px -20px color-mix(in srgb, var(--color-danger-500) 55%, transparent)',
    },
  }[mood];

  return (
    <motion.div whileHover={{ y: -3 }} transition={{ type: 'spring', stiffness: 320, damping: 22 }}>
      <Link
        to={`/g/${gateway.id}`}
        className="block relative overflow-hidden rounded-[var(--radius-card)] border transition-colors h-full"
        style={{
          background: `${moodStyles.halo}, var(--color-surface-1)`,
          borderColor: moodStyles.border,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.boxShadow = moodStyles.glow; }}
        onMouseLeave={(e) => { e.currentTarget.style.boxShadow = ''; }}
      >
        {/* Top-right live indicator */}
        {activeCount > 0 && (
          <div className="absolute top-4 right-4 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold"
               style={{
                 background: 'color-mix(in srgb, var(--color-accent-500) 18%, transparent)',
                 color: 'var(--color-accent-400)',
               }}>
            <span className="status-dot status-dot-on pulse" />
            {activeCount} live
          </div>
        )}

        <div className="p-5">
          {/* Header — icon + name + connection */}
          <div className="flex items-start gap-3 mb-4">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
                 style={{ background: moodStyles.accentSoft, color: moodStyles.accent }}>
              <Server className="w-6 h-6" strokeWidth={1.75} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-bold text-[var(--color-ink-0)] truncate leading-tight">
                {gateway.name}
              </h3>
              <p className="text-xs text-[var(--color-ink-2)] mt-0.5 flex items-center gap-1.5">
                {connected ? (
                  <>
                    <Wifi className="w-3 h-3" style={{ color: moodStyles.accent }} />
                    <span>Connected</span>
                  </>
                ) : (
                  <>
                    <WifiOff className="w-3 h-3 text-[var(--color-ink-3)]" />
                    <span>Offline gateway</span>
                  </>
                )}
                <span className="text-[var(--color-ink-3)]">·</span>
                <span>{total} device{total === 1 ? '' : 's'}</span>
              </p>
            </div>
          </div>

          {/* Health bar */}
          <div className="mb-5">
            <div className="flex items-center justify-between text-[11px] mb-1.5">
              <span className="text-[var(--color-ink-2)] uppercase tracking-wide font-medium">Online</span>
              <span className="font-bold tabular-nums" style={{ color: moodStyles.accent }}>
                {healthPct}%
                <span className="ml-1 text-[var(--color-ink-3)] font-normal">({online}/{total})</span>
              </span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden"
                 style={{ background: 'color-mix(in srgb, var(--color-ink-0) 8%, transparent)' }}>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${healthPct}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
                className="h-full rounded-full"
                style={{ background: moodStyles.barBg }}
              />
            </div>
          </div>

          {/* Live readings grid */}
          <div className="grid grid-cols-4 gap-2 mb-5">
            <Reading icon={Zap}         value={power > 0 ? `${power.toFixed(0)}W` : '—'} label="Power" />
            <Reading icon={Thermometer} value={avgTemp != null ? `${avgTemp.toFixed(1)}°` : '—'} label="Temp" />
            <Reading icon={Unlock}      value={doorLocks.length ? `${doorsUnlocked}/${doorLocks.length}` : '—'} label="Doors" tone={doorsUnlocked > 0 ? 'warning' : 'default'} />
            <Reading icon={Bell}        value={alarming} label="Alarms" tone={alarming > 0 ? 'alarm' : 'default'} />
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between pt-3 border-t"
               style={{ borderColor: 'color-mix(in srgb, var(--color-ink-0) 6%, transparent)' }}>
            <span className="inline-flex items-center gap-1.5 text-[11px] text-[var(--color-ink-2)]">
              <Activity className="w-3 h-3" />
              {activeCount > 0 ? `${activeCount} device${activeCount === 1 ? '' : 's'} active` : 'All quiet'}
            </span>
            <span className="inline-flex items-center gap-1 text-xs font-semibold"
                  style={{ color: moodStyles.accent }}>
              Enter site
              <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

function Reading({ icon: Icon, value, label, tone = 'default' }) {
  const color =
    tone === 'alarm'   ? 'var(--color-danger-400)' :
    tone === 'warning' ? 'var(--color-warning-400)' :
    'var(--color-ink-1)';
  return (
    <div className="rounded-xl p-2 text-center"
         style={{ background: 'color-mix(in srgb, var(--color-ink-0) 4%, transparent)' }}>
      <Icon className="w-3.5 h-3.5 mx-auto mb-1" style={{ color: 'var(--color-ink-2)' }} strokeWidth={1.75} />
      <p className="text-sm font-bold tabular-nums" style={{ color }}>{value}</p>
      <p className="text-[9px] uppercase tracking-wider text-[var(--color-ink-3)]">{label}</p>
    </div>
  );
}
