/**
 * Gateway helpers — a "gateway" is a location/site. Each child asset belongs to
 * exactly one gateway. We identify gateways by the SMS IoT asset `type`
 * (GatewayAsset) first, then by a custom type attribute as a fallback.
 */

import { isDeviceAsset } from './assetIcons';

export function isGatewayAsset(asset) {
  if (!asset) return false;
  if (asset.type === 'GatewayAsset') return true;
  if (asset.attributes?.customAssetType?.value === 'GatewayAsset') return true;
  return false;
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
