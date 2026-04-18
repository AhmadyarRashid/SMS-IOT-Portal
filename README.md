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

10 authenticated routes plus the login route. Every legacy route redirects to
one of these.

| Route | Page | Purpose |
|---|---|---|
| `/` | `OverviewPage` | **Dashboard.** KPIs, live readings strip, alarm pipeline + 7-day bars, device mix donut, recent activity, reports, sites strip |
| `/sites` | `SitesPage` | **Minimal sites gallery.** One-line summary header, tactile tilt-cards, floating Quick Actions pill, ambient drifting blobs |
| `/g/:gatewayId` | `GatewayPage` | Devices at one site — **horizontal chip filter** (All · Needs attention · per-type) + inline search, flat grid |
| `/a/:assetId` | `AssetPage` | Device detail — drifting mood halo hero, inline primary controls (brightness/speed), pill tabs (State / Controls / History / Alarms) |
| `/quick` | `QuickAccessPage` | **iPhone-widget control centre** — pinned controllable devices, drag to reorder, small/large size variants, per-browser IndexedDB layout |
| `/live` | `LivePage` | **Live activity feed** — two sections (This session · Alarms), pulsing live indicator, session timer |
| `/alarms` | `AlarmsPage` | Cross-site alarm inbox with filtering, one-click Ack/Resolve, pending-state buttons |
| `/map` | `MapPage` | Site pins on a themed tile map (Carto dark / OSM light); sidebar or marker click flies to site |
| `/tutorial` | `TutorialPage` | **Illustrated gallery** of 10 SVG-animated walkthrough cards with click-to-expand detail and progress ring |
| `/settings` | `SettingsPage` | Hero profile · Appearance · Notifications (real browser alerts) · Connection status · Install as app · Data & privacy · About |
| `/login` | `LoginPage` | OAuth2 password-grant login |

**Global command palette (⌘K / Ctrl+K)** — launched from any authenticated
route, fuzzy searches sites, devices, pages, and actions (bulk lock / arm /
lights-off, theme toggle, per-device toggle). See §15.

Legacy redirects in `App.jsx`: `/monitoring`, `/devices`, `/devices/:id`,
`/history`, `/controls`, `/rules` → unified views. `/activity` → `/live`
(the feed was renamed in v1.0 to reflect its ephemeral session-scoped nature).
`/automations` was removed — rule management is no longer exposed in the
client portal.

