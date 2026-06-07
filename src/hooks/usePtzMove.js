import { useCallback, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { useWriteAttribute } from './useAssets';
import { writeAttributeValue } from '../api/assets';

/* ==========================================================================
   usePtzMove

   Drives a PtzCameraAsset via two OpenRemote attributes on the camera:
     • `ptzCommand`       — text. We write `move_<dir>` then `stop`.
     • `movementDuration` — text, ms. How long to hold the move before stop.
                            Missing / blank / non-numeric ⇒ DEFAULT_DURATION_MS.

   Flow on press:
     write ptzCommand = "move_<dir>" → setTimeout(duration) → write "stop".

   Press handling:
     • While a move is in flight, further presses are ignored — the operator
       waits for the auto-stop. (Decided 2026-06-07.)
     • Unmount, modal close, route change: pending timer is cleared and a
       synchronous `stop` write is fired so the camera doesn't keep panning.
   ========================================================================== */

const DEFAULT_DURATION_MS = 3000;
const PTZ_COMMAND_ATTR = 'ptzCommand';
const MOVEMENT_DURATION_ATTR = 'movementDuration';
const STOP_COMMAND = 'stop';

const DIRECTION_COMMAND = {
  up:    'move_up',
  down:  'move_down',
  left:  'move_left',
  right: 'move_right',
};

function readMovementDuration(camera) {
  const raw = camera?.attributes?.[MOVEMENT_DURATION_ATTR]?.value;
  if (raw == null || raw === '') return DEFAULT_DURATION_MS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_DURATION_MS;
  return n;
}

export function usePtzMove(camera) {
  const write = useWriteAttribute();
  const inFlightRef = useRef(false);
  const stopTimerRef = useRef(null);
  const assetIdRef = useRef(null);
  // Hold the latest mutate so the scheduled stop can never call a stale one
  // after a parent re-render swaps the hook's returned object.
  const mutateRef = useRef(write.mutate);
  useEffect(() => {
    mutateRef.current = write.mutate;
  }, [write.mutate]);

  useEffect(() => {
    assetIdRef.current = camera?.id ?? null;
  }, [camera?.id]);

  const move = useCallback((direction) => {
    const assetId = camera?.id;
    if (!assetId) {
      toast.error('PTZ camera id is missing.');
      return;
    }
    if (inFlightRef.current) return;

    const command = DIRECTION_COMMAND[direction];
    if (!command) return;

    const duration = readMovementDuration(camera);
    inFlightRef.current = true;

    console.log('[PTZ] move', { assetId, command, duration });

    mutateRef.current(
      { assetId, attributeName: PTZ_COMMAND_ATTR, value: command },
      {
        onError: (err) => {
          console.warn('[PTZ] move write failed', err);
          inFlightRef.current = false;
          if (stopTimerRef.current) {
            clearTimeout(stopTimerRef.current);
            stopTimerRef.current = null;
          }
        },
      },
    );

    stopTimerRef.current = setTimeout(() => {
      stopTimerRef.current = null;
      console.log('[PTZ] auto-stop firing', { assetId });
      mutateRef.current(
        { assetId, attributeName: PTZ_COMMAND_ATTR, value: STOP_COMMAND },
        {
          onSettled: () => { inFlightRef.current = false; },
          onError: (err) => {
            console.warn('[PTZ] stop write failed', err);
          },
        },
      );
    }, duration);
  }, [camera]);

  // Synchronous stop on unmount when a move is still in flight. Direct API
  // call so the request goes out as React tears the component down.
  useEffect(() => {
    return () => {
      if (stopTimerRef.current) {
        clearTimeout(stopTimerRef.current);
        stopTimerRef.current = null;
      }
      if (inFlightRef.current && assetIdRef.current) {
        console.log('[PTZ] cleanup stop', { assetId: assetIdRef.current });
        writeAttributeValue(assetIdRef.current, PTZ_COMMAND_ATTR, STOP_COMMAND)
          .catch(() => {});
        inFlightRef.current = false;
      }
    };
  }, []);

  return { move, available: !!camera?.id };
}
