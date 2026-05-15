import { create } from 'zustand';

const KEY_CITY = 'sms_secureops_city';
const KEY_TOWER = 'sms_secureops_tower';

const savedCity = (typeof localStorage !== 'undefined' && localStorage.getItem(KEY_CITY)) || null;
const savedTower = (typeof localStorage !== 'undefined' && localStorage.getItem(KEY_TOWER)) || null;

/**
 * Cross-tab selection for the SecureOps dashboard.
 *   selectedCityId  — null means "All Sites" (the dropdown's first option).
 *   selectedTowerId — the tower whose live cameras / remote control / telemetry
 *                     is currently active. Null = auto-pick first tower of the
 *                     selected city.
 *
 * Persisted in localStorage so the user lands on the same scope after refresh.
 */
const useSecureOpsStore = create((set) => ({
  selectedCityId: savedCity,
  selectedTowerId: savedTower,

  setCity: (id) => {
    if (typeof localStorage !== 'undefined') {
      if (id) localStorage.setItem(KEY_CITY, id);
      else localStorage.removeItem(KEY_CITY);
      // Clear the tower so the next render auto-picks the first tower in the
      // new city. Otherwise we'd point at a tower that no longer exists in scope.
      localStorage.removeItem(KEY_TOWER);
    }
    set({ selectedCityId: id, selectedTowerId: null });
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
