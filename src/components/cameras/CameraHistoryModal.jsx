import { useEffect, useMemo, useState } from 'react';
import { format, formatDistanceToNowStrict } from 'date-fns';
import {
  X, History, Play, RefreshCw, Loader2, RadioTower,
} from 'lucide-react';
import CameraStream from './CameraStream';
import PtzControls from './PtzControls';
import { useCameraEvents } from '../../hooks/useCameraEvents';
import { usePtzMove } from '../../hooks/usePtzMove';
import { getCameraStreamUrl, isPtzCamera } from '../../utils/gateways';
import { getAssetDisplayName } from '../../utils/assetIcons';
import {
  getEventClipUrl, getEventSnapshotUrl, normalizeEventLabel,
} from '../../constants/events';

/* ==========================================================================
   CameraHistoryModal

   The unified camera popup used by every surface that shows a camera tile
   (Overview's Live Camera Feeds, the Video wall, Control's Cameras panel,
   the Audit Log breadcrumbs). Opens to a live stream player with a
   scrollable detection-history sidebar on the right.

   Pulled out of `SecureOpsVideoPage.jsx` so the same modal renders
   identically everywhere — previously each surface used either this rich
   modal (Video tab) or a simpler `CameraFullView` (Overview / Control).

   Player has three states (handled internally):
     • live stream      — `liveStreamUrl` / `streamUrl`
     • snapshot preview — `getEventSnapshotUrl(eventId)` (cheap peek)
     • clip playing     — `getEventClipUrl(eventId)`

   PTZ overlay is rendered over the live stream only when the camera is a
   `PtzCameraAsset`. Snapshot / clip frames hide the pad so historical media
   doesn't appear interactive.
   ========================================================================== */

const DETECTION_TYPES = [
  { id: 'human',  label: 'Human',  color: 'var(--color-danger-400)' },
  { id: 'animal', label: 'Animal', color: 'var(--color-warning-400)' },
  { id: 'other',  label: 'Other',  color: 'var(--color-ink-2)' },
];

// Time windows for the modal's history fetch. Smaller windows are the
// default — the OR datapoints endpoint has no cursor, so "pagination" here
// means "fetch a narrower window first, widen on demand".
const TIME_WINDOWS = [
  { id: '24h', label: '24h', ms: 24 * 60 * 60 * 1000 },
  { id: '7d',  label: '7d',  ms: 7 * 24 * 60 * 60 * 1000 },
  { id: '30d', label: '30d', ms: 30 * 24 * 60 * 60 * 1000 },
];

const PAGE_SIZE = 20;

