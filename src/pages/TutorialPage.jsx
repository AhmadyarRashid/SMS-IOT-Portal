import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import {
  CheckCircle2, Info, X, RotateCcw, ArrowRight,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  getTutorialProgress, markTutorialStep, resetTutorial, resetTips,
} from '../utils/prefs';
import { TutorialIllustration } from './tutorial-illustrations';
import './tutorial.css';

/**
 * Minimal tutorial: gallery of illustrated cards. Default view is purely
 * visual — one short tagline per step. Tap a card to reveal one paragraph
 * of detail and a "Try it" link to the feature in-app.
 */
const STEPS = [
  {
    id: 'overview',
    title: 'Control Centre',
    tagline: 'Map, sites, alarms — one screen',
    detail: 'The landing page shows every site pinned on a live map, a filterable store roster with per-site health metrics (temperature, alarms, cameras, doors), and open alarms with one-click Ack / Resolve. Everything is driven by two cached queries — no per-widget calls.',
    tryHref: '/',
    tryLabel: 'Open Control Centre',
  },
  {
    id: 'sites',
    title: 'Your sites',
    tagline: 'Minimal page, tactile cards',
    detail: 'One-line summary header · a floating Quick Actions pill to lock doors / arm alarms / turn lights off · 3D-tilting cards with a drifting mood glow. Click a card to drill in.',
    tryHref: '/sites',
    tryLabel: 'Browse sites',
  },
  {
    id: 'devices',
    title: 'Filter, tap, rename',
    tagline: 'Chips filter · icons toggle · pencil renames',
    detail: 'Inside a site, chips at the top filter devices by type — a "Needs attention" chip lights up red when anything is alarming. Tap any round icon to toggle. On a device\'s detail page, click the pencil next to the name to give it a friendly label; the rename syncs across every browser you sign in from.',
    tryHref: '/sites',
    tryLabel: 'Try a device',
  },
  {
    id: 'quick',
    title: 'Quick access',
    tagline: 'iPhone-widget control centre',
    detail: 'Pin your most-used lights, plugs, fans, locks, and alarms. Tap Edit layout → drag to rearrange and resize between small (1×1) and large (2×1) widgets. Layout is saved per-browser.',
    tryHref: '/quick',
    tryLabel: 'Open quick access',
  },
  /* Hidden from sidebar — kept in code for future re-enable.
  {
    id: 'live',
    title: 'Live feed',
    tagline: 'Every change, as it happens',
    detail: 'Two sections: "This session" streams device state changes in real time, and "Alarms" shows the server-persistent alarm history. Backed by a 15-second poll that keeps running even when the tab is hidden.',
    tryHref: '/live',
    tryLabel: 'Open live feed',
  },
  */
  {
    id: 'history',
    title: 'History',
    tagline: 'Values over time',
    detail: 'On any device detail page, open the History tab to chart past values. Numbers plot as a smooth area, booleans render as step lines. Switch between 1h / 6h / 24h / 7d / 30d ranges.',
    tryHref: '/sites',
    tryLabel: 'Try it',
  },
  {
    id: 'alarms',
    title: 'Alarms',
    tagline: 'Triage with one click',
    detail: 'Rich cards show the alarm, the linked device, the site, and the location — click the location cell to open that site on the map in a new tab. Chip filters narrow by severity or status; counts cross-filter as you click. Ack or Resolve in one tap; a red sidebar badge pulses when any are open.',
    tryHref: '/alarms',
    tryLabel: 'Open alarms',
  },
  /* Hidden from sidebar — map is embedded in the Control Centre overview.
  {
    id: 'map',
    title: 'Map view',
    tagline: 'Sites in the world',
    detail: 'Every geocoded site pins on a themed map. Click the sidebar or a pin to fly to it — clicking the same site twice re-centres even if you panned away.',
    tryHref: '/map',
    tryLabel: 'Open map',
  },
  */
  {
    id: 'command',
    title: 'Command palette',
    tagline: '⌘K to do anything, instantly',
    detail: 'Press Cmd+K (Ctrl+K on Windows) from any page. Fuzzy-search sites, devices, routes, and actions — toggle a fan, lock every door, switch theme — all without leaving the keyboard.',
    tryHref: '/settings',
    tryLabel: 'See the shortcut',
  },
  {
    id: 'settings',
    title: 'Make it yours',
    tagline: 'Theme · notifications · install',
    detail: 'Switch theme and density, enable OS notifications for new alarms (with a test button to verify), install the app to your home screen, or clear local data. All changes apply instantly.',
    tryHref: '/settings',
    tryLabel: 'Open settings',
  },
];

