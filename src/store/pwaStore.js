import { create } from 'zustand';

/**
 * Global capture of the `beforeinstallprompt` event so both the bottom-left
 * install toast AND the Settings page can trigger the native install UI.
 * The browser only fires the event once per navigation and the prompt() method
 * is single-shot, so we have to capture it at a single well-known place.
 *
 * The listener is mounted from DashboardLayout (once per authenticated
 * session). On iOS Safari the event never fires — `event` stays null and the
 * consumers simply don't render the install button.
 */
const usePwaStore = create((set, get) => ({
  event: null,
  installed: false,

  _registerListener: () => {
    if (typeof window === 'undefined') return () => {};
    const onPrompt = (e) => { e.preventDefault(); set({ event: e }); };
    const onInstalled = () => set({ event: null, installed: true });
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);

    // Detect already-installed state.
    const standalone = window.matchMedia?.('(display-mode: standalone)').matches
      || window.navigator.standalone;
    if (standalone) set({ installed: true });

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  },

  install: async () => {
    const evt = get().event;
    if (!evt) return { ok: false, reason: 'not-available' };
    evt.prompt();
    try {
      const choice = await evt.userChoice;
      set({ event: null });
      return { ok: choice?.outcome === 'accepted', reason: choice?.outcome };
    } catch {
      set({ event: null });
      return { ok: false, reason: 'error' };
    }
  },
}));

export default usePwaStore;
