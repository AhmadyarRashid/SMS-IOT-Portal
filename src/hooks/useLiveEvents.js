import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAlarms, useAssets } from './useAssets';
import useActivityStore from '../store/activityStore';
import { REALM } from '../api/client';
import {
  getCustomAssetType, getStateLabel, CONTROLLABLE_TYPES,
} from '../utils/assetIcons';
import { fireAlarmNotification } from './useAlarmNotifications';

/**
 * Hook that feeds the activity store from two sources:
 *
 *   1. Alarm poll (always on)    — subscribes to useAlarms({}) via React Query,
 *      diffs the incoming list against what's already in the store, pushes new
 *      alarms as activity events, and fires a toast when a new one arrives
 *      while the user is not on the /alarms page.
 *
 *   2. WebSocket (best-effort)   — attempts `/websocket/events?Realm=...` with
 *      the current access token, subscribes to asset-attribute events and
 *      pushes state changes into the activity store. Silently disables itself
 *      if the connection fails or the server rejects the subscription.
 *
 * Mount this hook exactly once, in DashboardLayout, so it runs for the whole
 * authenticated session.
 */
export default function useLiveEvents() {
  const { data: alarms = [] } = useAlarms({});
  const { data: assets = [] } = useAssets({});
  const push = useActivityStore((s) => s.push);
  const pushMany = useActivityStore((s) => s.pushMany);
  const location = useLocation();
  const locRef = useRef(location.pathname);
  useEffect(() => { locRef.current = location.pathname; }, [location.pathname]);

  // ---- Alarm watcher -------------------------------------------------------
  const seededRef = useRef(false);
  const prevIdsRef = useRef(new Set());

  useEffect(() => {
    if (!Array.isArray(alarms)) return;

    const toEvent = (a) => ({
      id: `alarm:${a.id}:${a.lastModified || a.createdOn || 0}`,
      kind: 'alarm',
      title: a.title || 'Alarm',
      detail: a.content || a.description || '',
      assetId: a.assetId,
      assetName: a.sourceName,
      severity: (a.severity || 'MEDIUM').toLowerCase(),
      timestamp: a.createdOn || a.lastModified || Date.now(),
    });

    if (!seededRef.current) {
      // First successful fetch — seed the feed with current alarms (no toast).
      pushMany(alarms.map(toEvent));
      prevIdsRef.current = new Set(alarms.map((a) => a.id));
      seededRef.current = true;
      return;
    }

    // Subsequent fetches — diff and toast on anything new.
    const prev = prevIdsRef.current;
    const fresh = alarms.filter((a) => !prev.has(a.id));
    if (fresh.length > 0) {
      pushMany(fresh.map(toEvent));
      const onAlarmsPage = locRef.current.startsWith('/alarms');
      if (!onAlarmsPage) {
        fresh.slice(0, 3).forEach((a) => {
          toast.error(a.title || 'New alarm', {
            duration: 4500,
            icon: '🔔',
          });
          fireAlarmNotification({
            title: a.title || 'New alarm',
            body: a.content || a.description || '',
            tag: `alarm-${a.id}`,
          });
        });
        if (fresh.length > 3) {
          toast(`+${fresh.length - 3} more alarms`, { icon: '…' });
        }
      }
    }
    prevIdsRef.current = new Set(alarms.map((a) => a.id));
  }, [alarms, pushMany]);

  // ---- Asset attribute diff watcher ---------------------------------------
  // Whenever the global asset cache updates (optimistic writes after an icon
  // tap, background refetch, WebSocket pushes), compare each tracked attribute
  // against its previous value and push an event if it changed. Works whether
  // or not the WebSocket is connected — the optimistic cache update inside
  // useWriteAttribute is enough to fire an event when the user toggles a
  // device from the UI.
  const assetStateRef = useRef(null); // Map<assetId, Map<attrName, value>>

  useEffect(() => {
    if (!Array.isArray(assets) || assets.length === 0) return;

    const prev = assetStateRef.current;
    const next = new Map();
    const diffs = [];

    for (const a of assets) {
      const attrMap = new Map();
      const attrs = a.attributes || {};
      for (const [name, attr] of Object.entries(attrs)) {
        if (!attr || typeof attr !== 'object') continue;
        if (SKIP_ATTRS.has(name)) continue;
        const v = attr.value;
        if (typeof v !== 'boolean' && typeof v !== 'number') continue;
        attrMap.set(name, v);
        const prevVal = prev?.get(a.id)?.get(name);
        // Only emit on actual change after the baseline is built.
        if (prev && prevVal !== undefined && prevVal !== v) {
          diffs.push({ asset: a, name, prevVal, newVal: v });
        }
      }
      next.set(a.id, attrMap);
    }

    if (prev && diffs.length > 0) {
      const now = Date.now();
      pushMany(diffs.map(({ asset, name, newVal }) => {
        const customType = getCustomAssetType(asset);
        const controllable = CONTROLLABLE_TYPES.includes(customType);
        const primary = asset.attributes?.[name];
        const ts = primary?.timestamp || now;
        return {
          id: `state:${asset.id}:${name}:${ts}`,
          kind: controllable && typeof newVal === 'boolean' ? 'control' : 'state',
          title: buildStateTitle(asset, name, newVal, customType),
          detail: formatValue(name, newVal, primary),
          assetId: asset.id,
          assetName: asset.name,
          attributeName: name,
          value: newVal,
          timestamp: ts,
        };
      }));
    }

    assetStateRef.current = next;
  }, [assets, pushMany]);

  // ---- WebSocket (best-effort) --------------------------------------------
  // OpenRemote exposes asset attribute events over a WebSocket at
  // /websocket/events. We connect speculatively — if the server/version/auth
  // combination doesn't accept us, the asset-diff watcher above + the 15s
  // refetchInterval on useAssets still keep /live accurate, just with
  // slightly higher latency. On connect we try two common OR subscribe
  // message shapes (older and newer) since we can't know the exact
  // deployment version at build time.
  useEffect(() => {
    const token = localStorage.getItem('or_access_token');
    if (!token || typeof WebSocket === 'undefined') return;

    let closed = false;
    let socket;
    let reconnectTimer;
    let gaveUp = false;
    let attempts = 0;

    const dev = !!import.meta.env?.DEV;
    const log = (...args) => { if (dev) console.debug('[live-ws]', ...args); };

    const connect = () => {
      if (closed || gaveUp) return;
      attempts += 1;

      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      // `Auth` is the param name current OR versions accept; older ones used
      // `Authorization`. Send both — the server will ignore whichever it doesn't know.
      const params = new URLSearchParams({
        realm: REALM,
        Auth: `Bearer ${token}`,
        Authorization: `Bearer ${token}`,
      });
      const url = `${proto}//${window.location.host}/websocket/events?${params.toString()}`;
      log('connect', url.replace(/Auth(orization)?=Bearer[^&]+/g, 'Auth=Bearer…'));

      try {
        socket = new WebSocket(url);
      } catch (err) {
        log('construction failed', err);
        return;
      }

      socket.addEventListener('open', () => {
        log('open — subscribing');
        // Try both the modern and legacy subscribe message formats.
        const subscribes = [
          { messageID: '1', type: 'subscribe-asset-events', subscriptionId: 'sms-iot-live' },
          { type: 'SUBSCRIBE', subscriptionId: 'sms-iot-live', eventType: 'AttributeEvent' },
        ];
        for (const msg of subscribes) {
          try { socket.send(JSON.stringify(msg)); } catch { /* ignore */ }
        }
      });

      socket.addEventListener('message', (ev) => {
        if (typeof ev.data !== 'string') return;
        let payload;
        try { payload = JSON.parse(ev.data); } catch { return; }
        log('message', payload);

        // Normalise the various shapes OR emits — attributeState, event,
        // direct AttributeEvent, etc. — into the activity-store event format.
        const attr = payload?.attributeState || payload?.event || payload;
        if (!attr || typeof attr !== 'object') return;

        const assetId = attr.assetId || attr.id || attr.ref?.id;
        const attributeName = attr.attributeName || attr.ref?.name;
        const value = attr.value;
        const timestamp = attr.timestamp || Date.now();
        if (!assetId || !attributeName) return;

        push({
          id: `ws:${assetId}:${attributeName}:${timestamp}`,
          kind: typeof value === 'boolean' ? 'control' : 'state',
          title: `${attributeName} updated`,
          detail: value == null ? undefined : String(value),
          assetId,
          attributeName,
          value,
          timestamp,
        });
      });

      socket.addEventListener('close', (ev) => {
        if (closed) return;
        log(`closed (code ${ev.code}) — attempt ${attempts}`);
        // If the server rejects the handshake outright (1006/1008/1011) twice
        // in a row, give up for this session so we don't spam the backend.
        if (attempts >= 3 && !ev.wasClean) {
          gaveUp = true;
          log('giving up — backend appears to not support this WS flavour. Polling will keep /live accurate.');
          return;
        }
        reconnectTimer = setTimeout(connect, Math.min(8000 * attempts, 30000));
      });

      socket.addEventListener('error', () => {
        log('error');
        try { socket.close(); } catch { /* ignore */ }
      });
    };

    connect();

    return () => {
      closed = true;
      clearTimeout(reconnectTimer);
      try { socket?.close(); } catch { /* ignore */ }
    };
  }, [push]);
}

