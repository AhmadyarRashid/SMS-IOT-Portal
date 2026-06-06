# SMS IoT — Client Portal

Next.js 15 + React 19 dashboard for the SMS IoT (OpenRemote) backend.

## Setup

```bash
yarn install
cp .env.example .env   # set NEXT_PUBLIC_SMS_IOT_URL and NEXT_PUBLIC_SMS_IOT_REALM
yarn dev               # http://localhost:3000
```

Build / start production:

```bash
yarn build
yarn start
```

### Environment

| Variable | Where | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SMS_IOT_URL` | client | Backend URL surfaced in Settings. |
| `NEXT_PUBLIC_SMS_IOT_REALM` | client | Keycloak realm used in the API path (`/api/{REALM}/…`). |
| `SMS_IOT_BACKEND_URL` | server | Target of the `/api`, `/auth`, `/websocket` rewrites in `next.config.mjs`. |

`/api/*`, `/auth/*`, and `/websocket/*` are proxied through Next.js rewrites so the browser stays same-origin.

## Project layout

```
app/                Next.js App Router routes (login + (app) group)
src/api/            Axios client, OAuth2, asset/alarm/datapoint endpoints
src/components/     Layout, tiles, cameras, command palette, notifications, UI primitives
src/hooks/          React Query wrappers, live events, alarm notifications
src/lib/            react-router-dom → next/navigation compatibility shim
src/store/          Zustand stores (auth, app, secureOps, activity, pwa)
src/utils/          assetIcons, gateways, alarms, helpers, csv
src/views/          Page components mounted by the app/ routes
public/             Service worker, manifest, favicon, logo
```

## customAssetType

Every asset in OpenRemote carries a `customAssetType` attribute that tells the portal what kind of device it is. The portal hides anything that isn't on the recognised list (e.g. `ConsoleAsset`, `AgentAsset`).

### Recognised values

| Type | Group | UI behaviour |
|---|---|---|
| `SiteAsset` | hierarchy | Top-level container (`/control`, site dropdown). |
| `TowerAsset` *(or any `GatewayAsset`)* | hierarchy | Mid-level container under a Site. |
| `CameraAsset` | sensor | Live video tile (`liveStreamUrl`), opens history modal. |
| `PtzCameraAsset` | sensor | Camera + PTZ directional pad. |
| `DoorLockAsset` / `ToggleableDoorLockAsset` | controllable | Tap to lock / unlock. |
| `LightAsset` | controllable | Tap to toggle, brightness slider on detail. |
| `PlugAsset` | controllable | Tap to toggle. |
| `FanAsset` | controllable | Tap to toggle (writes `Fan` attr), speed slider on detail. |
| `AlarmAsset` / `BuzzerAsset` | controllable | Arm / silence. |
| `BatteryAsset`, `SolarAsset` | sensor | Tower-side power telemetry. |
| `HeatSensorAsset` | sensor | Temperature reading. |
| `HumanPresenceSensorAsset`, `MotionSensorAsset`, `DoorSensorAsset`, `SmokeSensorAsset`, `VibrationSensorAsset`, `SOSAsset` | sensor | Read-only state. |
| `PanelAsset` | sensor | Read-only panel. |

The full list lives in `src/utils/assetIcons.js` (`DEVICE_TYPES`, `CONTROLLABLE_TYPES`).

### How it's used

- **`getCustomAssetType(asset)`** — reads `attributes.customAssetType.value`, falls back to `asset.type`.
- **`normalizeAssetType(t)`** — case-insensitive matching (`siteAsset` and `SiteAsset` both work).
- **`isAssetActive(asset, customType)`** — single source of truth for "is this device on/triggered". Prefer this over reading attributes directly.
- **`getPrimaryControlAttr(asset, customType)`** — returns the attribute name a tap should write (`onOff` for most, `Fan` for `FanAsset`, legacy fallbacks otherwise). Pair with `nextToggleValue` and the `useWriteAttribute` hook for optimistic updates.
- **`<AssetGlyph customType={…} />`** — the only place Lucide icons are mapped from a customAssetType. Always render device icons through this component.

Adding a new device type: add it to `DEVICE_TYPES` (and `CONTROLLABLE_TYPES` if tappable), extend the switch in `getStateLabel` / `isAssetActive` if needed, and add an icon row to `AssetGlyph`.
