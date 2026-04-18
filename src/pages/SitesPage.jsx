import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  Building2, Lightbulb, Lock, Siren, AlertTriangle,
  Search, X, Sparkles,
} from 'lucide-react';
import { useAssets, useAlarms, useWriteAttribute } from '../hooks/useAssets';
import { pickGateways, pickAllDevices } from '../utils/gateways';
import { getCustomAssetType } from '../utils/assetIcons';
import { Skeleton } from '../components/ui';
import GatewayCard from '../components/tiles/GatewayCard';
import './sites.css';

export default function SitesPage() {
  const { data: assets = [], isLoading } = useAssets({});
  const { data: alarms = [] } = useAlarms({ status: 'OPEN' });
  const gateways = useMemo(() => pickGateways(assets), [assets]);
  const allDevices = useMemo(() => pickAllDevices(assets), [assets]);
  const write = useWriteAttribute();

  const [working, setWorking] = useState(null);
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);

  const orphanCount = useMemo(() => {
    const gids = new Set(gateways.map((g) => g.id));
    return allDevices.filter((d) => {
      if (gids.has(d.parentId)) return false;
      if (Array.isArray(d.path) && d.path.some((p) => gids.has(p))) return false;
      return true;
    }).length;
  }, [allDevices, gateways]);

  const totals = useMemo(() => {
    const online = allDevices.filter((d) => d.attributes?.connected?.value !== false).length;
    return {
      gateways: gateways.length,
      devices: allDevices.length,
      online,
      alarms: (alarms || []).length,
    };
  }, [allDevices, gateways, alarms]);

  const filteredGateways = useMemo(() => {
    if (!search.trim()) return gateways;
    const q = search.toLowerCase();
    return gateways.filter((g) => (g.name || '').toLowerCase().includes(q));
  }, [gateways, search]);

  const runBulk = async (kind) => {
    setActionsOpen(false);
    setWorking(kind);
    try {
      const targets = assets.filter((a) => {
        const t = getCustomAssetType(a);
        if (kind === 'lights-off') return t === 'LightAsset';
        if (kind === 'lock-all') return t === 'DoorLockAsset';
        if (kind === 'arm-alarms') return t === 'AlarmAsset';
        return false;
      });
      if (!targets.length) {
        toast('Nothing to do — no matching devices', { icon: 'ℹ️' });
        return;
      }
      const attr = 'onOff';
      const value = kind !== 'lights-off';
      await Promise.allSettled(targets.map((a) =>
        write.mutateAsync({ assetId: a.id, attributeName: attr, value })));
      toast.success(`${kind.replace('-', ' ')} — ${targets.length} devices`);
    } finally {
      setWorking(null);
    }
  };

  if (isLoading) {
    return (
      <div className="sites-page relative p-4 md:p-6 max-w-[1400px] mx-auto">
        <AmbientBlobs />
        <div className="relative space-y-6">
          <div className="flex flex-col gap-2">
            <Skeleton.Box h={32} w={200} rounded={10} />
            <Skeleton.Box h={14} w={320} rounded={6} />
          </div>
          <Skeleton.Grid cols={3} count={6} cardHeight={320} />
        </div>
      </div>
    );
  }

  return (
    <div className="sites-page relative p-4 md:p-6 max-w-[1400px] mx-auto">
      {/* Ambient drifting blobs behind everything */}
      <AmbientBlobs />

      <div className="relative space-y-6">
        {/* Minimal header */}
        <header className="flex flex-wrap items-end gap-x-6 gap-y-3 pt-1">
          <div className="min-w-0">
            <h1 className="text-3xl md:text-[34px] font-bold leading-tight text-[var(--color-ink-0)] tracking-tight">
              Your sites
            </h1>
            <SummaryLine totals={totals} />
          </div>

          {gateways.length > 3 && (
            <div className="ml-auto">
              <InlineSearch
                value={search}
                onChange={setSearch}
                open={searchOpen}
                setOpen={setSearchOpen}
              />
            </div>
          )}
        </header>

        {/* Orphan notice — compact inline chip */}
        {orphanCount > 0 && (
          <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs"
               style={{
                 background: 'color-mix(in srgb, var(--color-warning-500) 12%, transparent)',
                 color: 'var(--color-warning-400)',
                 border: '1px solid color-mix(in srgb, var(--color-warning-500) 25%, transparent)',
               }}>
            <AlertTriangle className="w-3.5 h-3.5" />
            <span className="font-medium">
              {orphanCount} device{orphanCount === 1 ? '' : 's'} not linked to any site.
            </span>
          </div>
        )}

        {/* Cards */}
        <section>
          {gateways.length === 0 ? (
            <RadarEmptyState
              title="No sites yet"
              message="Sites linked to your account will appear here. Contact SMS to register your first."
            />
          ) : filteredGateways.length === 0 ? (
            <RadarEmptyState
              title="Nothing matches"
              message={`No sites found for "${search}". Try a different search term.`}
            />
          ) : (
            <LayoutGroup>
              <motion.div
                layout
                className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5"
              >
                <AnimatePresence mode="popLayout" initial={false}>
                  {filteredGateways.map((g, idx) => (
                    <motion.div
                      key={g.id}
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{
                        type: 'spring', stiffness: 300, damping: 26,
                        // Tiny stagger just to give the grid personality — cap
                        // at 120ms so the page never feels "blank" on mount.
                        delay: Math.min(idx * 0.025, 0.12),
                      }}
                    >
                      <GatewayCard gateway={g} assets={assets} />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </motion.div>
            </LayoutGroup>
          )}
        </section>
      </div>

      {/* Floating action pill */}
      <FloatingActions
        open={actionsOpen}
        setOpen={setActionsOpen}
        working={working}
        onRun={runBulk}
      />
    </div>
  );
}

/* ---------------- Summary line ---------------- */

function SummaryLine({ totals }) {
  const parts = [];
  if (totals.gateways > 0) {
    parts.push(
      <span key="sites">
        <strong className="text-[var(--color-ink-0)] tabular-nums">{totals.gateways}</strong>{' '}
        site{totals.gateways === 1 ? '' : 's'}
      </span>
    );
    parts.push(
      <span key="online">
        <strong className="text-[var(--color-ink-0)] tabular-nums">{totals.online}/{totals.devices}</strong>{' '}
        online
      </span>
    );
    if (totals.alarms > 0) {
      parts.push(
        <span key="alarms" className="text-[var(--color-danger-400)] font-semibold">
          {totals.alarms} alarm{totals.alarms === 1 ? '' : 's'} active
        </span>
      );
    } else {
      parts.push(
        <span key="quiet" className="text-[var(--color-accent-400)] font-semibold">All quiet</span>
      );
    }
  } else {
    parts.push(<span key="empty">Nothing pinned to your account yet.</span>);
  }

  return (
    <p className="text-sm text-[var(--color-ink-2)] mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
      {parts.map((p, i) => (
        <span key={i} className="inline-flex items-center gap-3">
          {i > 0 && <span className="text-[var(--color-ink-3)]">·</span>}
          {p}
        </span>
      ))}
    </p>
  );
}

/* ---------------- Inline expanding search ---------------- */

function InlineSearch({ value, onChange, open, setOpen }) {
  const inputRef = useRef(null);
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  return (
    <motion.div
      layout
      transition={{ type: 'spring', stiffness: 320, damping: 26 }}
      className="relative flex items-center"
    >
      <AnimatePresence mode="wait" initial={false}>
        {open ? (
          <motion.div
            key="input"
            initial={{ width: 40, opacity: 0 }}
            animate={{ width: 260, opacity: 1 }}
            exit={{ width: 40, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            className="overflow-hidden"
          >
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-3)]" />
              <input
                ref={inputRef}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onBlur={() => { if (!value) setOpen(false); }}
                placeholder="Search sites…"
                className="w-full pl-9 pr-8 py-2 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--color-accent-500)_30%,transparent)]"
                style={{
                  background: 'var(--color-surface-1)',
                  color: 'var(--color-ink-0)',
                  border: '1px solid color-mix(in srgb, var(--color-ink-0) 10%, transparent)',
                }}
              />
              {value && (
                <button
                  onClick={() => { onChange(''); setOpen(false); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-[var(--color-ink-3)] hover:text-[var(--color-ink-0)]"
                  aria-label="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </motion.div>
        ) : (
          <motion.button
            key="btn"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            onClick={() => setOpen(true)}
            className="w-10 h-10 rounded-xl flex items-center justify-center text-[var(--color-ink-1)] hover:text-[var(--color-ink-0)] transition-colors"
            style={{
              background: 'var(--color-surface-1)',
              border: '1px solid color-mix(in srgb, var(--color-ink-0) 10%, transparent)',
            }}
            aria-label="Search sites"
          >
            <Search className="w-4 h-4" />
          </motion.button>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ---------------- Floating action pill ---------------- */

function FloatingActions({ open, setOpen, working, onRun }) {
  const actions = [
    { id: 'lights-off', icon: Lightbulb, label: 'All lights off' },
    { id: 'lock-all',   icon: Lock,      label: 'Lock all doors' },
    { id: 'arm-alarms', icon: Siren,     label: 'Arm all alarms' },
  ];

  return (
    <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2 pointer-events-none">
      <AnimatePresence>
        {open && (
          <motion.div
            key="menu"
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 320, damping: 24 }}
            className="panel p-1.5 pointer-events-auto"
            style={{ minWidth: 220 }}
          >
            {actions.map((a, i) => (
              <motion.button
                key={a.id}
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.04 * i, type: 'spring', stiffness: 280, damping: 22 }}
                onClick={() => onRun(a.id)}
                disabled={working === a.id}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium text-[var(--color-ink-1)] hover:text-[var(--color-ink-0)] hover:bg-[color-mix(in_srgb,var(--color-ink-0)_6%,transparent)] disabled:opacity-60 transition-colors"
              >
                <a.icon className="w-4 h-4 text-[var(--color-accent-400)]" strokeWidth={1.75} />
                <span>{working === a.id ? 'Working…' : a.label}</span>
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        onClick={() => setOpen(!open)}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.92 }}
        transition={{ type: 'spring', stiffness: 420, damping: 20 }}
        className="pointer-events-auto relative inline-flex items-center gap-2 pl-4 pr-5 py-3 rounded-full text-[13px] font-semibold text-white shadow-lg"
        style={{
          background: 'linear-gradient(135deg, var(--color-accent-400), var(--color-accent-600))',
          boxShadow: '0 18px 40px -12px color-mix(in srgb, var(--color-accent-500) 55%, transparent)',
        }}
        aria-expanded={open}
        aria-label="Quick actions"
      >
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 22 }}
          className="inline-flex"
        >
          <Sparkles className="w-4 h-4" strokeWidth={2} />
        </motion.span>
        <span>Quick actions</span>
        <span className="absolute inset-0 rounded-full pointer-events-none sites-fab-ring" />
      </motion.button>
    </div>
  );
}

/* ---------------- Ambient blobs ---------------- */

function AmbientBlobs() {
  return (
    <div className="sites-ambient" aria-hidden="true">
      <span className="sites-blob sites-blob-a" />
      <span className="sites-blob sites-blob-b" />
    </div>
  );
}

/* ---------------- Empty state with radar sweep ---------------- */

function RadarEmptyState({ title, message }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center py-16 text-center"
    >
      <div className="sites-radar" aria-hidden="true">
        <span className="sites-radar-ring sites-radar-r1" />
        <span className="sites-radar-ring sites-radar-r2" />
        <span className="sites-radar-ring sites-radar-r3" />
        <span className="sites-radar-sweep" />
        <span className="sites-radar-core">
          <Building2 className="w-6 h-6 text-[var(--color-accent-400)]" strokeWidth={1.5} />
        </span>
      </div>
      <h3 className="text-lg font-semibold text-[var(--color-ink-0)] mt-6">{title}</h3>
      <p className="text-sm text-[var(--color-ink-2)] mt-1 max-w-sm">{message}</p>
    </motion.div>
  );
}