export default function TutorialPage() {
  const [progress, setProgress] = useState({ completedSteps: [] });
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    getTutorialProgress().then(setProgress);
  }, []);

  const completedSet = useMemo(() => new Set(progress.completedSteps), [progress]);
  const percent = Math.round((completedSet.size / STEPS.length) * 100);

  const markDone = async (id) => {
    await markTutorialStep(id);
    setProgress(await getTutorialProgress());
  };

  const resetAll = async () => {
    await resetTutorial();
    setProgress({ completedSteps: [] });
    setOpenId(null);
    toast.success('Tutorial progress cleared');
  };

  const bringBackTips = async () => {
    await resetTips();
    toast.success('Contextual tips will show again');
  };

  return (
    <div className="p-4 md:p-6 max-w-[1200px] mx-auto">
      {/* Minimal hero */}
      <header className="flex items-end justify-between flex-wrap gap-4 mb-6">
        <div>
          <h1 className="text-3xl md:text-[34px] font-bold leading-tight text-[var(--color-ink-0)] tracking-tight">
            Take the tour
          </h1>
          <p className="text-sm text-[var(--color-ink-2)] mt-1.5">
            Tap any card to expand. {completedSet.size} of {STEPS.length} explored.
          </p>
        </div>

        <ProgressRing percent={percent} />
      </header>

      {/* Gallery */}
      <LayoutGroup>
        <motion.div
          layout
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
        >
          {STEPS.map((step, idx) => {
            const done = completedSet.has(step.id);
            const expanded = openId === step.id;
            return (
              <motion.div
                key={step.id}
                layout
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  type: 'spring', stiffness: 300, damping: 26,
                  delay: Math.min(idx * 0.03, 0.12),
                }}
                className={`tut-card ${expanded ? 'tut-card-open' : ''} ${done ? 'tut-card-done' : ''}`}
                onClick={() => setOpenId(expanded ? null : step.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setOpenId(expanded ? null : step.id);
                  }
                  if (e.key === 'Escape' && expanded) setOpenId(null);
                }}
                aria-expanded={expanded}
              >
                {done && (
                  <div className="tut-check" aria-label="Completed">
                    <CheckCircle2 className="w-4 h-4" strokeWidth={2} />
                  </div>
                )}

                <motion.div layout="position" className="tut-card-art">
                  <TutorialIllustration kind={step.id} done={done} />
                </motion.div>

                <motion.div layout="position" className="tut-card-meta">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-[15px] font-semibold text-[var(--color-ink-0)] leading-tight truncate">
                        {step.title}
                      </h3>
                      <p className="text-[12px] text-[var(--color-ink-2)] mt-0.5 truncate">
                        {step.tagline}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenId(expanded ? null : step.id);
                      }}
                      aria-label={expanded ? 'Close details' : 'Show details'}
                      className="tut-info-btn flex-shrink-0"
                    >
                      {expanded
                        ? <X className="w-3.5 h-3.5" />
                        : <Info className="w-3.5 h-3.5" />}
                    </button>
                  </div>

                  <AnimatePresence initial={false}>
                    {expanded && (
                      <motion.div
                        key="detail"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }}
                        className="overflow-hidden"
                      >
                        <p className="text-[13px] text-[var(--color-ink-1)] leading-relaxed mt-3">
                          {step.detail}
                        </p>
                        <div className="flex items-center justify-between gap-2 mt-4">
                          <Link
                            to={step.tryHref}
                            onClick={(e) => { e.stopPropagation(); markDone(step.id); }}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[12.5px] font-semibold text-white transition-transform hover:scale-[1.02]"
                            style={{ background: 'linear-gradient(135deg, var(--color-accent-400), var(--color-accent-600))' }}
                          >
                            {step.tryLabel}
                            <ArrowRight className="w-3.5 h-3.5" />
                          </Link>
                          {!done && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); markDone(step.id); }}
                              className="text-[12px] text-[var(--color-ink-2)] hover:text-[var(--color-ink-0)] font-medium"
                            >
                              Got it
                            </button>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              </motion.div>
            );
          })}
        </motion.div>
      </LayoutGroup>

      {/* Footer controls */}
      <div className="mt-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-5 border-t"
           style={{ borderColor: 'color-mix(in srgb, var(--color-ink-0) 6%, transparent)' }}>
        <p className="text-[12px] text-[var(--color-ink-3)]">
          Tutorial progress is saved only in this browser.
        </p>
        <div className="flex gap-2">
          <button
            onClick={bringBackTips}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] text-[var(--color-ink-1)] hover:text-[var(--color-ink-0)] border"
            style={{ borderColor: 'color-mix(in srgb, var(--color-ink-0) 12%, transparent)' }}
          >
            <RotateCcw className="w-3 h-3" />
            Show tips again
          </button>
          <button
            onClick={resetAll}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] text-[var(--color-ink-1)] hover:text-[var(--color-ink-0)] border"
            style={{ borderColor: 'color-mix(in srgb, var(--color-ink-0) 12%, transparent)' }}
          >
            <RotateCcw className="w-3 h-3" />
            Reset progress
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Progress ring ---------------- */

function ProgressRing({ percent }) {
  const size = 64;
  const stroke = 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (percent / 100) * c;

  return (
    <div className="relative inline-flex" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none"
          stroke="color-mix(in srgb, var(--color-ink-0) 10%, transparent)"
          strokeWidth={stroke}
        />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none"
          stroke="url(#tutRingGrad)"
          strokeWidth={stroke}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c - dash }}
          transition={{ type: 'spring', stiffness: 110, damping: 22 }}
        />
        <defs>
          <linearGradient id="tutRingGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%"   stopColor="var(--color-accent-400)" />
            <stop offset="100%" stopColor="var(--color-accent-600)" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[13px] font-bold text-[var(--color-accent-400)] tabular-nums">{percent}%</span>
      </div>
    </div>
  );
}
