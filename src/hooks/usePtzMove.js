import { useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import { getCameraPtzId } from '../utils/gateways';
import { getPtzMoveUrl } from '../constants/ptz';

/* ==========================================================================
   usePtzMove

   Returns `{ move(direction), available }` for a PtzCameraAsset.

   • `move('up' | 'down' | 'left' | 'right')` — fires a fire-and-forget GET
     to the PTZ controller's nudge endpoint. The response is ignored, so we
     use `mode: 'no-cors'` to avoid CORS preflight noise — every browser
     fetch to the PTZ host is one-way (control out, no read back).
   • `available` — false when the camera has no resolvable AI-side id
     (neither a `ptzId` / `cameraId` attribute nor an extractable segment
     in `liveStreamUrl`). The pad still renders so the operator knows
     PTZ is intended; pressing a button surfaces a toast instead of
     silently doing nothing.

   Soft-throttle: presses closer than 150ms apart are dropped. Stops a
   double-tap from sending two MOVE commands when the operator meant one,
   without making rapid intentional taps feel sluggish.
   ========================================================================== */

const THROTTLE_MS = 150;

export function usePtzMove(camera) {
  const lastPressAt = useRef(0);
  const ptzId = getCameraPtzId(camera);

  const move = useCallback((direction) => {
    if (!ptzId) {
      toast.error('PTZ id not configured for this camera.');
      return;
    }
    const now = new Date().getTime();
    if (now - lastPressAt.current < THROTTLE_MS) return;
    lastPressAt.current = now;

    const url = getPtzMoveUrl(ptzId, direction);
    if (!url) return;

    // Fire-and-forget. `no-cors` suppresses preflight + console noise; we
    // don't read the response anyway. Network failures (DNS, refused,
    // mixed-content blocked) still reject and surface as a toast.
    fetch(url, { method: 'GET', mode: 'no-cors' }).catch(() => {
      toast.error(`PTZ ${direction} failed — controller unreachable.`);
    });
  }, [ptzId]);

  return { move, available: !!ptzId };
}