**Navigation highlighting (`Sidebar.jsx`):** the **Sites** sidebar item is
active for `/sites`, `/g/:id`, and `/a/:id` — so drilling into a site keeps
that item highlighted. The **Alarms** entry has a pulsing red badge driven
by `useAlarms({status:'OPEN'}).length`.

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
│   ├── alarms.js          /alarm endpoints (PUT uses /alarm/{id} + minimal body)
│   ├── datapoints.js      /asset/datapoint endpoints
│   ├── rules.js           /rules endpoints (kept, not surfaced in UI)
│   └── ...                notifications, users, dashboard, map (minimal)
│
├── components/
│   ├── commandpalette/
│   │   ├── CommandPalette.jsx    ⌘K launcher — pages/sites/devices/actions
│   │   └── command-palette.css
│   ├── layout/
│   │   ├── DashboardLayout.jsx   Shell, scroll restoration, live events, PWA listener,
│   │   │                         command palette, install prompt mount points
│   │   ├── Sidebar.jsx           Left rail nav (9 items) + pulsing alarm badge
│   │   └── Header.jsx            Search + theme + notifications + user menu
│   ├── pwa/
│   │   └── InstallPrompt.jsx     Floating "Install SMS IoT" toast (beforeinstallprompt)
│   ├── tiles/
│   │   ├── AssetGlyph.jsx        Dynamic Lucide icon by customAssetType
│   │   ├── AssetTile.jsx         HA-style tile card for a single device
│   │   ├── GatewayCard.jsx       Tilt-reactive site card with drifting halo
│   │   └── gateway-card.css
│   └── ui/                       Button, Modal, LoadingSpinner, EmptyState,
│                                 Tip (dismissible inline), Skeleton (.Box/.Card/.Grid/.Hero)
│
├── hooks/
│   ├── useAssets.js             React Query hooks — useAssets, useAsset, useAlarms,
│   │                            useRules, useAssetDatapoints, useWriteAttribute
│   │                            (optimistic), useGateways, useGatewayChildren.
│   │                            BOTH useAssets and useAlarms poll every 15s with
│   │                            refetchIntervalInBackground: true.
│   ├── useLiveEvents.js         Mounted once in DashboardLayout — alarm watcher
│   │                            (toast + OS notification), asset diff watcher,
│   │                            best-effort WebSocket to /websocket/events
│   └── useAlarmNotifications.js useAlarmNotifications() hook + fireAlarmNotification
│                                helper + buildAlarmNotificationPayload formatter
│
├── pages/                        One file per route + per-page CSS modules
│                                 (sites.css, gateway/asset-detail.css, quick-access.css,
│                                  live.css, tutorial.css, settings.css,
│                                  tutorial-illustrations.jsx = inline SVG scenes)
│
├── store/
│   ├── authStore.js              user, token, isAuthenticated, login/logout
│   ├── appStore.js               theme, density, sidebar state
│   ├── activityStore.js          Zustand ring buffer (200 events) +
│   │                             SESSION_START const for the /live page
│   └── pwaStore.js               Global beforeinstallprompt capture + install()
│
└── utils/
    ├── assetIcons.js     DEVICE_TYPES, CONTROLLABLE_TYPES,
    │                     PRIMARY_ATTR_OVERRIDE, getPrimaryControlAttr,
    │                     nextToggleValue, isAssetActive, isAssetAlarming,
    │                     getStateLabel, getAssetIcon (+ labels)
    ├── gateways.js       isGatewayAsset, pickGateways, pickAllDevices,
    │                     pickGatewayChildren (path-aware),
    │                     isDescendantOfGateway, findGatewayForAsset,
    │                     groupByCustomType, summariseGateway
    ├── prefs.js          IndexedDB-backed preferences via idb-keyval —
    │                     tips dismissal, tutorial progress, quick-access layout,
    │                     plus clearAllPrefs() and a localStorage fallback.
    ├── helpers.js        formatDate, formatRelativeTime, getTimeRanges,
    │                     getAlarmSeverityColor, truncate
    └── csv.js            toCsv, downloadCsv (RFC 4180, UTF-8 BOM)

public/
├── favicon.svg           Cyan shield-check (matches sidebar logo)
├── manifest.webmanifest  PWA manifest — name, theme_color, icon
└── sw.js                 Service worker — app shell cache + rich notifications
                          (click-to-focus, action buttons). Registered in
                          both dev and prod from main.jsx.
