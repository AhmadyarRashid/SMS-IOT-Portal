/* ==========================================================================
   Camera event constants

   Camera detection events are exposed by the AI side as OpenRemote
   datapoints on the `eventId` attribute. Each datapoint's value is a single
   `{ id, label }` object — the id is the AI-side event identifier, the
   label is the raw category ("person", "animal", anything else).

   The actual clip / snapshot bytes live on a separate media server. The
   per-camera `eventsBaseUrl` attribute (read via `getCameraEventsBaseUrl`
   in utils/gateways.js) holds that origin — e.g. `https://100.84.108.142:8443`
   — so each camera points at its own media host. There is **no fallback**:
   a camera with no `eventsBaseUrl` resolves no clip / snapshot URLs, and the
   UI surfaces a "clips not configured" error instead of fabricating a host.
   ========================================================================== */

// Attribute name on every CameraAsset that exposes the event datapoints
// stream. Kept as a constant so the OR-side rename is a one-liner here.
export const CAMERA_EVENT_ATTRIBUTE = 'eventId';

// Operator-facing message shown (as a toast) when a clip / snapshot can't be
// built because the camera's media origin is missing or malformed. Kept
// non-technical on purpose — no attribute names, no "OpenRemote" — the
// operator just needs to know it's a config issue for the admin to fix.
export const EVENT_CLIP_MISSING_MESSAGE =
  'Event clip configuration is missing. Please contact your administrator.';

// Normalise the per-camera media origin: trim and strip a trailing slash so
// `${base}/api/...` never doubles up. Returns null when no usable base — the
// builders then return null and the caller shows the missing-config error.
function trimBase(baseUrl) {
  if (typeof baseUrl !== 'string' || !baseUrl.trim()) return null;
  return baseUrl.trim().replace(/\/+$/, '');
}

export function getEventSnapshotUrl(eventId, baseUrl) {
  const base = trimBase(baseUrl);
  if (!eventId || !base) return null;
  return `${base}/api/events/${encodeURIComponent(eventId)}/snapshot.jpg`;
}

export function getEventClipUrl(eventId, baseUrl) {
  const base = trimBase(baseUrl);
  if (!eventId || !base) return null;
  return `${base}/api/events/${encodeURIComponent(eventId)}/clip.mp4`;
}

export function getTimeRangeClipUrl(cameraId, start, end, baseUrl) {
  const base = trimBase(baseUrl);
  if (!cameraId || !base || !Number.isFinite(start) || !Number.isFinite(end)) return null;
  return `${base}/api/${encodeURIComponent(cameraId)}/start/${start}/end/${end}/clip.mp4`;
}

// Raw AI labels → telco scope buckets. Anything not in this map falls into
// `other` (matches the existing DETECTION_TYPES chips in the Video modal).
const LABEL_MAP = {
  person: 'human',
  human: 'human',
  animal: 'animal',
};

export function normalizeEventLabel(raw) {
  if (!raw) return 'other';
  return LABEL_MAP[String(raw).toLowerCase()] || 'other';
}
