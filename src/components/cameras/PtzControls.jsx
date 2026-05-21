import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Pan/Tilt/Zoom directional pad rendered over a PtzCameraAsset live frame
 * inside `CameraHistoryModal`. Not used on tile cards — those expose only
 * the PTZ capability pill, since glanceable tiles aren't meant to be
 * actionable.
 *
 * Calls `onMove(direction)` on press where direction is one of
 * `'up' | 'down' | 'left' | 'right'`. Functionality is intentionally
 * stubbed for now — the markup + callback are in place so a future PTZ
 * HTTP call (or OpenRemote write) can hook in without touching the
 * camera surfaces. Until then `onMove` defaults to a no-op.
 *
 * Each button stops event propagation so a press doesn't bubble to a
 * wrapping click handler (defensive — the modal player doesn't have one
 * today, but it's cheap insurance).
 */
export default function PtzControls({ onMove }) {
  const press = (dir) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    onMove?.(dir);
  };
  const stopBubble = (e) => e.stopPropagation();

  return (
    <div className="so-ptz" onClick={stopBubble} onKeyDown={stopBubble}>
      <button
        type="button"
        className="so-ptz-btn so-ptz-up"
        onClick={press('up')}
        title="Tilt up"
        aria-label="Tilt up"
      >
        <ChevronUp className="so-ptz-icon" strokeWidth={2.5} />
      </button>
      <button
        type="button"
        className="so-ptz-btn so-ptz-left"
        onClick={press('left')}
        title="Pan left"
        aria-label="Pan left"
      >
        <ChevronLeft className="so-ptz-icon" strokeWidth={2.5} />
      </button>
      <button
        type="button"
        className="so-ptz-btn so-ptz-right"
        onClick={press('right')}
        title="Pan right"
        aria-label="Pan right"
      >
        <ChevronRight className="so-ptz-icon" strokeWidth={2.5} />
      </button>
      <button
        type="button"
        className="so-ptz-btn so-ptz-down"
        onClick={press('down')}
        title="Tilt down"
        aria-label="Tilt down"
      >
        <ChevronDown className="so-ptz-icon" strokeWidth={2.5} />
      </button>
    </div>
  );
}
