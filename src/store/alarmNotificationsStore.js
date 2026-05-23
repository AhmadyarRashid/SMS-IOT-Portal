import { create } from 'zustand';

/**
 * In-app alarm notifications — feeds the Mac-style `AlarmNotificationStack`
 * mounted in `DashboardLayout`.
 *
 * Replaces the previous `toast.error(…)` flow inside `useLiveEvents`, which
 * dropped multiple `react-hot-toast` cards into the top-right corner — those
 * had no close affordance, auto-expired only after several seconds, and
 * covered the site dropdown the whole time. The stack lives BELOW the
 * sticky header so it never overlaps header controls; each card has its
 * own close button, and `dismissAll()` empties the list in one click.
 *
 * De-duped by alarm id so a re-render of the alarm watcher can't push the
 * same alarm twice. Capped at MAX_ITEMS to bound memory if the AI side
 * floods.
 */
const MAX_ITEMS = 25;

const useAlarmNotificationsStore = create((set) => ({
  items: [],
  push: (alarm) => set((state) => {
    if (!alarm || !alarm.id) return state;
    if (state.items.some((i) => i.id === alarm.id)) return state;
    const item = { id: alarm.id, alarm, ts: Date.now() };
    return { items: [item, ...state.items].slice(0, MAX_ITEMS) };
  }),
  dismiss: (id) => set((state) => ({ items: state.items.filter((i) => i.id !== id) })),
  dismissAll: () => set({ items: [] }),
}));

export default useAlarmNotificationsStore;
