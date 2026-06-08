/**
 * Gateway helpers — a "gateway" is a location/site. Each child asset belongs to
 * exactly one gateway. We identify gateways by the SMS IoT asset `type`
 * (GatewayAsset / BuildingAsset) first, then by a custom type attribute as a
 * fallback. Realms that model their locations as buildings (e.g. retail
 * outlets) surface them under `BuildingAsset`; older realms use
 * `GatewayAsset`. Both shapes are treated as sites here.
 */

import { isDeviceAsset, getCustomAssetType, normalizeAssetType } from './assetIcons';

const SITE_TYPES = new Set(['GatewayAsset', 'BuildingAsset']);

/* ==========================================================================
   Telco hierarchy: Site (top, customAssetType=SiteAsset)
                  → Tower (TowerAsset OR any GatewayAsset)
                  → IoT devices.

   "Site" here is the top-level container the user picks from the global
   dropdown — not to be confused with the legacy `OverviewPage`/`SitesPage`
   usage where a gateway was loosely called a "site". In the SecureOps view
   sites and towers are distinct levels.
   ========================================================================== */

/**
 * Top-level container in the telco hierarchy. An asset is a Site when its
 * `customAssetType` (or canonical `type`), normalised to PascalCase, equals
 * `SiteAsset`. Realms that wrote `siteAsset` or `SiteAsset` both match.
 */
export function isSiteAsset(asset) {
  if (!asset) return false;
  if (normalizeAssetType(asset.type) === 'SiteAsset') return true;
  return normalizeAssetType(getCustomAssetType(asset)) === 'SiteAsset';
}

/**
 * Return every site in a flat asset list.
 */
export function pickSites(assets = []) {
  return (assets || []).filter(isSiteAsset);
}

/**
 * A "tower" is any asset whose `customAssetType` is `TowerAsset` (normalised
 * PascalCase, so `towerAsset` also matches), OR any `GatewayAsset` (so
 * installations that haven't migrated to the new custom type still surface
 * their gateways as towers). Excludes assets that already match `isSiteAsset`
 * to avoid double-counting.
 */
export function isTowerAsset(asset) {
  if (!asset) return false;
  if (isSiteAsset(asset)) return false;
  if (normalizeAssetType(getCustomAssetType(asset)) === 'TowerAsset') return true;
  return isGatewayAsset(asset);
}

/**
 * Towers that live under a given site. Walks `asset.path` so towers may be
 * nested several layers deep under the site without breaking the lookup.
 */
export function pickTowersForSite(assets = [], siteId) {
  if (!siteId) return [];
  return (assets || []).filter((a) => {
    if (!isTowerAsset(a)) return false;
    if (a.parentId === siteId) return true;
    if (Array.isArray(a.path) && a.path.includes(siteId)) return true;
    return false;
  });
}

/**
 * Camera-type predicates.
 *
 * Two flavours of camera asset live in the realm:
 *   • `CameraAsset`    — fixed-position camera. Plays a single live stream.
 *   • `PtzCameraAsset` — pan/tilt/zoom (180° or 360°). Plays a live stream
 *                       AND surfaces a direction pad over the frame.
 *
 * Every camera-iterating filter in the dashboard goes through `isCameraAsset`
 * so adding a third variant later is a one-line change here.
 */
export function isCameraAsset(asset) {
  const t = normalizeAssetType(getCustomAssetType(asset));
  return t === 'CameraAsset' || t === 'PtzCameraAsset';
}

export function isPtzCamera(asset) {
  return normalizeAssetType(getCustomAssetType(asset)) === 'PtzCameraAsset';
}

/**
 * Read the playable live-stream URL from a CameraAsset. Accepts either:
 *   • `liveStreamUrl` — the canonical attribute name in this portal.
 *   • `streamUrl`     — short alias for installations that use that name
 *                       (added 2026-05-16 after the SMS realm spelled the
 *                       attribute `streamUrl`; both spellings now work).
 *
 * Returns the first trimmed http(s) URL found, otherwise `null` so the
 * camera tile / modal can render an "Camera offline / no stream URL" state.
 */
