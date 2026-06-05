import { useState } from 'react';
import { ShieldAlert, Maximize2, PlayCircle } from 'lucide-react';
import CameraStream from './CameraStream';
import CameraHistoryModal from './CameraHistoryModal';
import { getCameraStreamUrl, isPtzCamera } from '../../utils/gateways';
import { getAssetDisplayName } from '../../utils/assetIcons';

/* ==========================================================================
   CameraCard

   The single camera tile used on every SecureOps surface — Overview's Live
   Camera Feeds, the Video wall, Control's Cameras panel, and the Audit Log
   breadcrumb pop-out. Previously each page had its own near-identical tile
   implementation; consolidating here means a change to the live-tile chrome
   (pills, footer, PTZ overlay) lands everywhere in one edit.

   Behaviour:
     • Plays the live stream inline via the shared `CameraStream`.
     • LIVE pill (steady) or ALERT pill (recent human detection within 5 min).
     • For `PtzCameraAsset`: a PTZ badge in the top-right pill cluster.
       The directional pad itself lives only inside the history modal — the
       tile is meant to be glanceable, not actionable.
     • Click anywhere on the tile opens the unified `CameraHistoryModal` —
       same modal that powers the Video tab.

   Props:
     • camera   — the CameraAsset / PtzCameraAsset.
     • tower    — optional, used as the modal subtitle and in the footer
                  when `showTower` is set.
     • showTower— show the tower name in a second footer line (Video wall).
   ========================================================================== */

const RECENT_ALERT_WINDOW_MS = 5 * 60 * 1000;

export default function CameraCard({ camera, tower, showTower = false }) {
  const [open, setOpen] = useState(false);

  const url = getCameraStreamUrl(camera);
  const offline = camera.attributes?.connected?.value === false;
  const alerting = isRecentHumanDetection(camera);
  const ptz = isPtzCamera(camera);
  const name = getAssetDisplayName(camera);
  const code = shortCamCode(camera);

  // Use `<div role="button">` (not a real `<button>`) so we keep the option
  // to nest interactive overlays later without hitting the nested-button
  // HTML restriction. Keyboard accessibility is preserved via tabIndex +
  // onKeyDown.
  const openModal = () => setOpen(true);
  const onKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpen(true);
    }
  };

  return (
    <>
      <div
        className="so-cam"
        role="button"
        tabIndex={0}
        onClick={openModal}
        onKeyDown={onKeyDown}
        title={`Open ${name}`}
      >
        {/* Poster — defer the actual stream fetch until the operator
            clicks. Each tile previously mounted an <img>/<video>/<iframe>
            against the camera's stream URL on render, so on slow networks
            opening the Video wall (or Control's Cameras panel) fired N
            concurrent stream requests. The modal still plays the stream
            on open via the same CameraStream renderer. */}
        {(offline || !url) ? (
          <CameraStream url={url} offline={offline} />
        ) : (
          <div
            aria-hidden="true"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
              height: '100%',
              background: 'color-mix(in srgb, var(--color-ink-0) 92%, black)',
              color: 'var(--color-ink-1)',
            }}
          >
            <PlayCircle className="w-10 h-10 opacity-80" strokeWidth={1.5} />
          </div>
        )}

        <div className="so-cam-pills">
          <span className="so-cam-pill is-label">{code}</span>
          <div className="flex items-center gap-1">
            {ptz && <span className="so-cam-pill is-ptz">PTZ</span>}
            {alerting
              ? <span className="so-cam-pill is-alert"><ShieldAlert className="w-2.5 h-2.5" />Alert</span>
              : <span className="so-cam-pill is-rec">Live</span>}
          </div>
        </div>

        <div className="so-cam-foot">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate">{name}</span>
            <Maximize2 className="w-3 h-3 opacity-75 flex-shrink-0" />
          </div>
          {showTower && tower && (
            <div className="text-[10px] opacity-75 truncate">
              {getAssetDisplayName(tower)}
            </div>
          )}
        </div>
      </div>

      {open && (
        <CameraHistoryModal
          camera={camera}
          tower={tower}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function shortCamCode(camera) {
  const m = (camera?.name || '').match(/CAM[-\s_]?(\d{1,3})/i);
  if (m) return `CAM-${m[1].padStart(2, '0')}`;
  return 'CAM';
}

function isRecentHumanDetection(camera) {
  const hist = camera?.attributes?.history?.value;
  if (!Array.isArray(hist) || hist.length === 0) return false;
  const latest = hist[0];
  const ts = parseDate(latest?.date);
  if (!ts) return false;
  const recent = new Date().getTime() - ts < RECENT_ALERT_WINDOW_MS;
  return recent && (latest?.detection || '').toLowerCase() === 'human';
}

function parseDate(v) {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : new Date(v).getTime();
  return Number.isFinite(n) ? n : null;
}
