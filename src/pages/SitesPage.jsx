import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  Building2, Lightbulb, Lock, Siren, Zap, Bell, Workflow, AlertTriangle,
  Search, LayoutGrid, List,
} from 'lucide-react';
import { useAssets, useAlarms, useWriteAttribute } from '../hooks/useAssets';
import { pickGateways, pickAllDevices } from '../utils/gateways';
import { getCustomAssetType } from '../utils/assetIcons';
import { LoadingSpinner, EmptyState } from '../components/ui';
import GatewayCard from '../components/tiles/GatewayCard';

export default function SitesPage() {
  const { data: assets = [], isLoading } = useAssets({});
  const { data: alarms = [] } = useAlarms({ status: 'OPEN' });
  const gateways = useMemo(() => pickGateways(assets), [assets]);
  const allDevices = useMemo(() => pickAllDevices(assets), [assets]);
  const write = useWriteAttribute();
  const [working, setWorking] = useState(null);
  const [search, setSearch] = useState('');
  const [view, setView] = useState('grid'); // 'grid' | 'list'

  const orphanDevices = useMemo(() => {
    const gids = new Set(gateways.map((g) => g.id));
    return allDevices.filter((d) => {
      if (gids.has(d.parentId)) return false;
      if (Array.isArray(d.path) && d.path.some((p) => gids.has(p))) return false;
      return true;
    });
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
      let attr, value;
      if (kind === 'lights-off') { attr = 'onOff'; value = false; }
      if (kind === 'lock-all')   { attr = 'onOff'; value = true; }
      if (kind === 'arm-alarms') { attr = 'onOff'; value = true; }
      await Promise.allSettled(targets.map((a) =>
        write.mutateAsync({ assetId: a.id, attributeName: attr, value })));
      toast.success(`${kind.replace('-', ' ')} — ${targets.length} devices`);
    } finally {
      setWorking(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* Hero banner */}
      <div
        className="relative overflow-hidden rounded-[var(--radius-card)] border p-6 md:p-7"
        style={{
          background:
            'radial-gradient(900px 300px at 10% 0%, color-mix(in srgb, var(--color-accent-500) 22%, transparent), transparent 60%),' +
            'radial-gradient(800px 400px at 100% 100%, color-mix(in srgb, var(--color-brand-700) 35%, transparent), transparent 60%),' +
            'var(--color-surface-1)',
          borderColor: 'color-mix(in srgb, var(--color-accent-500) 22%, transparent)',
        }}
      >
        <div
          className="absolute inset-0 opacity-[0.04] pointer-events-none"
          style={{
            backgroundImage:
              'linear-gradient(currentColor 1px, transparent 1px), linear-gradient(90deg, currentColor 1px, transparent 1px)',
            backgroundSize: '56px 56px',
          }}
        />
        <div className="relative flex flex-col md:flex-row md:items-end md:justify-between gap-5">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-accent-400)] font-semibold mb-2">
              Properties
            </p>
            <h1 className="text-3xl md:text-4xl font-bold text-[var(--color-ink-0)] leading-tight">
              Your sites
            </h1>
            <p className="text-sm text-[var(--color-ink-2)] mt-2 max-w-lg">
              {totals.gateways > 0
                ? `${totals.gateways} site${totals.gateways === 1 ? '' : 's'} · ${totals.online}/${totals.devices} devices online${totals.alarms > 0 ? ` · ${totals.alarms} alarm${totals.alarms === 1 ? '' : 's'} active` : ''}.`
                : 'Contact SMS to register your first site.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <HeroStat label="Sites" value={totals.gateways} tone="accent" />
            <HeroStat
              label="Online"
              value={totals.devices ? `${Math.round((totals.online / totals.devices) * 100)}%` : '—'}
              tone={totals.online === totals.devices ? 'ok' : 'warning'}
            />
            <HeroStat label="Alarms" value={totals.alarms} tone={totals.alarms ? 'alarm' : 'default'} />
          </div>
        </div>
      </div>

      {/* Quick-action bar */}
      <div className="panel p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-[var(--color-accent-400)]" />
            <h3 className="text-sm font-semibold text-[var(--color-ink-0)]">Quick actions</h3>
            <span className="text-[11px] text-[var(--color-ink-3)]">apply to every matching device</span>
          </div>
          <div className="flex flex-wrap gap-2 ml-auto">
            <QuickAction icon={Lightbulb} label="All lights off" onClick={() => runBulk('lights-off')} busy={working === 'lights-off'} />
            <QuickAction icon={Lock}      label="Lock all doors" onClick={() => runBulk('lock-all')}   busy={working === 'lock-all'} />
            <QuickAction icon={Siren}     label="Arm all alarms" onClick={() => runBulk('arm-alarms')} busy={working === 'arm-alarms'} />
          </div>
        </div>
      </div>

      {/* Orphan-device warning */}
      {orphanDevices.length > 0 && (
        <div className="panel p-4 border-l-4" style={{ borderLeftColor: 'var(--color-warning-400)' }}>
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-[var(--color-warning-400)] mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[var(--color-ink-0)]">
                {orphanDevices.length} device{orphanDevices.length === 1 ? '' : 's'} not linked to a site
              </p>
              <p className="text-xs text-[var(--color-ink-2)] mt-1">
                Link them under a site in SMS IoT to see them here.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Search + view toggle — show only if >3 sites */}
      {gateways.length > 3 && (
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-3)]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search sites by name…"
              className="w-full pl-9 pr-3 py-2.5 rounded-xl text-sm outline-none"
              style={{
                background: 'var(--color-surface-1)',
                color: 'var(--color-ink-0)',
                border: '1px solid color-mix(in srgb, var(--color-ink-0) 8%, transparent)',
              }}
            />
          </div>
          <div className="flex items-center gap-1 p-1 rounded-xl"
               style={{ background: 'var(--color-surface-1)', border: '1px solid color-mix(in srgb, var(--color-ink-0) 8%, transparent)' }}>
            <ViewBtn active={view === 'grid'} onClick={() => setView('grid')} icon={LayoutGrid} label="Grid" />
            <ViewBtn active={view === 'list'} onClick={() => setView('list')} icon={List} label="List" />
          </div>
        </div>
      )}

      {/* Gateway cards */}
      <section>
        {gateways.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="No sites yet"
            message="Sites linked to your account will appear here. Contact SMS to register a new site."
          />
        ) : filteredGateways.length === 0 ? (
          <EmptyState
            icon={Search}
            title="No matches"
            message={`No sites found for "${search}". Try a different search term.`}
          />
        ) : (
          <motion.div
            initial="hidden" animate="show"
            variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }}
            className={view === 'grid'
              ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4'
              : 'grid grid-cols-1 gap-3'}
          >
            {filteredGateways.map((g) => (
              <motion.div
                key={g.id}
                variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
              >
                <GatewayCard gateway={g} assets={assets} />
              </motion.div>
            ))}
          </motion.div>
        )}
      </section>
    </div>
  );
}