export function getCameraStreamUrl(camera) {
  const a = camera?.attributes;
  if (!a) return null;
  const candidates = [a.liveStreamUrl?.value, a.streamUrl?.value];
  for (const raw of candidates) {
    if (typeof raw === 'string' && raw.trim()) return raw.trim();
  }
  return null;
}

/**
 * Find the "weather" asset for a tower — the realm-side convention is that
 * each tower has a single `HeatSensorAsset` child carrying BOTH `temperature`
 * and `humidity` attributes (a packaged temp/humidity sensor inside the
 * tower's IP67 box). The Overview's Environmental Telemetry, the header's
 * temp/humidity chips, and the Control page's Environment card all source
 * their reading from this asset rather than from the tower attributes
 * directly.
 *
 * Returns `null` when the tower has no HeatSensorAsset child — callers
 * should hide the corresponding widget (no placeholder data).
 */
export function getWeatherAssetForTower(tower, allAssets = []) {
  if (!tower) return null;
  const children = pickGatewayChildren(allAssets, tower.id);
  return children.find(
    (a) => normalizeAssetType(getCustomAssetType(a)) === 'HeatSensorAsset'
  ) || null;
}

/**
 * Find the PTT asset under a tower.
 *
 * Match rules (all case-insensitive — telco realms inconsistently capitalise
 * type strings, and the operator may have renamed the asset by hand):
 *   • `customAssetType` equals `PttAsset`, OR
 *   • display `name` equals `PTT Asset` (also accepts the `PTT Assest` typo).
 *
 * Walks `isDescendantOfGateway` directly rather than `pickGatewayChildren`
 * because `PttAsset` is not in `DEVICE_TYPES` — it's a single-purpose
 * configuration asset that carries the `socketIP` attribute holding the
 * full `mumble://user:pass@host:port/` link the OS Mumble client opens.
 *
 * Returns the first match or `null` — callers render the PTT button
 * disabled when null.
 */
export function findPttAssetForTower(tower, allAssets = []) {
  if (!tower) return null;
  return (allAssets || []).find((a) => {
    if (!isDescendantOfGateway(a, tower.id)) return false;
    const type = String(getCustomAssetType(a) || '').toLowerCase();
    if (type === 'pttasset') return true;
    const name = String(a?.name || '').replace(/\s+/g, ' ').trim().toLowerCase();
    return name === 'ptt asset' || name === 'ptt assest';
  }) || null;
}

/**
 * Resolve the PTT link for a tower. Centralised so every callsite (the
 * Control grid tile, the AlarmClipModal icon button, the CameraHistoryModal
 * header) shares one lookup and the same hide/show rules.
 *
 *   • `ok`      — `socketIP` is a `mumble://…` URL. Used verbatim as the
 *                 `<a href>` so the OS hands off to the Mumble client.
 *   • `missing` — no PttAsset under the tower, or `socketIP` blank.
 *                 Callsites render a clickable button that toasts a
 *                 "not configured" hint so the operator can fix OR.
 *   • `invalid` — `socketIP` is non-empty but doesn't look like a
 *                 `mumble://…` URL. Callsites **hide the icon entirely** —
 *                 clicking a malformed link would do nothing useful and
 *                 the operator shouldn't see a broken affordance.
 *
 * Returns `{ status, href }`. `href` is null unless status === 'ok'.
 */
export function resolvePttForTower(tower, allAssets = []) {
  if (!tower) return { status: 'missing', href: null };
  const pttAsset = findPttAssetForTower(tower, allAssets);
  const rawValue = pttAsset?.attributes?.socketIP?.value;
  if (typeof rawValue !== 'string' || !rawValue.trim()) {
    return { status: 'missing', href: null };
  }
  const trimmed = rawValue.trim();
  if (!/^mumble:\/\//i.test(trimmed)) {
    return { status: 'invalid', href: null };
  }
  return { status: 'ok', href: trimmed };
}

/**
 * The single site an asset (usually a tower or device) belongs to. Returns
 * the first matching site found via `path` descent; falls back to a direct
 * `parentId` lookup.
 */
export function findSiteForAsset(asset, sites = []) {
  if (!asset || !sites.length) return null;
  const byId = new Map(sites.map((c) => [c.id, c]));
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
