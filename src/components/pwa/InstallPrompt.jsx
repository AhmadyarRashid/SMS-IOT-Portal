import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, X } from 'lucide-react';

const DISMISS_KEY = 'sms_install_dismissed';

/**
 * Catches the `beforeinstallprompt` event and shows a small corner toast
 * inviting the user to install the app. Stays out of the way — one tap on
 * the × dismisses it for this device, stored in localStorage.
 *
 * On iOS Safari the event never fires; the user installs via the native
 * "Add to Home Screen" — nothing to show. We silently stay dormant.
 */
export default function InstallPrompt() {
  const [evt, setEvt] = useState(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // If already dismissed (or already installed / running standalone), skip.
    const dismissed = localStorage.getItem(DISMISS_KEY);
    const standalone = window.matchMedia?.('(display-mode: standalone)').matches
      || window.navigator.standalone;
    if (dismissed || standalone) return;

    const handler = (e) => {
      e.preventDefault();
      setEvt(e);
      setVisible(true);
    };
    window.addEventListener('beforeinstallprompt', handler);

    const installed = () => setVisible(false);
    window.addEventListener('appinstalled', installed);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installed);
    };
  }, []);

  const dismiss = () => {
    setVisible(false);
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* noop */ }
  };

  const install = async () => {
    if (!evt) return;
    evt.prompt();
    try { await evt.userChoice; } catch { /* user cancelled */ }
    setVisible(false);
  };

  return (
    <AnimatePresence>
      {visible && evt && (
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ type: 'spring', stiffness: 320, damping: 26 }}
          className="fixed bottom-4 left-4 z-40 panel p-3 flex items-center gap-3 max-w-[340px]"
          style={{ boxShadow: '0 20px 50px -20px rgba(0, 0, 0, 0.5)' }}
        >
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, var(--color-accent-400), var(--color-accent-600))' }}
          >
            <Download className="w-5 h-5 text-white" strokeWidth={2} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-[var(--color-ink-0)] leading-tight">
              Install SMS IoT
            </p>
            <p className="text-[11px] text-[var(--color-ink-2)] mt-0.5 leading-snug">
              Launch it from your home screen like a real app.
            </p>
          </div>
          <button
            onClick={install}
            className="px-3 py-1.5 rounded-lg text-[12px] font-semibold text-white flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, var(--color-accent-400), var(--color-accent-600))' }}
          >
            Install
          </button>
          <button
            onClick={dismiss}
            aria-label="Dismiss"
            className="p-1 rounded text-[var(--color-ink-3)] hover:text-[var(--color-ink-0)]"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
