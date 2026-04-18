import {
  Siren, Video, Lock, LockOpen, DoorOpen, DoorClosed,
  Thermometer, PersonStanding, Lightbulb, LightbulbOff,
  Radar, Flame, LayoutDashboard, Plug, PlugZap,
  Vibrate, TriangleAlert, Fan, Cpu, Server,
} from 'lucide-react';

/**
 * The canonical list of device `customAssetType` values the portal recognises.
 * Anything else (ConsoleAsset, AgentAsset, the Gateway itself, etc.) is not a
 * "device" and is hidden from site pages.
 */
export const DEVICE_TYPES = [
  'AlarmAsset',
  'CameraAsset',
  'DoorLockAsset',
  'DoorSensorAsset',
  'HeatSensorAsset',
  'HumanPresenceSensorAsset',
  'LightAsset',
  'MotionSensorAsset',
  'SmokeSensorAsset',
  'PanelAsset',
  'PlugAsset',
  'VibrationSensorAsset',
  'SOSAsset',
  'FanAsset',
];

/**
 * Types the client can directly toggle on/off. All others are read-only sensors.
 */
export const CONTROLLABLE_TYPES = ['LightAsset', 'PlugAsset', 'FanAsset', 'DoorLockAsset', 'AlarmAsset'];

/**
 * Per-customType overrides for the primary control attribute name. Most types
 * use the universal `onOff` attribute, but some devices model their control
 * differently — e.g. FanAsset exposes a `Fan` boolean.
 *
 * These overrides take precedence over `onOff`.
 */
const PRIMARY_ATTR_OVERRIDE = {
  FanAsset: 'Fan',
};

/**
 * Read the `customAssetType` attribute from a SMS IoT asset.
 * Falls back to the asset's `type` field if no custom attribute is set.
 */
export function getCustomAssetType(asset) {
  if (!asset) return null;
  const v = asset.attributes?.customAssetType?.value;
  if (typeof v === 'string' && v.trim()) return v.trim();
  return asset.type || null;
}

/**
 * Standard OpenRemote attribute the portal repurposes as a friendly display
 * name. Every asset inherits a `notes` field from the base Asset class, and
 * writing to it only needs attribute-write permission (which every user
 * who can control the device already has). Because it lives on the server,
 * renames sync across every browser/device the user signs in from.
 */
export const DISPLAY_NAME_ATTR = 'notes';

/**
 * Asset types whose backend integration uses `notes` to carry structured
 * data (sensor payloads, encoded state, etc.) rather than free-form text.
 * For these we must NOT repurpose `notes` as a display name — reading the
 * value would show garbage, and writing would wipe the data.
 *
 * Extend this set when you discover another type that uses `notes` for
 * data. Anything listed here:
 *   • falls back to `asset.name` in `getAssetDisplayName`
 *   • has the rename pencil hidden on the asset detail page
 */
export const NOTES_USED_FOR_DATA = new Set([
  'HumanPresenceSensorAsset',
]);

/** Whether this asset type is safe to rename via the `notes` attribute. */
export function canRenameAsset(asset) {
  if (!asset) return false;
  const type = getCustomAssetType(asset);
  return !NOTES_USED_FOR_DATA.has(type);
}

/**
 * Returns the name to show in the UI for a device or site, checking in order:
 *   1. The `notes` attribute value — ONLY if the asset type is safe for
 *      repurposing notes (see NOTES_USED_FOR_DATA above).
 *   2. The asset's canonical `name` property.
 *   3. 'Untitled' as the final fallback.
 *
 * Components that use React Query's asset cache automatically re-render
 * when the `notes` attribute flips — `useWriteAttribute` patches the cache
 * optimistically on every rename.
 */
export function getAssetDisplayName(asset) {
  if (!asset) return 'Untitled';
  if (canRenameAsset(asset)) {
    const override = asset.attributes?.[DISPLAY_NAME_ATTR]?.value;
    if (typeof override === 'string' && override.trim()) return override.trim();
  }
  if (typeof asset.name === 'string' && asset.name.trim()) return asset.name;
  return 'Untitled';
}

/**
 * True when the asset is one of the recognised device types.
 */
export function isDeviceAsset(asset) {
  return DEVICE_TYPES.includes(getCustomAssetType(asset));
}

/**
 * Map a customAssetType (or fallback type) to an outline Lucide icon component.
 * Supports active/on/alarm variants for icons that have them.
 */
export function getAssetIcon(customType, { on = false, alarm = false } = {}) {
  switch (customType) {
    case 'AlarmAsset':              return alarm ? Siren : Siren;
    case 'CameraAsset':             return Video;
    case 'DoorLockAsset':           return on ? Lock : LockOpen; // on = locked (secured)
    case 'DoorSensorAsset':         return on ? DoorOpen : DoorClosed; // on = open
    case 'HeatSensorAsset':         return Thermometer;
    case 'HumanPresenceSensorAsset':return PersonStanding;
    case 'LightAsset':              return on ? Lightbulb : LightbulbOff;
    case 'MotionSensorAsset':       return Radar;
    case 'SmokeSensorAsset':        return Flame;
    case 'PanelAsset':              return LayoutDashboard;
    case 'PlugAsset':               return on ? PlugZap : Plug;
    case 'VibrationSensorAsset':    return Vibrate;
    case 'SOSAsset':                return TriangleAlert;
    case 'FanAsset':                return Fan;
    case 'GatewayAsset':            return Server;
    default:                        return Cpu;
  }
}

