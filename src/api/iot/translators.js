/**
 * IoT translator layer — wire DTO -> internal model.
 *
 * Phase 0 policy: minimal-change. We coerce ids to strings, add ISO-string
 * timestamps alongside legacy epoch-ms fields, and normalise nullable
 * scalars. We deliberately preserve the existing `attributes` map and the
 * legacy field names (`createdOn`, `asset[]` on alarms, …) so the existing
 * components keep working without per-component churn.
 *
 * Later phases can introduce stricter renames (alarm.asset -> linkedAssets,
 * createdOn -> createdAt) once every consumer has migrated.
 */

import { toId, mapArray } from '../safeGet';

const isoFromEpoch = (ms) =>
  typeof ms === 'number' && Number.isFinite(ms) ? new Date(ms).toISOString() : null;

/** Wire Attribute -> internal Attribute. Always returns an Attribute object. */
export function toAttribute(name, attr) {
  if (!attr || typeof attr !== 'object') {
    return { name, type: null, value: null, timestamp: null, meta: null };
  }
  const ts = attr.timestamp ?? null;
  return {
    name: attr.name ?? name,
    type: attr.type ?? null,
    value: attr.value ?? null,
    timestamp: ts,                     // keep epoch-ms for legacy callers
    timestampIso: isoFromEpoch(ts),    // ISO for new callers
    meta: attr.meta ?? null,
  };
}

/** Wire Asset -> internal Asset. Preserves attribute map shape. */
export function toAsset(dto) {
  if (!dto || typeof dto !== 'object') return null;
  const attrs = {};
  const wireAttrs = dto.attributes || {};
  for (const k of Object.keys(wireAttrs)) attrs[k] = toAttribute(k, wireAttrs[k]);

  return {
    id: toId(dto.id),
    name: dto.name ?? '',
    type: dto.type ?? '',
    parentId: dto.parentId ? toId(dto.parentId) : null,
    realm: dto.realm ?? '',
    path: Array.isArray(dto.path) ? dto.path.map(toId) : [],
    version: dto.version ?? null,
    accessPublicRead: dto.accessPublicRead ?? null,

    // Dual timestamp surfaces — epoch-ms for legacy, ISO for new code.
    createdOn: dto.createdOn ?? null,
    createdAt: isoFromEpoch(dto.createdOn),

    attributes: attrs,
  };
}

/** Wire Alarm -> internal Alarm. Hydrates linked assets through toAsset. */
export function toAlarm(dto) {
  if (!dto || typeof dto !== 'object') return null;
  const linked = mapArray(dto.asset, toAsset);

  return {
    id: toId(dto.id),
    realm: dto.realm ?? null,
    title: dto.title ?? '',
    content: dto.content ?? '',
    severity: dto.severity ?? 'LOW',
    status: dto.status ?? 'OPEN',

    source: dto.source ?? null,
    sourceId: dto.sourceId != null ? toId(dto.sourceId) : null,
    sourceName: dto.sourceName ?? null,
    assetId: dto.assetId != null ? toId(dto.assetId) : null,
    assigneeId: dto.assigneeId ?? null,

    // Dual timestamp surfaces.
    createdOn: dto.createdOn ?? null,
    createdAt: isoFromEpoch(dto.createdOn),
    lastModified: dto.lastModified ?? null,
    lastModifiedAt: isoFromEpoch(dto.lastModified),
    acknowledgedOn: dto.acknowledgedOn ?? null,
    acknowledgedAt: isoFromEpoch(dto.acknowledgedOn),
    acknowledgedBy: dto.acknowledgedBy ?? null,

    // Preserve the wire field name for existing callers; introduce
    // `linkedAssets` as the canonical internal name for new callers.
    asset: linked,
    linkedAssets: linked,
  };
}

/**
 * Inverse of toAlarm for PUTs. The server-side SentAlarm deserialiser is
 * picky — it rejects denormalised fields and server-managed timestamps.
 * This mirrors the careful body in `src/api/alarms.js#updateAlarm`.
 */
export function toAlarmUpdate(model) {
  if (!model?.id) throw new Error('toAlarmUpdate: model.id is required');
  const body = {
    id: toId(model.id),
    realm: model.realm,
    title: model.title,
    content: model.content ?? '',
    severity: model.severity,
    source: model.source,
    sourceId: model.sourceId,
    status: model.status,
  };
  if (model.assigneeId) body.assigneeId = model.assigneeId;
  return body;
}

/**
 * Wire Datapoint -> internal Datapoint. The backend may emit either
 * `[ts, value]` tuples or `{x, y}` objects; we normalise to {ts, value}.
 */
export function toDatapoint(dto) {
  if (Array.isArray(dto) && dto.length >= 2) {
    return { ts: dto[0] ?? null, value: dto[1] ?? null };
  }
  if (dto && typeof dto === 'object') {
    return {
      ts: dto.x ?? dto.ts ?? null,
      value: dto.y ?? dto.value ?? null,
    };
  }
  return null;
}

