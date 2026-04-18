import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lightbulb, X } from 'lucide-react';
import { getDismissedTips, dismissTip } from '../../utils/prefs';

/**
 * Inline dismissible tip. Identify with a stable id — once a user clicks X,
 * it stays hidden across sessions. Resetting happens from Settings.
 *
 * <Tip id="asset-icon-tap" title="Quick tip">
 *   Tap the circular icon to toggle the device.
 * </Tip>
 */
export default function Tip({ id, title, children, className = '' }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let live = true;
    getDismissedTips().then((list) => {
      if (live) setVisible(!list.includes(id));
    });
    return () => { live = false; };
  }, [id]);

  const close = () => {
    setVisible(false);
    dismissTip(id);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          className={`relative flex items-start gap-3 rounded-2xl p-4 pr-10 ${className}`}
          style={{
            background: 'color-mix(in srgb, var(--color-accent-500) 8%, var(--color-surface-1))',
            border: '1px solid color-mix(in srgb, var(--color-accent-500) 25%, transparent)',
          }}
        >
          <div
            className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: 'color-mix(in srgb, var(--color-accent-500) 18%, transparent)' }}
          >
            <Lightbulb className="w-4 h-4 text-[var(--color-accent-400)]" strokeWidth={1.75} />
          </div>
          <div className="flex-1 min-w-0">
            {title && (
              <p className="text-[13px] font-semibold text-[var(--color-ink-0)] leading-tight">
                {title}
              </p>
            )}
            <div className={`text-[12px] text-[var(--color-ink-1)] leading-snug ${title ? 'mt-0.5' : ''}`}>
              {children}
            </div>
          </div>
          <button
            onClick={close}
            aria-label="Dismiss tip"
            className="absolute top-3 right-3 p-1 rounded text-[var(--color-ink-3)] hover:text-[var(--color-ink-0)] hover:bg-[color-mix(in_srgb,var(--color-ink-0)_8%,transparent)] transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
