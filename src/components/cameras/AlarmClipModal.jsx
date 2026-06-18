import { useEffect, useMemo, useState } from 'react';
import { format, formatDistanceToNowStrict } from 'date-fns';
import toast from 'react-hot-toast';
import {
  X, AlertOctagon, Building2, RadioTower, Camera, Clock, Play,
  Image as ImageIcon, User, PawPrint, Car, Download, Loader2, Radio,
  Check, CheckCheck, Lock, Siren, Lightbulb, Mic,
  ChevronLeft, ChevronRight,
} from 'lucide-react';
import CameraStream from './CameraStream';
import PtzControls from './PtzControls';
import { usePtzMove } from '../../hooks/usePtzMove';
import { useAssets, useUpdateAlarmStatus, useWriteAttribute } from '../../hooks/useAssets';
import {
  getAlarmClipUrl, getAlarmSnapshotUrl, getAlarmDetectionLabel, getAlarmEventId,
} from '../../utils/alarms';
import {
  getCameraStreamUrl, isCameraAsset, isPtzCamera, pickGatewayChildren,
  resolvePttForTower,
} from '../../utils/gateways';
import {
  getAssetDisplayName, getCustomAssetType, getAssetTypeLabel,
  isAssetActive, getPrimaryControlAttr, nextToggleValue, normalizeAssetType,
} from '../../utils/assetIcons';
import { EVENT_CLIP_MISSING_MESSAGE } from '../../constants/events';

/* ==========================================================================
   AlarmClipModal — rich preview for an alarm's recorded clip.

   Replaces the URL-only `ClipModal` previously used by the alert surfaces.
   Pulls together everything we know about the alarm:

     • Site › Tower breadcrumb (when resolvable from the linked asset)
     • Time stamp + relative "X min ago"
     • Camera name + best-effort detection label (human / animal / vehicle)
     • Snapshot preview with a centred play overlay
     • Click play → clip mp4 plays in place
     • "Show snapshot" toggle to flip back to the preview while playing

   When the alarm has no event id (and so no snapshot URL), the modal jumps
   straight to clip playback — keeps the legacy URL-only flow intact.

   Closes on Esc or backdrop click. Body scroll locked while open.
   ========================================================================== */

const SEVERITY_META = {
  CRITICAL: { label: 'Critical', color: 'var(--color-danger-400)' },
  HIGH:     { label: 'High',     color: 'var(--color-danger-400)' },
  MEDIUM:   { label: 'Medium',   color: 'var(--color-warning-400)' },
  LOW:      { label: 'Low',      color: 'var(--color-ink-2)' },
};

const DETECTION_META = {
  human:   { icon: User,     label: 'Human detected',   color: 'var(--color-danger-400)' },
  animal:  { icon: PawPrint, label: 'Animal detected',  color: 'var(--color-warning-400)' },
  vehicle: { icon: Car,      label: 'Vehicle detected', color: 'var(--color-accent-400)' },
};

