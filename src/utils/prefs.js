import { get, set, del, createStore } from 'idb-keyval';

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
