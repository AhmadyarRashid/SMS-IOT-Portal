import { useQuery } from '@tanstack/react-query';
import { getDatapoints } from '../api/datapoints';
import { CAMERA_EVENT_ATTRIBUTE } from '../constants/events';

/* ==========================================================================
   useCameraEvents

   Pulls the camera's detection event datapoints from OpenRemote
   (`/asset/datapoint/{cameraId}/{CAMERA_EVENT_ATTRIBUTE}`) for an explicit
   time window.

   The OR datapoints endpoint expects `fromTimestamp` / `toTimestamp` (ms).
   We pass `type: 'ALL'` so we get every event in the window — the default
   `LTTB` downsampling silently drops points to hit `amountOfPoints`, which
   is wrong for an event log.

   Pagination strategy: this hook does NOT page through the OR API (it has
   no cursor — it's a time-window query). The caller controls the window
   via the `from` / `to` args; further client-side paging on the returned
   array is the consumer's job.

   Dev-mode debug: when the response is empty (or non-array) we log the
   request + response so a misnamed attribute is obvious in the console.
   ========================================================================== */

export function useCameraEvents(cameraId, { from, to } = {}) {
  const enabled = !!cameraId && Number.isFinite(from) && Number.isFinite(to);
  return useQuery({
    queryKey: ['cameraEvents', cameraId, CAMERA_EVENT_ATTRIBUTE, from, to],
    queryFn: async () => {
      try {
        const res = await getDatapoints(cameraId, CAMERA_EVENT_ATTRIBUTE, {
          fromTimestamp: from,
          toTimestamp: to,
          type: 'ALL',
        });
        if (process.env.NODE_ENV !== 'production') {
          console.log('[useCameraEvents]', {
            assetId: cameraId,
            attribute: CAMERA_EVENT_ATTRIBUTE,
            window: { from: new Date(from).toISOString(), to: new Date(to).toISOString() },
            count: Array.isArray(res) ? res.length : '(not an array)',
            firstFew: Array.isArray(res) ? res.slice(0, 3) : res,
          });
        }
        return res;
      } catch (err) {
        // 404 = camera has no `eventId` attribute (or no datapoint storage on
        // it). Treat as "no events" so the sidebar shows the empty state
        // instead of a red error — the operator doesn't care whether the
        // attribute is missing or just has no points in the window.
        if (err?.response?.status === 404) return [];
        throw err;
      }
    },
    enabled,
    // Datapoints rarely backfill silently — a 60s poll is plenty for the
    // operator's "live" feel inside the modal.
    refetchInterval: 60000,
    staleTime: 30000,
  });
}