/**
 * Gateway helpers — a "gateway" is a location/site. Each child asset belongs to
 * exactly one gateway. We identify gateways by the SMS IoT asset `type`
 * (GatewayAsset / BuildingAsset) first, then by a custom type attribute as a
 * fallback. Realms that model their locations as buildings (e.g. retail
 * outlets) surface them under `BuildingAsset`; older realms use
 * `GatewayAsset`. Both shapes are treated as sites here.
 */

import { isDeviceAsset, getCustomAssetType } from './assetIcons';

const SITE_TYPES = new Set(['GatewayAsset', 'BuildingAsset']);

/* ==========================================================================
   Telco hierarchy: City (top) → Tower (gateway) → IoT devices.
   ========================================================================== */

/**
 * Top-level container in the telco hierarchy. Detected by either the canonical
 * `type === 'CityAsset'` or `customAssetType === 'CityAsset'` so installations
 * that model cities as a custom subtype still work.
 */
export function isCityAsset(asset) {
  if (!asset) return false;
  if (asset.type === 'CityAsset') return true;
  return getCustomAssetType(asset) === 'CityAsset';
}

/**
 * Return every city in a flat asset list.
 */
export function pickCities(assets = []) {
  return (assets || []).filter(isCityAsset);
}

/**
 * A "tower" is a gateway whose customAssetType is `TowerAsset`. We still treat
 * it as a site (it inherits all the gateway helpers) — `TowerAsset` is just a
 * semantic label on top.
 */
export function isTowerAsset(asset) {
  if (!asset) return false;
  return getCustomAssetType(asset) === 'TowerAsset' || isGatewayAsset(asset);
}

/**
 * Towers that live under a given city. Walks `asset.path` so towers may be
 * nested several layers deep under the city without breaking the lookup.
 */
export function pickTowersForCity(assets = [], cityId) {
  if (!cityId) return [];
  return (assets || []).filter((a) => {
    if (!isTowerAsset(a)) return false;
    if (a.parentId === cityId) return true;
    if (Array.isArray(a.path) && a.path.includes(cityId)) return true;
    return false;
  });
}

/**
 * The single city an asset (usually a tower or device) belongs to. Returns the
 * first matching city found via `path` descent; falls back to a direct
 * `parentId` lookup.
 */
export function findCityForAsset(asset, cities = []) {
  if (!asset || !cities.length) return null;
  const byId = new Map(cities.map((c) => [c.id, c]));
  if (asset.parentId && byId.has(asset.parentId)) return byId.get(asset.parentId);
  if (Array.isArray(asset.path)) {
    for (const id of asset.path) if (byId.has(id)) return byId.get(id);
  }
  return null;
}

export function isGatewayAsset(asset) {
  if (!asset) return false;
  const type = SITE_TYPES.has(asset.type)
    ? asset.type
    : SITE_TYPES.has(asset.attributes?.customAssetType?.value)
      ? asset.attributes.customAssetType.value
      : null;
  if (!type) return false;
  // Exclude the root BuildingAsset (the realm-level container that wraps every
  // outlet) — only nested buildings represent actual sites in the J-Dot realm.
  if (type === 'BuildingAsset' && !asset.parentId) return false;
  return true;
}

/**
 * Given a flat list of assets, return only gateways.
 */
export function pickGateways(assets = []) {
  return (assets || []).filter(isGatewayAsset);
}

/**
 * Return true when the asset is a descendant of the given gateway — at any
 * depth. The SMS IoT backend populates `asset.path` as an array of ancestor IDs
 * (deepest first, inclusive of the asset itself) so a gateway ID appearing
 * anywhere in that array means this asset lives under it, whether the parent
 * is the gateway directly or a group a few levels down.
 *
 * Falls back to a direct `parentId` check for backends that omit `path`.
 */
export function isDescendantOfGateway(asset, gatewayId) {
  if (!asset || !gatewayId) return false;
  if (Array.isArray(asset.path) && asset.path.includes(gatewayId)) return true;
  if (asset.parentId === gatewayId) return true;
  return false;
}

/**
 * Children devices of a gateway. A device is any asset whose `customAssetType`
 * is one of the 14 recognised types (see DEVICE_TYPES), anywhere in the
 * gateway's subtree.
 */
export function pickGatewayChildren(assets = [], gatewayId) {
  if (!gatewayId) return [];
  return (assets || []).filter((a) => isDescendantOfGateway(a, gatewayId) && isDeviceAsset(a));
}

/**
 * Every device asset in the portal (regardless of gateway). Used on Overview
 * for totals and for "Unassigned devices" detection.
 */
export function pickAllDevices(assets = []) {
  return (assets || []).filter(isDeviceAsset);
}

/**
 * Walk an asset's `path` (and parentId as a fallback) to find which gateway
 * it lives under. Handles devices nested under groups — where parentId points
 * to the group rather than the gateway itself.
 *
 * Returns the gateway asset or null.
 */
export function findGatewayForAsset(asset, gateways = []) {
  if (!asset || !gateways.length) return null;
  const byId = new Map(gateways.map((g) => [g.id, g]));

  if (asset.parentId && byId.has(asset.parentId)) return byId.get(asset.parentId);
  if (Array.isArray(asset.path)) {
    for (const id of asset.path) {
      if (byId.has(id)) return byId.get(id);
    }
  }
  return null;
}

