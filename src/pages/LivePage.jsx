import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import {
  Activity, Bell, Zap, ChevronRight, Trash2, Wifi,
} from 'lucide-react';
import { formatRelativeTime } from '../utils/helpers';
import useActivityStore, { SESSION_START } from '../store/activityStore';
import { useAssets } from '../hooks/useAssets';
import { EmptyState } from '../components/ui';
import './live.css';

/**
 * Live feed page.
 *
 * Two sections:
 *   1. "This session"  — ephemeral, in-memory device state changes since the
 *      user opened the app. Wiped on reload (by design — see discussion).
 *   2. "Alarms"        — alarm events. Server-persisted, so identical on any
 *      browser / device.
 *
 * The split UI makes the storage model honest: alarms are your durable
 * history; the session stream is a live tracker for anything the browser
 * observes while open.
 */
export default function LivePage() {
  const events = useActivityStore((s) => s.events);
  const clearSession = useActivityStore((s) => s.clearSession);
  const { data: assets = [] } = useAssets({});

  const assetMap = useMemo(() => {
    const m = new Map();
    for (const a of assets) m.set(a.id, a);
    return m;
  }, [assets]);

  const { sessionEvents, alarmEvents } = useMemo(() => {
    const session = [];
    const alarms = [];
    for (const e of events) {
      if (e.kind === 'alarm') alarms.push(e);
      else session.push(e);
    }
    return { sessionEvents: session, alarmEvents: alarms };
  }, [events]);

  // "since 14:32" ticker — update once a minute to keep it fresh without
  // thrashing renders.
  const [, tick] = useState(0);
  useEffect(() => {
    const h = setInterval(() => tick((t) => t + 1), 60_000);
    return () => clearInterval(h);
  }, []);

  return (
    <div className="p-4 md:p-6 max-w-[900px] mx-auto space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <span className="live-dot" aria-hidden="true" />
            <h1 className="text-3xl md:text-[34px] font-bold leading-tight text-[var(--color-ink-0)] tracking-tight">
              Live
            </h1>
          </div>
          <p className="text-sm text-[var(--color-ink-2)] mt-1.5">
            Watching your sites since <strong className="text-[var(--color-ink-0)]">
              {formatRelativeTime(SESSION_START)}
            </strong>
            {sessionEvents.length > 0 && (
              <> · <span className="text-[var(--color-accent-400)] font-semibold tabular-nums">
                {sessionEvents.length} event{sessionEvents.length === 1 ? '' : 's'}
              </span> this session</>
            )}
          </p>
        </div>
        {sessionEvents.length > 0 && (
          <button
            onClick={clearSession}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium text-[var(--color-ink-2)] hover:text-[var(--color-danger-400)] border"
            style={{ borderColor: 'color-mix(in srgb, var(--color-ink-0) 12%, transparent)' }}
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear session
          </button>
        )}
      </header>

      {/* This session */}
      <Section
        title="This session"
        description="Device state changes, as they happen"
        badge={<LiveBadge />}
        count={sessionEvents.length}
      >
        {sessionEvents.length === 0 ? (
          <EmptyState
            icon={Activity}
            title="Nothing yet — still watching"
            message="Toggle a device or wait for a state change. Events appear here in real time. This section only tracks the current browser session and clears on reload."
          />
        ) : (
          <FeedList events={sessionEvents} assetMap={assetMap} />
        )}
      </Section>

      {/* Alarms */}
      <Section
        title="Alarms"
        description="Stored on your site — same across every device"
        badge={<StoredBadge />}
        count={alarmEvents.length}
      >
        {alarmEvents.length === 0 ? (
          <EmptyState
            icon={Bell}
            title="All clear"
            message="No alarms have been raised. When one fires, it will appear here and stay consistent across every browser you sign in from."
          />
        ) : (
          <FeedList events={alarmEvents} assetMap={assetMap} />
        )}
      </Section>
    </div>
  );
}

/* ---------------- Section shell ---------------- */

function Section({ title, description, badge, count, children }) {
  return (
    <section>
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <h2 className="text-[14px] font-bold text-[var(--color-ink-0)] uppercase tracking-[0.14em]">
          {title}
        </h2>
        {badge}
        <span className="text-[11px] text-[var(--color-ink-3)] tabular-nums">{count}</span>
        <p className="text-[12px] text-[var(--color-ink-3)] ml-auto">{description}</p>
      </div>
      {children}
    </section>
  );
}

function LiveBadge() {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold"
      style={{
        background: 'color-mix(in srgb, var(--color-accent-500) 14%, transparent)',
        color: 'var(--color-accent-400)',
        border: '1px solid color-mix(in srgb, var(--color-accent-500) 30%, transparent)',
      }}
    >
      <span className="live-dot live-dot-sm" /> Live
    </span>
  );
}

function StoredBadge() {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold"
      style={{
        background: 'color-mix(in srgb, var(--color-ink-0) 6%, transparent)',
        color: 'var(--color-ink-1)',
        border: '1px solid color-mix(in srgb, var(--color-ink-0) 12%, transparent)',
      }}
    >
      <Wifi className="w-3 h-3" /> Synced
    </span>
  );
}

/* ---------------- Feed list ---------------- */

function FeedList({ events, assetMap }) {
  return (
    <LayoutGroup>
      <motion.ul layout className="space-y-1.5">
        <AnimatePresence initial={false}>
          {events.map((e) => (
            <ActivityRow key={e.id} event={e} asset={assetMap.get(e.assetId)} />
          ))}
        </AnimatePresence>
      </motion.ul>
    </LayoutGroup>
  );
}

function ActivityRow({ event, asset }) {
  const isAlarm = event.kind === 'alarm';
  const isControl = event.kind === 'control';
  const Icon = isAlarm ? Bell : isControl ? Zap : Activity;

  const toneColor = isAlarm
    ? 'var(--color-danger-400)'
    : isControl ? 'var(--color-accent-400)'
    : 'var(--color-ink-1)';
  const toneBg = isAlarm
    ? 'color-mix(in srgb, var(--color-danger-500) 14%, transparent)'
    : isControl ? 'color-mix(in srgb, var(--color-accent-500) 14%, transparent)'
    : 'color-mix(in srgb, var(--color-ink-0) 6%, transparent)';

  const displayName = asset?.name || event.assetName || 'Unknown device';
  const linkTo = event.assetId ? `/a/${event.assetId}` : null;

  const inner = (
    <motion.li
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="panel p-3 flex items-center gap-3 hover:border-[color-mix(in_srgb,var(--color-accent-500)_25%,transparent)] transition-colors"
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: toneBg, color: toneColor }}
      >
        <Icon className="w-4 h-4" strokeWidth={1.75} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-[var(--color-ink-0)] truncate">
          {event.title}
        </p>
        <p className="text-[11px] text-[var(--color-ink-2)] truncate">
          {displayName}
          {event.detail ? ` · ${event.detail}` : ''}
        </p>
      </div>
      <div className="flex-shrink-0 flex items-center gap-2">
        <p className="text-[11px] text-[var(--color-ink-3)] whitespace-nowrap">
          {formatRelativeTime(event.timestamp)}
        </p>
        {linkTo && <ChevronRight className="w-3.5 h-3.5 text-[var(--color-ink-3)]" />}
      </div>
    </motion.li>
  );

  return linkTo ? <Link to={linkTo}>{inner}</Link> : inner;
}
