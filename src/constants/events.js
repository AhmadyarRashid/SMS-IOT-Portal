/* ==========================================================================
   Camera event constants

   Camera detection events are exposed by the AI side as OpenRemote
   datapoints on the `eventId` attribute. Each datapoint's value is a single
   `{ id, label }` object — the id is the AI-side event identifier, the
   label is the raw category ("person", "animal", anything else).

   The actual clip / snapshot bytes live on a separate media server. This
   file is the one place that knows the base URL + path layout, so a host
   change is a single-line edit.
   ========================================================================== */

export const EVENTS_BASE_URL = 'https://media.smsiotpk.com:8971';

// Attribute name on every CameraAsset that exposes the event datapoints
// stream. Kept as a constant so the OR-side rename is a one-liner here.
export const CAMERA_EVENT_ATTRIBUTE = 'eventId';

export function getEventSnapshotUrl(eventId) {
  if (!eventId) return null;
  return `${EVENTS_BASE_URL}/api/events/${encodeURIComponent(eventId)}/snapshot.jpg`;
}

export function getEventClipUrl(eventId) {
  if (!eventId) return null;
  return `${EVENTS_BASE_URL}/api/events/${encodeURIComponent(eventId)}/clip.mp4`;
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