function HeroStat({ label, value, tone }) {
  const color =
    tone === 'ok'     ? 'var(--color-accent-400)' :
    tone === 'accent' ? 'var(--color-accent-400)' :
    tone === 'warning'? 'var(--color-warning-400)' :
    tone === 'alarm'  ? 'var(--color-danger-400)' :
    'var(--color-ink-0)';
  return (
    <div className="text-right">
      <p className="text-[10px] uppercase tracking-wider text-[var(--color-ink-2)] font-semibold">{label}</p>
      <p className="text-3xl font-bold tabular-nums mt-0.5" style={{ color }}>{value}</p>
    </div>
  );
}

function QuickAction({ icon: Icon, label, onClick, busy }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-[13px] font-semibold border transition-colors disabled:opacity-60 hover:brightness-110"
      style={{
        background: 'color-mix(in srgb, var(--color-accent-500) 12%, transparent)',
        color: 'var(--color-accent-400)',
        borderColor: 'color-mix(in srgb, var(--color-accent-500) 32%, transparent)',
      }}
    >
      <Icon className="w-4 h-4" strokeWidth={2} />
      {busy ? 'Working…' : label}
    </button>
  );
}

function ViewBtn({ active, onClick, icon: Icon, label }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
        active ? 'text-[var(--color-accent-400)]' : 'text-[var(--color-ink-2)] hover:text-[var(--color-ink-0)]'
      }`}
      style={active ? { background: 'color-mix(in srgb, var(--color-accent-500) 14%, transparent)' } : {}}
      aria-pressed={active}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  );
}