```

---

## 8. State & data flow

### 8.1. Fetching

Two endpoints cover most of the app, and **every view derives from these
two** without extra per-widget calls:

1. `POST /asset/query` — hydrates `useAssets({})` (the global asset cache).
2. `GET /alarm` — `useAlarms({ status: 'OPEN' })` and `useAlarms({})`.

`useRules()` also exists but is no longer surfaced in the UI. Per-asset
datapoints (`/asset/datapoint/...`) are fetched lazily only when a user opens
the History tab on a specific asset.

### 8.1.1. Live-refresh polling (critical)

**Both `useAssets` and `useAlarms` poll every 15 seconds with
`refetchIntervalInBackground: true`.** This is the foundation that makes the
Live feed, sidebar alarm badge, command palette, and OS notifications work
when the tab isn't focused. Without `refetchIntervalInBackground`, React
Query pauses polling on hidden tabs and the portal would miss every
externally-created alarm.

The optional WebSocket in `src/hooks/useLiveEvents.js` is a best-effort
latency improvement (sub-second event delivery when connected) that falls
back silently to the 15s poll on deployments where the socket is unavailable.

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

See §23 Troubleshooting for how to fix 403 at the role-assignment level.

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

Every widget on `/` is computed from the two cached queries (`useAssets` +
`useAlarms`) plus the in-memory activity store. **No extra API calls.**

| Widget | Derivation |
|---|---|
| Greeting | `new Date()` + `user.name` — updates every 30s |
| **KPIs** (Sites / Online / Alarms / Active) | Counts from assets + alarms |
| **Live readings strip** (3 tiles) | `power` = sum of `PlugAsset.power`; `temp` = min/avg/max of `HeatSensor.temperature`; doors unlocked = count of DoorLocks where `!isAssetActive` |
| **Alarm pipeline** | Count by status (OPEN / ACKNOWLEDGED / IN_PROGRESS / RESOLVED / CLOSED) + severity pills |
| **Device-mix donut** | Top 6 `customAssetType` values plus "Other" |
| **7-day alarm bars** | Count per day from `allAlarms.createdOn` |
| **Currently on** | Controllable devices where `isAssetActive` (Light / Plug / Fan only) |
| **Triggered sensors** | Sensors (non-controllable, non-Camera/Panel) where `isAssetActive` or `isAssetAlarming` |
| **Recent alarms** | Top 5 with OPEN status |
| **Recent activity** | Last 5 entries from the in-memory activity store, with "See all" → `/live` |
| **Reports** | Client-side CSV export of alarm history + device status |
| **Sites strip** | Up to 6 mini site cards linking to `/g/:id` |

The Automations widget was removed — rule management lives on the backend
only. All charts use Recharts with `minWidth={0} minHeight={0} debounce={50}`
to silence the `-1` measurement warning during route transitions. Tooltip
styling is pulled from theme tokens so it matches both light and dark mode.

---

## 10. Sites page (`/sites`)

**Minimal-plus-delight** — the philosophy is to cut page chrome and let the
cards be the primary UX.

- **Minimal header** — one-line summary (`3 sites · 18/20 online · All
  quiet` or `… · 2 alarms active` in red). No hero banner, no stat pills.
- **Floating Quick Actions pill** (bottom-right, cyan gradient, pulsing
  ring). Click to fan out the three bulk writes:
  - "All lights off" → every `LightAsset` → `onOff=false`
  - "Lock all doors" → every `DoorLockAsset` → `onOff=true`
  - "Arm all alarms" → every `AlarmAsset` → `onOff=true`
- **Ambient drifting gradient blobs** — two oversized blurred cyan/navy
  blobs drifting behind the content over 42s and 54s cycles. Disabled under
  `prefers-reduced-motion`.
- **Inline expanding search** — small magnifier icon that expands to a
  260px input when clicked. Only rendered when there are >3 sites.
- **Orphan notice** — collapsed to a small inline amber chip when any
  device-typed asset is not linked to a known gateway.
- **GatewayCard redesign** — `src/components/tiles/GatewayCard.jsx` +
  `gateway-card.css`:
  - **Mouse-follow 3D tilt** (~8° via `useMotionValue` + `useSpring`)
  - **Shine sweep** following the cursor (radial gradient, screen blend)
  - **Drifting mood halo** keyed to site health (ok/warning/alarm)
  - **Count-up health percentage** via `requestAnimationFrame`
  - **Shimmering health bar** with alarm-mode brightness pulse
  - 4-up live readings (Power, Temp, Doors, Alarms); hover tint to mood colour
  - Whole card tap-springs to 0.985 then releases
- **Playful empty state** — animated radar display (3 concentric rings + a
  conic-gradient sweep) for "No sites yet" / "No matches".

---

## 11. Gateway page (`/g/:id`)

**Chip filter + flat grid** — the old 14-section stacked layout was
replaced with a horizontal chip filter and a single uniform grid.

- **Minimal header** — icon badge + site name + one-line summary
  (`Connected · 18/20 online · 2 alarms`).
- **Horizontal chip row** (scrollable, overflow-x-auto):
  - `All (N)` — shows every device, sorted by the safety-first order below.
  - `Needs attention (N)` — red chip, appears only when any child is
    alarming or disconnected. Uses `isAssetAlarming` + `attributes.connected`.
  - One chip per present `customAssetType`, in safety-first order with a
    count pill and the type's `<AssetGlyph>`.
- **Inline expanding search** — magnifier → 220px input; filters the
  active chip's pool. Only rendered when there are >6 devices.
- **Reflow animations** — `LayoutGroup` + `AnimatePresence popLayout`
  on the grid so switching chips or typing in search smoothly animates
  tiles in/out rather than a flash reset.
- **Safety-first sort order** (used for the "All" chip and per-type chips):

```js
AlarmAsset → SOSAsset → SmokeSensorAsset →
CameraAsset →
DoorLockAsset → DoorSensorAsset →
MotionSensorAsset → HumanPresenceSensorAsset →
HeatSensorAsset → VibrationSensorAsset →
LightAsset → PlugAsset → FanAsset → PanelAsset
```

`AssetTile` itself is unchanged — same icon-tap toggle, same detail
navigation, same optimistic updates.

---

## 12. Asset detail (`/a/:id`)

Hero-as-control-panel with pill tabs below.

**Hero** (`src/pages/asset-detail.css`):
- **Drifting mood halo** — cyan/red radial gradient that slowly translates
  over 20s. Alarming assets get a 2.6s breathing pulse instead.
- **Info strip** at the top: type label (cyan caps) · live connection dot
  · relative "Updated 2 min ago" · site-name link back to the gateway.
- **128px clickable icon** for controllable types (Light / Plug / Fan / Lock
  / Alarm) with radial glow matching state. Tap → `useWriteAttribute` via §5.
- **Animated state label** — fade-up re-animates on every value change.
- **Mood border + outer shadow** keyed to state (cyan on, red alarm, neutral off).
- **Inline rename** — a pencil icon next to the name flips the h1 into an
  editable input. Enter saves, Esc cancels. Writes to the standard OR
  `notes` attribute via `useWriteAttribute` (needs only attribute-write
  permission, not full asset-write) so the change syncs across every
  browser the user signs in from. `getAssetDisplayName(asset)` prefers
  `notes` over `asset.name` everywhere in the UI. See §24 for the
  `NOTES_USED_FOR_DATA` blocklist — HumanPresenceSensor et al. reuse
  `notes` for structured data and have the rename UI hidden.

**Primary control panel** (new, between hero and tabs):
- For `LightAsset` with `brightness`/`level` attribute → inline **slider**.
- For `FanAsset` with `speed` attribute → inline **slider**.
- Uses a **draft/commit** pattern (no `setState` in effect): value updates
  live while dragging, write fires on `mouseUp` / `touchEnd` / `blur` / `keyUp`.
- Other device types → panel returns `null`. Controls tab still has full
  access to every writable attribute.

**Pill tabs** — replaces the old underline tabs. Rounded container with
four icon+text pills; active pill gets cyan-tinted background + inset accent
border. No `mode="wait"` on the inner AnimatePresence (avoids hung tab
transitions).

- **State** — **feature tile** promotes the primary reading (44px tabular
  number, unit, 4px accent rail, "live dot + relative time" footer). Other
  attributes render in a compact 2/3/4-col grid of small tiles with hover tint.
- **Controls** — unchanged. Two groups: Switches (booleans) write
  immediately, Values (numbers) with range sliders + explicit Save button.
- **History** — see §13.
- **Alarms** — alarms filtered to this asset's id.

### 12.1. Active state rendering

Mood (`on` / `off` / `alarm`) drives:
- Hero icon background — cyan glow / grey / red radial.
- Icon variant (lightbulb vs lightbulb-off, lock vs lock-open, fan spins
  when on, alarm icons pulse when alarming).
- State label color (`--color-accent-400` / `--color-ink-2` / `--color-danger-400`).
- Hero border colour + shadow + halo intensity.

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

## 14.1. Quick access (`/quick`)

iPhone-style widget grid for any pinned devices — controllable or read-only.

- Built on **dnd-kit** (`@dnd-kit/core` + `sortable` + `utilities`) — React
  19-native, no `findDOMNode`.
- **Two widget sizes**: small (1 grid cell, square aspect) and large
  (2 cells wide, 2:1 aspect). Toggle per-tile via a chrome button in edit mode.
- **Edit mode** — pencil/check toggle in the hero. While editing, tiles
  *jiggle* (two alternating CSS keyframes), are draggable, show maximize +
  delete chrome buttons. Icon toggle is disabled during edit to prevent
  accidental taps.
- **DragOverlay** provides a silky floating ghost: rotated 1.5°, scaled
  1.03, cyan drop-shadow. Original slot fades to opacity:0 while dragging.
- **Layout persistence** — `{id, size}[]` array stored in IndexedDB via
  `idb-keyval` (`src/utils/prefs.js`). Schema migrations in `prefs.js#getQuickLayout`
  handle older shapes (`string[]` → `{id, size}[]` and an intermediate
  `{i, x, y, w, h}[]` from a short-lived RGL experiment).
