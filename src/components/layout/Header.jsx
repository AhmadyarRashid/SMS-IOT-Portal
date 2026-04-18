import { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Menu, Bell, Search, Sun, Moon, ChevronDown, X,
  LogOut, Settings, AlertTriangle, AlertCircle, Info,
  Building2,
} from 'lucide-react';
import useAppStore from '../../store/appStore';
import useAuthStore from '../../store/authStore';
import { useAssets, useAlarms } from '../../hooks/useAssets';
import { pickGateways, pickAllDevices } from '../../utils/gateways';
import { getCustomAssetType, getAssetTypeLabel, getAssetDisplayName } from '../../utils/assetIcons';
import { formatRelativeTime } from '../../utils/helpers';
import AssetGlyph from '../tiles/AssetGlyph';

function severityIcon(sev) {
  const s = sev?.toUpperCase();
  if (s === 'CRITICAL') return <AlertCircle className="w-4 h-4 text-[var(--color-danger-400)]" />;
  if (s === 'HIGH') return <AlertTriangle className="w-4 h-4 text-[var(--color-warning-400)]" />;
  if (s === 'MEDIUM') return <AlertTriangle className="w-4 h-4 text-[var(--color-warning-400)]" />;
  return <Info className="w-4 h-4 text-[var(--color-accent-400)]" />;
}

