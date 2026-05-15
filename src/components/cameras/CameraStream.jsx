import { useState } from 'react';

/**
 * Renders a live camera feed from a URL with smart fallback detection:
 *   • `.jpg` / `.png` / `.webp` / `.gif` — `<img>` (still snapshot or MJPEG)
 *   • `.mp4` / `.webm` / `.ogg` / `.m3u8` / `.mov` — `<video>` (autoplay, muted, loop)
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
  if (looksLikeIframe(url)) {
    return <iframe src={url} title="Live stream" allow="autoplay; encrypted-media" />;
  }
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

function looksLikeImage(url) {
  return /\.(jpe?g|png|webp|gif)(?:$|\?)/i.test(url);
}
function looksLikeIframe(url) {
  // Heuristic: any URL that doesn't look like a direct media file gets the
  // iframe treatment. Catches HLS viewers, RTSP-to-WebRTC pages, vendor UIs.
  if (looksLikeImage(url)) return false;
  if (/\.(mp4|webm|ogg|m3u8|mov)(?:$|\?)/i.test(url)) return false;
  if (/^https?:\/\//i.test(url)) return true;
  return false;
}