- **Device picker** — slide-over panel grouped by site with search; shows
  every recognised device (sensors + cameras included), with pin/unpin
  state per device. Tapping a pinned sensor's tile opens its detail page
  instead of toggling (matches `AssetTile` behaviour).
- Auto-compacts from top-left (no floating empties) — same mental model
  as iPhone widgets.

## 14.2. Live feed (`/live`)

Real-time event feed with a session timer. Mounted behind the sidebar
**Activity / Live** entry (Activity icon). `/activity` redirects here.

Two sections, visually distinct:

1. **This session** — cyan "Live" pill badge. Shows device state changes
   since the app was opened. Wipes on reload — purely ephemeral and
   per-browser by design; cross-device history would require a backend
   audit log (not available in the current SMS IoT backend). Empty state:
   *"Nothing yet — still watching."*
2. **Alarms** — neutral "Synced" pill. Server-persistent via `GET /alarm`,
   identical across every browser. Empty state: *"All clear."*

Data flow:
- `useLiveEvents` seeds the activity store from the alarm list on mount.
- Diff watchers detect (a) new alarms and (b) attribute value changes on
  known boolean/number attributes. Events push into `activityStore`.
- `useWriteAttribute`'s optimistic cache update is enough to emit an event
  when the user toggles a device — no need to wait for the server roundtrip.
