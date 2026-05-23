import { useCallback, useState } from 'react';

/**
 * Browser-level OS notifications for alarms. Backed by the native Notification
 * API — no third-party services, no server side.
 *
 *   const { supported, permission, enabled, toggle } = useAlarmNotifications();
 *
 * Notifications only fire when the tab is *hidden* (background / other tab /
 * minimised). If the user is looking at the app, the in-app toast is enough.
 */

const PREF_KEY = 'sms_notify_alarms';

function getPermission() {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission;
}

function readPref() {
  try { return localStorage.getItem(PREF_KEY) === 'true'; }
  catch { return false; }
}

function writePref(v) {
  try { localStorage.setItem(PREF_KEY, v ? 'true' : 'false'); }
  catch { /* ignore quota */ }
}

export function useAlarmNotifications() {
  const supported = typeof Notification !== 'undefined';
  const [permission, setPermission] = useState(() => getPermission());
  const [enabled, setEnabled] = useState(() => readPref());

  const toggle = useCallback(async (next) => {
    if (!supported) return { ok: false, reason: 'unsupported', permission: 'unsupported' };

    if (!next) {
      writePref(false);
      setEnabled(false);
      return { ok: true, permission: getPermission() };
    }

    // Enabling — make sure we have permission.
    if (Notification.permission === 'granted') {
      writePref(true);
      setEnabled(true);
      setPermission('granted');
      // A welcome notification so the user knows it's live.
      try {
        new Notification('Alerts enabled', {
          body: "We'll let you know when a new alarm fires.",
          icon: '/favicon.svg',
          tag: 'sms-iot-welcome',
        });
      } catch { /* ignore */ }
      return { ok: true, permission: 'granted' };
    }

    if (Notification.permission === 'denied') {
      setPermission('denied');
      return { ok: false, reason: 'denied', permission: 'denied' };
    }

    // 'default' — need to ask.
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result === 'granted') {
      writePref(true);
      setEnabled(true);
      return { ok: true, permission: 'granted' };
    }
    return { ok: false, reason: 'denied', permission: result };
  }, [supported]);

  return { supported, permission, enabled, toggle };
}

/**
 * Fire an OS notification for an alarm. Safe to call from anywhere —
 * silently no-ops when the preference is off, permission missing, or the
 * tab is visible (toast is enough in that case).
 */
const dev = !!import.meta.env?.DEV;
const log = (...args) => { if (dev) console.debug('[notify]', ...args); };

/**
 * Format an OpenRemote SentAlarm into a polished notification payload.
 * Severity-emoji in the title, asset name in the body, and a
 * `url: '/alarms'` payload so the SW can deep-link on click.
 *
 * The free-text `content` / description is intentionally NOT included —
 * matches the in-app alert-card policy (operators triage on title +
 * asset + severity; the description added little signal).
 */
export function buildAlarmNotificationPayload(alarm) {
  const sev = (alarm?.severity || 'MEDIUM').toUpperCase();
  const emoji =
    sev === 'CRITICAL' ? '🚨' :
    sev === 'HIGH'     ? '⚠️' :
    sev === 'LOW'      ? 'ℹ️' :
    '🔔';
  const title = `${emoji} ${alarm?.title || 'New alarm'}`;
  const body = alarm?.sourceName || 'Tap to open the alarms page.';
  return {
    title,
    body,
    tag: `alarm-${alarm?.id || Date.now()}`,
    severity: sev,
    url: '/alarms',
  };
}

/**
 * Try the rich SW-backed showNotification first (supports action buttons and
 * click-to-focus), fall back to the bare Notification constructor if no SW is
 * controlling the page (happens in dev, and on iOS).
 */
async function showRich({ title, body, tag, url, severity }) {
  const actions = [
    { action: 'view', title: 'View alarm' },
    { action: 'acknowledge', title: 'Dismiss' },
  ];
  const opts = {
    body: body || '',
    tag: tag || `sms-iot-alarm-${Date.now()}`,
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    data: { url, severity },
    requireInteraction: severity === 'CRITICAL',
    renotify: true,
  };

  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready;
      if (reg && typeof reg.showNotification === 'function') {
        log('fire via SW', title);
        await reg.showNotification(title, { ...opts, actions });
        return true;
      }
    } catch (err) {
      log('SW notification failed, falling back', err);
    }
  }

  // Bare fallback — no actions, but at least shows up.
  try {
    log('fire via Notification()', title);
    new Notification(title, opts);
    return true;
  } catch (err) {
    log('Notification() failed', err);
    return false;
  }
}

export function fireAlarmNotification(input) {
  if (typeof Notification === 'undefined') {
    log('skip — Notification API not supported');
    return;
  }
  if (Notification.permission !== 'granted') {
    log('skip — permission is', Notification.permission);
    return;
  }
  if (!readPref()) {
    log('skip — preference disabled (sms_notify_alarms=false)');
    return;
  }
  const { ignoreVisibility = false } = input || {};
  if (!ignoreVisibility && typeof document !== 'undefined' && document.visibilityState === 'visible') {
    log('skip — tab is visible (toast is enough)');
    return;
  }

  // Accept either a raw alarm object or a pre-built payload.
  const payload = input && (input.title || input.body)
    ? input
    : buildAlarmNotificationPayload(input?.alarm || input);

  showRich(payload);
}
