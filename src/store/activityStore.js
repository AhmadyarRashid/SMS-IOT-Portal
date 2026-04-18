import { create } from 'zustand';

/**
 * Activity ring buffer (most-recent-first).
 *
 * Event shape:
 *   {
 *     id:          string    (stable per event — dedupes re-pushes)
 *     kind:        'alarm' | 'control' | 'state' | 'info'
 *     title:       string
 *     detail?:     string
 *     assetId?:    string
 *     assetName?:  string
 *     attributeName?: string
 *     value?:      any
 *     severity?:   'critical' | 'high' | 'medium' | 'low' | 'info'
 *     timestamp:   number (ms since epoch)
 *   }
 */

const MAX = 200;

// Session start — captured once when the module is first imported (i.e. on
// app mount). Used by the /live page to show "since …" and to partition
// events into "this session" vs. "earlier alarms" buckets.
export const SESSION_START = Date.now();

const useActivityStore = create((set, get) => ({
  events: [],

  push: (event) => {
    if (!event || !event.id) return;
    const existing = get().events;
    if (existing.some((e) => e.id === event.id)) return;
    const next = [event, ...existing].slice(0, MAX);
    set({ events: next });
  },

  pushMany: (incoming) => {
    if (!Array.isArray(incoming) || incoming.length === 0) return;
    const existing = get().events;
    const seen = new Set(existing.map((e) => e.id));
    const added = [];
    for (const e of incoming) {
      if (!e || !e.id || seen.has(e.id)) continue;
      seen.add(e.id);
      added.push(e);
    }
    if (added.length === 0) return;
    const merged = [...added, ...existing]
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
      .slice(0, MAX);
    set({ events: merged });
  },

  clear: () => set({ events: [] }),

  // Drop only non-alarm events. Alarms are server-sourced and re-seeding them
  // depends on a "first fetch" flag inside useLiveEvents — clearing them
  // would leave the feed empty until the next new alarm arrives.
  clearSession: () =>
    set((s) => ({ events: s.events.filter((e) => e.kind === 'alarm') })),
}));

export default useActivityStore;
