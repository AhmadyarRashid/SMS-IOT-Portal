import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  motion, useMotionValue, useSpring, useTransform, useReducedMotion,
} from 'framer-motion';
import {
  Server, Zap, Thermometer, Unlock, Bell, Activity,
  ArrowRight, Wifi, WifiOff,
} from 'lucide-react';
import { pickGatewayChildren, summariseGateway } from '../../utils/gateways';
import { getCustomAssetType, isAssetActive, getAssetDisplayName } from '../../utils/assetIcons';
import './gateway-card.css';

/**
 * Home Assistant-style site card with delight:
 *   • 3D tilt that follows the cursor (disabled if prefers-reduced-motion)
 *   • shine sweep on hover
 *   • mood-keyed radial glow that slowly drifts
 *   • spring on tap, counting-up numbers on mount
 */
export default function GatewayCard({ gateway, assets = [], alarmsCount = null }) {
  const reduceMotion = useReducedMotion();
  const cardRef = useRef(null);
  const [hovered, setHovered] = useState(false);

  // ---- Derived stats ----------------------------------------------------
  const children = useMemo(() => pickGatewayChildren(assets, gateway.id), [assets, gateway.id]);
  const { total, online, offline, alarming: attrAlarming } = summariseGateway(children);
  // Prefer the real OPEN-alarm count from the `/alarm` list (passed by parent).
  // Fall back to attribute-state alarming for callers that don't pass it.
  const alarming = alarmsCount ?? attrAlarming;
  const connected = gateway.attributes?.connected?.value !== false;

  const power = useMemo(() => children
    .filter((c) => getCustomAssetType(c) === 'PlugAsset')
    .reduce((s, p) => {
      const v = Number(p.attributes?.power?.value);
      return Number.isFinite(v) ? s + v : s;
    }, 0), [children]);

  const avgTemp = useMemo(() => {
    const heats = children
      .filter((c) => getCustomAssetType(c) === 'HeatSensorAsset')
      .map((h) => Number(h.attributes?.temperature?.value))
      .filter(Number.isFinite);
    return heats.length ? heats.reduce((a, b) => a + b, 0) / heats.length : null;
  }, [children]);

  const doorLocks = useMemo(
    () => children.filter((c) => getCustomAssetType(c) === 'DoorLockAsset'),
    [children],
  );
  const doorsUnlocked = doorLocks.filter((d) => !isAssetActive(d, 'DoorLockAsset')).length;

  const activeCount = useMemo(() => children.filter((c) => {
    const t = getCustomAssetType(c);
    if (!['LightAsset', 'PlugAsset', 'FanAsset'].includes(t)) return false;
    return isAssetActive(c, t);
  }).length, [children]);

  const healthPct = total > 0 ? Math.round((online / total) * 100) : 100;
  const mood = alarming > 0 ? 'alarm' : offline > 0 ? 'warning' : 'ok';

  // ---- 3D tilt (mouse-follow) -------------------------------------------
  const mx = useMotionValue(0.5);
  const my = useMotionValue(0.5);
  const rotateX = useSpring(useTransform(my, [0, 1], [8, -8]), { stiffness: 180, damping: 18 });
  const rotateY = useSpring(useTransform(mx, [0, 1], [-10, 10]), { stiffness: 180, damping: 18 });

  const shineX = useTransform(mx, [0, 1], ['0%', '100%']);
  const shineY = useTransform(my, [0, 1], ['0%', '100%']);

  const onMove = (e) => {
    if (reduceMotion || !cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    mx.set((e.clientX - rect.left) / rect.width);
    my.set((e.clientY - rect.top) / rect.height);
  };

  const onLeave = () => {
    setHovered(false);
    mx.set(0.5);
    my.set(0.5);
  };

  return (
    <motion.div
      ref={cardRef}
      data-mood={mood}
      className="gw-card-wrap"
      style={reduceMotion ? undefined : { rotateX, rotateY, transformPerspective: 1100 }}
      onMouseMove={onMove}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={onLeave}
      whileTap={{ scale: 0.985 }}
      transition={{ type: 'spring', stiffness: 320, damping: 22 }}
    >
      <Link
        to={`/g/${gateway.id}`}
        className={`gw-card gw-card-${mood}`}
        aria-label={`Open ${getAssetDisplayName(gateway)}`}
      >
        {/* Drifting mood halo */}
        <span className="gw-card-halo" aria-hidden="true" />

        {/* Shine sweep — follows cursor, only visible on hover */}
        <motion.span
          className="gw-card-shine"
          aria-hidden="true"
          style={{
            opacity: hovered && !reduceMotion ? 1 : 0,
            background: `radial-gradient(320px circle at ${shineX.get()} ${shineY.get()},
              color-mix(in srgb, #fff 14%, transparent), transparent 60%)`,
          }}
        />

        <div className="gw-card-body">
          {/* Header */}
          <div className="flex items-start gap-3">
            <motion.div
              whileHover={reduceMotion ? {} : { rotate: [0, -6, 6, 0] }}
              transition={{ duration: 0.6 }}
              className="gw-card-badge"
            >
              <Server className="w-6 h-6" strokeWidth={1.75} />
            </motion.div>
            <div className="flex-1 min-w-0">
              <h3 className="text-[19px] font-bold text-[var(--color-ink-0)] truncate leading-tight">
                {getAssetDisplayName(gateway)}
              </h3>
              <p className="text-xs text-[var(--color-ink-2)] mt-1 flex items-center gap-1.5">
                {connected ? (
                  <>
                    <Wifi className="w-3 h-3 gw-accent" />
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

          {/* Health */}
          <div className="mt-5">
            <div className="flex items-end justify-between mb-2">
              <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--color-ink-2)] font-semibold">
                Online
              </span>
              <div className="flex items-baseline gap-1.5">
                <CountUp to={healthPct} duration={0.9} className="gw-big-number" />
                <span className="text-base gw-accent font-bold">%</span>
                <span className="text-[11px] text-[var(--color-ink-3)] ml-1 tabular-nums">
                  {online}/{total}
                </span>
              </div>
            </div>
            <div className="gw-health-track">
              <motion.div
                className={`gw-health-fill ${mood === 'alarm' ? 'gw-health-pulse' : ''}`}
                initial={{ width: 0 }}
                animate={{ width: `${healthPct}%` }}
                transition={{ duration: 0.9, ease: [0.2, 0.8, 0.2, 1] }}
              />
            </div>
          </div>

          {/* Readings */}
          <div className="grid grid-cols-4 gap-2 mt-5">
            <Reading icon={Zap}         value={power > 0 ? `${power.toFixed(0)}W` : '—'} label="Power" />
            <Reading icon={Thermometer} value={avgTemp != null ? `${avgTemp.toFixed(1)}°` : '—'} label="Temp" />
            <Reading icon={Unlock}      value={doorLocks.length ? `${doorsUnlocked}/${doorLocks.length}` : '—'} label="Doors" tone={doorsUnlocked > 0 ? 'warning' : 'default'} />
            <Reading icon={Bell}        value={alarming} label="Alarms" tone={alarming > 0 ? 'alarm' : 'default'} />
          </div>

          {/* Footer */}
          <div className="gw-card-footer">
            <span className="inline-flex items-center gap-1.5 text-[11px] text-[var(--color-ink-2)]">
              <Activity className="w-3 h-3" />
              {activeCount > 0 ? `${activeCount} device${activeCount === 1 ? '' : 's'} active` : 'All quiet'}
            </span>
            <motion.span
              animate={hovered && !reduceMotion ? { x: 4 } : { x: 0 }}
              transition={{ type: 'spring', stiffness: 380, damping: 22 }}
              className="inline-flex items-center gap-1 text-xs font-semibold gw-accent"
            >
              Enter site
              <ArrowRight className="w-3.5 h-3.5" />
            </motion.span>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

/* ---------- Counting-up number on mount ---------- */

function CountUp({ to, duration = 0.8, className = '' }) {
  const reduceMotion = useReducedMotion();
  const [v, setV] = useState(reduceMotion ? to : 0);

  useEffect(() => {
    if (reduceMotion) return;
    const start = performance.now();
    let frame;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / (duration * 1000));
      const eased = 1 - Math.pow(1 - t, 3);
      setV(Math.round(to * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [to, duration, reduceMotion]);

  return <span className={`tabular-nums ${className}`}>{reduceMotion ? to : v}</span>;
}

/* ---------- Reading tile ---------- */

function Reading({ icon: Icon, value, label, tone = 'default' }) {
  const toneClass =
    tone === 'alarm'   ? 'text-[var(--color-danger-400)]' :
    tone === 'warning' ? 'text-[var(--color-warning-400)]' :
    'text-[var(--color-ink-0)]';

  return (
    <div className="gw-reading">
      <Icon className="w-3.5 h-3.5 mx-auto mb-1 text-[var(--color-ink-2)]" strokeWidth={1.75} />
      <p className={`text-sm font-bold tabular-nums ${toneClass}`}>{value}</p>
      <p className="text-[9px] uppercase tracking-wider text-[var(--color-ink-3)]">{label}</p>
    </div>
  );
}
