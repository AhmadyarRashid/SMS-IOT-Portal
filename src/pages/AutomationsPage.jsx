import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Workflow, Play, Pause, Trash2, Plus, Search } from 'lucide-react';
import {
  useRules, useCreateRule, useUpdateRule, useDeleteRule,
} from '../hooks/useAssets';
import { formatRelativeTime } from '../utils/helpers';
import { LoadingSpinner, EmptyState } from '../components/ui';

export default function AutomationsPage() {
  const { data: rules = [], isLoading } = useRules();
  const create = useCreateRule();
  const update = useUpdateRule();
  const remove = useDeleteRule();

  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const list = useMemo(() => (Array.isArray(rules) ? rules : []), [rules]);
  const filtered = useMemo(() => list.filter((r) => {
    const q = search.toLowerCase();
    return (r.name || '').toLowerCase().includes(q);
  }), [list, search]);

  const handleCreate = () => {
    if (!name.trim()) return;
    create.mutate(
      {
        name: name.trim(),
        type: 'WHEN_THEN',
        enabled: true,
        lang: 'JSON',
        rules: { description: description.trim(), when: {}, then: [] },
      },
      {
        onSuccess: () => {
          setShowCreate(false);
          setName('');
          setDescription('');
        },
      }
    );
  };

  const confirmDelete = (id) => {
    if (window.confirm('Delete this automation? This cannot be undone.')) {
      remove.mutate(id);
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center min-h-[60vh]"><LoadingSpinner size="lg" /></div>;
  }

  return (
    <div className="p-4 md:p-6 max-w-[1200px] mx-auto space-y-5">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-ink-0)]">Automations</h1>
          <p className="text-sm text-[var(--color-ink-2)] mt-1">
            Rules that react to sensor events and automate your sites.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold"
          style={{
            background: 'var(--color-accent-500)',
            color: '#fff',
          }}
        >
          <Plus className="w-4 h-4" /> New automation
        </button>
      </header>

      <div className="panel p-3">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-3)]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search automations…"
            className="w-full pl-9 pr-3 py-2 rounded-xl text-sm outline-none"
            style={{
              background: 'var(--color-surface-0)',
              color: 'var(--color-ink-0)',
              border: '1px solid color-mix(in srgb, var(--color-ink-0) 8%, transparent)',
            }}
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Workflow}
          title="No automations"
          message="Create your first rule to react to sensor events automatically."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map((rule) => (
            <div key={rule.id} className="panel p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                       style={{
                         background: rule.enabled
                           ? 'color-mix(in srgb, var(--color-accent-500) 14%, transparent)'
                           : 'color-mix(in srgb, var(--color-ink-0) 6%, transparent)',
                         color: rule.enabled ? 'var(--color-accent-400)' : 'var(--color-ink-2)',
                       }}>
                    <Workflow className="w-5 h-5" strokeWidth={1.75} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-[var(--color-ink-0)] truncate">{rule.name}</h3>
                    <p className="text-xs text-[var(--color-ink-2)] truncate">{rule.rules?.description || 'No description'}</p>
                    <p className="text-[11px] text-[var(--color-ink-3)] mt-1">
                      {rule.lastModified ? formatRelativeTime(rule.lastModified) : 'Never modified'}
                    </p>
                  </div>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                      style={{
                        background: rule.enabled
                          ? 'color-mix(in srgb, var(--color-accent-500) 14%, transparent)'
                          : 'color-mix(in srgb, var(--color-ink-0) 6%, transparent)',
                        color: rule.enabled ? 'var(--color-accent-400)' : 'var(--color-ink-2)',
                      }}>
                  {rule.enabled ? 'Active' : 'Paused'}
                </span>
              </div>
              <div className="flex items-center gap-1.5 mt-3 pt-3 border-t"
                   style={{ borderColor: 'color-mix(in srgb, var(--color-ink-0) 6%, transparent)' }}>
                <button
                  onClick={() => update.mutate({ ...rule, enabled: !rule.enabled })}
                  className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg"
                  style={{
                    background: 'color-mix(in srgb, var(--color-ink-0) 6%, transparent)',
                    color: 'var(--color-ink-1)',
                  }}
                >
                  {rule.enabled ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  {rule.enabled ? 'Pause' : 'Resume'}
                </button>
                <button
                  onClick={() => confirmDelete(rule.id)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg"
                  style={{
                    background: 'color-mix(in srgb, var(--color-danger-500) 12%, transparent)',
                    color: 'var(--color-danger-400)',
                  }}
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setShowCreate(false)}
          >
            <motion.div
              initial={{ scale: 0.96, y: 10, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md panel p-5"
            >
              <h3 className="text-lg font-semibold text-[var(--color-ink-0)] mb-4">New automation</h3>
              <label className="block text-xs text-[var(--color-ink-2)] mb-1">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Turn off lights at 10pm"
                className="w-full px-3 py-2 rounded-xl text-sm outline-none mb-3"
                style={{
                  background: 'var(--color-surface-0)',
                  color: 'var(--color-ink-0)',
                  border: '1px solid color-mix(in srgb, var(--color-ink-0) 8%, transparent)',
                }}
              />
              <label className="block text-xs text-[var(--color-ink-2)] mb-1">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                style={{
                  background: 'var(--color-surface-0)',
                  color: 'var(--color-ink-0)',
                  border: '1px solid color-mix(in srgb, var(--color-ink-0) 8%, transparent)',
                }}
              />
              <div className="flex items-center justify-end gap-2 mt-4">
                <button
                  onClick={() => setShowCreate(false)}
                  className="px-3 py-2 rounded-xl text-sm text-[var(--color-ink-2)] hover:text-[var(--color-ink-0)]"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={!name.trim()}
                  className="px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50"
                  style={{ background: 'var(--color-accent-500)', color: '#fff' }}
                >
                  Create
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
