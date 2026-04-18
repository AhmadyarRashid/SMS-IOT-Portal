import { get, set, del, clear, createStore } from 'idb-keyval';

// Single IDB database, single store — simple key/value for user prefs.
// Falls back to localStorage silently if IndexedDB is unavailable
// (private mode in some browsers, old embedded webviews).
const store = createStore('sms-iot-prefs', 'kv');
const LS_PREFIX = 'sms_iot_pref_';

const useLS = typeof indexedDB === 'undefined';

async function read(key) {
  if (useLS) {
    try {
      const raw = localStorage.getItem(LS_PREFIX + key);
      return raw == null ? undefined : JSON.parse(raw);
    } catch {
      return undefined;
    }
  }
  try {
    return await get(key, store);
  } catch {
    return undefined;
  }
}

async function write(key, value) {
  if (useLS) {
    try { localStorage.setItem(LS_PREFIX + key, JSON.stringify(value)); } catch { /* quota */ }
    return;
  }
  try { await set(key, value, store); } catch { /* noop */ }
}

async function remove(key) {
  if (useLS) {
    try { localStorage.removeItem(LS_PREFIX + key); } catch { /* noop */ }
    return;
  }
  try { await del(key, store); } catch { /* noop */ }
}

// ---- Tips ------------------------------------------------------------------

const TIPS_KEY = 'tips_dismissed';

export async function getDismissedTips() {
  return (await read(TIPS_KEY)) || [];
}

export async function dismissTip(id) {
  const list = await getDismissedTips();
  if (!list.includes(id)) await write(TIPS_KEY, [...list, id]);
}

export async function resetTips() {
  await remove(TIPS_KEY);
}

// ---- Tutorial --------------------------------------------------------------

const TUTORIAL_KEY = 'tutorial_progress';

export async function getTutorialProgress() {
  return (await read(TUTORIAL_KEY)) || { completedSteps: [] };
}

export async function markTutorialStep(stepId) {
  const p = await getTutorialProgress();
  if (!p.completedSteps.includes(stepId)) {
    await write(TUTORIAL_KEY, { completedSteps: [...p.completedSteps, stepId] });
  }
}

export async function resetTutorial() {
  await remove(TUTORIAL_KEY);
}

// ---- Quick-access layout ---------------------------------------------------
//
// Each item: { id: assetId, size: 'small' | 'large' }. Order in the array
// determines placement — tiles auto-compact from top-left like iPhone widgets.
//
// Migrations:
//   - very old: string[] of asset ids        → [{id, size:'small'}]
//   - previous: {i, x, y, w, h}[] from RGL   → [{id, size}] (size inferred
//                                              from width: w>=4 is large)

const QUICK_KEY = 'quick_access_layout';

export const QUICK_SIZES = ['small', 'large'];

function normaliseLayoutEntry(v) {
  if (typeof v === 'string') return { id: v, size: 'small' };
  if (v && typeof v === 'object') {
    // New shape
    if (typeof v.id === 'string' && QUICK_SIZES.includes(v.size)) {
      return { id: v.id, size: v.size };
    }
    // RGL shape
    if (typeof v.i === 'string' && Number.isFinite(v.w)) {
      return { id: v.i, size: v.w >= 4 ? 'large' : 'small' };
    }
  }
  return null;
}

export async function getQuickLayout() {
  const v = await read(QUICK_KEY);
  if (!Array.isArray(v)) return [];
  return v.map(normaliseLayoutEntry).filter(Boolean);
}

export async function setQuickLayout(layout) {
  await write(QUICK_KEY, layout);
}

// ---- Nuclear: clear everything this app owns in the browser ----------------
//
// Wipes the IDB key/value store AND every localStorage key this app sets.
// Intentionally does NOT touch auth tokens (`or_access_token` / `or_refresh_token`)
// — signing the user out is a separate action in the UI.

const LOCAL_KEYS_EXACT = [
  'dashboard_settings',  // legacy settings panel state
  'sms_density',         // appStore density
  'sms_install_dismissed',
  'sms_notify_alarms',
  'or_theme',            // appStore theme (if persisted)
  'sms_iot_theme',
];

const LOCAL_KEY_PREFIXES = [
  LS_PREFIX, // localStorage-fallback copies of IDB entries
];

export async function clearAllPrefs() {
  // Wipe IDB store.
  if (!useLS) {
    try { await clear(store); } catch { /* ignore */ }
  }

  // Wipe known localStorage app keys.
  try {
    const toRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (LOCAL_KEYS_EXACT.includes(k)) { toRemove.push(k); continue; }
      if (LOCAL_KEY_PREFIXES.some((p) => k.startsWith(p))) toRemove.push(k);
    }
    toRemove.forEach((k) => {
      try { localStorage.removeItem(k); } catch { /* noop */ }
    });
  } catch { /* noop */ }
}
