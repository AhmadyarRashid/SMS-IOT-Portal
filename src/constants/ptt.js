/* ==========================================================================
   Push-to-talk WebSocket endpoint

   The PTT server runs on a Windows PC near the site speaker. It exposes a
   single WebSocket endpoint that accepts:
     • JSON control frames     — `{type: "ptt_start"}` / `{type: "ptt_stop"}`
     • Binary audio frames     — raw 16-bit signed PCM, mono, 48 kHz,
                                 little-endian (ArrayBuffer chunks)

   Server replies (JSON, ignored if unknown):
     • `{type: "ptt_started"}` / `{type: "ptt_stopped"}` — ack
     • `{type: "error", message}`                       — surfaced as a toast

   Mixed-content caveat — same story as `PTZ_BASE_URL` (`ptz.js`) and
   `EVENTS_BASE_URL` (`events.js`): an HTTPS-served dashboard cannot open a
   `ws://` socket. Switch to `wss://` once the PC server has TLS, or
   reverse-proxy through the dashboard origin (Vite dev proxy + nginx/caddy
   in prod) and point this constant at the relative `/ptt` path.
   ========================================================================== */

export const PTT_WS_URL = 'wss://media.smsiotpk.com:3000/ws';

/**
 * Build a `wss://` URL from a PttAsset's `socketIP` attribute value.
 *
 * The attribute is expected to hold the host (+ optional port + path) only —
 * no scheme — so the dashboard owns the protocol. Any accidental
 * `ws://` / `wss://` prefix on the stored value is stripped before we
 * re-prepend `wss://`, so a mistyped attribute can't downgrade an
 * HTTPS-served dashboard to a plain-text socket.
 *
 * Returns null when the value is missing or blank — callers should fall
 * back to the global `PTT_WS_URL` constant.
 */
export function buildPttWsUrl(socketIP) {
  if (typeof socketIP !== 'string') return null;
  const trimmed = socketIP.trim().replace(/^wss?:\/\//i, '');
  if (!trimmed) return null;
  return `wss://${trimmed}`;
}