- External changes surface within 15 seconds via the `refetchInterval` poll.

Session start timestamp is captured once (module-level `SESSION_START`)
and used by the hero for *"Watching since 12 min ago · 42 events this
session"*. Ticker refreshes every 60s.

`clearSession()` on the store drops non-alarm events only — alarms survive
because re-seeding them depends on `seededRef` which would not re-fire.

## 14.3. Tutorial (`/tutorial`)

Ten-card illustrated gallery with click-to-expand details.

- `src/pages/tutorial-illustrations.jsx` — ten custom inline SVG scenes
  (overview, sites, devices, quick, live, history, alarms, map, command,
  settings) with pure-CSS animations: pulsing dots, radar rings, drawing
  paths, keycap-press, heartbeat lines, etc.
- `src/pages/tutorial.css` — shared theme tokens (`--tut-accent`, `--tut-ink`,
  …) plus all keyframes. Every animation respects `prefers-reduced-motion`.
- **Card default state**: big SVG + 3-word title + one tagline + "ⓘ" hint.
  Minimal chrome.
- **Click → expands inline**: reveals short description + "Try it" CTA
  (marks the step complete on click) + a "Got it" secondary button.
- **Completion** tracked in IndexedDB (`tutorial_progress`) via
  `markTutorialStep` / `getTutorialProgress` in `prefs.js`. Done cards get
  a green check pill and the illustration's accent colour shifts to green.
- **Progress ring** (64px, SVG, gradient stroke) in the hero.
- Footer has **Show tips again** (`resetTips`) and **Reset progress**
  (`resetTutorial`) controls.

## 14.4. Alarms inbox (`/alarms`)

Cross-site triage page with rich cards, chip filters, and one-tap Ack/Resolve.

- **Minimal hero** — "Alarms" title + pulsing live dot (red when any
  critical is open) + one-line summary (*3 open · 1 critical · 5 resolved
  today*). 7-day sparkline on the right with the today-bar highlighted.
- **Chip filter row** — Severity (`All · Critical · High · Medium · Low`)
  + a dashed-border divider + Status (`All · Open · Acknowledged ·
  Resolved`). Counts on every chip **cross-filter**: severity counts
  honour the current status/search, and status counts honour the current
  severity/search, so the sum of visible sub-counts always equals the
  `All` total.
- **Sort menu** — *Newest first · Oldest first · By severity*. Default is
  newest, status defaults to `Open` so the page is triage-focused on load.
