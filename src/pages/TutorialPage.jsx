import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BookOpen, CheckCircle2, Circle, LayoutGrid, Building2, Bell, MapPin,
  Zap, History, Sparkles, ArrowRight, RotateCcw, Hand,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  getTutorialProgress, markTutorialStep, resetTutorial, resetTips,
} from '../utils/prefs';

const STEPS = [
  {
    id: 'overview',
    icon: LayoutGrid,
    title: 'The Overview dashboard',
    lead: 'Your home base — everything else is reachable from here.',
    body: [
      'KPIs up top: how many sites you have, how many devices are online, how many alarms are open, and how many devices are currently active.',
      'The live readings strip aggregates power draw from every plug, a min/avg/max of temperature across all heat sensors, and door-lock state at a glance.',
      'Device mix and a 7-day alarm bar chart follow — all built from already-cached data, so nothing refetches while you scroll.',
    ],
  },
  {
    id: 'sites',
    icon: Building2,
    title: 'Sites — your properties',
    lead: 'Each site (gateway) hosts the devices at that property.',
    body: [
      'The Sites page shows mood-tinted cards per site: green when calm, amber when something needs attention, red when alarming.',
      'Quick actions let you turn all lights off, lock every door, or arm every alarm across all your sites in a single tap.',
      'Click any site to drill into its device list, grouped by safety-first ordering (alarms first, then cameras, then locks, then sensors, then lights/plugs).',
    ],
  },
  {
    id: 'devices',
    icon: Hand,
    title: 'Controlling devices',
    lead: 'The icon is the power switch.',
    body: [
      'On lights, plugs, fans, door locks, and alarms — tap the circular icon to toggle. Cyan glow = on/engaged, grey = off/idle.',
      'Door locks follow the same metaphor: locked = cyan, unlocked = grey. The "unlocked" count on the dashboard highlights when any door is open.',
      'For sensors (motion, smoke, temperature, etc.) the icon opens the device detail page — there is nothing to toggle on a read-only sensor.',
      'Tap a device tile anywhere else to open its full detail page with State, Controls, History, and Alarm tabs.',
    ],
  },
  {
    id: 'quick',
    icon: Sparkles,
    title: 'Quick-access control center',
    lead: 'A drag-and-drop grid of your favourite controllable devices.',
    body: [
      'Visit Quick access from the sidebar, pick the devices you use most, and reorder them by dragging.',
      'Layout is saved locally in your browser — each user on each device keeps their own arrangement.',
      'Great for phones mounted on the fridge or wall, or a tablet in the office. Tap an icon and it toggles instantly.',
    ],
  },
  {
    id: 'history',
    icon: History,
    title: 'History charts',
    lead: 'Every device attribute can be plotted over time.',
    body: [
      'On any device detail page, open the History tab to see past values.',
      'Numeric attributes plot as a smooth area chart. Boolean attributes plot as a step chart — useful to see when a light was on or a door was open.',
      'Switch the time range from the dropdown: 1 hour, 24 hours, 7 days, 30 days.',
    ],
  },
  {
    id: 'alarms',
    icon: Bell,
    title: 'Alarms and notifications',
    lead: 'Cross-site alarm inbox with status transitions.',
    body: [
      'Alarms page lists every open incident across every site, filterable by severity and status.',
      'Move an alarm from Open → Acknowledged → In progress → Resolved → Closed as you triage.',
      'The Overview "Alarm pipeline" shows this same breakdown as a visual funnel.',
    ],
  },
  {
    id: 'map',
    icon: MapPin,
    title: 'Map view',
    lead: 'Your sites pinned on a themed map.',
    body: [
      'Markers show every gateway with coordinates. The map auto-fits to show them all on first load.',
      'Click a site in the sidebar or a pin on the map to fly to it — clicking the same site twice re-centres if you have panned away.',
    ],
  },
  {
    id: 'settings',
    icon: Zap,
    title: 'Personalise it',
    lead: 'Theme, density, and tutorial preferences.',
    body: [
      'Switch between dark (default) and light mode any time.',
      'Compact density tightens everything up — useful on small screens or when you want more devices visible at once.',
      'If you want to see the contextual tips again, use the reset buttons at the bottom of this tutorial.',
    ],
  },
];

