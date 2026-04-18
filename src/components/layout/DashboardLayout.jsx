import { useEffect, useLayoutEffect, useRef } from 'react';
import { Outlet, useLocation, useNavigationType } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Toaster } from 'react-hot-toast';
import Sidebar from './Sidebar';
import Header from './Header';
import useAppStore from '../../store/appStore';
import useLiveEvents from '../../hooks/useLiveEvents';
import usePwaStore from '../../store/pwaStore';
import CommandPalette from '../commandpalette/CommandPalette';
import InstallPrompt from '../pwa/InstallPrompt';

/**
 * Remember scroll positions per pathname. When the user navigates away we
 * snapshot the current scrollY; when they POP back we restore it on the next
 * layout frame. Forward navigations always scroll to the top.
 */
function useScrollRestoration() {
  const location = useLocation();
  const navigationType = useNavigationType();
  const positions = useRef(new Map());
  const prevPath = useRef(location.pathname);

  // Save the position of the page we're about to leave.
  useEffect(() => {
    const save = () => positions.current.set(prevPath.current, window.scrollY);
    return () => {
      save();
      prevPath.current = location.pathname;
    };
  }, [location.pathname]);

  // Restore (on back/forward) or scroll to top (on new navigation).
  useLayoutEffect(() => {
    if (navigationType === 'POP') {
      const saved = positions.current.get(location.pathname) ?? 0;
      window.scrollTo({ top: saved, behavior: 'instant' });
    } else {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }, [location.pathname, navigationType]);
}

export default function DashboardLayout() {
  const { sidebarCollapsed, theme } = useAppStore();
  const location = useLocation();
  useScrollRestoration();
  useLiveEvents();

  // Capture the PWA install prompt event globally — consumed by the floating
  // install toast and the Settings page.
  const registerPwaListener = usePwaStore((s) => s._registerListener);
  useEffect(() => registerPwaListener(), [registerPwaListener]);

  return (
    <div className="min-h-screen" style={{ background: 'var(--color-surface-0)', color: 'var(--color-ink-0)' }}>
      <Sidebar />
      <div className={`transition-all duration-300 ${sidebarCollapsed ? 'lg:ml-[72px]' : 'lg:ml-[232px]'}`}>
        <Header />
        <main className="min-h-[calc(100vh-56px)]">
          {/* Key on pathname so the page re-runs its entrance animation on
              navigation. No AnimatePresence wrapper — `mode="wait"` would hold
              the next page off-screen if an outgoing page had a hung exit
              animation (notably Recharts containers during unmount), which
              occasionally left this area blank on sidebar click. */}
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            <Outlet />
          </motion.div>
        </main>
      </div>
      <CommandPalette />
      <InstallPrompt />
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: theme === 'light' ? '#fff' : '#111827',
            color: theme === 'light' ? '#0f172a' : '#f8fafc',
            border: theme === 'light' ? '1px solid #e2e8f0' : '1px solid #1f2937',
            borderRadius: '12px',
            fontSize: '13px',
          },
        }}
      />
    </div>
  );
}
