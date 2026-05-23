import { useState } from 'react';

/**
 * Renders a live camera feed from a URL with smart fallback detection:
 *   • `.jpg` / `.png` / `.webp` / `.gif` — `<img>` (still snapshot or MJPEG)
 *   • Extensionless URLs (e.g. `/api/cam238`) — `<img>` (MJPEG stream endpoint)
 *   • `.mp4` / `.webm` / `.ogg` / `.m3u8` / `.mov` — `<video>` (autoplay,
 *     muted, loop). Audio is OFF by default — `muted` is required for
 *     browser autoplay policy anyway.
 *   • Anything else — `<iframe>` (vendor web UI / RTSP-to-HLS proxy page)
 *
 * Used by every SecureOps surface that shows a live feed — keeps the URL
 * heuristics in one place so the Overview's Live Camera Feeds panel and the
 * Control page can't drift apart.
 */
export default function CameraStream({ url, offline }) {
  const [errored, setErrored] = useState(false);
  if (offline || !url || errored) {
    return (
      <div className="so-cam-empty">
        {offline ? 'Camera offline' : (errored ? 'Stream unavailable' : 'No stream URL')}
      </div>
    );
  }
  if (looksLikeImage(url)) {
    return <img src={url} alt="" onError={() => setErrored(true)} />;
  }
  if (looksLikeVideo(url)) {
    return (
      <video
        src={url}
        autoPlay
        muted
        playsInline
        loop
        onError={() => setErrored(true)}
      />
    );
  }
  return <iframe src={url} title="Live stream" allow="autoplay; encrypted-media" />;
}

function looksLikeImage(url) {
  if (/\.(jpe?g|png|webp|gif)(?:$|\?|#)/i.test(url)) return true;
  // Extensionless path (e.g. `/api/cam238`) — backend MJPEG endpoint.
  // Browsers render multipart/x-mixed-replace natively in <img>; <video> can't
  // decode MJPEG and would show a blank box.
  try {
    const last = new URL(url).pathname.split('/').filter(Boolean).pop() || '';
    if (last && !last.includes('.')) return true;
  } catch { /* not a parseable URL — fall through */ }
  return false;
}
function looksLikeVideo(url) {
  return /\.(mp4|webm|ogg|m3u8|mov)(?:$|\?|#)/i.test(url);
}