/**
 * Human-friendly label for an asset type.
 */
export function getAssetTypeLabel(customType) {
  if (!customType) return 'Device';
  return customType
    .replace(/Asset$/, '')
    .replace(/Sensor$/, ' Sensor')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Accent tint for a given asset type (used for icon backgrounds / chips).
 * Keep aligned with Tailwind color tokens.
 */
export function getAssetAccent(customType) {
  switch (customType) {
    case 'AlarmAsset':
    case 'SOSAsset':
    case 'SmokeSensorAsset':       return 'red';
    case 'CameraAsset':            return 'blue';
    case 'DoorLockAsset':
    case 'DoorSensorAsset':        return 'amber';
    case 'HeatSensorAsset':        return 'orange';
    case 'HumanPresenceSensorAsset':
    case 'MotionSensorAsset':      return 'cyan';
    case 'LightAsset':             return 'yellow';
    case 'PlugAsset':
    case 'FanAsset':               return 'cyan';
    case 'VibrationSensorAsset':   return 'purple';
    case 'PanelAsset':             return 'slate';
    case 'GatewayAsset':           return 'cyan';
    default:                       return 'slate';
  }
}

const TRUTHY = new Set([true, 'true', 'ON', 'on', 1]);
const boolish = (v) => TRUTHY.has(v);

/**
 * "Active" = the device is in its highlighted / user-engaged state.
 *
 * Universal rule — **if the asset has an `onOff` attribute, it's the source
 * of truth**. Type-specific attributes (`locked`, `armed`, `opened`, sensor
 * detection flags, etc.) are only consulted when `onOff` is missing.
 */
export function isAssetActive(asset, customType) {
  const a = asset?.attributes || {};
  const t = customType || getCustomAssetType(asset);

  // 1. Per-type attribute override (e.g. FanAsset → `Fan`).
  const override = PRIMARY_ATTR_OVERRIDE[t];
  if (override && a[override]?.value !== undefined && a[override]?.value !== null) {
    return boolish(a[override].value);
  }

  // 2. Universal primary — every controllable device exposes `onOff`.
  if (a.onOff?.value !== undefined && a.onOff?.value !== null) return boolish(a.onOff.value);

  switch (t) {
    case 'DoorLockAsset':
      // Legacy attribute: asset was modelled with `locked` before `onOff`.
      // locked=true → secured → ACTIVE (matches the "on=Locked" convention).
      return boolish(a.locked?.value);
    case 'DoorSensorAsset':
      return boolish(a.opened?.value ?? a.state?.value);
    case 'MotionSensorAsset':
      return boolish(a.motionDetected?.value ?? a.detected?.value);
    case 'HumanPresenceSensorAsset':
      return boolish(a.presenceDetected?.value ?? a.detected?.value);
    case 'SmokeSensorAsset':
      return boolish(a.smokeDetected?.value ?? a.triggered?.value);
    case 'VibrationSensorAsset':
      return boolish(a.vibrationDetected?.value ?? a.triggered?.value);
    case 'SOSAsset':
      return boolish(a.triggered?.value ?? a.sos?.value);
    case 'AlarmAsset':
      return boolish(a.armed?.value ?? a.enabled?.value);
    case 'LightAsset':
    case 'PlugAsset':
    case 'FanAsset':
      return boolish(a.on?.value ?? a.power?.value ?? a.enabled?.value);
    case 'CameraAsset':
      return true;
    default: {
      const candidates = [a.on, a.power, a.enabled, a.active, a.state, a.triggered];
      for (const attr of candidates) {
        if (attr && attr.value != null) return boolish(attr.value);
      }
      return false;
    }
  }
}

/**
 * Return "triggered" true when an alarm/sensor is firing.
 * Used to pick red styling in tiles.
 */
export function isAssetAlarming(asset, customType) {
  const a = asset?.attributes || {};
  const boolish = (v) => v === true || v === 'true' || v === 'ON' || v === 'on' || v === 1;

  if (['AlarmAsset', 'SOSAsset', 'SmokeSensorAsset'].includes(customType)) {
    const attrs = [a.triggered, a.alarm, a.smokeDetected, a.onOff, a.on, a.active];
    return attrs.some((x) => x && boolish(x.value));
  }
  return false;
}

/**
 * Return the attribute name the icon should flip on tap.
 *
 * Order of preference:
 *   1. Per-type override from `PRIMARY_ATTR_OVERRIDE` (e.g. FanAsset → `Fan`).
 *   2. Universal `onOff` — the standard primary for every other device.
 *   3. Legacy per-type fallbacks, only consulted when neither of the above
 *      exist on the asset at all.
 */
export function getPrimaryControlAttr(asset, customType) {
  const a = asset?.attributes || {};

  // 1. Per-type override (e.g. FanAsset → "Fan").
  const override = PRIMARY_ATTR_OVERRIDE[customType];
  if (override) return override;

  // 2. Universal primary — `onOff`.
  if ('onOff' in a) return 'onOff';

  // 3. Legacy fallbacks for assets modelled before `onOff` existed.
  const fallback = {
    DoorLockAsset: ['locked'],
    AlarmAsset:    ['armed', 'enabled', 'on'],
    LightAsset:    ['on', 'power', 'enabled'],
    PlugAsset:     ['on', 'power', 'enabled'],
  }[customType] || [];
  for (const n of fallback) if (n in a) return n;

  return 'onOff';
}

/**
 * Value to write when flipping a device via its icon — always the negation of
 * the attribute's current value. If the attribute has no value yet, the first
 * tap turns it on.
 */
export function nextToggleValue(asset, attrName) {
  const current = asset?.attributes?.[attrName]?.value;
  if (typeof current === 'boolean') return !current;
  return true;
}

/**
 * Return the "primary value" attribute name for display — used by sensor-type
 * tiles to show their headline reading (temperature, brightness, power, ...).
 */
export function getPrimaryReadingAttr(asset, customType) {
  const a = asset?.attributes || {};
  const firstOf = (...names) => names.find((n) => n in a);
  switch (customType) {
    case 'HeatSensorAsset':         return firstOf('temperature', 'value', 'reading');
    case 'PlugAsset':               return firstOf('power', 'energy', 'wattage');
    case 'LightAsset':              return firstOf('brightness', 'dimLevel', 'level');
    case 'FanAsset':                return firstOf('speed', 'level');
    case 'HumanPresenceSensorAsset':return firstOf('presenceDetected', 'detected', 'on');
    case 'MotionSensorAsset':       return firstOf('motionDetected', 'detected', 'on');
    case 'SmokeSensorAsset':        return firstOf('smokeDetected', 'triggered', 'on');
    case 'DoorSensorAsset':         return firstOf('opened', 'state', 'on');
    case 'DoorLockAsset':           return firstOf('locked');
    case 'VibrationSensorAsset':    return firstOf('vibrationDetected', 'triggered');
    case 'SOSAsset':                return firstOf('triggered', 'sos', 'on');
    case 'AlarmAsset':              return firstOf('armed', 'enabled', 'triggered', 'on');
    default:                        return null;
  }
}

/**
 * Produce a short human-readable state label for a device.
 *   LightAsset     on=true  → "On" / "Off"
 *   HeatSensor     temp=22  → "22°C"
 *   DoorSensor     open=true→ "Open" / "Closed"
 *   MotionSensor   detected → "Motion" / "Clear"
 */
export function getStateLabel(asset, customType) {
  const a = asset?.attributes || {};
  const alarm = isAssetAlarming(asset, customType);
  if (alarm) return 'Triggered';

  const readingName = getPrimaryReadingAttr(asset, customType);
  const reading = readingName ? a[readingName]?.value : undefined;

  switch (customType) {
    case 'HeatSensorAsset':
      return reading != null ? `${Number(reading).toFixed(1)}°C` : '—';
    case 'PlugAsset':
      return reading != null ? `${Number(reading).toFixed(0)} W` : (isAssetActive(asset) ? 'On' : 'Off');
    case 'LightAsset':
      if (reading != null && typeof reading === 'number') return isAssetActive(asset) ? `${Math.round(reading)}%` : 'Off';
      return isAssetActive(asset) ? 'On' : 'Off';
    case 'FanAsset':
      if (reading != null && typeof reading === 'number') return isAssetActive(asset) ? `Speed ${reading}` : 'Off';
      return isAssetActive(asset) ? 'On' : 'Off';
    case 'DoorSensorAsset':
      return isAssetActive(asset) ? 'Open' : 'Closed';
    case 'DoorLockAsset':
      return isAssetActive(asset, customType) ? 'Locked' : 'Unlocked';
    case 'MotionSensorAsset':
      return isAssetActive(asset) ? 'Motion' : 'Clear';
    case 'HumanPresenceSensorAsset':
      return isAssetActive(asset) ? 'Present' : 'Clear';
    case 'SmokeSensorAsset':
      return isAssetActive(asset) ? 'Smoke' : 'Clear';
    case 'VibrationSensorAsset':
      return isAssetActive(asset) ? 'Vibration' : 'Stable';
    case 'SOSAsset':
      return isAssetActive(asset) ? 'SOS' : 'Idle';
    case 'AlarmAsset':
      return isAssetActive(asset) ? 'Armed' : 'Disarmed';
    case 'CameraAsset':
      return 'Live';
    case 'PanelAsset':
      return 'Panel';
    default:
      return isAssetActive(asset) ? 'On' : 'Off';
  }
}
