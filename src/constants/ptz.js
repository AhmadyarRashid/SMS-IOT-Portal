/* ==========================================================================
   PTZ control endpoints

   The AI-side PTZ controller exposes one fire-and-forget GET per move:
     GET {PTZ_BASE_URL}/{cameraId}/ptz/MOVE_{UP|DOWN|LEFT|RIGHT}

   The body is empty and the response is ignored — each call is a single
   "nudge" of the camera in that direction. Multiple calls queue server-side.

   The cameraId here is the AI-side identifier (e.g. `cam243`), NOT the OR
   asset id. See `getCameraPtzId()` in `src/utils/gateways.js` for how that
   id is resolved from a CameraAsset / PtzCameraAsset.

   Mixed-content caveat — same story as `EVENTS_BASE_URL` in `events.js`:
   when the portal is served over HTTPS the browser blocks plain-HTTP
   requests from `<img>` / `<video>` AND `fetch`. For now the easiest path
   in dev is to serve the portal over HTTP; production deployments should
   reverse-proxy the PTZ host through the dashboard origin or front it
   with TLS so this becomes a one-line change here.
   ========================================================================== */

export const PTZ_BASE_URL = 'https://100.84.236.75:5002';

const ACTION_BY_DIRECTION = {
  up:    'MOVE_UP',
  down:  'MOVE_DOWN',
  left:  'MOVE_LEFT',
  right: 'MOVE_RIGHT',
};

export function getPtzMoveUrl(ptzId, direction) {
  if (!ptzId) return null;
  const action = ACTION_BY_DIRECTION[direction];
  if (!action) return null;
  return `${PTZ_BASE_URL}/${encodeURIComponent(ptzId)}/ptz/${action}`;
}
