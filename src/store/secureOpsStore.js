import { create } from 'zustand';

const KEY_SITE = 'sms_secureops_site';
const KEY_TOWER = 'sms_secureops_tower';

const savedSite = (typeof localStorage !== 'undefined' && localStorage.getItem(KEY_SITE)) || null;
const savedTower = (typeof localStorage !== 'undefined' && localStorage.getItem(KEY_TOWER)) || null;

/**
 * Cross-tab selection for the SecureOps dashboard.
 *   selectedSiteId  — null means "All Sites" (the dropdown's first option).
 *                     A "site" here is a top-level `SiteAsset` container.
 *   selectedTowerId — the tower whose live cameras / remote control / telemetry
 *                     is currently active. Null = auto-pick first tower of the
 *                     selected site.
 *
 * Persisted in localStorage so the user lands on the same scope after refresh.
 */
const useSecureOpsStore = create((set) => ({
  selectedSiteId: savedSite,
  selectedTowerId: savedTower,

  setSite: (id) => {
    if (typeof localStorage !== 'undefined') {
      if (id) localStorage.setItem(KEY_SITE, id);
      else localStorage.removeItem(KEY_SITE);
      // Clear the tower so the next render auto-picks the first tower in the
      // new site. Otherwise we'd point at a tower that no longer exists in
      // scope.
      localStorage.removeItem(KEY_TOWER);
    }
    set({ selectedSiteId: id, selectedTowerId: null });
  },

  setTower: (id) => {
    if (typeof localStorage !== 'undefined') {
      if (id) localStorage.setItem(KEY_TOWER, id);
      else localStorage.removeItem(KEY_TOWER);
    }
    set({ selectedTowerId: id });
  },
}));

export default useSecureOpsStore;
