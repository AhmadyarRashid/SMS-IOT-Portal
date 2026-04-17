# SMS IoT — Client Portal

A Home Assistant-inspired client portal for monitoring and controlling IoT
devices across multiple sites (home, office, factory, …), powered by the
**SMS IoT** platform. Built by SMS Service (PK).

> **Read this document top-to-bottom before making non-trivial changes.** Every
> non-obvious behaviour in the app is documented here along with *why* it works
> that way, not just what it does.

---

## 1. Overview

- **Audience:** end-customers of SMS Service — property owners managing a
  handful of sites, each containing many IoT devices.
- **Backend:** a SMS IoT instance (OpenRemote-compatible REST + Keycloak
  OAuth2). Everything is proxied through Vite/nginx so the browser never speaks
  cross-origin.
- **Design inspiration:** [home-assistant.io / lovelace](https://demo.home-assistant.io/#/lovelace/home)
  — tile cards, dark-first theme, tap-the-icon to toggle, subtle motion,
  per-site dashboards.

### Tech stack

| Layer | Library |
|---|---|
| Framework | **React 19** |
| Bundler | **Vite 8** |
| Styling | **Tailwind CSS v4** with a CSS-variable token layer |
| Routing | **React Router v7** |
| Server state | **TanStack React Query** (with optimistic updates) |
| Client state | **Zustand** (auth, theme, density, sidebar) |
| HTTP | **Axios** (JWT bearer + auto-refresh interceptor) |
| Charts | **Recharts** (area, bar, pie) |
| Map | **Leaflet** + **React-Leaflet** (Carto dark / OSM light) |
| Icons | **Lucide React** (outline style) |
| Motion | **Framer Motion** |
| Toasts | **react-hot-toast** |
| Dates | **date-fns** |

### What this portal *does not* do

- **Device provisioning** — new devices are registered in the backend's own
  manager UI. The portal is read/write on existing assets only.
- **Role/user management** — handled in the backend's Keycloak realm.
- **TypeScript** — JSX only. (Possible future migration.)
- **Tests** — none yet. (Vitest + React Testing Library recommended.)

---

## 2. Quick start

```bash
npm install
cp .env.example .env   # set VITE_SMS_IOT_URL and VITE_SMS_IOT_REALM
npm run dev            # http://localhost:3000
```

Build / lint / preview:

```bash
npm run build
npm run lint
npm run preview
```

---

## 3. Information architecture

9 routes. Every legacy route from the previous version of the app redirects to
one of these.

| Route | Page | Purpose |
|---|---|---|
| `/` | `OverviewPage` | **Dashboard.** KPIs, charts, live readings, reports, mini site strip |
| `/sites` | `SitesPage` | **Management.** Gateway grid with rich cards + bulk actions |
| `/g/:gatewayId` | `GatewayPage` | Devices at one site, grouped by `customAssetType` |
| `/a/:assetId` | `AssetPage` | Unified device detail with State / Controls / History / Alarms tabs |
| `/alarms` | `AlarmsPage` | Cross-site alarm inbox with filtering and status transitions |
| `/automations` | `AutomationsPage` | Rules CRUD (create/pause/delete) |
| `/map` | `MapPage` | Site pins on a themed tile map; click sidebar or marker to focus |
| `/settings` | `SettingsPage` | Theme, density, notifications, connection info |
| `/login` | `LoginPage` | OAuth2 password-grant login |

Legacy redirects in `App.jsx`: `/monitoring`, `/devices`, `/devices/:id`,
`/history`, `/controls`, `/rules` → unified views.

**Navigation highlighting (`Sidebar.jsx`):** the **Sites** sidebar item is
active for `/sites`, `/g/:id`, and `/a/:id` — so drilling into a site keeps
that item highlighted.

---

## 4. Core concepts

### 4.1. Sites (gateways)

In the backend an asset's `type` can be `GatewayAsset`. We refer to these as
**sites** in the UI (user-facing) and **gateways** internally (to match the
backend data model).

`src/utils/gateways.js`:
- `isGatewayAsset(asset)` — `type === 'GatewayAsset'` OR
  `attributes.customAssetType.value === 'GatewayAsset'`.
- `pickGateways(assets)` — filter the global asset list.

### 4.2. Device hierarchy (`path` descent)

Devices are usually direct children of a site (`parentId === gateway.id`), but
some installations nest devices inside group assets inside the gateway. So
`parentId` alone isn't reliable.

`findGatewayForAsset` + `pickGatewayChildren` / `isDescendantOfGateway` walk
`asset.path` (array of ancestor IDs, any depth) to find the real owning site.

**Why:** the naïve `parentId === gatewayId` filter missed devices grouped
under intermediate folders. Many real installations use groups.

### 4.3. Device types — the 14 we recognise

`src/utils/assetIcons.js`:

```js
export const DEVICE_TYPES = [
  'AlarmAsset', 'CameraAsset',
  'DoorLockAsset', 'DoorSensorAsset',
  'HeatSensorAsset', 'HumanPresenceSensorAsset',
  'LightAsset', 'MotionSensorAsset', 'SmokeSensorAsset',
  'PanelAsset', 'PlugAsset', 'VibrationSensorAsset',
  'SOSAsset', 'FanAsset',
];
```

An asset is a "device" (and appears in the portal) iff its `customAssetType`
attribute matches one of these. Anything else — ConsoleAsset, AgentAsset,
random types — is silently hidden from site pages.

`getCustomAssetType(asset)` reads
`asset.attributes.customAssetType.value` and falls back to `asset.type` when
the custom attribute isn't set. `isDeviceAsset(asset)` tests membership.

### 4.4. Controllable vs. sensor

```js
export const CONTROLLABLE_TYPES =
  ['LightAsset', 'PlugAsset', 'FanAsset', 'DoorLockAsset', 'AlarmAsset'];
```

Only these 5 types can be toggled directly from the icon. Everything else is
a read-only sensor whose icon opens the detail page instead.

---

## 5. Device control logic (the most important section)

Every icon tap (tile, hero, Controls-tab switch) eventually calls:

```
PUT /api/{realm}/asset/{assetId}/attribute/{attributeName}
```

The question is *which* attribute, and *what* value. Three helpers handle it.

### 5.1. `getPrimaryControlAttr(asset, customType)` → attribute name

Priority order:

1. **Per-type override** from `PRIMARY_ATTR_OVERRIDE`. Current overrides:
   ```js
   const PRIMARY_ATTR_OVERRIDE = { FanAsset: 'Fan' };
   ```
   A FanAsset icon **always** writes to `Fan` (capital F) — it's how fans are
   modelled in the SMS IoT asset definition. Any future type with its own
   canonical attribute goes in this map as a one-liner.
2. **Universal `onOff`** — for every other controllable type we prefer the
   `onOff` attribute when the asset has it. This is the single source of
   truth across Light, Plug, DoorLock, Alarm (and Fan via fallback if it
   didn't have `Fan`).
3. **Legacy fallbacks** — only consulted when neither of the above is on the
   asset at all. Mostly there to support older assets modelled before `onOff`
   existed:
   ```js
   DoorLockAsset: ['locked']
   AlarmAsset:    ['armed', 'enabled', 'on']
   LightAsset:    ['on', 'power', 'enabled']
   PlugAsset:     ['on', 'power', 'enabled']
   ```
4. **Last resort:** return `'onOff'` so the backend can initialise the
   attribute on first write (if the model allows).

### 5.2. `nextToggleValue(asset, attrName)` → boolean to write

Simple: read the current value, return its negation. If the attribute has
never been written (value is null/undefined), first tap turns it on.

```js
const current = asset.attributes[attrName]?.value;
return typeof current === 'boolean' ? !current : true;
```

**Why so simple now?** Earlier versions had type-specific inversion (DoorLock
used `locked=!active` which flipped semantics). That's all gone — we always
just flip the attribute's current boolean value. The `isAssetActive`
function does the type-specific visual interpretation instead.

### 5.3. `isAssetActive(asset, customType)` → boolean for visual state

"Active" = the device is in its highlighted/engaged state — the cyan-glow
state in the UI. Resolution order:

1. If a `PRIMARY_ATTR_OVERRIDE` exists for this type and the asset has that
   attribute with a value, use it. (`FanAsset.Fan`.)
2. Universal `onOff` — if the asset has it with a non-null value, use it.
3. Type-specific branches (when neither of the above applies):
   - `DoorLockAsset` → `locked === true` is "active" (**see §5.5 DoorLock
     convention**).
   - `DoorSensorAsset` → `opened || state` truthy.
   - `MotionSensorAsset` → `motionDetected || detected`.
   - `HumanPresenceSensorAsset` → `presenceDetected || detected`.
   - `SmokeSensorAsset` → `smokeDetected || triggered`.
   - `VibrationSensorAsset` → `vibrationDetected || triggered`.
   - `SOSAsset` → `triggered || sos`.
   - `AlarmAsset` → `armed || enabled`.
   - `LightAsset` / `PlugAsset` / `FanAsset` → `power || enabled`.
   - `CameraAsset` → always `true` ("Live").
   - Default: inspect `power / enabled / active / state / triggered`.

### 5.4. `getStateLabel(asset, customType)` → short label

Called by tile + hero to render the text under the name. Returns type-aware
strings — examples:

| Type | Label when active / off |
|---|---|
| LightAsset | "100%" (if brightness present) / "On" / "Off" |
| PlugAsset | "240 W" / "On" / "Off" |
| FanAsset | "Speed 3" / "On" / "Off" (spins when on) |
| DoorLockAsset | **"Locked" / "Unlocked"** (see §5.5) |
| DoorSensorAsset | "Open" / "Closed" |
| MotionSensorAsset | "Motion" / "Clear" |
| HumanPresenceSensorAsset | "Present" / "Clear" |
| SmokeSensorAsset | "Smoke" / "Clear" |
| HeatSensorAsset | "22.5°C" (or "—") |
| VibrationSensorAsset | "Vibration" / "Stable" |
| SOSAsset | "SOS" / "Idle" |
| AlarmAsset | "Armed" / "Disarmed" |
| CameraAsset | "Live" |

### 5.5. DoorLock convention

Everywhere in the app:

| `onOff` (or `locked`) | Active | Label | Icon |
|---|---|---|---|
| `true` | **yes** | **Locked** | `Lock` (closed padlock, cyan) |
| `false` | no | **Unlocked** | `LockOpen` (grey) |

**Why the inversion from the old model?** The previous version read `locked`
and treated unlocked as the active/changed state, which was confusing. The
new convention matches the icon-as-power-switch metaphor used for every
other device: engaged/locked = cyan glow ("on"), open = grey ("off").

The **"Doors unlocked"** count on Dashboard and in `GatewayCard` uses
`!isAssetActive(d, 'DoorLockAsset')` so both callers agree on what "unlocked"
means.

### 5.6. The two write sites

Both paths call `useWriteAttribute` — same mutation, same endpoint.

- **Icon** (`AssetTile.jsx`, Asset-detail hero) →
  `{ attributeName: getPrimaryControlAttr(...), value: nextToggleValue(...) }`
- **Controls-tab switch** (`AssetPage.jsx` ControlsTab) →
  directly `{ attributeName: n, value: !attr.value }` for every boolean
  attribute on the asset.

They produce identical network calls when targeting the same attribute.

### 5.7. Optimistic updates (`src/hooks/useAssets.js`)

Tap → UI flips **instantly**, before the server responds. React Query's
`onMutate` / `onError` / `onSettled` pattern:

1. **`onMutate`** cancels pending refetches, snapshots the current
   `['asset', id]` and `['assets', …]` caches, then patches both with the new
   attribute value. Every subscriber (tile, hero, Controls switch, state
   label) re-renders immediately.
2. **`onError`** rolls back to the snapshot and shows a toast. 403 gets a
   dedicated "You don't have permission to control this device." message.
3. **`onSettled`** invalidates the caches so the server's authoritative state
   reconciles any drift.

No success toast — would be noisy on rapid taps. Visual change is the
confirmation.

---

## 6. UI system

### 6.1. Icon rendering — `<AssetGlyph>`

`src/components/tiles/AssetGlyph.jsx` is the single place that maps
`customAssetType` → a Lucide icon. Every page/component that shows an
asset's icon imports `<AssetGlyph>` — **never** a Lucide icon directly.
This keeps the mapping centralised and prevents React's
`react-hooks/static-components` rule from firing on dynamic icon refs.

Active/alarm variants baked in:

| `customAssetType` | Off icon | On/Active icon | Alarm icon |
|---|---|---|---|
| `AlarmAsset` | `Siren` | `Siren` | `Siren` (red + pulse) |
| `CameraAsset` | `Video` | `Video` | — |
| `DoorLockAsset` | `LockOpen` | `Lock` | — |
| `DoorSensorAsset` | `DoorClosed` | `DoorOpen` | — |
| `HeatSensorAsset` | `Thermometer` | `Thermometer` | — |
| `HumanPresenceSensorAsset` | `PersonStanding` | `PersonStanding` | — |
| `LightAsset` | `LightbulbOff` | `Lightbulb` | — |
| `MotionSensorAsset` | `Radar` | `Radar` | — |
| `SmokeSensorAsset` | `Flame` | `Flame` | `Flame` (red + pulse) |
| `PanelAsset` | `LayoutDashboard` | — | — |
| `PlugAsset` | `Plug` | `PlugZap` | — |
| `VibrationSensorAsset` | `Vibrate` | `Vibrate` | — |
| `SOSAsset` | `TriangleAlert` | `TriangleAlert` | `TriangleAlert` (red + pulse) |
| `FanAsset` | `Fan` | `Fan` (spin-slow class) | — |
| `GatewayAsset` | `Server` | — | — |
| unknown | `Cpu` | — | — |

### 6.2. Theme tokens (CSS variables)

Defined in `src/index.css`, top of file. Everything uses these — no hardcoded
colors anywhere in the app.

| Token | Use |
|---|---|
| `--color-surface-0/1/2/3` | Page bg / panel / elevated card / hover+border |
| `--color-ink-0/1/2/3` | Primary / secondary / muted / very-muted text |
| `--color-accent-500` | Primary accent (cyan) — everything "on" |
| `--color-brand-*` | SMS navy blues |
| `--color-ok/warning/danger-*` | Semantic states |

Light mode overrides those via `:root[data-theme="light"]` in the same file.
Toggled by `appStore.toggleTheme()`.

### 6.3. Density (compact view)

Same mechanism as theme. `:root[data-density="compact"]` on `<html>` tightens
padding/gaps/sizes on `.panel`, `.tile`, `.ha-tile`, `.ha-tile-icon`,
`.ha-hero-icon`, and `.toggle-track`. Managed by `appStore.setDensity` /
`toggleCompact`. Persisted in `localStorage.sms_density`. Settings page
exposes the toggle.

### 6.4. Reusable primitives

| Class | Look | Used for |
|---|---|---|
| `.panel` | Rounded 16px card on surface-1 with subtle 1px border | Hero, section wrappers, dropdowns |
| `.tile` | Rounded 20px card with hover accent border | State attribute cards, misc content |
| `.ha-tile` | **HA-style device tile** — horizontal icon-pill + name + state | `AssetTile` (site pages) |
| `.ha-tile-icon[-on/-off/-alarm]` | Circular tinted icon badge | Inside `.ha-tile` |
| `.ha-hero-icon` | 128px circular glow — the big clickable icon on the asset detail page | `AssetPage` hero |
| `.toggle-track` + `.toggle-thumb` | 44×26 pill switch with button-reset | Every on/off control |
| `.status-dot` / `.pulse` | 8px dot with optional glow + pulse | Connection / alarm indicators |
| `.sev-critical/high/medium/low` | Severity badges with matching bg+border | Alarm pills throughout |

### 6.5. Motion
- Framer Motion used sparingly — `whileHover`, `whileTap`, and staggered
  entries on lists. No page-flip animations.
- CSS animations: `.pulse` (alarm dot breathing), `.spin-slow` (fan blades),
  `alarm-breathe` (red box-shadow on alarming tiles).

---

## 7. Project layout

```
src/
├── api/
│   ├── client.js          Axios instance, REALM config, JWT refresh interceptor
│   ├── auth.js            OAuth2 password grant + JWT decode for user info
│   ├── assets.js          /asset/* endpoints
│   ├── alarms.js          /alarm endpoints
│   ├── datapoints.js      /asset/datapoint endpoints
│   ├── rules.js           /rules endpoints
│   └── ...                notifications, users, dashboard (minimal)
│
├── components/
│   ├── layout/
│   │   ├── DashboardLayout.jsx    Outer shell + scroll restoration
│   │   ├── Sidebar.jsx            Left rail nav (7 items)
│   │   └── Header.jsx             Search + theme + notifications + user menu
│   ├── tiles/
│   │   ├── AssetGlyph.jsx         Dynamic Lucide icon by customAssetType
│   │   ├── AssetTile.jsx          HA-style tile card for a single device
│   │   └── GatewayCard.jsx        Rich site card with live readings
│   └── ui/                        Button, Modal, LoadingSpinner, EmptyState, ...
│
├── hooks/
│   └── useAssets.js       All React Query hooks — useAssets, useAsset,
│                          useAlarms, useRules, useAssetDatapoints,
│                          useWriteAttribute (with optimistic updates),
│                          useGateways, useGatewayChildren
│
├── pages/                 One file per route
│
├── store/
│   ├── authStore.js       user, token, isAuthenticated, login/logout
│   └── appStore.js        theme, density, sidebar state
│
└── utils/
    ├── assetIcons.js      DEVICE_TYPES, CONTROLLABLE_TYPES,
    │                      PRIMARY_ATTR_OVERRIDE, getPrimaryControlAttr,
    │                      nextToggleValue, isAssetActive, isAssetAlarming,
    │                      getStateLabel, getAssetIcon (+ labels)
    ├── gateways.js        isGatewayAsset, pickGateways, pickAllDevices,
    │                      pickGatewayChildren (path-aware),
    │                      isDescendantOfGateway, findGatewayForAsset,
    │                      groupByCustomType, summariseGateway
    ├── helpers.js         formatDate, formatRelativeTime, getTimeRanges,
    │                      getAlarmSeverityColor, truncate
    └── csv.js             toCsv, downloadCsv (RFC 4180, UTF-8 BOM)
```

---

## 8. State & data flow

### 8.1. Fetching

Three endpoints cover most of the app, and **every view derives from these
three** without extra per-widget calls:

1. `POST /asset/query` — hydrates `useAssets({})` (the global asset cache).
2. `GET /alarm` — `useAlarms({ status: 'OPEN' })` and `useAlarms({})`.
3. `GET /rules` — `useRules()`.

Per-asset datapoints (`/asset/datapoint/...`) are fetched lazily only when a
user opens the History tab on a specific asset.

### 8.2. Query keys

- `['assets', query]` — asset list (usually `query={}`)
- `['asset', id]` — single asset
- `['alarms', params]` — alarm list
- `['rules']` — rules list
- `['datapoints', assetId, attributeName, timeRange]` — chart data

### 8.3. Invalidation

`useWriteAttribute` uses `onSettled` to invalidate both `['asset', id]` and
`['assets']` so the optimistic patch reconciles with server state. Other
mutations (alarm status, rule CRUD) use plain `onSuccess` invalidation.

### 8.4. 403 resilience (`src/api/client.js` + hooks)

The response interceptor tags 403 errors with `error.isForbidden = true`. The
hooks then degrade gracefully:

- `useAssets` tries `POST /asset/query` first. On 403 it falls back to
  `GET /asset/user/current`, normalises the response (accepting either full
  assets or id lists), and re-queries by id. Result: restricted users see
  only their linked assets without a blank screen.
- `useAlarms` / `useRules` return `[]` on 403 instead of throwing. The
  matching pages show empty state, nothing crashes.
- `useWriteAttribute` surfaces 403 as a clear toast: "You do not have
  permission to control this device."

See §14 Troubleshooting for how to fix 403 at the role-assignment level.

### 8.5. Auth (`src/api/auth.js` + `src/store/authStore.js`)

- **Login:** `POST /auth/realms/{realm}/protocol/openid-connect/token` with
  grant_type=password, `client_id: 'openremote'`. Stores access + refresh
  tokens in localStorage.
- **User info:** we **don't** call `/userinfo`. It 403s on some Keycloak
  configurations. Instead `getUserInfo()` decodes the JWT payload locally
  (`preferred_username`, `email`, `name`, `sub`, `realm_access`). Network
  fallback exists in case decoding fails.
- **Refresh:** Axios response interceptor catches 401, refreshes with the
  refresh token, retries the original request. On refresh failure, clears
  tokens and redirects to `/login`.
- **Logout:** clears localStorage, navigates to `/login`.

### 8.6. Scroll restoration (`DashboardLayout.jsx`)

`useScrollRestoration()` maintains a `Map<pathname, scrollY>` across route
changes:

- On **unmount** of a route, save current `window.scrollY`.
- On **POP** navigation (browser back/forward, sidebar click to same route),
  restore the saved position via `useLayoutEffect` — before paint, no flicker.
- On **PUSH** navigation (new page), scroll to top.

Works with both the app's internal links and the browser Back button.

### 8.7. Back navigation (`AssetPage.jsx`)

The asset detail page's "Back to …" link doesn't rely on `parentId` (which
may point to a group rather than a gateway). It uses
`findGatewayForAsset(asset, gateways)` to walk the full `path` and resolve
the owning site. The button label also reflects the site name dynamically
("Back to Head Office").

---

## 9. Dashboard (`OverviewPage.jsx`)

Every widget on `/` is computed from the three cached queries. **No extra
API calls.**

| Widget | Derivation |
|---|---|
| Greeting | `new Date()` + `user.name` — updates every 30s |
| **KPIs** (Sites / Online / Alarms / Active) | Counts from assets + alarms |
| **Live readings strip** | Aggregates: `power` = sum of `PlugAsset.power`; `temp` = min/avg/max of `HeatSensor.temperature`; doors unlocked = count of DoorLocks where `!isAssetActive`; rules active/total = `rules.filter(r => r.enabled).length` |
| **Alarm pipeline** | Count by status (OPEN / ACKNOWLEDGED / IN_PROGRESS / RESOLVED / CLOSED) + severity pills |
| **Device-mix donut** | Top 6 `customAssetType` values plus "Other" |
| **7-day alarm bars** | Count per day from `allAlarms.createdOn` |
| **Currently on** | Controllable devices where `isAssetActive` (Light / Plug / Fan only) |
| **Triggered sensors** | Sensors (non-controllable, non-Camera/Panel) where `isAssetActive` or `isAssetAlarming` |
| **Recent alarms** | Top 5 with OPEN status |
| **Reports** | Client-side CSV export of alarm history + device status |
| **Sites strip** | Up to 6 mini site cards linking to `/g/:id` |

All charts use Recharts. Tooltip styling pulled from theme tokens so they
match both light and dark mode.

---

## 10. Sites page (`/sites`)

- **Hero banner** — dual-radial gradient over a subtle grid pattern, showing
  the property count and three right-aligned stats.
- **Quick actions** — bulk writes to `onOff`:
  - "All lights off" → every `LightAsset` → `onOff=false`
  - "Lock all doors" → every `DoorLockAsset` → `onOff=true`
  - "Arm all alarms" → every `AlarmAsset` → `onOff=true`
- **Orphan banner** — appears when device-typed assets exist but none of
  their `parentId` or `path` entries is a known gateway. Tells the user to
  link them in the backend.
- **Search + grid/list toggle** — shown when more than 3 sites.
- **GatewayCard** — rich tile with mood-tinted gradient (ok/warning/alarm),
  animated health bar, 4-up live readings (Power, Temp, Doors, Alarms), and
  a "Live N" pulsing pill when any devices are active.

---

## 11. Gateway page (`/g/:id`)

Grouped tile grid, ordered by safety-first semantics:

```js
AlarmAsset → SOSAsset → SmokeSensorAsset →
CameraAsset →
DoorLockAsset → DoorSensorAsset →
MotionSensorAsset → HumanPresenceSensorAsset →
HeatSensorAsset → VibrationSensorAsset →
LightAsset → PlugAsset → FanAsset → PanelAsset
```

Section headers use `<AssetGlyph>` + friendly label. Each section renders
`AssetTile`s in a 1/2/3/4-col responsive grid.

---

## 12. Asset detail (`/a/:id`)

Large hero with:
- 128px circular **clickable** icon (for controllable types) with radial glow
  matching state. Tap → `useWriteAttribute` via §5 logic.
- Huge state label with color tied to state.
- "Tap the icon to turn on/off" hint for controllable types.
- Static "Live" chip with pulsing dot for read-only sensors.

**Tabs** (rendered as chips with an underline for the active one):

- **State** — every attribute as a tile; the "primary reading" (temperature
  for HeatSensor, power for Plug, brightness for Light, …) renders as a
  **3xl accent-colored number** and the rest as plain tiles.
- **Controls** — two groups: **Switches** (booleans) and **Values**
  (numbers with range sliders + Save button). Writes immediately on switch
  toggle; deferred-save model for sliders to avoid spamming the API as the
  user drags.
- **History** — see §13.
- **Alarms** — alarms filtered to this asset's id.

### 12.1. Active state rendering

Mood (`on` / `off` / `alarm`) drives:
- Hero icon background — cyan glow / grey / red radial.
- Icon variant (lightbulb vs lightbulb-off, lock vs lock-open, fan spins
  when on, alarm icons pulse when alarming).
- State label color (`--color-accent-400` / `--color-ink-2` / `--color-danger-400`).

---

## 13. History tab — chart logic

Non-trivial. Two bugs fixed along the way, both documented here:

### 13.1. Time range memoisation (bug fix #1)

`getTimeRanges()` in `utils/helpers.js` calls `Date.now()` internally. If
you pass its result directly into a React Query `queryKey`, the timestamps
change every render — the key mutates, React Query refetches, component
re-renders, key mutates again, **infinite loop**.

**Fix:** memoise by the selected range string.

```js
const [range, setRange] = useState('24h');
const timeRange = useMemo(() => getTimeRanges()[range], [range]);
const { data } = useAssetDatapoints(asset.id, attr, timeRange);
```

### 13.2. Attribute-type filtering (bug fix #2)

A `LightAsset` only has `onOff` (boolean). If you filter by
`typeof value === 'number'`, the History tab shows "No chartable data" —
booleans are absolutely chartable.

The current filter accepts any attribute whose declared `type` is
number-ish OR `boolean`, plus a value-type fallback for servers that don't
populate `type`:

```js
const CHARTABLE_TYPES = new Set([
  'number', 'integer', 'positiveInteger', 'negativeInteger',
  'positiveNumber', 'negativeNumber', 'long', 'double', 'float',
  'boolean',
]);
```

### 13.3. Boolean rendering

When the selected attribute is boolean:
- Each datapoint's value is normalised to `0 / 1`.
- Chart uses `type="stepAfter"` (square-step line) — correct for binary
  state over time, matches HA's history.
- Y-axis locked to `[0, 1]` with ticks `Off` / `On` (not `0` / `1`).
- Tooltip formatter shows `Off` / `On`.

### 13.4. Response shape tolerance

The backend can return datapoints either as `[[ts, v], …]` tuples or
`[{x, y}, …]` objects — `HistoryTab.series` handles both. Non-finite
values are filtered out so a bad point doesn't break the chart.

---

## 14. Map page (`/map`)

- **Theme-aware tiles** — Carto dark tiles in dark mode, OSM in light mode.
- **`FitBoundsOnce`** — auto-fits to all markers on first render; **doesn't**
  re-fit after that so user panning isn't yanked back.
- **Gateway selection** (sidebar or marker) stores a fresh object
  `setSelection({ id, pos })` on every click. **Identity changes every time**
  — so clicking the same site twice re-fires `FocusSelected`'s effect and
  re-centres the map (after the user panned away).
- **`FocusSelected`** calls `map.flyTo(pos, zoom, { duration: 0.8 })` and
  opens the marker's popup 350 ms later (after the fly animation).
- Marker refs are stored in a `useRef(new Map())` keyed by asset id so
  `FocusSelected` can call `openPopup()` on the right one.

---

## 15. Header search (`Header.jsx`)

Full in-app search with live dropdown:

- Input on the **right side** of the header (expands on focus,
  `w-72 → w-96`).
- Results grouped into **Sites** (top 5) and **Devices** (top 8). Click a
  result → navigates to `/g/:id` or `/a/:id`, clears the search.
- **Keyboard shortcuts:** `/` focuses search (unless another input is
  focused), `Esc` closes all header dropdowns.
- Click-outside dismisses. Opening search closes notifications + user menu
  (only one dropdown open at a time).
- Uses the cached `useAssets({})` result — zero extra network calls.

---

## 16. Reports & exports

### 16.1. Dashboard → Reports section

Two CSV downloads, both client-side from already-cached data:

- **Alarm history** — id, title, description, severity, status, asset id,
  source, created, last-modified.
- **Device status** — id, name, customAssetType, parentId, connected,
  current state label.

### 16.2. CSV helper (`src/utils/csv.js`)

- `toCsv(rows, columns)` — RFC 4180 escaping (quotes, commas, newlines).
- `downloadCsv(filename, rows, columns)` — builds the CSV, prepends a UTF-8
  BOM (so Excel handles Unicode), triggers a blob download. Revokes the
  object URL afterwards.

---

## 17. Env configuration

`.env` is loaded at **build time** by Vite. New names are preferred, legacy
names are still honoured:

```env
# Preferred
VITE_SMS_IOT_URL=https://go.smsiotpk.com
VITE_SMS_IOT_REALM=sms-iot

# Legacy (still recognised via fallback in client.js / SettingsPage.jsx)
# VITE_OPENREMOTE_URL=...
# VITE_OPENREMOTE_REALM=...
```

Read via:

```js
import.meta.env.VITE_SMS_IOT_URL ||
import.meta.env.VITE_OPENREMOTE_URL ||
''
```

**Nothing calls the URL directly** — the browser always uses relative `/api/*`
and `/auth/*` paths. The URL is surfaced in the Settings page for visibility
only.

---

## 18. Proxy setup (dev + prod)

Both environments proxy `/api/*` and `/auth/*` to the backend so the browser
stays same-origin.

- **Dev** — `vite.config.js` declares the proxy for `localhost:3000`.
- **Prod** — `nginx.conf` (inside the Docker image) proxies to
  `SMS_IOT_BACKEND_URL` at runtime. Legacy `OPENREMOTE_BACKEND_URL` is noted
  in a comment for migrating deployments.

**This is why you'll see `localhost:3000` in DevTools Network tab in dev** —
the request actually terminates at the backend via Vite's server-side proxy.
See the Troubleshooting section for why.

---

## 19. Deployment (Docker)

Multi-stage build. Build-time args bake the env vars into the bundle:

```bash
docker build \
  --build-arg VITE_SMS_IOT_URL=https://go.smsiotpk.com \
  --build-arg VITE_SMS_IOT_REALM=sms-iot \
  -t sms-iot-dashboard .

docker run -p 8080:80 \
  -e SMS_IOT_BACKEND_URL=https://go.smsiotpk.com \
  sms-iot-dashboard
```

Both `VITE_SMS_IOT_*` and `VITE_OPENREMOTE_*` ARGs are accepted by the
Dockerfile for compatibility with existing build pipelines.

---

## 20. Troubleshooting

### 20.1. "All API calls return 403"

Role issue, not a code bug. The logged-in user lacks Keycloak client-roles
for the endpoints the app hits.

| Endpoint | Required role |
|---|---|
| `POST /asset/query` | `read:assets` |
| `PUT  /asset/*/attribute/*` | `write:assets` |
| `GET /alarm`, `PUT /alarm` | `read:alarms`, `write:alarms` |
| `GET /rules`, `POST /rules` | `read:rules`, `write:rules` |
| `GET /asset/user/current` | any authenticated user |

Fix in the SMS IoT manager UI → Users → *user* → Roles. Assign at minimum
`read:assets` + `write:assets` + `read:alarms` + `write:alarms`. For
per-user isolation add `restricted-user` and create explicit user-asset
links.

### 20.2. "Login shows an error and won't get me in"

Usually a 403 on `/userinfo`, not the token grant itself. We work around
this by decoding the JWT locally for user info — but if you still see it,
check the Keycloak client config: the `openremote` client must have
`profile` and `email` scopes.

### 20.3. "History tab spins forever"

Was caused by unstable `queryKey` from `getTimeRanges()` re-running
`Date.now()` every render. Already fixed via `useMemo`. If it regresses,
check `HistoryTab.timeRange` is memoised on the selected `range` string.

### 20.4. "Map won't focus on the same site when clicked twice"

Was caused by memoised selection with a stable id. Already fixed by
creating a fresh object literal on every click (new identity re-fires the
effect). If it regresses, check `selectGateway` in `MapPage.jsx` uses
`setSelection({ id, pos })` with a new object reference each time.

### 20.5. "Icon tap seems laggy"

Check `useWriteAttribute`'s `onMutate` optimistic update is still in place.
That's what makes the flip instant.

### 20.6. "Compact view doesn't change anything"

Confirm `<html>` has `data-density="compact"` attribute after toggling.
`appStore.setDensity` writes this plus `localStorage.sms_density`. The CSS
overrides live in the `@layer components` block of `src/index.css`.

### 20.7. "CORS errors in console"

You're bypassing the Vite/nginx proxy by hardcoding the full URL somewhere.
All API calls must use **relative** paths (`/api/...`, `/auth/...`).

---

## 21. Conventions (respect these when making changes)

- **One source of truth for device icons** — any new component that shows an
  asset icon imports `<AssetGlyph customType={...} />`. Never import Lucide
  icons directly for asset-type rendering.
- **Don't reintroduce per-concern pages.** Devices / History / Monitoring /
  Controls are all tabs inside `/a/:id`, not standalone routes.
- **Use theme variables**, not Tailwind's default palette. Cards/tiles/panels
  have pre-made classes (`.panel`, `.tile`, `.ha-tile`).
- **Control writes go through `useWriteAttribute`** — never call
  `writeAttributeValue` directly. Lose the optimistic updates and error
  toast consistency.
- **Read device state via `isAssetActive(asset, customType)`**, never via
  a specific attribute directly. Keeps the per-type interpretation
  consistent everywhere.
- **Read the primary attribute name via `getPrimaryControlAttr`** — hides
  the `onOff` vs `Fan` vs legacy-fallback decision tree.
- **Stable query keys** — if you pass a derived object to a `queryKey`,
  memoise it. Otherwise React Query refetches forever.
- **Per-type attribute overrides** go in `PRIMARY_ATTR_OVERRIDE` — one
  line, no branching elsewhere.

---

## 22. License

Proprietary — SMS Service (PK).
