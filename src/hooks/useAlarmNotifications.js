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
export function fireAlarmNotification({ title, body, tag }) {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission !== 'granted') return;
  if (!readPref()) return;
  if (typeof document !== 'undefined' && document.visibilityState === 'visible') return;
  try {
    new Notification(title, {
      body: body || '',
      tag: tag || `sms-iot-alarm-${Date.now()}`,
      icon: '/favicon.svg',
      badge: '/favicon.svg',
    });
  } catch { /* ignore */ }
}