- **Inline expanding search** — matches title, content, source, linked
  device name, and device type label.
- **Rich alarm cards**:
  - Severity-keyed left rail. Critical alarms get a 2.2s breathing pulse.
  - Severity icon badge + severity pill + status pill (color-coded).
  - Title + content.
  - 3-to-4 column info grid: **Site · Device · Location · When**.
    Site clicks through to `/g/:id`; Device to `/a/:id`; Location opens
    `/map?focus=<gatewayId>` in a new tab (see §14 Map).
  - Ack and Resolve buttons with live pending state (`…` while writing).
    Resolved cards fade to 72% opacity so live incidents stand out.
- **Linked-asset resolution** lives entirely client-side:
  `resolveAlarmAsset(alarm, assetMap)` reads the full asset objects OR
  now embeds on each alarm as `alarm.asset[]`. The old
  `GET /alarm/{id}/asset` endpoint is no longer called — SMS IoT's
  deployment doesn't mount it, and the per-alarm 404 spam was wasteful
  anyway. Defensive fallbacks for id-only fields (`assetId`, `sourceId`
  when `source=INTERNAL`, `assetIds[]`, etc.) remain for older/variant
  OR versions.
- **Ack/Resolve** via `useUpdateAlarmStatus` → `updateAlarm()` which
  PUTs `/alarm/{id}` with a **minimal** SentAlarm body (only core editable
  fields; server-managed timestamps and denormalised `sourceName`/
  `assetId` are stripped to avoid 500s on strict deserializers).
- **Animations** — `LayoutGroup` + `AnimatePresence popLayout`. Entry and
  layout transitions are **split** via Framer's `default` vs `layout`
  keys so reshuffles are zero-delay and don't fight CSS. Cards use
  `whileHover={{ y: -2 }}` (not CSS `transform`) to avoid transform
  interpolation conflicts during layout animations.
- **Playful empty state** — animated radar sweep for *"All clear"* /
  *"Nothing matches"*, same language as Sites/Live.

## 15. Command palette (⌘K / Ctrl+K)

Globally available from any authenticated page. Implemented in
`src/components/commandpalette/CommandPalette.jsx`, mounted once in
`DashboardLayout`.

- **Keybinding** — `Cmd+K` / `Ctrl+K` toggles. `Esc` closes. `↑ ↓ Enter`
  for keyboard navigation. All state resets (query, cursor) happen inside
  the event handler to avoid `set-state-in-effect` lint violations.
- **Four command kinds**, grouped and scored:
  - **Pages** — the 10 top-level routes.
  - **Sites** — every gateway in the asset cache.
  - **Devices** — every known device, opens its detail page.
  - **Actions** — "Toggle *device*" per controllable (optimistic via
    `useWriteAttribute`), "All lights off / Lock all / Arm all" bulk ops
    via `Promise.allSettled`, and "Switch to light/dark mode".
- **Fuzzy-ish scorer** — exact-prefix match on title scores 100+, substring
  60+, in-order character match 5. Sorted desc, top 30 shown.
- **Hover + keyboard** keep the cursor in sync — `onMouseEnter` sets the
  cursor index so you can mix pointer + keyboard without losing position.
- Footer hints: `↑↓ navigate · ↵ select · ⌘K toggle`.

## 16. Header search (`Header.jsx`)

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

## 17. Reports & exports

### 17.1. Dashboard → Reports section

Two CSV downloads, both client-side from already-cached data:

- **Alarm history** — id, title, description, severity, status, asset id,
  source, created, last-modified.
- **Device status** — id, name, customAssetType, parentId, connected,
  current state label.

### 17.2. CSV helper (`src/utils/csv.js`)

- `toCsv(rows, columns)` — RFC 4180 escaping (quotes, commas, newlines).
- `downloadCsv(filename, rows, columns)` — builds the CSV, prepends a UTF-8
  BOM (so Excel handles Unicode), triggers a blob download. Revokes the
  object URL afterwards.

---

## 18. Notifications

Native OS notifications for new alarms. Implemented in
`src/hooks/useAlarmNotifications.js`.

