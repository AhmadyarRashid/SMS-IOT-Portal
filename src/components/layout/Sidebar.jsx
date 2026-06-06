import { NavLink, useLocation } from '@/lib/router-shim';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutGrid, Building2, Bell, MapPin, Sparkles, BookOpen, Activity,
  Settings, ChevronLeft, ChevronRight, X, LogOut, ShieldCheck, Gauge,
} from 'lucide-react';
import useAppStore from '../../store/appStore';
import useAuthStore from '../../store/authStore';
import { useAlarms } from '../../hooks/useAssets';

const nav = [
  { path: '/', icon: LayoutGrid, label: 'Overview', exact: true },
  // { path: '/dashboard', icon: Gauge, label: 'Dashboard' },
  { path: '/sites', icon: Building2, label: 'Sites' },
  { path: '/quick', icon: Sparkles, label: 'Quick access' },
  { path: '/alarms', icon: Bell, label: 'Alarms', badgeKey: 'openAlarms' },
  // { path: '/live', icon: Activity, label: 'Live' },
  // { path: '/map', icon: MapPin, label: 'Map' },
  { path: '/tutorial', icon: BookOpen, label: 'Tutorial' },
];

function isRouteActive(item, pathname) {
  if (item.exact) return pathname === item.path;
  if (item.path === '/sites') {
    return pathname === '/sites' || pathname.startsWith('/g/') || pathname.startsWith('/a/');
  }
  return pathname.startsWith(item.path);
}

function NavItem({ item, collapsed, pathname, onNavigate, badge }) {
  const active = isRouteActive(item, pathname);
  return (
    <NavLink
      to={item.path}
      onClick={onNavigate}
      className={`group relative flex items-center gap-3 mx-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors
        ${active
          ? 'bg-[color-mix(in_srgb,var(--color-accent-500)_14%,transparent)] text-[var(--color-accent-400)]'
          : 'text-[var(--color-ink-2)] hover:text-[var(--color-ink-0)] hover:bg-[color-mix(in_srgb,var(--color-ink-0)_6%,transparent)]'}`}
    >
      <span className="relative flex-shrink-0">
        <item.icon className="w-[18px] h-[18px]" strokeWidth={1.75} />
        {badge > 0 && collapsed && (
          <span
            className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full text-[9px] font-bold flex items-center justify-center tabular-nums pulse"
            style={{
              background: 'var(--color-danger-500)',
              color: '#fff',
              boxShadow: '0 0 0 2px var(--color-surface-1)',
            }}
          >
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </span>
      {!collapsed && <span className="whitespace-nowrap">{item.label}</span>}
      {badge > 0 && !collapsed && (
        <span
          className="ml-auto px-2 py-0.5 rounded-full text-[10px] font-bold tabular-nums pulse"
          style={{
            background: 'color-mix(in srgb, var(--color-danger-500) 18%, transparent)',
            color: 'var(--color-danger-400)',
            border: '1px solid color-mix(in srgb, var(--color-danger-500) 40%, transparent)',
          }}
        >
          {badge > 99 ? '99+' : badge}
        </span>
      )}
      {active && (
        <span className="absolute left-0 top-2 bottom-2 w-0.5 rounded-r bg-[var(--color-accent-500)]" />
      )}
    </NavLink>
  );
}

export default function Sidebar() {
  const location = useLocation();
  const { sidebarOpen, sidebarCollapsed, toggleCollapse, closeSidebar } = useAppStore();
  const { user, logout } = useAuthStore();
  const { data: openAlarms = [] } = useAlarms({ status: 'OPEN' });
  const badgeByKey = { openAlarms: openAlarms.length };

  const displayName = user?.name || user?.preferred_username || 'Client';
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <>
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
            onClick={closeSidebar}
          />
        )}
      </AnimatePresence>

      <aside
        className={`fixed top-0 left-0 h-full z-50 flex flex-col border-r
          ${sidebarCollapsed ? 'w-[72px]' : 'w-[232px]'}
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          transition-all duration-300 ease-in-out`}
        style={{
          background: 'var(--color-surface-1)',
          borderColor: 'color-mix(in srgb, var(--color-ink-0) 8%, transparent)',
        }}
      >
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-4 h-16 border-b"
             style={{ borderColor: 'color-mix(in srgb, var(--color-ink-0) 8%, transparent)' }}>
          <div className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center"
               style={{ background: 'linear-gradient(135deg, var(--color-accent-400), var(--color-accent-600))' }}>
            <ShieldCheck className="w-5 h-5 text-white" strokeWidth={2} />
          </div>
          {!sidebarCollapsed && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="overflow-hidden flex-1">
              <h1 className="text-sm font-semibold leading-tight text-[var(--color-ink-0)]">SMS IoT</h1>
              <p className="text-[11px] leading-tight text-[var(--color-ink-2)]">Client Portal</p>
            </motion.div>
          )}
          <button onClick={closeSidebar} className="p-1 rounded text-[var(--color-ink-2)] hover:text-[var(--color-ink-0)] lg:hidden">
            <X className="w-4 h-4" />
          </button>
          <button onClick={toggleCollapse} className="hidden lg:flex p-1 rounded text-[var(--color-ink-3)] hover:text-[var(--color-ink-0)] transition-colors">
            {sidebarCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
          </button>
        </div>

        <nav className="flex-1 py-4 space-y-1 overflow-y-auto">
          {nav.map((item) => (
            <NavItem
              key={item.path}
              item={item}
              collapsed={sidebarCollapsed}
              pathname={location.pathname}
              onNavigate={closeSidebar}
              badge={item.badgeKey ? badgeByKey[item.badgeKey] : 0}
            />
          ))}
        </nav>

        <div className="border-t"
             style={{ borderColor: 'color-mix(in srgb, var(--color-ink-0) 8%, transparent)' }}>
          <NavItem
            item={{ path: '/settings', icon: Settings, label: 'Settings' }}
            collapsed={sidebarCollapsed}
            pathname={location.pathname}
            onNavigate={closeSidebar}
          />

          <div className="px-3 py-3">
            <div className={`flex items-center gap-2.5 p-2 rounded-xl ${sidebarCollapsed ? 'justify-center' : ''}`}>
              <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-bold text-white"
                   style={{ background: 'linear-gradient(135deg, var(--color-accent-500), var(--color-brand-700))' }}>
                {initials}
              </div>
              {!sidebarCollapsed && (
                <>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-semibold text-[var(--color-ink-0)] truncate">{displayName}</p>
                    <p className="text-[10px] text-[var(--color-ink-2)] truncate">{user?.email || ''}</p>
                  </div>
                  <button
                    onClick={logout}
                    title="Sign out"
                    className="p-1.5 rounded-lg text-[var(--color-ink-2)] hover:text-[var(--color-danger-400)] hover:bg-[color-mix(in_srgb,var(--color-danger-500)_10%,transparent)] transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
