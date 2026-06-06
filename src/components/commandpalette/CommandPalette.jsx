import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from '@/lib/router-shim';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, ArrowRight, LayoutGrid, Building2, Sparkles, Bell, MapPin,
  BookOpen, Activity, Settings, Sun, Moon, Lightbulb, Lock, Siren, Cpu,
  Command, CornerDownLeft,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAssets, useWriteAttribute } from '../../hooks/useAssets';
import {
  getCustomAssetType, CONTROLLABLE_TYPES, getAssetTypeLabel, getAssetDisplayName,
} from '../../utils/assetIcons';
import { pickAllDevices, pickGateways } from '../../utils/gateways';
import useAppStore from '../../store/appStore';
import AssetGlyph from '../tiles/AssetGlyph';
import './command-palette.css';

/**
 * Cmd/Ctrl+K-launched command palette. Mounted once at the layout level.
 *
 * Searchable sources:
 *   • Pages        — the 8 top-level routes
 *   • Sites        — every gateway asset
 *   • Devices      — every controllable + readable device
 *   • Actions      — bulk ops (lights off / lock all / arm all) + theme toggle
 *
 * Keyboard: ↑↓ navigate, Enter run, Esc close, Ctrl+K toggle.
 */
export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const navigate = useNavigate();
  const write = useWriteAttribute();
  const { data: assets = [] } = useAssets({});
  const { theme, toggleTheme } = useAppStore();

  // Global keybinding — Cmd/Ctrl+K opens, Esc closes.
  useEffect(() => {
    const openPalette = () => {
      // Reset state inside the event handler (not inside an effect body) so
      // React 19's set-state-in-effect lint stays happy.
      setQ('');
      setCursor(0);
      setOpen(true);
      setTimeout(() => inputRef.current?.focus(), 40);
    };
    const onKey = (e) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (open) setOpen(false);
        else openPalette();
        return;
      }
      if (e.key === 'Escape' && open) {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // -- Command sources ------------------------------------------------------
  const commands = useMemo(() => {
    const gateways = pickGateways(assets);
    const devices = pickAllDevices(assets);

    const pages = [
      { id: 'pg-overview',   kind: 'Page', icon: LayoutGrid, title: 'Overview',         to: '/' },
      { id: 'pg-sites',      kind: 'Page', icon: Building2,  title: 'Sites',            to: '/sites' },
      { id: 'pg-quick',      kind: 'Page', icon: Sparkles,   title: 'Quick access',     to: '/quick' },
      { id: 'pg-live',       kind: 'Page', icon: Activity,   title: 'Live feed',        to: '/live' },
      { id: 'pg-alarms',     kind: 'Page', icon: Bell,       title: 'Alarms',           to: '/alarms' },
      { id: 'pg-map',        kind: 'Page', icon: MapPin,     title: 'Map',              to: '/map' },
      { id: 'pg-tutorial',   kind: 'Page', icon: BookOpen,   title: 'Tutorial',         to: '/tutorial' },
      { id: 'pg-settings',   kind: 'Page', icon: Settings,   title: 'Settings',         to: '/settings' },
    ];

    const siteItems = gateways.map((g) => ({
      id: `gw-${g.id}`,
      kind: 'Site',
      icon: Building2,
      title: getAssetDisplayName(g),
      subtitle: 'Open site',
      to: `/g/${g.id}`,
    }));

    const deviceItems = devices.map((d) => {
      const customType = getCustomAssetType(d);
      return {
        id: `dv-${d.id}`,
        kind: 'Device',
        glyphType: customType,
        title: getAssetDisplayName(d),
        subtitle: getAssetTypeLabel(customType),
        to: `/a/${d.id}`,
      };
    });

    // Toggle actions — only listed for controllable devices. They show up as
    // a separate item from the "open device detail" entry.
    const toggleActions = devices
      .filter((d) => CONTROLLABLE_TYPES.includes(getCustomAssetType(d)))
      .map((d) => ({
        id: `tog-${d.id}`,
        kind: 'Action',
        glyphType: getCustomAssetType(d),
        title: `Toggle ${getAssetDisplayName(d)}`,
        subtitle: 'Flip on/off',
        run: () => {
          const v = d.attributes?.onOff?.value;
          const customType = getCustomAssetType(d);
          const attrName = customType === 'FanAsset' && d.attributes?.Fan
            ? 'Fan'
            : 'onOff';
          write.mutate({
            assetId: d.id,
            attributeName: attrName,
            value: typeof v === 'boolean' ? !v : true,
          });
          toast.success(`${getAssetDisplayName(d)} toggled`);
        },
      }));

    const bulkActions = [
      {
        id: 'bulk-lights-off',
        kind: 'Action', icon: Lightbulb,
        title: 'All lights off',
        subtitle: 'Turn off every LightAsset',
        run: () => runBulk('LightAsset', 'onOff', false, assets, write),
      },
      {
        id: 'bulk-lock-all',
        kind: 'Action', icon: Lock,
        title: 'Lock all doors',
        subtitle: 'Lock every DoorLockAsset',
        run: () => runBulk('DoorLockAsset', 'onOff', true, assets, write),
      },
      {
        id: 'bulk-arm-all',
        kind: 'Action', icon: Siren,
        title: 'Arm all alarms',
        subtitle: 'Arm every AlarmAsset',
        run: () => runBulk('AlarmAsset', 'onOff', true, assets, write),
      },
      {
        id: 'act-theme',
        kind: 'Action',
        icon: theme === 'dark' ? Sun : Moon,
        title: theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode',
        subtitle: 'Toggle theme',
        run: () => toggleTheme(),
      },
    ];

    return [...pages, ...siteItems, ...deviceItems, ...bulkActions, ...toggleActions];
  }, [assets, theme, toggleTheme, write]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return commands.slice(0, 12);
    return commands
      .map((c) => ({ c, score: score(c, needle) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 30)
      .map((x) => x.c);
  }, [commands, q]);

  const grouped = useMemo(() => {
    const m = new Map();
    for (const c of filtered) {
      if (!m.has(c.kind)) m.set(c.kind, []);
      m.get(c.kind).push(c);
    }
    return Array.from(m.entries());
  }, [filtered]);

  const flat = filtered; // cursor-indexable flat list (same order as grouped)

  const run = (cmd) => {
    if (!cmd) return;
    if (cmd.to) navigate(cmd.to);
    else if (cmd.run) cmd.run();
    setOpen(false);
  };

  const onInputKey = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, flat.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      run(flat[cursor]);
    }
  };

  // Scroll active item into view
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-cp-idx="${cursor}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [cursor, open]);

  return (
    <AnimatePresence>
      {open && (
        <div className="cp-root" onClick={() => setOpen(false)}>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="cp-backdrop"
          />
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            className="cp-panel"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Command palette"
          >
            <div className="cp-inputwrap">
              <Search className="w-4 h-4 text-[var(--color-ink-3)] flex-shrink-0" />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => { setQ(e.target.value); setCursor(0); }}
                onKeyDown={onInputKey}
                placeholder="Search sites, devices, pages, actions…"
                className="cp-input"
              />
              <kbd className="cp-kbd">esc</kbd>
            </div>

            <div ref={listRef} className="cp-list">
              {flat.length === 0 ? (
                <p className="cp-empty">No matches for “{q}”.</p>
              ) : (
                grouped.map(([kind, items]) => (
                  <div key={kind} className="cp-group">
                    <p className="cp-group-label">{kind}</p>
                    {items.map((c) => {
                      const idx = flat.indexOf(c);
                      const active = idx === cursor;
                      return (
                        <button
                          key={c.id}
                          data-cp-idx={idx}
                          onMouseEnter={() => setCursor(idx)}
                          onClick={() => run(c)}
                          className={`cp-item ${active ? 'cp-item-active' : ''}`}
                        >
                          <span className="cp-item-glyph">
                            {c.icon
                              ? <c.icon className="w-4 h-4" strokeWidth={1.75} />
                              : c.glyphType
                                ? <AssetGlyph customType={c.glyphType} className="w-4 h-4" strokeWidth={1.75} />
                                : <Cpu className="w-4 h-4" />}
                          </span>
                          <span className="cp-item-main">
                            <span className="cp-item-title">{c.title}</span>
                            {c.subtitle && <span className="cp-item-sub">{c.subtitle}</span>}
                          </span>
                          {active && <ArrowRight className="w-3.5 h-3.5 text-[var(--color-accent-400)] flex-shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>

            <div className="cp-footer">
              <span className="cp-hint"><kbd className="cp-kbd">↑</kbd><kbd className="cp-kbd">↓</kbd> navigate</span>
              <span className="cp-hint"><kbd className="cp-kbd"><CornerDownLeft className="w-3 h-3 inline" /></kbd> select</span>
              <span className="cp-hint ml-auto"><kbd className="cp-kbd"><Command className="w-3 h-3 inline" /></kbd><kbd className="cp-kbd">K</kbd> toggle</span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

/* -------- Fuzzy-ish scorer -------- */

function score(cmd, needle) {
  const haystack = `${cmd.title} ${cmd.subtitle || ''} ${cmd.kind || ''}`.toLowerCase();
  if (haystack.includes(needle)) {
    // Boost exact-prefix matches on the title.
    const titleLower = cmd.title.toLowerCase();
    if (titleLower.startsWith(needle)) return 100 + needle.length;
    if (titleLower.includes(needle)) return 60 + needle.length;
    return 20 + needle.length;
  }
  // Fallback: all characters appear in order
  let i = 0;
  for (const ch of haystack) {
    if (ch === needle[i]) i++;
    if (i === needle.length) return 5;
  }
  return 0;
}

/* -------- Bulk action helper -------- */

function runBulk(customType, attrName, value, assets, write) {
  const targets = assets.filter((a) => getCustomAssetType(a) === customType);
  if (!targets.length) {
    toast('Nothing to do — no matching devices', { icon: 'ℹ️' });
    return;
  }
  Promise.allSettled(
    targets.map((a) => write.mutateAsync({ assetId: a.id, attributeName: attrName, value }))
  ).then(() => {
    toast.success(`${customType.replace('Asset', '')} · ${targets.length} devices`);
  });
}