/* ------------------------ helpers ------------------------ */

// Attribute names that are never interesting for the activity feed.
const SKIP_ATTRS = new Set([
  'customAssetType',
  'location',
  'parentId',
  'path',
  'version',
  'createdOn',
  'lastModified',
  'timestamp',
  'notes',
  'tags',
]);

function buildStateTitle(asset, attrName, value, customType) {
  const name = asset.name || 'Device';
  // Prefer the asset's canonical state label when the attribute we just saw
  // is the one that drives it — gives nice "Locked" / "Unlocked" strings for
  // door locks, "On" / "Off" for lights, etc.
  if (typeof value === 'boolean') {
    try {
      const label = getStateLabel(asset, customType);
      if (label) return `${name} · ${label}`;
    } catch { /* fall through */ }
    return `${name} · ${value ? 'On' : 'Off'}`;
  }
  // Numeric: show the new value in the title with its unit when available.
  const unit = asset.attributes?.[attrName]?.meta?.unit || '';
  const num = typeof value === 'number'
    ? value.toLocaleString(undefined, { maximumFractionDigits: 2 })
    : String(value);
  return `${name} · ${prettyAttrName(attrName)} ${num}${unit}`;
}

function formatValue(attrName, value, attr) {
  if (typeof value === 'boolean') return `${prettyAttrName(attrName)} · ${value ? 'on' : 'off'}`;
  const unit = attr?.meta?.unit || '';
  return `${prettyAttrName(attrName)} ${value}${unit}`;
}

function prettyAttrName(name) {
  return name
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}
