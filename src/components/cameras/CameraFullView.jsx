import { useEffect } from 'react';
import { X } from 'lucide-react';
import CameraStream from './CameraStream';
import { getAssetDisplayName } from '../../utils/assetIcons';

/**
 * Full-screen camera preview modal. Every surface that shows a live camera
 * tile (Overview's Live Camera Feeds, Control's Cameras panel, future Video
 * tab) opens this on click *instead of* navigating to /a/:cameraId — that
 * way operators can glance at the feed at full size and dismiss without
 * losing their place in the dashboard.
 *
 * Behaviour:
 *   • Click the dark backdrop OR press Esc to close.
 *   • Body scroll is locked while open.
 *   • Reuses the shared `CameraStream` URL-detection logic so the same
 *     URL types that play in the tile play here too.
 *   • Intentionally has no "Detail" / "Open asset page" affordance — the
 *     camera tile is for monitoring only; if an operator needs Controls /
 *     History / Alarms they can reach the asset detail page from the
 *     audit log breadcrumb or the alarm rows.
 */
export default function CameraFullView({ camera, onClose }) {
  // Lock body scroll while open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Escape to close.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!camera) return null;
  const url = camera.attributes?.liveStreamUrl?.value;
  const offline = camera.attributes?.connected?.value === false;
  const name = getAssetDisplayName(camera);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(2, 6, 23, 0.85)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        className="panel p-3 w-[min(1280px,96vw)] max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 mb-3 px-1">
          <div className="min-w-0">
            <p className="text-sm font-bold text-[var(--color-ink-0)] truncate">{name}</p>
            <p className="text-[11px] text-[var(--color-ink-2)]">Live stream</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="audit-btn flex-shrink-0"
            title="Close (Esc)"
          >
            <X className="w-3.5 h-3.5" strokeWidth={2} />
            Close
          </button>
        </div>
        <div className="so-cam-full">
          <CameraStream url={url} offline={offline} />
        </div>
      </div>
    </div>
  );
}
