/**
 * Alarm-shape helpers.
 *
 * The portal stays defensive about how the AI side fills in alarm fields
 * because OR alarms are loosely typed — `title`, `content`, `severity`,
 * `status`, `createdOn`, `lastModified` are the load-bearing ones; anything
 * else is best-effort.
 */

/**
 * Strip any `http(s)://...` URLs out of an alarm's content / description
 * text. The dashboard surfaces the URL only via the dedicated "View clip"
 * icon — operators should never see the raw URL in the description row,
 * because it's noisy and clickable URLs in text would conflict with the
 * dedicated button.
 *
 * Returns a cleaned, trimmed string with no URLs, or `null` if nothing
 * meaningful remains (e.g. content was JUST a URL).
 */
export function getAlarmContentText(alarm) {
  const text = alarm?.content || alarm?.description;
  if (typeof text !== 'string') return null;
  const stripped = text.replace(/https?:\/\/[^\s,)>"'<]+/gi, '');
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
 * Resolution order:
 *   1. A dedicated structured field on the alarm — `clipUrl`, `videoUrl`,
 *      or `streamUrl` (first non-empty wins). Recommended for new
 *      installations: backend rule writes the clip URL straight onto the
 *      alarm as it's raised.
 *   2. Fallback — extract the first `http(s)://...` URL found in the
 *      `content` or `description` text. Useful when the AI side just dumps
 *      "Person detected — https://media.../clip.mp4" into the alarm body.
 *
 * Returns `null` when nothing is available. Consumers should hide the
 * "View clip" affordance in that case (no placeholder data rule).
 */
export function getAlarmClipUrl(alarm) {
  if (!alarm) return null;

  // Structured field — preferred.
  for (const key of ['clipUrl', 'videoUrl', 'streamUrl']) {
    const v = alarm[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }

  // Extract from content / description text.
  for (const text of [alarm.content, alarm.description]) {
    if (typeof text !== 'string') continue;
    const m = text.match(/https?:\/\/[^\s,)>"'<]+/i);
    if (m) return m[0];
  }

  return null;
}