export default function CameraHistoryModal({ camera, tower, onClose }) {
  // Body scroll lock + ESC close.
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

  const liveUrl = getCameraStreamUrl(camera);
  const offline = camera.attributes?.connected?.value === false;
  const ptz = isPtzCamera(camera);
  const { move: ptzMove } = usePtzMove(ptz ? camera : null);

  const [windowId, setWindowId] = useState('24h');
  const [anchor, setAnchor] = useState(() => new Date().getTime());
  const range = useMemo(() => {
    const w = TIME_WINDOWS.find((x) => x.id === windowId) || TIME_WINDOWS[0];
    return { from: anchor - w.ms, to: anchor };
  }, [anchor, windowId]);

  const {
    data: rawPoints, isLoading, isFetching, isError, refetch,
  } = useCameraEvents(camera.id, range);

  const [drawerDetection, setDrawerDetection] = useState(new Set());

  // Reset paging when the underlying filter / window changes.
  const filterSignature = `${windowId}|${[...drawerDetection].sort().join(',')}|${rawPoints?.length ?? 0}`;
  const [resetSignature, setResetSignature] = useState(filterSignature);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  if (resetSignature !== filterSignature) {
    setResetSignature(filterSignature);
    setVisibleCount(PAGE_SIZE);
  }

  const history = useMemo(() => {
    if (!Array.isArray(rawPoints)) return [];
    return rawPoints
      .map((pt, i) => {
        let ts, rawValue;
        if (Array.isArray(pt)) {
          [ts, rawValue] = pt;
        } else {
          ts = pt?.x ?? pt?.timestamp;
          rawValue = pt?.y ?? pt?.value;
        }
        const tsNum = typeof ts === 'number' ? ts : new Date(ts).getTime();
        if (!Number.isFinite(tsNum)) return null;

        const entry = unwrapEventValue(rawValue);
        const eventId = entry?.id;
        if (!eventId) return null;

        return {
          id: `${eventId}-${i}`,
          eventId,
          ts: tsNum,
          detection: normalizeEventLabel(entry?.label),
          rawLabel: entry?.label,
          url: getEventClipUrl(eventId),
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.ts - a.ts);
  }, [rawPoints]);

  const filteredHistory = useMemo(() => {
    if (drawerDetection.size === 0) return history;
    return history.filter((h) => drawerDetection.has(h.detection));
  }, [history, drawerDetection]);

  const visibleHistory = filteredHistory.slice(0, visibleCount);
  const hasMore = filteredHistory.length > visibleCount;

  // Player state — three modes (see file header).
  const [activeClip, setActiveClip] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);

  let playerUrl;
  if (!activeClip) playerUrl = liveUrl;
  else if (isPlaying) playerUrl = activeClip.url;
  else playerUrl = getEventSnapshotUrl(activeClip.eventId);
  const playerKey = playerUrl || 'empty';
  const showPlayOverlay = !!activeClip && !isPlaying;
  const showPtzOverlay = ptz && !activeClip && !offline;

  const handleSelectClip = (clip) => {
    setActiveClip(clip);
    setIsPlaying(false);
  };
  const handleBackToLive = () => {
    setActiveClip(null);
    setIsPlaying(false);
  };

  const detectionCounts = useMemo(() => {
    const out = { human: 0, animal: 0, other: 0 };
    for (const h of history) if (h.detection in out) out[h.detection] += 1;
    return out;
  }, [history]);

  const handleRefresh = () => {
    setAnchor(new Date().getTime());
    refetch();
  };

  const handleWindowChange = (id) => {
    setWindowId(id);
    setAnchor(new Date().getTime());
    setActiveClip(null);
    setIsPlaying(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3"
      style={{ background: 'rgba(2, 6, 23, 0.85)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        className="panel p-3 w-[min(1280px,96vw)] h-[min(760px,92vh)] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 mb-3 px-1">
          <div className="min-w-0">
            <p className="text-sm font-bold text-[var(--color-ink-0)] truncate">
              {getAssetDisplayName(camera)}
              {ptz && (
                <span
                  className="ml-2 align-middle inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold tracking-wide"
                  style={{
                    background: 'color-mix(in srgb, var(--color-accent-400) 18%, transparent)',
                    color: 'var(--color-accent-300)',
                    border: '1px solid color-mix(in srgb, var(--color-accent-400) 50%, transparent)',
                  }}
                >
                  PTZ
                </span>
              )}
            </p>
            <p className="text-[11px] text-[var(--color-ink-2)] flex items-center gap-1">
              {tower && (
                <>
                  <RadioTower className="w-3 h-3" />
                  {getAssetDisplayName(tower)}
                </>
              )}
              {activeClip && (
                <>
                  {tower && ' · '}
                  <strong className="text-[var(--color-accent-300)]">
                    {isPlaying ? 'playing clip' : 'clip preview'} · {format(activeClip.ts, 'HH:mm dd MMM')}
                  </strong>
                </>
              )}
            </p>
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

        {/* Body: player + history sidebar */}
        <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[minmax(0,1.7fr)_minmax(280px,1fr)] gap-3">
          {/* Player */}
          <div className="flex flex-col min-h-0 min-w-0">
            <div className="so-cam-full flex-1 relative">
              <CameraStream key={playerKey} url={playerUrl} offline={!activeClip && offline} />
              {showPlayOverlay && (
                <button
                  type="button"
                  onClick={() => setIsPlaying(true)}
                  className="so-play-overlay"
                  title="Play clip"
                  aria-label="Play clip"
                >
                  <span className="so-play-overlay-disc">
                    <Play className="w-7 h-7 ml-1" strokeWidth={2} fill="currentColor" />
                  </span>
                </button>
              )}
              {showPtzOverlay && <PtzControls onMove={ptzMove} />}
            </div>
            {activeClip && (
              <div className="flex items-center gap-2 mt-2">
                <button
                  type="button"
                  onClick={handleBackToLive}
                  className="audit-btn"
                >
                  ← Back to live
                </button>
                {isPlaying && (
                  <button
                    type="button"
                    onClick={() => setIsPlaying(false)}
                    className="audit-btn"
                    title="Show snapshot preview again"
                  >
                    Show snapshot
                  </button>
                )}
              </div>
            )}
          </div>

          {/* History sidebar */}
          <aside className="flex flex-col min-h-0 panel p-3 bg-[color-mix(in_srgb,var(--color-ink-0)_3%,transparent)]">
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-[12px] font-bold text-[var(--color-ink-0)] inline-flex items-center gap-1.5">
                <History className="w-3.5 h-3.5" />
                History
              </p>
              <div className="flex items-center gap-2">
                <span className="text-[10px] tabular-nums text-[var(--color-ink-2)]">
                  {isLoading
                    ? 'loading…'
                    : `${visibleHistory.length} of ${filteredHistory.length}`}
                </span>
                <button
                  type="button"
                  onClick={handleRefresh}
                  disabled={isFetching}
                  className="text-[var(--color-ink-3)] hover:text-[var(--color-ink-0)] disabled:opacity-40"
                  title="Refresh history"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`}
                    strokeWidth={2}
                  />
                </button>
              </div>
            </div>

            {/* Time window selector */}
            <div className="flex items-center gap-1.5 mb-1.5">
              {TIME_WINDOWS.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => handleWindowChange(w.id)}
                  data-active={windowId === w.id}
                  className="audit-chip"
                  style={windowId === w.id ? {
                    background: 'color-mix(in srgb, var(--color-accent-400) 18%, transparent)',
                    borderColor: 'color-mix(in srgb, var(--color-accent-400) 55%, transparent)',
                    color: 'var(--color-accent-300)',
                  } : {}}
                >
                  Last {w.label}
                </button>
              ))}
            </div>

            {/* Detection chips */}
            <div className="flex items-center gap-1.5 flex-wrap mb-2">
              {DETECTION_TYPES.map((d) => (
                <ToggleChip
                  key={d.id}
                  active={drawerDetection.has(d.id)}
                  onClick={() => setDrawerDetection((prev) => {
                    const next = new Set(prev);
                    if (next.has(d.id)) next.delete(d.id); else next.add(d.id);
                    return next;
                  })}
                  color={d.color}
                  count={detectionCounts[d.id]}
                >
                  {d.label}
                </ToggleChip>
              ))}
            </div>

            {isLoading ? (
              <div className="flex-1 flex items-center justify-center text-[12px] text-[var(--color-ink-2)] gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Loading events…
              </div>
            ) : isError ? (
              <div className="text-[12px] text-[var(--color-ink-2)] py-6 text-center px-3">
                No history data found for this camera.
              </div>
            ) : visibleHistory.length === 0 ? (
              <div className="text-[12px] text-[var(--color-ink-2)] py-6 text-center px-3">
                {history.length === 0
                  ? 'No history data found for this camera.'
                  : 'No events match the selected detection types.'}
              </div>
            ) : (
              <div className="flex-1 min-h-0 flex flex-col">
                <ul className="space-y-1.5 overflow-y-auto pr-1 flex-1">
                  {visibleHistory.map((h) => {
                    const meta = DETECTION_TYPES.find((d) => d.id === h.detection)
                      || { label: 'Other', color: 'var(--color-ink-2)' };
                    const isActive = activeClip?.id === h.id;
                    return (
                      <li key={h.id}>
                        <button
                          type="button"
                          onClick={() => handleSelectClip(h)}
                          data-active={isActive}
                          className="so-clip-row"
                        >
                          <div
                            className="so-clip-bullet"
                            style={{ background: meta.color, boxShadow: `0 0 6px color-mix(in srgb, ${meta.color} 60%, transparent)` }}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-[12px] font-semibold text-[var(--color-ink-0)] tabular-nums">
                              {format(h.ts, 'HH:mm:ss')} · {format(h.ts, 'dd MMM')}
                            </div>
                            <div className="text-[10px] text-[var(--color-ink-2)]">
                              {formatDistanceToNowStrict(h.ts)} ago
                            </div>
                          </div>
                          <span
                            className="so-clip-pill"
                            style={{
                              background: `color-mix(in srgb, ${meta.color} 14%, transparent)`,
                              color: meta.color,
                              border: `1px solid color-mix(in srgb, ${meta.color} 40%, transparent)`,
                            }}
                          >
                            {meta.label}
                          </span>
                          <Play className="w-3.5 h-3.5 text-[var(--color-ink-3)] flex-shrink-0" />
                        </button>
                      </li>
                    );
                  })}
                </ul>

                {hasMore && (
                  <button
                    type="button"
                    onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
                    className="audit-btn mt-2 self-center"
                    title={`Show next ${Math.min(PAGE_SIZE, filteredHistory.length - visibleCount)} events`}
                  >
                    Load more ({filteredHistory.length - visibleCount} remaining)
                  </button>
                )}
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

/* ==========================================================================
   Local primitives — kept inline so the modal is self-contained.
   ========================================================================== */

function ToggleChip({ active, onClick, color, count, children }) {
  const tint = color || 'var(--color-ink-1)';
  return (
    <button
      type="button"
      onClick={onClick}
      data-active={active}
      className="audit-chip"
      style={active ? {
        background: `color-mix(in srgb, ${tint} 18%, transparent)`,
        borderColor: `color-mix(in srgb, ${tint} 55%, transparent)`,
        color: tint,
      } : {}}
    >
      <span>{children}</span>
      {count != null && <span className="audit-chip-count">{count}</span>}
    </button>
  );
}

// Unwrap a datapoint value into `{ id, label }`. The OR datapoints table
// for "Event id" shows the value column as a list-of-one-object, but the
// API can ship it in any of the shapes documented below.
function unwrapEventValue(raw) {
  if (raw == null) return null;
  let v = raw;
  if (typeof v === 'string') {
    if (!v.startsWith('{') && !v.startsWith('[')) {
      return { id: v, label: undefined };
    }
    try { v = JSON.parse(v); }
    catch { return { id: raw, label: undefined }; }
  }
  if (Array.isArray(v)) v = v[0];
  if (!v || typeof v !== 'object') return null;
  return { id: v.id ?? v.eventId ?? v.event_id, label: v.label ?? v.type ?? v.category };
}
