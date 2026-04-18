import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bell, AlertTriangle, AlertCircle, Info, Clock, Cpu, Search,
} from 'lucide-react';
import { useAlarms, useUpdateAlarmStatus } from '../hooks/useAssets';
import { formatRelativeTime } from '../utils/helpers';
import { EmptyState, LoadingSpinner } from '../components/ui';

const SEVERITY = {
  CRITICAL: { icon: AlertTriangle, class: 'sev-critical' },
  HIGH:     { icon: AlertTriangle, class: 'sev-high' },
  MEDIUM:   { icon: AlertCircle,   class: 'sev-medium' },
  LOW:      { icon: Info,          class: 'sev-low' },
};

const STATUSES = ['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];

export default function AlarmsPage() {
  const { data: alarms = [], isLoading } = useAlarms();
  const update = useUpdateAlarmStatus();
  const [search, setSearch] = useState('');
  const [sev, setSev] = useState('all');
  const [status, setStatus] = useState('all');

  const list = useMemo(() => (Array.isArray(alarms) ? alarms : []), [alarms]);
  const filtered = useMemo(() => list.filter((a) => {
    const hay = `${a.title || ''} ${a.content || ''} ${a.sourceName || ''}`.toLowerCase();
    if (search && !hay.includes(search.toLowerCase())) return false;
    if (sev !== 'all' && a.severity !== sev) return false;
    if (status !== 'all' && a.status !== status) return false;
    return true;
  }), [list, search, sev, status]);

  const counts = {
    critical: list.filter((a) => a.severity === 'CRITICAL' && a.status === 'OPEN').length,
    high:     list.filter((a) => a.severity === 'HIGH' && a.status === 'OPEN').length,
    open:     list.filter((a) => a.status === 'OPEN').length,
    total:    list.length,
  };

  if (isLoading) {
    return <div className="flex items-center justify-center min-h-[60vh]"><LoadingSpinner size="lg" /></div>;
  }

  return (
    <div className="p-4 md:p-6 max-w-[1200px] mx-auto space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-[var(--color-ink-0)]">Alarms</h1>
        <p className="text-sm text-[var(--color-ink-2)] mt-1">Active incidents across all your sites.</p>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <CountTile label="Critical" value={counts.critical} tone="alarm" icon={AlertTriangle} />
        <CountTile label="High" value={counts.high} tone="warning" icon={AlertCircle} />
        <CountTile label="Open" value={counts.open} tone="default" icon={Bell} />
        <CountTile label="Total" value={counts.total} tone="default" icon={Info} />
      </div>

      <div className="panel p-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-3)]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search alarms…"
            className="w-full pl-9 pr-3 py-2 rounded-xl text-sm outline-none"
            style={{
              background: 'var(--color-surface-0)',
              color: 'var(--color-ink-0)',
              border: '1px solid color-mix(in srgb, var(--color-ink-0) 8%, transparent)',
            }}
          />
        </div>
        <Select value={sev} onChange={setSev} options={['all', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW']} />
        <Select value={status} onChange={setStatus} options={['all', ...STATUSES]} />
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Bell} title="All clear" message="No alarms match your filters." />
      ) : (
        <div className="space-y-2">
          <AnimatePresence>
            {filtered.map((al) => {
              const meta = SEVERITY[al.severity] || SEVERITY.LOW;
              const Icon = meta.icon;
              return (
                <motion.div
                  key={al.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                >
                  <div className="panel p-4 flex items-start gap-3">
                    <div className={`p-2 rounded-xl ${meta.class}`}>
                      <Icon className="w-4 h-4" strokeWidth={1.75} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-semibold text-[var(--color-ink-0)] truncate">{al.title || 'Alarm'}</h3>
                        <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full ${meta.class}`}>
                          {al.severity}
                        </span>
                        <span className="px-2 py-0.5 text-[10px] font-medium rounded-full"
                              style={{
                                background: 'color-mix(in srgb, var(--color-ink-0) 6%, transparent)',
                                color: 'var(--color-ink-1)',
                              }}>
                          {(al.status || '').replace('_', ' ')}
                        </span>
                      </div>
                      {al.content && <p className="text-xs text-[var(--color-ink-2)] mt-1">{al.content}</p>}
                      <div className="flex items-center gap-4 text-[11px] text-[var(--color-ink-3)] mt-2">
                        {al.assetId ? (
                          <Link to={`/a/${al.assetId}`} className="flex items-center gap-1 hover:text-[var(--color-accent-400)]">
                            <Cpu className="w-3 h-3" /> {al.sourceName || al.assetId}
                          </Link>
                        ) : (
                          <span className="flex items-center gap-1"><Cpu className="w-3 h-3" /> {al.sourceName || 'System'}</span>
                        )}
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {al.createdOn ? formatRelativeTime(al.createdOn) : ''}</span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {al.status !== 'ACKNOWLEDGED' && al.status !== 'RESOLVED' && al.status !== 'CLOSED' && (
                        <ActionBtn
                          onClick={() => update.mutate({ alarm: al, status: 'ACKNOWLEDGED' })}
                          pending={update.isPending && update.variables?.alarm?.id === al.id && update.variables?.status === 'ACKNOWLEDGED'}
                        >
                          Ack
                        </ActionBtn>
                      )}
                      {al.status !== 'RESOLVED' && al.status !== 'CLOSED' && (
                        <ActionBtn
                          onClick={() => update.mutate({ alarm: al, status: 'RESOLVED' })}
                          pending={update.isPending && update.variables?.alarm?.id === al.id && update.variables?.status === 'RESOLVED'}
                        >
                          Resolve
                        </ActionBtn>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

function CountTile({ label, value, tone, icon: Icon }) {
  const color =
    tone === 'alarm'   ? 'var(--color-danger-400)' :
    tone === 'warning' ? 'var(--color-warning-400)' :
    'var(--color-ink-1)';
  return (
    <div className="panel p-4">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-[var(--color-ink-2)]">
        <Icon className="w-3.5 h-3.5" />
        {label}
      </div>
      <p className="text-2xl font-bold mt-1" style={{ color }}>{value}</p>
    </div>
  );
}

function Select({ value, onChange, options }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="px-3 py-2 rounded-xl text-xs outline-none"
      style={{
        background: 'var(--color-surface-0)',
        color: 'var(--color-ink-0)',
        border: '1px solid color-mix(in srgb, var(--color-ink-0) 8%, transparent)',
      }}
    >
      {options.map((o) => <option key={o} value={o}>{o === 'all' ? 'All' : o.replace('_', ' ')}</option>)}
    </select>
  );
}

function ActionBtn({ children, onClick, pending = false }) {
  return (
    <button
      onClick={onClick}
      disabled={pending}
      className="text-[11px] font-semibold px-2.5 py-1 rounded-lg transition-opacity disabled:opacity-60 disabled:cursor-wait"
      style={{
        background: 'color-mix(in srgb, var(--color-accent-500) 14%, transparent)',
        color: 'var(--color-accent-400)',
      }}
    >
      {pending ? '…' : children}
    </button>
  );
}