- **User preference** — `localStorage.sms_notify_alarms = 'true' | 'false'`,
  toggled from the Notifications section of `/settings` via
  `useAlarmNotifications().toggle(next)`. On enable, calls
  `Notification.requestPermission()` and fires a welcome notification.
- **Rich OS notification** via `registration.showNotification()` (service
  worker) when supported:
  - Severity emoji prefix in the title (🚨 CRITICAL / ⚠️ HIGH / ℹ️ LOW /
    🔔 default)
  - Site + alarm content concatenated in the body
  - Action buttons: **View alarm** (focuses portal tab + navigates to
    `/alarms`) / **Dismiss** (closes)
  - `requireInteraction: true` for CRITICAL — stays on screen until the
    user responds
- **Fallback** — plain `new Notification(...)` when the SW isn't
  controlling the page (older browsers, iOS).
- **Click handler** lives in `public/sw.js#notificationclick` — iterates
  `clients.matchAll`, focuses an existing portal tab (or opens a new one)
  via `client.focus()` + `client.navigate()`, falling back to
  `postMessage({ type: 'sms-iot-open', url })` on browsers without
  `navigate`. `main.jsx` listens for that message and routes the app.
- **Background polling** — `useAlarms` + `useAssets` both use
  `refetchIntervalInBackground: true` so the tab detects new alarms
  within ~15 s even when minimised. Without this, `fireAlarmNotification`
  would never be called for a backgrounded tab. This is load-bearing —
  see §24 Conventions.
- **Seed-once guard** — the alarm watcher in `useLiveEvents` gates on
  React Query's `isSuccess` so it doesn't misfire a toast-storm the
  first render (when the placeholder `data: []` makes existing alarms
  look "new").
- **Visibility guard** — `fireAlarmNotification` is a no-op when
  `document.visibilityState === 'visible'` so the in-app toast wins when
  the user is already looking at the tab. Set `ignoreVisibility: true`
  to bypass (used by the Settings "Send test" button).
- **Dev-mode logs** — `console.debug('[notify]', …)` for each decision
  step so unexpected silences are traceable in DevTools.

## 19. PWA (install + offline shell)

- **Manifest** — `public/manifest.webmanifest` with `theme_color: #0891b2`,
  favicon as icon, `display: standalone`, scope `/`.
- **Service worker** — `public/sw.js` registered from `main.jsx` on
  `window.load` in both **dev and production** (needed for rich
  notifications in dev). Caches a shell on install (`/`, `/index.html`,
  `/favicon.svg`, `/manifest.webmanifest`) with network-first strategy.
  Explicitly bypasses `/api/*`, `/auth/*`, `/websocket/*`, `/@vite/*`,
  `/@fs/*`, `/src/*`, and Vite's `?import` / `?t=...` query params so HMR
  keeps working in development.
- **Install prompt** — `src/components/pwa/InstallPrompt.jsx` shows a
  bottom-left toast when `beforeinstallprompt` fires. The event is captured
  globally in `src/store/pwaStore.js` (zustand) so the Settings page can
  surface the same install button under its "Install as app" section.
  Dismissal stored in `localStorage.sms_install_dismissed`.
- **iOS** — `beforeinstallprompt` never fires. Settings shows a hint:
  *"Tap Share → Add to Home Screen"*. `index.html` includes
  `apple-touch-icon`, `apple-mobile-web-app-capable`,
  `apple-mobile-web-app-status-bar-style` for a clean standalone look.

## 20. Env configuration

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

## 21. Proxy setup (dev + prod)

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

## 22. Deployment (Docker)

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

## 23. Troubleshooting

### 23.1. "All API calls return 403"

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

### 23.2. "Login shows an error and won't get me in"

Usually a 403 on `/userinfo`, not the token grant itself. We work around
this by decoding the JWT locally for user info — but if you still see it,
check the Keycloak client config: the `openremote` client must have
`profile` and `email` scopes.

### 23.3. "History tab spins forever"

Was caused by unstable `queryKey` from `getTimeRanges()` re-running
`Date.now()` every render. Already fixed via `useMemo`. If it regresses,
check `HistoryTab.timeRange` is memoised on the selected `range` string.

### 23.4. "Map won't focus on the same site when clicked twice"

