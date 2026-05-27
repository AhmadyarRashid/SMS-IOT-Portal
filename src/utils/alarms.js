/**
 * Alarm-shape helpers.
 *
 * The portal stays defensive about how the AI side fills in alarm fields
 * because OR alarms are loosely typed — `title`, `content`, `severity`,
 * `status`, `createdOn`, `lastModified` are the load-bearing ones; anything
 * else is best-effort.
 */

import { getEventClipUrl, getEventSnapshotUrl } from '../constants/events';

// Matches the AI-side event id shape used by the Video page eventId
// datapoints — e.g. `1779269865.828876-zcx508`: a unix timestamp (optionally
// fractional) + dash + alphanumeric suffix. Kept strict enough that arbitrary
// hyphenated numbers in alarm bodies (timestamps, counts) don't match.
const EVENT_ID_RE = /\b\d{10,}(?:\.\d+)?-[A-Za-z0-9]+\b/;
const EVENT_ID_RE_GLOBAL = new RegExp(EVENT_ID_RE.source, 'g');
const URL_RE = /https?:\/\/[^\s,)>"'<]+/i;
const URL_RE_GLOBAL = new RegExp(URL_RE.source, 'gi');

function findUrl(text) {
  if (typeof text !== 'string') return null;
  const m = text.match(URL_RE);
  return m ? m[0] : null;
}

// Search for an event id only in the portion of the text that ISN'T inside
// a URL. Otherwise an event id embedded in a URL path
// (`https://media/api/events/1779…-zcx508/clip.mp4`) would false-match and
// route the icon to the wrong host. Stripping URLs first preserves the
// "explicit URL wins" intent.
function findEventId(text) {
  if (typeof text !== 'string') return null;
  const withoutUrls = text.replace(URL_RE_GLOBAL, ' ');
  const m = withoutUrls.match(EVENT_ID_RE);
  return m ? m[0] : null;
}

/**
 * Strip any `http(s)://...` URLs AND raw event ids out of an alarm's
 * content / description text. The dashboard surfaces playback only via the
 * dedicated "View clip" icon — operators should never see the raw URL or
 * event id in the description row, because it's noisy and clickable URLs
 * in text would conflict with the dedicated button.
 *
 * Returns a cleaned, trimmed string with no URLs / event ids, or `null` if
 * nothing meaningful remains (e.g. content was JUST a URL).
 */
export function getAlarmContentText(alarm) {
  const text = alarm?.content || alarm?.description;
  if (typeof text !== 'string') return null;
  const stripped = text.replace(URL_RE_GLOBAL, '').replace(EVENT_ID_RE_GLOBAL, '');
  // Collapse repeated whitespace, then trim leftover punctuation that often
  // dangles after a URL was removed ("Person detected — " → "Person detected").
  const tidy = stripped.replace(/\s+/g, ' ').replace(/^[\s,—–\-:|]+|[\s,—–\-:|]+$/g, '');
  return tidy || null;
}

/**
 * Extract the URL of a recorded clip associated with an alarm — used by the
 * "View clip" action on alert rows (Overview's Recent Alerts panel, the
 * Alerts page, the Audit Log).
 *
 * The description / content can carry the clip reference in either of two
 * shapes — both are handled here:
 *
 *   • **Literal URL** — `"Person detected — https://media.../clip.mp4"`.
 *     Returned as-is.
 *   • **Bare event id** — `"Person detected — 1779269865.828876-zcx508"`.
 *     Same id shape the Video page reads from the `eventId` datapoints
 *     stream. Built into a clip URL via `getEventClipUrl()` so the icon
 *     points at the same media server as the Video modal.
 *
 * Resolution order:
 *   1. A dedicated structured field on the alarm — `clipUrl`, `videoUrl`,
 *      or `streamUrl` (first non-empty wins). Recommended for new
 *      installations: backend rule writes the clip URL straight onto the
 *      alarm as it's raised.
 *   2. A literal `http(s)://...` URL in the `content` / `description` text.
 *      Checked before the event-id path so an explicit URL is always
 *      respected verbatim (and an event id embedded inside a URL path
 *      doesn't get extracted out and rebuilt against the wrong host).
 *   3. A raw event id in the `content` / `description` text (searched only
 *      in the non-URL portion of the text — see `findEventId`).
 *
 * Returns `null` when nothing is available. Consumers should hide the
 * "View clip" affordance in that case (no placeholder data rule).
 */
export function getAlarmClipUrl(alarm) {
  if (!alarm) return null;

  // 1. Structured field — preferred.
  for (const key of ['clipUrl', 'videoUrl', 'streamUrl']) {
    const v = alarm[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }

  // 2. Literal URL in description / content.
  for (const text of [alarm.content, alarm.description]) {
    const url = findUrl(text);
    if (url) return url;
  }

  // 3. Bare event id in description / content — built via the same helper
  //    the Video page uses, so a host change in `constants/events.js`
  //    updates both surfaces.
  for (const text of [alarm.content, alarm.description]) {
    const id = findEventId(text);
    if (id) return getEventClipUrl(id);
  }

  return null;
}

/**
 * Extract the AI-side event id associated with an alarm, when one is
 * available. The id is the same shape the Video page's `eventId` datapoints
 * stream uses (`1779269865.828876-zcx508`).
 *
 * Resolution order mirrors `getAlarmClipUrl` for consistency:
 *   1. A dedicated structured field — `eventId` (preferred for new
 *      deployments — backend rule writes the id straight onto the alarm).
 *   2. A raw event id in the `content` / `description` text, searched only
 *      in the non-URL portion so an id embedded inside a clip URL path
 *      doesn't get extracted out and re-routed.
 *
 * Returns `null` when no id is available; callers should fall back to the
 * direct clip URL (which may have been provided as a literal URL).
 */
export function getAlarmEventId(alarm) {
  if (!alarm) return null;

  // 1. Structured field.
  const direct = alarm.eventId;
  if (typeof direct === 'string' && direct.trim()) return direct.trim();

  // 2. Bare event id in description / content.
  for (const text of [alarm.content, alarm.description]) {
    const id = findEventId(text);
    if (id) return id;
  }

  return null;
}

/**
 * Snapshot URL for an alarm, derived from its event id when available.
 * Used by the alarm clip modal to preview a still frame before pulling the
 * video bytes. Returns `null` when the alarm carries no event id — the
 * modal then jumps straight to clip playback (no snapshot step).
 */
export function getAlarmSnapshotUrl(alarm) {
  const id = getAlarmEventId(alarm);
  return id ? getEventSnapshotUrl(id) : null;
}

/**
 * Best-effort detection-category label, derived from alarm title + body
 * text. Returns one of `'human' | 'animal' | 'vehicle'` when a keyword
 * matches; `null` when no clear category. Used by the alarm clip modal
 * to render a small detection chip alongside the camera name.
 *
 * Intentionally lightweight — the AI side doesn't currently expose a
 * structured detection field on the alarm. If/when it does, prefer
 * reading that and only fall back to this heuristic.
 */
export function getAlarmDetectionLabel(alarm) {
  if (!alarm) return null;
  const hay = `${alarm.title || ''} ${alarm.content || ''} ${alarm.description || ''}`.toLowerCase();
  if (/\b(person|human|intruder|trespass|people)\b/.test(hay)) return 'human';
  if (/\b(animal|dog|cat|wildlife|bird)\b/.test(hay)) return 'animal';
  if (/\b(vehicle|car|truck|bike|motorcycle|van)\b/.test(hay)) return 'vehicle';
  return null;
}