export default function AlarmClipModal({
  alarm, asset, tower, site,
  prev, next, position,        // tower-scoped queue navigation
  onSelect,                    // (alarmId: string) — switch the modal to a sibling
  onClose,
}) {
  const clipUrl = getAlarmClipUrl(alarm, asset);
  const snapshotUrl = getAlarmSnapshotUrl(alarm, asset);
  // An event id was found but no clip URL could be built (the camera's media
  // origin is missing / malformed). We still open the modal and show a black
  // frame + play icon; pressing play toasts a friendly config error rather
  // than playing a dead URL — same UX as the camera history modal.
  const alarmEventId = getAlarmEventId(alarm);
  const clipConfigMissing = !clipUrl && !!alarmEventId;
  // Live stream only exists when the alarm's linked asset is itself a camera
  // (alarms can also fire from non-camera assets — door lock, sensor — for
  // which a "Live" tab makes no sense).
  const liveUrl = isCameraAsset(asset) ? getCameraStreamUrl(asset) : null;
  const hasSnapshot = !!snapshotUrl;
  const hasLive = !!liveUrl;

  // PTZ controls render only over the LIVE view of a PtzCameraAsset — the
  // recorded clip is a fixed-frame mp4, panning it makes no sense. Gate the
  // hook on `ptz ? asset : null` so non-PTZ alarms don't open an unused
  // controller connection.
  const ptz = isPtzCamera(asset);
  const { move: ptzMove } = usePtzMove(ptz ? asset : null);

  // Alarm status mutation — mirrors the alert-row UX so the operator can
  // act on the alarm without bouncing back to the list. Status-aware
  // visibility:
  //   • OPEN          → both Ack and Resolve
  //   • ACKNOWLEDGED  → only Resolve (already acked)
  //   • IN_PROGRESS   → only Resolve (in-flight from elsewhere)
  //   • RESOLVED/CLOSED → no action buttons
  const update = useUpdateAlarmStatus();
  const status = (alarm?.status || 'OPEN').toUpperCase();
  const canAck = status === 'OPEN';
  const canResolve = status === 'OPEN' || status === 'ACKNOWLEDGED' || status === 'IN_PROGRESS';
  const mutatingThis = update.isPending && update.variables?.alarm?.id === alarm?.id;
  const ackPending = mutatingThis && update.variables?.status === 'ACKNOWLEDGED';
  const resolvePending = mutatingThis && update.variables?.status === 'RESOLVED';
  const anyActionPending = ackPending || resolvePending;

  // Post-action navigation (auto-advance to next, or close if at end) is
  // handled per-click via `mutate(..., { onSuccess })` on the Ack/Resolve
  // buttons below — no auto-close effect needed.

  // View state — `snapshot` → `clip` → `live`. Snapshot is the default when
  // available (preview before paying for video bytes); otherwise we open
  // straight on the clip. Live is opt-in via the footer tab.
  //
  // Internal state (view, downloading) does NOT auto-reset on alarm
  // navigation — parent passes `key={alarm.id}` to force a fresh mount on
  // each navigation step, which is the project's "reset state when a prop
  // changes" idiom (avoids the react-hooks/set-state-in-effect rule).
  const [view, setView] = useState(hasSnapshot ? 'snapshot' : 'clip');
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      // Don't hijack arrow keys when the user is interacting with the
      // <video> scrubber (which uses Left/Right for seeking) or a form
      // control. Walk up from the focused element to see if it's inside
      // the modal's video player.
      const target = e.target;
      const isFormField = target && (
        target.tagName === 'INPUT'
        || target.tagName === 'TEXTAREA'
        || target.isContentEditable
        || target.closest?.('video')
      );
      if (isFormField) return;
      if (e.key === 'ArrowLeft' && prev) {
        e.preventDefault();
        onSelect?.(prev.alarm.id);
      } else if (e.key === 'ArrowRight' && next) {
        e.preventDefault();
        onSelect?.(next.alarm.id);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, onSelect, prev, next]);

  // Render when there's something to show: a resolvable clip URL, or an event
  // id (in which case clip playback surfaces the missing-config error).
  if (!alarm || (!clipUrl && !clipConfigMissing)) return null;

  const sev = (alarm.severity || 'LOW').toUpperCase();
  const sevMeta = SEVERITY_META[sev] || SEVERITY_META.LOW;
  const detection = getAlarmDetectionLabel(alarm);
  const detMeta = detection ? DETECTION_META[detection] : null;

  const createdAt = alarm.createdOn ? new Date(alarm.createdOn) : null;
  const assetName = asset ? getAssetDisplayName(asset) : null;
  const assetType = asset ? getAssetTypeLabel(getCustomAssetType(asset)) : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(2, 6, 23, 0.85)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        className="panel p-0 w-[min(1280px,96vw)] h-[95vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ----- Header (severity · title · queue nav · close) ----- */}
        <div className="so-clip-modal-head">
          <span
            className="so-clip-modal-sev"
            style={{
              background: `color-mix(in srgb, ${sevMeta.color} 18%, transparent)`,
              color: sevMeta.color,
              border: `1px solid color-mix(in srgb, ${sevMeta.color} 50%, transparent)`,
            }}
            title={`${sevMeta.label} severity`}
          >
            <AlertOctagon className="w-3.5 h-3.5" strokeWidth={2} />
            {sevMeta.label}
          </span>
          <p className="so-clip-modal-title">{alarm.title || 'Alarm'}</p>

          {/* Tower-scoped queue navigation. Shown only when there's more
              than one alarm in the queue — single-alarm queues would just
              render two disabled chevrons, which is noise. */}
          {position && position.total > 1 && (
            <div className="so-clip-modal-nav" aria-label="Navigate alarms in this tower">
              <button
                type="button"
                onClick={() => prev && onSelect?.(prev.alarm.id)}
                disabled={!prev}
                className="so-clip-modal-nav-btn"
                title={prev ? `Previous: ${prev.alarm.title || 'Alarm'} (←)` : 'No previous alarm'}
                aria-label="Previous alarm"
              >
                <ChevronLeft className="w-4 h-4" strokeWidth={2.25} />
              </button>
              <span className="so-clip-modal-nav-counter tabular-nums">
                {position.current} / {position.total}
              </span>
              <button
                type="button"
                onClick={() => next && onSelect?.(next.alarm.id)}
                disabled={!next}
                className="so-clip-modal-nav-btn"
                title={next ? `Next: ${next.alarm.title || 'Alarm'} (→)` : 'No more alarms — last in queue'}
                aria-label="Next alarm"
              >
                <ChevronRight className="w-4 h-4" strokeWidth={2.25} />
              </button>
            </div>
          )}

          <button type="button" onClick={onClose} className="audit-btn" title="Close (Esc)">
            <X className="w-3.5 h-3.5" strokeWidth={2} />
            Close
          </button>
        </div>

        {/* ----- Meta strip (breadcrumb · time · camera · detection) ----- */}
        <div className="so-clip-modal-meta">
          <div className="so-clip-modal-meta-row">
            {site && (
              <span className="so-crumb so-crumb-static">
                <Building2 className="w-3 h-3" strokeWidth={2} />
                {getAssetDisplayName(site)}
              </span>
            )}
            {tower && (
              <>
                {site && <span className="so-crumb-sep">›</span>}
                <span className="so-crumb so-crumb-static">
                  <RadioTower className="w-3 h-3" strokeWidth={2} />
                  {getAssetDisplayName(tower)}
                </span>
              </>
            )}
            {createdAt && (
              <span className="so-clip-modal-meta-divider" aria-hidden="true">·</span>
            )}
            {createdAt && (
              <span className="so-clip-modal-meta-time">
                <Clock className="w-3 h-3" strokeWidth={2} />
                {format(createdAt, 'HH:mm:ss · dd MMM yyyy')}
                <span className="text-[var(--color-ink-3)]">
                  ({formatDistanceToNowStrict(createdAt)} ago)
                </span>
              </span>
            )}
          </div>

          {(asset || detMeta) && (
            <div className="so-clip-modal-meta-row">
              {asset && (
                <span className="so-clip-modal-camera">
                  <Camera className="w-3.5 h-3.5" strokeWidth={2} />
                  {assetName || assetType}
                </span>
              )}
              {detMeta && (
                <span
                  className="so-clip-modal-detection"
                  style={{
                    background: `color-mix(in srgb, ${detMeta.color} 14%, transparent)`,
                    color: detMeta.color,
                    border: `1px solid color-mix(in srgb, ${detMeta.color} 40%, transparent)`,
                  }}
                >
                  <detMeta.icon className="w-3 h-3" strokeWidth={2} />
                  {detMeta.label}
                </span>
              )}
              {/* Compact tools cluster — Door / Siren / Lights toggles
                  plus the hold-to-talk PTT button. Floats to the right
                  edge of the row so the camera + detection chip stay
                  flush-left. */}
              <span className="so-clip-modal-tools">
                <QuickControls tower={tower} />
                <PttButton tower={tower} />
              </span>
            </div>
          )}
          {!asset && !detMeta && (
            <div className="so-clip-modal-meta-row">
              <span className="so-clip-modal-tools is-standalone">
                <QuickControls tower={tower} />
                <PttButton tower={tower} />
              </span>
            </div>
          )}
        </div>

        {/* ----- Player body ----- */}
        <div className="so-clip-modal-stage">
          {view === 'snapshot' && hasSnapshot && (
            <button
              type="button"
              className="so-clip-modal-snapshot"
              onClick={() => setView('clip')}
              aria-label="Play clip"
            >
              <img src={snapshotUrl} alt="Detection snapshot" />
              <span className="so-clip-modal-play">
                <Play className="w-7 h-7" strokeWidth={2} fill="currentColor" />
              </span>
            </button>
          )}
          {view === 'clip' && (
            clipConfigMissing ? (
              /* No media origin configured — black frame + play icon. Pressing
                 it toasts a friendly config error instead of loading a dead
                 URL (mirrors the camera history modal). */
              <button
                type="button"
                className="so-clip-modal-snapshot"
                onClick={() => toast.error(EVENT_CLIP_MISSING_MESSAGE)}
                aria-label="Play clip"
              >
                <span className="so-clip-modal-play">
                  <Play className="w-7 h-7" strokeWidth={2} fill="currentColor" />
                </span>
              </button>
            ) : (
              <div className="so-clip-modal-player">
                {/* Native controls — operator controls play / pause / seek /
                    volume + browser-provided fullscreen + PiP. `key={clipUrl}`
                    forces a fresh element if the modal is reused for a
                    different clip without unmounting. */}
                <video
                  key={clipUrl}
                  src={clipUrl}
                  controls
                  autoPlay
                  playsInline
                  controlsList="nodownload"
                  preload="metadata"
                />
              </div>
            )
          )}
          {view === 'live' && hasLive && (
            <div className="so-clip-modal-player so-clip-modal-live">
              {/* Reuse the shared CameraStream renderer so URL heuristics
                  (image / MJPEG / video / iframe) stay in one place. The
                  small LIVE pill anchors top-left so it's visible over any
                  feed type, including dark scenes. */}
              <CameraStream key={liveUrl} url={liveUrl} />
              <span className="so-clip-modal-live-pill">
                <span className="so-clip-modal-live-dot" aria-hidden="true" />
                LIVE
              </span>
              {/* PTZ pad — same component the Video page uses, anchored
                  bottom-right by `.so-ptz`. Renders only for PtzCameraAsset. */}
              {ptz && <PtzControls onMove={ptzMove} />}
            </div>
          )}
        </div>

        {/* ----- Footer ----- segmented [Snapshot|Clip|Live] tabs on the
            left; Download (only on Clip view) on the right. Tabs whose
            URL isn't available are hidden — no disabled-greyed stubs. */}
        <div className="so-clip-modal-footer">
          <div className="so-clip-modal-tabs" role="tablist" aria-label="View">
            {hasSnapshot && (
              <button
                type="button"
                role="tab"
                aria-selected={view === 'snapshot'}
                data-active={view === 'snapshot'}
                onClick={() => setView('snapshot')}
                className="so-clip-modal-tab"
              >
                <ImageIcon className="w-3.5 h-3.5" strokeWidth={2} />
                Snapshot
              </button>
            )}
            <button
              type="button"
              role="tab"
              aria-selected={view === 'clip'}
              data-active={view === 'clip'}
              onClick={() => setView('clip')}
              className="so-clip-modal-tab"
            >
              <Play className="w-3.5 h-3.5" strokeWidth={2} fill="currentColor" />
              Clip
            </button>
            {hasLive && (
              <button
                type="button"
                role="tab"
                aria-selected={view === 'live'}
                data-active={view === 'live'}
                onClick={() => setView('live')}
                className="so-clip-modal-tab"
                title={`Live stream from ${getAssetDisplayName(asset)}`}
              >
                <Radio className="w-3.5 h-3.5" strokeWidth={2} />
                Live
              </button>
            )}
          </div>

          <div className="so-clip-modal-actions">
            {canAck && (
              <button
                type="button"
                onClick={() => {
                  // Capture `next` at click time so navigation lands on the
                  // alarm that was immediately after this one — even if the
                  // queue shifts between click and success.
                  const advance = next;
                  update.mutate({
                    alarm,
                    status: 'ACKNOWLEDGED',
                    successMessage: `Alarm acknowledged — ${alarm.title || 'alarm'}`,
                    errorMessage: 'Failed to acknowledge alarm',
                  }, {
                    onSuccess: () => {
                      if (advance) onSelect?.(advance.alarm.id);
                      else onClose();
                    },
                  });
                }}
                disabled={anyActionPending}
                className="so-alert-btn so-alert-btn-ack"
                title="Acknowledge"
              >
                {ackPending
                  ? <Loader2 className="w-3 h-3 spin-slow" />
                  : <Check className="w-3 h-3" strokeWidth={2.25} />}
                <span>{ackPending ? 'Acking…' : 'Ack'}</span>
              </button>
            )}
            {canResolve && (
              <button
                type="button"
                onClick={() => {
                  const advance = next;
                  update.mutate({
                    alarm,
                    status: 'RESOLVED',
                    successMessage: `Alarm resolved — ${alarm.title || 'alarm'}`,
                    errorMessage: 'Failed to resolve alarm',
                  }, {
                    onSuccess: () => {
                      if (advance) onSelect?.(advance.alarm.id);
                      else onClose();
                    },
                  });
                }}
                disabled={anyActionPending}
                className="so-alert-btn so-alert-btn-resolve"
                title="Resolve"
              >
                {resolvePending
                  ? <Loader2 className="w-3 h-3 spin-slow" />
                  : <CheckCheck className="w-3 h-3" strokeWidth={2.25} />}
                <span>{resolvePending ? 'Resolving…' : 'Resolve'}</span>
              </button>
            )}
            {view === 'clip' && clipUrl && (
              <button
                type="button"
                onClick={() => downloadClip({
                  url: clipUrl,
                  filename: buildClipFilename(alarm, createdAt),
                  onPending: setDownloading,
                })}
                disabled={downloading}
                className="audit-btn so-clip-modal-download"
                title="Download the clip"
              >
                {downloading
                  ? <Loader2 className="w-3.5 h-3.5 spin-slow" />
                  : <Download className="w-3.5 h-3.5" strokeWidth={2} />}
                {downloading ? 'Downloading…' : 'Download clip'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ==========================================================================
   Quick controls — Door / Siren / Lights for the alarm's tower

   Minimal icon-only toggle strip rendered inside the meta block. Operator
   can lock the gate / silence the siren / flip the lights without leaving
   the clip preview. Each button:
     • Hides itself when no matching asset is found under the tower (no
       "disabled" stubs that confuse the user about whether the action is
       available — per the no-placeholder rule)
     • Tints brightly when the device is currently active (cyan / red /
       amber for door / siren / lights)
     • Shows an inline spinner during its own mutation and disables siblings
   ========================================================================== */

/* Per-slot resolver — same selection logic as the original Overview
 * RemoteControlPanel. The siren resolver matters: BuzzerAsset is
 * preferred and AlarmAsset is only the fallback. A naive
 * `children.find(t => t === 'BuzzerAsset' || t === 'AlarmAsset')`
 * would silently pick whichever appears first in the children array,
 * defeating that preference. */
const QUICK_DEVICES = [
  {
    key: 'door',
    icon: Lock,
    label: 'Door',
    accent: 'var(--color-accent-500)',
    activeWord: 'Locked',
    idleWord: 'Unlocked',
    find: (children) => children.find((a) => {
      const t = normalizeAssetType(getCustomAssetType(a));
      return t === 'DoorLockAsset' || t === 'ToggleableDoorLockAsset';
    }),
  },
  {
    key: 'siren',
    icon: Siren,
    label: 'Siren',
    accent: 'var(--color-danger-500)',
    activeWord: 'Active',
    idleWord: 'Silent',
    find: (children) =>
      children.find((a) => getCustomAssetType(a) === 'BuzzerAsset')
      || children.find((a) => getCustomAssetType(a) === 'AlarmAsset'),
  },
  {
    key: 'light',
    icon: Lightbulb,
    label: 'Lights',
    accent: 'var(--color-warning-500)',
    activeWord: 'On',
    idleWord: 'Off',
    find: (children) => children.find((a) => getCustomAssetType(a) === 'LightAsset'),
  },
];

function QuickControls({ tower }) {
  const { data: assets = [] } = useAssets({});
  const write = useWriteAttribute();

  // Resolve each slot via its dedicated `find` so the siren slot keeps
  // its Buzzer-over-Alarm preference (the original Overview behaviour).
  const devices = useMemo(() => {
    if (!tower) return [];
    const children = pickGatewayChildren(assets, tower.id);
    return QUICK_DEVICES.map((d) => ({ ...d, asset: d.find(children) }))
      .filter((d) => d.asset);
  }, [tower, assets]);

  if (devices.length === 0) return null;

  const toggle = (asset) => {
    const attr = getPrimaryControlAttr(asset, getCustomAssetType(asset));
    write.mutate({ assetId: asset.id, attributeName: attr, value: nextToggleValue(asset, attr) });
  };

  const pendingId = write.isPending ? write.variables?.assetId : null;
  const anyPending = !!pendingId;

  return (
    <span className="so-clip-modal-quick">
      <span className="so-clip-modal-quick-label">Controls</span>
      {devices.map((d) => {
        const active = isAssetActive(d.asset, getCustomAssetType(d.asset));
        const pending = pendingId === d.asset.id;
        const stateWord = active ? d.activeWord : d.idleWord;
        return (
          <button
            key={d.key}
            type="button"
            onClick={() => toggle(d.asset)}
            disabled={anyPending}
            data-active={active}
            data-pending={pending}
            className="so-clip-modal-quick-btn"
            style={active ? {
              background: `color-mix(in srgb, ${d.accent} 22%, transparent)`,
              borderColor: `color-mix(in srgb, ${d.accent} 60%, transparent)`,
              color: d.accent,
            } : undefined}
            title={`${d.label} — ${stateWord} (click to toggle)`}
            aria-label={`Toggle ${d.label.toLowerCase()} — currently ${stateWord}`}
          >
            {pending
              ? <Loader2 className="w-3.5 h-3.5 spin-slow" />
              : <d.icon className="w-3.5 h-3.5" strokeWidth={2} />}
          </button>
        );
      })}
    </span>
  );
}

/* ==========================================================================
   Push-to-talk button — opens the OS Mumble client via a protocol link

   `PttAsset.socketIP` holds the link verbatim (typically a
   `mumble://user:pass@host:port/` URL). Compressed to a single 28×28 icon
   inside the modal's quick-controls cluster. Three branches via
   `resolvePttForTower`:

   • ok      → `<a href>` that hands off to the OS handler
   • missing → `<button>` that toasts "not configured" on click
   • invalid → render nothing (a broken affordance is worse than none)
   ========================================================================== */

function PttButton({ tower }) {
  const { data: assets = [] } = useAssets({});
  const { status, href } = useMemo(
    () => resolvePttForTower(tower, assets),
    [tower, assets],
  );

  if (status === 'invalid') return null;

  const onMissingClick = () => {
    toast.error('PTT not configured for this tower.');
  };

  return (
    <span className="so-clip-modal-quick">
      <span className="so-clip-modal-quick-label">PTT</span>
      {status === 'ok' ? (
        <a
          href={href}
          className="so-clip-modal-quick-btn so-clip-modal-ptt-btn"
          title="Open PTT in Mumble client"
          aria-label="Open PTT in Mumble client"
        >
          <Mic className="w-3.5 h-3.5" strokeWidth={2} />
        </a>
      ) : (
        <button
          type="button"
          onClick={onMissingClick}
          className="so-clip-modal-quick-btn"
          title="PTT not configured for this tower"
          aria-label="PTT not configured for this tower"
        >
          <Mic className="w-3.5 h-3.5" strokeWidth={2} />
        </button>
      )}
    </span>
  );
}

/* ==========================================================================
   Download helpers
   ========================================================================== */

/**
 * Build a stable filename for the downloaded clip. Prefers the AI-side
 * event id (matches the file name on the media server), then the alarm id,
 * then a timestamp slug. Always ends in `.mp4` — every alarm clip on this
 * deployment is mp4 (see §5.1b in telco-readme.md).
 */
function buildClipFilename(alarm, createdAt) {
  const eventId = getAlarmEventId(alarm);
  if (eventId) return `alarm-${eventId}.mp4`;
  if (alarm?.id) return `alarm-${alarm.id}.mp4`;
  if (createdAt) return `alarm-${format(createdAt, 'yyyyMMdd-HHmmss')}.mp4`;
  return 'alarm-clip.mp4';
}

/**
 * Download a clip via blob fetch so the browser actually saves the file
 * (and respects our chosen filename) instead of just navigating to the URL.
 *
 * The media server is cross-origin from the dashboard, so an `<a download>`
 * element alone is unreliable — modern Chrome/Firefox ignore the `download`
 * attribute when the resource is cross-origin without `Content-Disposition:
 * attachment`. Fetching as a blob + `URL.createObjectURL` sidesteps that.
 *
 * If the fetch fails (CORS blocked, network error), fall back to opening
 * the URL in a new tab so the operator can still right-click → save.
 */
async function downloadClip({ url, filename, onPending }) {
  if (!url) return;
  onPending?.(true);
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Revoke after the click so Safari has time to start the download.
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    toast.success('Clip downloaded');
  } catch (err) {
    // CORS or network failure — open in a new tab so the user can still
    // save it manually via the browser context menu.
    window.open(url, '_blank', 'noopener,noreferrer');
    toast.error(`Couldn't auto-download (${err.message}). Opened in new tab.`);
  } finally {
    onPending?.(false);
  }
}