export default function TutorialPage() {
  const [progress, setProgress] = useState({ completedSteps: [] });
  const [activeId, setActiveId] = useState(STEPS[0].id);

  useEffect(() => {
    getTutorialProgress().then(setProgress);
  }, []);

  const completedSet = useMemo(() => new Set(progress.completedSteps), [progress]);
  const active = STEPS.find((s) => s.id === activeId) || STEPS[0];
  const activeIndex = STEPS.findIndex((s) => s.id === active.id);
  const percent = Math.round((completedSet.size / STEPS.length) * 100);

  const markDone = async (id) => {
    await markTutorialStep(id);
    setProgress(await getTutorialProgress());
  };

  const goNext = async () => {
    await markDone(active.id);
    const next = STEPS[activeIndex + 1];
    if (next) setActiveId(next.id);
    else toast.success('Tutorial complete — you are all set.');
  };

  const resetAll = async () => {
    await resetTutorial();
    setProgress({ completedSteps: [] });
    setActiveId(STEPS[0].id);
    toast.success('Tutorial progress cleared');
  };

  const bringBackTips = async () => {
    await resetTips();
    toast.success('Contextual tips will show again');
  };

  return (
    <div className="p-4 md:p-6 max-w-[1100px] mx-auto space-y-5">
      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="panel p-6 relative overflow-hidden"
        style={{
          background:
            'radial-gradient(70% 90% at 15% 0%, color-mix(in srgb, var(--color-accent-500) 18%, transparent), transparent 60%),' +
            'radial-gradient(60% 90% at 100% 100%, color-mix(in srgb, var(--color-brand-700) 25%, transparent), transparent 60%),' +
            'var(--color-surface-1)',
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, var(--color-accent-400), var(--color-accent-600))' }}
          >
            <BookOpen className="w-6 h-6 text-white" strokeWidth={1.75} />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-[var(--color-ink-0)]">Take the tour</h1>
            <p className="text-sm text-[var(--color-ink-2)]">
              A guided walkthrough of every corner of your SMS IoT portal.
            </p>
          </div>
          <div className="hidden sm:block text-right">
            <p className="text-2xl font-bold text-[var(--color-accent-400)]">{percent}%</p>
            <p className="text-[11px] uppercase tracking-wider text-[var(--color-ink-3)]">complete</p>
          </div>
        </div>

        <div className="mt-4 h-1.5 rounded-full overflow-hidden"
             style={{ background: 'color-mix(in srgb, var(--color-ink-0) 8%, transparent)' }}>
          <motion.div
            className="h-full rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${percent}%` }}
            transition={{ type: 'spring', stiffness: 120, damping: 22 }}
            style={{ background: 'linear-gradient(90deg, var(--color-accent-400), var(--color-accent-600))' }}
          />
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-5">
        {/* Steps list */}
        <nav className="panel p-2 h-max">
          {STEPS.map((s, i) => {
            const done = completedSet.has(s.id);
            const isActive = s.id === active.id;
            return (
              <button
                key={s.id}
                onClick={() => setActiveId(s.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${
                  isActive
                    ? 'bg-[color-mix(in_srgb,var(--color-accent-500)_14%,transparent)] text-[var(--color-accent-400)]'
                    : 'text-[var(--color-ink-2)] hover:text-[var(--color-ink-0)] hover:bg-[color-mix(in_srgb,var(--color-ink-0)_6%,transparent)]'
                }`}
              >
                {done ? (
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-[var(--color-ok-400)]" strokeWidth={2} />
                ) : (
                  <Circle className="w-4 h-4 flex-shrink-0 opacity-50" strokeWidth={1.75} />
                )}
                <span className="text-[11px] font-mono opacity-60 w-4">{String(i + 1).padStart(2, '0')}</span>
                <span className="text-[13px] font-medium flex-1 truncate">{s.title}</span>
              </button>
            );
          })}
        </nav>

        {/* Active step */}
        <AnimatePresence mode="wait">
          <motion.article
            key={active.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="panel p-6 space-y-4"
          >
            <div className="flex items-center gap-3">
              <div
                className="w-11 h-11 rounded-2xl flex items-center justify-center"
                style={{ background: 'color-mix(in srgb, var(--color-accent-500) 14%, transparent)' }}
              >
                <active.icon className="w-5 h-5 text-[var(--color-accent-400)]" strokeWidth={1.75} />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink-3)]">
                  Step {activeIndex + 1} of {STEPS.length}
                </p>
                <h2 className="text-xl font-bold text-[var(--color-ink-0)] leading-tight">{active.title}</h2>
              </div>
            </div>

            <p className="text-[15px] text-[var(--color-ink-1)] leading-relaxed">{active.lead}</p>

            <ul className="space-y-2.5">
              {active.body.map((para, i) => (
                <li key={i} className="flex gap-2.5 text-[13px] text-[var(--color-ink-1)] leading-relaxed">
                  <span className="mt-2 w-1.5 h-1.5 flex-shrink-0 rounded-full bg-[var(--color-accent-500)]" />
                  <span>{para}</span>
                </li>
              ))}
            </ul>

            <div className="flex items-center justify-between pt-4 border-t"
                 style={{ borderColor: 'color-mix(in srgb, var(--color-ink-0) 8%, transparent)' }}>
              <button
                onClick={() => setActiveId(STEPS[Math.max(0, activeIndex - 1)].id)}
                disabled={activeIndex === 0}
                className="text-[13px] text-[var(--color-ink-2)] hover:text-[var(--color-ink-0)] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ← Previous
              </button>
              <button
                onClick={goNext}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold text-white transition-transform hover:scale-[1.02]"
                style={{ background: 'linear-gradient(135deg, var(--color-accent-400), var(--color-accent-600))' }}
              >
                {activeIndex === STEPS.length - 1 ? 'Finish' : 'Got it, next'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </motion.article>
        </AnimatePresence>
      </div>

      {/* Reset controls */}
      <div className="panel p-5 flex flex-col sm:flex-row items-start sm:items-center gap-3 justify-between">
        <div>
          <h3 className="text-[14px] font-semibold text-[var(--color-ink-0)]">Start fresh</h3>
          <p className="text-[12px] text-[var(--color-ink-2)] mt-0.5">
            Clear tutorial progress or bring back the inline tips you have dismissed.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={bringBackTips}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-[12px] font-medium text-[var(--color-ink-1)] hover:text-[var(--color-ink-0)] border"
            style={{ borderColor: 'color-mix(in srgb, var(--color-ink-0) 14%, transparent)' }}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Show tips again
          </button>
          <button
            onClick={resetAll}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-[12px] font-medium text-[var(--color-ink-1)] hover:text-[var(--color-ink-0)] border"
            style={{ borderColor: 'color-mix(in srgb, var(--color-ink-0) 14%, transparent)' }}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset progress
          </button>
        </div>
      </div>

      <div className="text-center">
        <Link to="/" className="text-[12px] text-[var(--color-ink-3)] hover:text-[var(--color-ink-1)]">
          ← Back to dashboard
        </Link>
      </div>
    </div>
  );
}
