/**
 * Defensive nested-property reader. Used inside translators so a missing
 * intermediate object on a server payload doesn't crash the page — translators
 * fall back to a typed default instead.
 *
 *   safeGet(dto, 'user.profile.email', null)
 *   safeGet(dto, ['list', 0, 'id'], '')
 */
export function safeGet(obj, path, fallback = undefined) {
  if (obj == null) return fallback;
  const parts = Array.isArray(path) ? path : String(path).split('.');
  let cur = obj;
  for (const part of parts) {
    if (cur == null) return fallback;
    cur = cur[part];
  }
  return cur === undefined ? fallback : cur;
}

/**
 * Coerce anything to a string id. `null`/`undefined` become `''`. Numbers and
 * booleans pass through `String()`. Objects use their `id` field if present.
 */
export function toId(v) {
  if (v == null) return '';
  if (typeof v === 'object') return v.id != null ? String(v.id) : '';
  return String(v);
}

/**
 * Map an array safely — non-arrays become `[]`. Inner items that the mapper
 * returns `null` for are dropped.
 */
export function mapArray(arr, fn) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    const next = fn(arr[i], i);
    if (next != null) out.push(next);
  }
  return out;
}

export default safeGet;
