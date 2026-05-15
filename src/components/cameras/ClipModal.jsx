import { useEffect } from 'react';
import { X } from 'lucide-react';
import CameraStream from './CameraStream';

/**
 * Plays a single clip URL in a full-screen modal. Used by the "View clip"
 * action on alert rows (Overview Recent Alerts, Alerts page, Audit Log).
 *
 * Identical shell to `CameraFullView` but takes a plain URL rather than a
 * camera asset — that way alerts can reference clips that aren't necessarily
 * stored in a CameraAsset's `history` array (e.g. a clip URL embedded in
 * the alarm's `content` field by the AI side).
 *
 * Closes on Esc or backdrop click. Body scroll locked while open.
 */
export default function ClipModal({ title, subtitle, url, onClose }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!url) return null;

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
            <p className="text-sm font-bold text-[var(--color-ink-0)] truncate">
              {title || 'Clip'}
            </p>
            {subtitle && (
              <p className="text-[11px] text-[var(--color-ink-2)] truncate">{subtitle}</p>
            )}
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
          {/* `key={url}` forces a fresh element so the source reloads cleanly
              if the modal is reused for a different clip without unmounting. */}
          <CameraStream key={url} url={url} />
        </div>
      </div>
    </div>
  );
}