/**
 * Group a list of child assets by their customAssetType (falling back to type).
 */
export function groupByCustomType(assets = []) {
  const out = {};
  for (const a of assets) {
    const t =
      a.attributes?.customAssetType?.value ||
      a.type ||
      'Unknown';
    if (!out[t]) out[t] = [];
    out[t].push(a);
  }
  return out;
}

/**
 * Resolve which gateway an alarm belongs to and return a filter predicate.
 *
 * Alarms carry site linkage in multiple shapes depending on how they were
 * raised. We check them in order:
 *   1. `alarm.asset[0]` — SMS IoT's canonical array of linked assets.
 *      Use the cached full asset if available (it has `path`); fall back to
 *      the stub on the alarm itself.
 *   2. `alarm.assets` / `alarm.linkedAssets` — variant shapes.
 *   3. id-only fields: `assetId`, and `sourceId` when `source` is INTERNAL
 *      or CLIENT.
 *
 * For each candidate we walk the path via `findGatewayForAsset` to see if it
 * lives under `gatewayId` — which correctly handles both devices inside
 * groups (nested parent) and alarms raised at the gateway itself.
 */
export function alarmBelongsToGateway(alarm, gatewayId, assetById, gateways) {
  if (!alarm || !gatewayId || !gateways?.length) return false;

  const tryAsset = (assetLike) => {
    if (!assetLike) return false;
    const id = typeof assetLike === 'string' ? assetLike : assetLike.id;
    if (!id) return false;
    // Prefer the full cached asset (has `path`); fall back to the stub.
    const asset = (assetById && assetById.get(id)) || assetLike;
    const owner = findGatewayForAsset(asset, gateways);
    return owner?.id === gatewayId;
  };

  if (Array.isArray(alarm.asset)) {
    for (const a of alarm.asset) if (tryAsset(a)) return true;
  } else if (alarm.asset && typeof alarm.asset === 'object') {
    if (tryAsset(alarm.asset)) return true;
  }

  if (Array.isArray(alarm.assets)) {
    for (const a of alarm.assets) if (tryAsset(a)) return true;
  }
  if (Array.isArray(alarm.linkedAssets)) {
    for (const a of alarm.linkedAssets) if (tryAsset(a)) return true;
  }

  if (alarm.assetId && tryAsset(alarm.assetId)) return true;
  if ((alarm.source === 'INTERNAL' || alarm.source === 'CLIENT') && alarm.sourceId && tryAsset(alarm.sourceId)) {
    return true;
  }

  return false;
}

/**
 * Return only the alarms that belong to the given gateway, using the same
 * resolution rules as `alarmBelongsToGateway`.
 */
export function pickAlarmsForGateway(alarms = [], gatewayId, assets = [], gateways = []) {
  if (!alarms.length || !gatewayId) return [];
  const assetById = new Map(assets.map((a) => [a.id, a]));
  return alarms.filter((al) => alarmBelongsToGateway(al, gatewayId, assetById, gateways));
}

/**
 * Extract a [lat, lng] tuple from an asset. We prefer `customLocation` because
 * J-Dot stores its outlet coordinates there; fall back to OpenRemote's standard
 * `location` attribute for realms that use the built-in field. Both accept the
 * GeoJSON Point shape (`{ type: 'Point', coordinates: [lng, lat] }`) plus the
 * `{ lat, lng }` / `{ latitude, longitude }` object shapes, and a plain
 * `"lat,lng"` string as a last resort.
 */
function readPoint(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    const m = value.split(',').map((s) => Number(s.trim()));
    if (m.length === 2 && m.every(Number.isFinite)) return [m[0], m[1]];
    return null;
  }
  if (typeof value !== 'object') return null;
  if (value.type === 'Point' && Array.isArray(value.coordinates) && value.coordinates.length >= 2) {
    const [lng, lat] = value.coordinates;
    if (typeof lat === 'number' && typeof lng === 'number') return [lat, lng];
  }
  if (typeof value.lat === 'number' && typeof value.lng === 'number') return [value.lat, value.lng];
  if (typeof value.latitude === 'number' && typeof value.longitude === 'number') return [value.latitude, value.longitude];
  return null;
}

export function extractLocation(asset) {
  const a = asset?.attributes;
  if (!a) return null;
  return readPoint(a.customLocation?.value) || readPoint(a.location?.value);
}

/**
 * Read the floor-map image URL from a gateway's `floorMap` attribute.
 * Returns the trimmed URL when it looks like a valid http(s) URL,
 * otherwise null. Callers should fall back to an inline placeholder
 * when null is returned.
 */
export function getFloorMapUrl(asset) {
  const raw = asset?.attributes?.floorMap?.value;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (!/^https?:\/\//i.test(trimmed)) return null;
  return trimmed;
}

/**
 * Summarise gateway health from its children.
 */
export function summariseGateway(children = []) {
  let online = 0;
  let offline = 0;
  let alarming = 0;
  for (const c of children) {
    const connected = c.attributes?.connected?.value;
    if (connected === false) offline += 1;
    else online += 1;
    const alarm = c.attributes?.alarm?.value || c.attributes?.triggered?.value;
    if (alarm === true || alarm === 'true') alarming += 1;
  }
  return { total: children.length, online, offline, alarming };
}
