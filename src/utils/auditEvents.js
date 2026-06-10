import { AlertOctagon, ScrollText } from 'lucide-react';
import { getAssetDisplayName } from './assetIcons';
import { findGatewayForAsset, findSiteForAsset } from './gateways';
import { getAlarmClipUrl, getAlarmContentText } from './alarms';

/**
 * Shared audit-event generation. Both the dashboard panel
 * (`SecureOpsOverviewPage.AuditLogPanel`) and the dedicated `/audit` page
 * consume this so they stay in lock-step on event shape, filtering, and the
 * persistent-vs-session distinction.
 *
 * Every event is sourced from server-stored data — alarms (full history) and
 * the optional per-tower `auditLog` attribute — so the list survives reloads.
 *
 * Event shape:
 *   {
 *     ts:        number   (ms since epoch)
 *     icon:      ComponentType
 *     title:     string   (short — the primary text)
 *     detail?:   string   (optional secondary line)
 *     actor?:    string   (operator name, when known)
 *     tag:       'Alert' | 'Command' | 'Info'
 *     tagTone:   'alert' | 'command' | 'info'
 *     source:    'alarm-raised' | 'alarm-acked' | 'alarm-resolved' | 'tower-log'
 *     severity?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'   (from the linked alarm)
 *     status?:   'OPEN' | 'ACKNOWLEDGED' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED'
 *     site?:     Asset    (resolved site for the linked asset)
 *     tower?:    Asset    (resolved tower for the linked asset)
 *     asset?:    Asset    (linked device, when any)
 *   }
 */

export function alarmAuditEvents(alarm, ctx = {}) {
  const events = [];
  const baseTitle = alarm.title || 'Alarm';
  const severity = (alarm.severity || 'LOW').toUpperCase();
  const status = (alarm.status || 'OPEN').toUpperCase();

  const linked = Array.isArray(alarm.asset) && alarm.asset[0];
  const asset = linked?.id
    ? (ctx.assetMap?.get(linked.id) || linked)
    : (alarm.assetId ? ctx.assetMap?.get(alarm.assetId) : null);
  const tower = asset ? findGatewayForAsset(asset, ctx.towers || []) : null;
  const site = tower
    ? findSiteForAsset(tower, ctx.sites || [])
    : (asset ? findSiteForAsset(asset, ctx.sites || []) : null);

  const clipUrl = getAlarmClipUrl(alarm, asset);
  // `alarm` rides along so downstream surfaces (AlarmClipModal) can derive
  // snapshot URL + detection label from the same source the row already shows.
  const common = { severity, status, site, tower, asset, clipUrl, alarm };

  if (alarm.createdOn) {
    events.push({
      ...common,
      ts: new Date(alarm.createdOn).getTime(),
      icon: AlertOctagon,
      title: `${baseTitle} raised`,
      detail: getAlarmContentText(alarm),
      tag: 'Alert',
      tagTone: 'alert',
      source: 'alarm-raised',
    });
  }

  // Only emit a transition row when lastModified is measurably distinct from
  // createdOn — otherwise we'd double-count the initial create as a "moved".
  const lastTs = alarm.lastModified ? new Date(alarm.lastModified).getTime() : null;
  const createdTs = alarm.createdOn ? new Date(alarm.createdOn).getTime() : null;
  const movedPastCreate = lastTs && (!createdTs || Math.abs(lastTs - createdTs) > 1000);

  if (status === 'ACKNOWLEDGED' && movedPastCreate) {
    events.push({
      ...common,
      ts: lastTs,
      icon: ScrollText,
      title: `${baseTitle} acknowledged`,
      tag: 'Command',
      tagTone: 'command',
      source: 'alarm-acked',
    });
  } else if ((status === 'RESOLVED' || status === 'CLOSED') && movedPastCreate) {
    events.push({
      ...common,
      ts: lastTs,
      icon: ScrollText,
      title: `${baseTitle} ${status.toLowerCase()}`,
      tag: 'Info',
      tagTone: 'info',
      source: 'alarm-resolved',
    });
  }

  return events;
}

/**
 * Read a tower's optional `auditLog` array attribute and convert each entry
 * into an audit event. Backend rules populate this attribute on every device
 * write so device-state-change rows show up persistently — without the UI
 * having to fire datapoint queries per attribute.
 *
 * Entry shape: `{ ts, actor?, action?, target?, tag? }`
 */
export function towerAuditEvents(tower) {
  const log = tower?.attributes?.auditLog?.value;
  if (!Array.isArray(log)) return [];
  return log
    .map((e) => {
      const ts = parseTs(e?.ts);
      if (!ts) return null;
      const parts = [];
      if (e.action) parts.push(e.action);
      if (e.target) parts.push(e.target);
      const title = parts.length
        ? parts.join(' — ')
        : `${getAssetDisplayName(tower)} event`;
      const tag = (e.tag || 'command').toLowerCase();
      const tagTone = ['alert', 'command', 'info'].includes(tag) ? tag : 'command';
      return {
        ts,
        icon: ScrollText,
        title,
        detail: null,
        actor: e.actor || null,
        tag: tag.charAt(0).toUpperCase() + tag.slice(1),
        tagTone,
        source: 'tower-log',
        tower,
        site: null, // resolved by caller if it needs site breadcrumb
      };
    })
    .filter(Boolean);
}

function parseTs(v) {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : new Date(v).getTime();
  return Number.isFinite(n) ? n : null;
}