Was caused by memoised selection with a stable id. Already fixed by
creating a fresh object literal on every click (new identity re-fires the
effect). If it regresses, check `selectGateway` in `MapPage.jsx` uses
`setSelection({ id, pos })` with a new object reference each time.

### 23.5. "Icon tap seems laggy"

Check `useWriteAttribute`'s `onMutate` optimistic update is still in place.
That's what makes the flip instant.

### 23.6. "Compact view doesn't change anything"

Confirm `<html>` has `data-density="compact"` attribute after toggling.
`appStore.setDensity` writes this plus `localStorage.sms_density`. The CSS
overrides live in the `@layer components` block of `src/index.css`.

### 23.7. "CORS errors in console"

You're bypassing the Vite/nginx proxy by hardcoding the full URL somewhere.
All API calls must use **relative** paths (`/api/...`, `/auth/...`).

---

## 24. Conventions (respect these when making changes)

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
- **Never disable `refetchIntervalInBackground`** on `useAssets` /
  `useAlarms`. The Live feed + sidebar badge + OS notifications all rely on
  polling continuing when the tab is hidden — that's the whole point.
- **Alarm PUT body must be minimal.** `updateAlarm` in `src/api/alarms.js`
  intentionally strips denormalised fields (`sourceName`, `assetId`) and
  server-managed timestamps before sending. Adding fields to the PUT body
  without verifying them against OR's `SentAlarm` will re-introduce the
  500 we fixed in v1.0.
- **Use the Skeleton primitives** (`<Skeleton.Box/Card/Grid/Hero/...>`)
  for loading states on major pages instead of a full-page spinner.
  Perceived latency is half the fight.
- **Notification payloads** are built via `buildAlarmNotificationPayload`
  so every site gets the same severity-emoji title format and `/alarms`
  deep-link via the service worker.
- **IDB preferences** live in `src/utils/prefs.js` behind typed helpers
  (`getDismissedTips`, `getTutorialProgress`, `getQuickLayout`, …). Don't
  read from `idb-keyval` directly elsewhere — schema migrations happen in
  these helpers.
- **User-facing names go through `getAssetDisplayName(asset)`** — never
  read `asset.name` directly for display. The helper resolves the `notes`
  attribute (our rename target) first, falling back to `asset.name`. All
  tiles, cards, search, command palette, live feed, map popups, and
  notifications use it. Adding a new display surface? Use the helper.
- **Asset types that store data in `notes`** go in `NOTES_USED_FOR_DATA`
  in `src/utils/assetIcons.js` — one-line Set. `getAssetDisplayName`
  skips `notes` for those types and the detail page hides the rename
  pencil via `canRenameAsset(asset)`. HumanPresenceSensorAsset is the
  canonical case; add any new offenders to the Set.
- **Alarm resolution reads `alarm.asset[0]` first.** That's the shape SMS
  IoT emits — an array of full asset objects despite the singular field
  name. `resolveAlarmAsset` in AlarmsPage keeps defensive fallbacks for
  id-only variants but the hot path is zero extra HTTP.
- **Never call `GET /alarm/{id}/asset` per card.** That endpoint 404s on
  this deployment and the data is already embedded on the alarm. The
  useAlarmAssets hook was deleted for this reason.
- **Cross-filtered chip counts** — when adding filter chips with counts,
  use the `ignoreSev`/`ignoreStatus`-style pattern (see `alarmMatches`
  in AlarmsPage). Counts should reflect *"if I click this chip, keeping
  my other filters"* — otherwise the list and the numbers disagree.
- **Don't put `transform` in CSS `transition` when the element has
  `layout` or `whileHover` from Framer Motion.** The two systems compete
  over the same property and the browser stutters. Move hover lifts to
  `whileHover={{ y: -2 }}` on the motion element, keep CSS transitions
  for non-transform properties only. The alarm cards regressed this way
  before; the fix is documented inline in `alarms.css`.
- **Split Framer transitions into `default` vs `layout`** when you use
  stagger delays on entry. A `delay` in the top-level `transition` prop
  applies to layout repositions too, making filter reshuffles feel
  sluggish. Put the delay on `default`, keep `layout` delay-free.

---

## 25. License

Proprietary — SMS Service (PK).