export default function Header() {
  const { toggleSidebar, theme, toggleTheme } = useAppStore();
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const { data: alarms = [] } = useAlarms({ status: 'OPEN' });
  const { data: assets = [] } = useAssets({});

  const [searchQ, setSearchQ] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const searchRef = useRef(null);
  const notifRef = useRef(null);
  const userRef = useRef(null);

  const alarmsList = Array.isArray(alarms) ? alarms : [];
  const recent = alarmsList.slice(0, 6);

  // --- Search results --------------------------------------------------------
  const sites = useMemo(() => pickGateways(assets), [assets]);
  const devices = useMemo(() => pickAllDevices(assets), [assets]);

  const results = useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    if (!q) return { sites: [], devices: [] };
    const match = (a) => getAssetDisplayName(a).toLowerCase().includes(q);
    return {
      sites: sites.filter(match).slice(0, 5),
      devices: devices.filter(match).slice(0, 8),
    };
  }, [searchQ, sites, devices]);

  const hasResults = results.sites.length + results.devices.length > 0;

  useEffect(() => {
    const onClick = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) setSearchOpen(false);
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false);
      if (userRef.current && !userRef.current.contains(e.target)) setUserOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  // Keyboard shortcut: "/" focuses search, "Esc" closes all dropdowns.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setSearchOpen(false); setNotifOpen(false); setUserOpen(false);
      }
      if (e.key === '/' && !/^(INPUT|TEXTAREA)$/.test(e.target.tagName)) {
        e.preventDefault();
        const input = searchRef.current?.querySelector('input');
        if (input) { input.focus(); setSearchOpen(true); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const displayName = user?.name || user?.preferred_username || 'Client';
  const initials = displayName.slice(0, 2).toUpperCase();

  const goTo = (path) => {
    setSearchOpen(false);
    setSearchQ('');
    navigate(path);
  };

  return (
    <header
      className="sticky top-0 z-30 border-b backdrop-blur"
      style={{
        background: 'color-mix(in srgb, var(--color-surface-1) 80%, transparent)',
        borderColor: 'color-mix(in srgb, var(--color-ink-0) 8%, transparent)',
      }}
    >
      <div className="flex items-center gap-3 px-4 md:px-6 h-14">
        {/* Left: hamburger (mobile only) */}
        <button onClick={toggleSidebar} className="p-1.5 rounded-lg text-[var(--color-ink-2)] hover:text-[var(--color-ink-0)] lg:hidden">
          <Menu className="w-5 h-5" />
        </button>

        {/* spacer pushes everything to the right */}
        <div className="flex-1" />

        {/* Right-aligned cluster: search, theme, notifications, user */}
        <div className="flex items-center gap-1.5">
          {/* Search */}
          <div className="relative" ref={searchRef}>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-ink-3)] pointer-events-none" />
              <input
                value={searchQ}
                onChange={(e) => { setSearchQ(e.target.value); setSearchOpen(true); }}
                onFocus={() => setSearchOpen(true)}
                placeholder="Search sites & devices"
                className="w-44 sm:w-60 md:w-72 pl-9 pr-8 py-2 rounded-xl text-sm outline-none transition-all focus:w-72 sm:focus:w-80 md:focus:w-96"
                style={{
                  background: 'var(--color-surface-0)',
                  color: 'var(--color-ink-0)',
                  border: '1px solid color-mix(in srgb, var(--color-ink-0) 8%, transparent)',
                }}
              />
              {searchQ ? (
                <button
                  onClick={() => { setSearchQ(''); setSearchOpen(false); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-[var(--color-ink-3)] hover:text-[var(--color-ink-0)]"
                  aria-label="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              ) : (
                <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded text-[10px] font-mono hidden md:block"
                     style={{
                       background: 'color-mix(in srgb, var(--color-ink-0) 6%, transparent)',
                       color: 'var(--color-ink-3)',
                     }}>/</kbd>
              )}
            </div>

            <AnimatePresence>
              {searchOpen && searchQ && (
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.97 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-full mt-2 w-96 max-w-[92vw] rounded-2xl overflow-hidden border"
                  style={{
                    background: 'var(--color-surface-1)',
                    borderColor: 'color-mix(in srgb, var(--color-ink-0) 12%, transparent)',
                    boxShadow: '0 20px 50px -12px rgba(0,0,0,0.5)',
                  }}
                >
                  {!hasResults ? (
                    <div className="px-4 py-10 text-center">
                      <Search className="w-7 h-7 text-[var(--color-ink-3)] mx-auto mb-2" />
                      <p className="text-sm text-[var(--color-ink-2)]">No matches for &quot;{searchQ}&quot;</p>
                    </div>
                  ) : (
                    <div className="max-h-96 overflow-y-auto">
                      {results.sites.length > 0 && (
                        <div>
                          <p className="px-4 pt-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-ink-2)]">
                            Sites
                          </p>
                          {results.sites.map((s) => (
                            <button
                              key={s.id}
                              onClick={() => goTo(`/g/${s.id}`)}
                              className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-[color-mix(in_srgb,var(--color-ink-0)_5%,transparent)] transition-colors"
                            >
                              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                                   style={{
                                     background: 'color-mix(in srgb, var(--color-accent-500) 14%, transparent)',
                                     color: 'var(--color-accent-400)',
                                   }}>
                                <Building2 className="w-4 h-4" strokeWidth={1.75} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-[var(--color-ink-0)] truncate">{getAssetDisplayName(s)}</p>
                                <p className="text-[11px] text-[var(--color-ink-2)]">Site</p>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}

                      {results.devices.length > 0 && (
                        <div>
                          <p className="px-4 pt-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-ink-2)]">
                            Devices
                          </p>
                          {results.devices.map((d) => {
                            const t = getCustomAssetType(d);
                            return (
                              <button
                                key={d.id}
                                onClick={() => goTo(`/a/${d.id}`)}
                                className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-[color-mix(in_srgb,var(--color-ink-0)_5%,transparent)] transition-colors"
                              >
                                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                                     style={{
                                       background: 'color-mix(in srgb, var(--color-ink-0) 7%, transparent)',
                                       color: 'var(--color-ink-2)',
                                     }}>
                                  <AssetGlyph customType={t} className="w-4 h-4" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-semibold text-[var(--color-ink-0)] truncate">{getAssetDisplayName(d)}</p>
                                  <p className="text-[11px] text-[var(--color-ink-2)]">{getAssetTypeLabel(t)}</p>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                  <div className="px-4 py-2 border-t flex items-center justify-between text-[10px] text-[var(--color-ink-3)]"
                       style={{ borderColor: 'color-mix(in srgb, var(--color-ink-0) 8%, transparent)' }}>
                    <span>
                      {results.sites.length + results.devices.length} result
                      {results.sites.length + results.devices.length === 1 ? '' : 's'}
                    </span>
                    <span><kbd className="font-mono">Esc</kbd> to close</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <button
            onClick={toggleTheme}
            title={theme === 'light' ? 'Switch to dark' : 'Switch to light'}
            className="p-2 rounded-lg text-[var(--color-ink-2)] hover:text-[var(--color-ink-0)] hover:bg-[color-mix(in_srgb,var(--color-ink-0)_6%,transparent)]"
          >
            {theme === 'light' ? <Moon className="w-4.5 h-4.5" /> : <Sun className="w-4.5 h-4.5" />}
          </button>

          <div className="relative" ref={notifRef}>
            <button
              onClick={() => { setNotifOpen(!notifOpen); setUserOpen(false); setSearchOpen(false); }}
              className="relative p-2 rounded-lg text-[var(--color-ink-2)] hover:text-[var(--color-ink-0)] hover:bg-[color-mix(in_srgb,var(--color-ink-0)_6%,transparent)]"
            >
              <Bell className="w-4.5 h-4.5" />
              {alarmsList.length > 0 && (
                <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 flex items-center justify-center text-[9px] font-bold rounded-full bg-[var(--color-danger-500)] text-white">
                  {alarmsList.length > 99 ? '99+' : alarmsList.length}
                </span>
              )}
            </button>

            <AnimatePresence>
              {notifOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.97 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-full mt-2 w-80 rounded-2xl overflow-hidden border"
                  style={{
                    background: 'var(--color-surface-1)',
                    borderColor: 'color-mix(in srgb, var(--color-ink-0) 12%, transparent)',
                    boxShadow: '0 20px 50px -12px rgba(0,0,0,0.5)',
                  }}
                >
                  <div className="px-4 py-3 border-b flex items-center justify-between"
                       style={{ borderColor: 'color-mix(in srgb, var(--color-ink-0) 8%, transparent)' }}>
                    <h3 className="text-sm font-semibold text-[var(--color-ink-0)]">Active alarms</h3>
                    {alarmsList.length > 0 && <span className="text-[10px] px-2 py-0.5 rounded-full sev-critical">{alarmsList.length}</span>}
                  </div>
                  {recent.length === 0 ? (
                    <div className="px-4 py-10 text-center">
                      <Bell className="w-7 h-7 text-[var(--color-ink-3)] mx-auto mb-2" />
                      <p className="text-sm text-[var(--color-ink-2)]">All clear — no open alarms</p>
                    </div>
                  ) : (
                    <div className="max-h-80 overflow-y-auto">
                      {recent.map((al, i) => (
                        <button
                          key={al.id || i}
                          onClick={() => { setNotifOpen(false); navigate('/alarms'); }}
                          className="w-full text-left px-4 py-3 border-b last:border-0 flex items-start gap-3 hover:bg-[color-mix(in_srgb,var(--color-ink-0)_4%,transparent)]"
                          style={{ borderColor: 'color-mix(in srgb, var(--color-ink-0) 6%, transparent)' }}
                        >
                          <div className="p-1.5 rounded-lg mt-0.5"
                               style={{ background: 'color-mix(in srgb, var(--color-ink-0) 6%, transparent)' }}>
                            {severityIcon(al.severity)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-[var(--color-ink-0)] truncate">{al.title || 'Alarm'}</p>
                            <p className="text-[11px] text-[var(--color-ink-2)] truncate">{al.sourceName || al.source || ''}</p>
                            <p className="text-[10px] text-[var(--color-ink-3)] mt-0.5">{al.createdOn ? formatRelativeTime(al.createdOn) : ''}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="px-4 py-2.5 border-t"
                       style={{ borderColor: 'color-mix(in srgb, var(--color-ink-0) 8%, transparent)' }}>
                    <button
                      onClick={() => { setNotifOpen(false); navigate('/alarms'); }}
                      className="text-xs font-semibold text-[var(--color-accent-400)] hover:text-[var(--color-accent-300)] w-full text-center"
                    >
                      View all alarms
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="relative" ref={userRef}>
            <button
              onClick={() => { setUserOpen(!userOpen); setNotifOpen(false); setSearchOpen(false); }}
              className="flex items-center gap-2 pl-1.5 pr-2 py-1 rounded-xl hover:bg-[color-mix(in_srgb,var(--color-ink-0)_6%,transparent)]"
            >
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                   style={{ background: 'linear-gradient(135deg, var(--color-accent-500), var(--color-brand-700))' }}>
                {initials}
              </div>
              <ChevronDown className={`w-3.5 h-3.5 text-[var(--color-ink-3)] hidden md:block transition-transform ${userOpen ? 'rotate-180' : ''}`} />
            </button>
            <AnimatePresence>
              {userOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.97 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-full mt-2 w-56 rounded-2xl overflow-hidden border"
                  style={{
                    background: 'var(--color-surface-1)',
                    borderColor: 'color-mix(in srgb, var(--color-ink-0) 12%, transparent)',
                    boxShadow: '0 20px 50px -12px rgba(0,0,0,0.5)',
                  }}
                >
                  <div className="px-4 py-3 border-b"
                       style={{ borderColor: 'color-mix(in srgb, var(--color-ink-0) 8%, transparent)' }}>
                    <p className="text-sm font-semibold text-[var(--color-ink-0)]">{displayName}</p>
                    <p className="text-xs text-[var(--color-ink-2)] truncate">{user?.email || ''}</p>
                  </div>
                  <button
                    onClick={() => { setUserOpen(false); navigate('/settings'); }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[var(--color-ink-1)] hover:bg-[color-mix(in_srgb,var(--color-ink-0)_4%,transparent)]"
                  >
                    <Settings className="w-4 h-4 text-[var(--color-ink-2)]" />
                    Settings
                  </button>
                  <button
                    onClick={() => { setUserOpen(false); logout(); navigate('/login'); }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[var(--color-danger-400)] hover:bg-[color-mix(in_srgb,var(--color-danger-500)_10%,transparent)] border-t"
                    style={{ borderColor: 'color-mix(in srgb, var(--color-ink-0) 8%, transparent)' }}
                  >
                    <LogOut className="w-4 h-4" />
                    Sign out
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </header>
  );
}

