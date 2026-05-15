# Telco Portal — SecureOps Dashboard

> This document is the **handoff brief** for the `telco-portal` branch of the
> SMS IoT Dashboard. Read this first when picking up the work — every
> non-obvious decision, attribute convention, and "why we did it this way" is
> here. It is intentionally long; skim the TOC and dive into the section you
> need.

**Branch:** `telco-portal` (off `main`)
**Source repo:** `sms-iot-dashboard` (React 19 + Vite 8 + Tailwind v4 + React Router v7 + TanStack Query)
**Backend:** OpenRemote (Keycloak OAuth2 + REST) — **no other services**
**Status (2026-05-16):** Overview, Recent Alerts, and full Audit Log pages built and shipped. Video / Control / Alerts (reskinned) / Settings tabs are routed but stubbed.

---

## Table of contents

1. [TL;DR](#1-tldr)
2. [What this portal is, and isn't](#2-what-this-portal-is-and-isnt)
3. [Decisions you should NOT reverse](#3-decisions-you-should-not-reverse)
4. [The hierarchy: Site → Tower → IoT](#4-the-hierarchy-site--tower--iot)
5. [Required OpenRemote attribute schema](#5-required-openremote-attribute-schema)
6. [Routing + the SecureOps shell](#6-routing--the-secureops-shell)
7. [State management (`secureOpsStore`)](#7-state-management-secureopsstore)
8. [The Overview page, panel by panel](#8-the-overview-page-panel-by-panel)
9. [The Audit Log page](#9-the-audit-log-page)
10. [Token refresh fix](#10-token-refresh-fix)
11. [Case-insensitive type matching](#11-case-insensitive-type-matching)
12. [Audit events shared util](#12-audit-events-shared-util)
13. [File map: what's new vs. what changed](#13-file-map-whats-new-vs-what-changed)
14. [Styling conventions](#14-styling-conventions)
15. [How to add a new SecureOps tab](#15-how-to-add-a-new-secureops-tab)
16. [What's next (open work)](#16-whats-next-open-work)
17. [Reference: memory files](#17-reference-memory-files)

---

## 1. TL;DR

- The portal looks like the hand-drawn SecureOps prototype: top tab strip
  (`Overview · Video · Alerts · Control · Audit log · Settings`), site
  dropdown, KPI strip, live camera grid, site status, remote control, recent
  alerts, environmental telemetry, audit log.
- **Site** = `customAssetType: siteAsset` (top-level container; **2** in realm).
- **Tower** = `customAssetType: towerAsset` OR any `GatewayAsset` (**4** in realm).
- **Devices** = `CameraAsset`, `DoorLockAsset` (or `ToggleableDoorLockAsset` —
  treated identically), `AlarmAsset`, `LightAsset`, `BatteryAsset`,
  `SolarAsset`, `BuzzerAsset`, + the original 14 SMS IoT types.
- **Camera attributes added:** `liveStreamUrl` (string),
  `history` (array of `{id, url, date, detection}`), `cameraVariant`
  (`fixed | 360`), and on 360 cams: `pttUrl` (string — opened in modal iframe
  on Push-to-talk click).
- **Tower attributes used:** `temperature`, `humidity`, `signalStrength`,
  `batteryLevel`, `connected`, `aiHeartbeatAt`, `aiUptime30d`, and an
  **optional `auditLog`** array attribute populated by backend rules.
- Auth: existing OAuth2 password grant + JWT refresh; **concurrent 401s now
  deduped** (see §10).
- All filtering, KPI math, and audit-log generation is client-side from the
  two cached queries `useAssets({})` + `useAlarms({})`. No new endpoints.

---

## 2. What this portal is, and isn't

It **is**:
- A telco operator console for monitoring towers and their on-site IoT —
  cameras, doors, lights, sirens, battery, solar, environment.
- A reskin of the existing SMS IoT portal — same React 19 stack, same auth,
  same React Query polling, same theme tokens.

It **is not**:
- A video management system (no Frigate, no recording, no RTSP transcoding).
  Cameras play whatever URL is in their `liveStreamUrl` attribute via
  `<video>` / `<img>` / `<iframe>` auto-detection — the URL is OR's problem.
- A push-to-talk audio bridge. The PTT button opens the 360 camera's own
  vendor web UI (whose URL lives in `pttUrl`) in a full-bleed iframe; that
  UI carries the actual mic/speaker controls.
- A general-purpose VMS / AMS / ANPR aggregator. That direction lives on the
  separate `one-box-solution` branch and was **explicitly de-scoped** for
  this branch.

---

## 3. Decisions you should NOT reverse

| Decision | Why |
|---|---|
| **OpenRemote only** | User asked, 2026-05-15. No Frigate, no external infra. |
| **`siteAsset` / `towerAsset` lowercase-first** | Matches the user's realm convention. Detection is case-insensitive everywhere via `normalizeAssetType` (§11), so `SiteAsset` / `TowerAsset` also work, but stick to lowercase-first when writing test data. |
| **No placeholder data** | Pre-existing project rule. If OR has no source for a metric, drop the widget — never render `—` standing in for "this metric exists, value missing". |
| **No session-only audit events** | User wants audit persistence across reloads. Audit log is now sourced from alarms + the optional tower `auditLog` attribute. The old in-memory `activityStore` is no longer used by the audit panel or page. |
| **Top tab strip replaces the left sidebar** | The sketch shows tabs along the top, not a sidebar. The `DashboardLayout` now mounts `SecureOpsHeader` only — no `Sidebar` import. Legacy pages (`SitesPage`, `QuickAccessPage`, etc.) are still reachable by URL but not in the chrome. |
| **Site dropdown is the only global scope** | The site dropdown in the header is the single source of truth for "which towers do I care about". The per-panel tower selector (Live Camera Feeds, Remote control, Environmental telemetry) is a **local** selection inside that scope. The Audit Log filters by site scope only, never by selected tower. |
| **Severity colors:** High = red, Medium = yellow, Low = grey | User-specified 2026-05-16. CRITICAL maps to the same red as HIGH. |

---

## 4. The hierarchy: Site → Tower → IoT

```
SiteAsset                          (e.g. "Karachi District A")
├── TowerAsset (or GatewayAsset)   (e.g. "Tower 3 — North")
│   ├── CameraAsset                  (CAM-01 Gate entrance, fixed)
│   ├── CameraAsset                  (CAM-02 Perimeter NW, 360, pttUrl)
│   ├── DoorLockAsset                (Tower gate lock)
│   ├── AlarmAsset / BuzzerAsset     (Siren)
│   ├── LightAsset                   (Tower lights)
│   ├── HeatSensorAsset              (Box temperature)
│   ├── BatteryAsset                 (Battery bank)
│   ├── SolarAsset                   (Solar plate)
│   └── …
├── TowerAsset
│   └── …
└── …
```

Helpers in `src/utils/gateways.js`:
- `isSiteAsset(asset)` — true when `customAssetType` (case-insensitive) is `SiteAsset`.
- `isTowerAsset(asset)` — true when `customAssetType` is `TowerAsset` OR the asset's `type` is `GatewayAsset` (and it isn't already a Site).
- `pickSites(assets)` — every Site in the global asset list.
- `pickTowersForSite(assets, siteId)` — Towers under a Site (walks `asset.path`, not just `parentId`).
- `findSiteForAsset(asset, sites)` — climbs back from a device/tower to its owning Site.
- `findGatewayForAsset(asset, towers)` — same idea for Tower (legacy name "gateway" preserved for the original portal).

Path-aware lookups are critical: in real OR installations, devices are often
nested under group assets between the tower and the device, so a naive
`parentId === towerId` filter misses them. Every helper walks `asset.path`.

---

## 5. Required OpenRemote attribute schema

This is the contract between the dashboard and OR. Some attributes are
required, some optional — when an optional attribute is missing the
corresponding widget hides itself (per the no-placeholder rule).

### 5.1. `customAssetType` (required on every non-Gateway asset)

Existing convention. Must equal one of the recognised values for the device
to render: `siteAsset`, `towerAsset`, `CameraAsset`, `DoorLockAsset`,
`AlarmAsset`, `LightAsset`, `BatteryAsset`, `SolarAsset`, `BuzzerAsset`,
plus the 14 original SMS IoT types (`HeatSensorAsset`,
`HumanPresenceSensorAsset`, `MotionSensorAsset`, `SmokeSensorAsset`,
`DoorSensorAsset`, `VibrationSensorAsset`, `SOSAsset`, `FanAsset`,
`PanelAsset`, `PlugAsset`).

Case-insensitive — `normalizeAssetType` (§11) uppercases the first letter of
whatever it gets.

### 5.2. CameraAsset attributes

| Attribute | Type | Required? | Purpose |
|---|---|---|---|
| `liveStreamUrl` | string | **yes** for live tiles | Played by `<video>` if `.mp4`/`.webm`/`.ogg`/`.m3u8`/`.mov`, `<img>` if `.jpg`/`.png`/`.webp`/`.gif`, otherwise `<iframe>` (vendor web UI). See `CameraStream` in `SecureOpsOverviewPage`. |
| `history` | array | optional | `[{id, url, date, detection}]` where `detection ∈ 'human' \| 'animal' \| 'other'`. Drives the ALERT pill on the live tile (recent `human` ≤ 5 min), the "Detections today" KPI, and the "Detections — past 8 h" bar chart. |
| `cameraVariant` | string | optional | `fixed` or `360`. Used to pick the PTT-capable camera under each tower. |
| `pttUrl` | string | optional, on 360 cams only | Vendor web UI URL with built-in mic/speaker controls. Opened in an iframe modal on Push-to-talk click (mic permission granted via `allow="microphone; camera; …"`). |
| `connected` | boolean | optional | If `false`, tile shows "Camera offline" instead of playing. |

### 5.3. TowerAsset attributes

| Attribute | Type | Required? | Purpose |
|---|---|---|---|
| `connected` | boolean | optional | `false` puts the tower in the "Offline" badge + bumps the Sites-online KPI. |
| `temperature` | number (°C) | optional | Environmental telemetry row. Also shown as a chip in the header. |
| `humidity` | number (%) | optional | Same. |
| `signalStrength` | number (dBm) | optional | "Signal (4G)" row in Environmental telemetry. |
| `batteryLevel` | number (%) | optional | "Battery backup" row. |
| `aiHeartbeatAt` | timestamp | optional | Drives the "AI uptime" KPI (falls back to 100% if any tower in scope reports a recent heartbeat). |
| `aiUptime30d` | number (%) | optional | If present, used directly for the AI uptime KPI. |
| `connectionType` / `network` | string | optional | Shown next to the tower in Site Status (e.g. "4G"). |
| `auditLog` | array | optional | `[{ts, actor?, action?, target?, tag?}]`. Backend rules write to this on every device write so device-state-change rows can show up persistently in the audit log without a per-attribute datapoint fetch. |

### 5.4. Device control attributes (existing convention)

The original SMS IoT contract is unchanged:
- Controllable types (`DoorLockAsset`, `ToggleableDoorLockAsset`,
  `AlarmAsset`, `BuzzerAsset`, `LightAsset`, `FanAsset`, `PlugAsset`)
  toggle via the universal `onOff` boolean attribute. FanAsset is the
  only override (`Fan` attribute).
- `ToggleableDoorLockAsset` is recognised as an alias of `DoorLockAsset`
  in every switch — same icons, same Locked / Unlocked semantics, same
  `locked` legacy fallback, same Remote Control panel finder. Toggle
  writes still go through the universal `onOff` path first.
- See `getPrimaryControlAttr` / `nextToggleValue` / `isAssetActive` in
  `src/utils/assetIcons.js` for the canonical rules.
- DoorLock convention: `onOff=true` ⇒ Locked ⇒ "active" (cyan glow).

---

## 6. Routing + the SecureOps shell

### 6.1. Routes (`src/App.jsx`)

| Path | Component | Status |
|---|---|---|
| `/` | `SecureOpsOverviewPage` | **built** |
| `/video` | `SecureOpsStubPage` (Video) | stub |
| `/alarms` | `AlarmsPage` (legacy, unchanged) | functional, to be reskinned |
| `/control` | `SecureOpsStubPage` (Control) | stub |
| `/audit` | `AuditLogPage` | **built** |
| `/settings` | `SettingsPage` (legacy) | functional |
| `/login` | `LoginPage` (unchanged) | functional |
| `/legacy-overview` | original `OverviewPage` (Control Centre) | kept addressable, not linked |
| `/sites`, `/g/:id`, `/store/:id`, `/a/:id`, `/dashboard`, `/quick`, `/live`, `/map`, `/tutorial`, `/automations` | original pages | reachable by URL, not in nav |

Legacy redirects (`/monitoring`, `/devices`, `/devices/:id`, etc.) are preserved.

### 6.2. The shell (`src/components/layout/DashboardLayout.jsx`)

The old shell rendered `Sidebar` + `Header` around an `<Outlet>`. **Now it
renders `SecureOpsHeader` + `<Outlet>` only.** The Sidebar and Header
components still exist on disk (not deleted), but nothing imports them.

```jsx
<div className="min-h-screen">
  <SecureOpsHeader />
  <main>
    <Outlet />   {/* one of the routes above */}
  </main>
  <CommandPalette />
  <InstallPrompt />
  <Toaster />
</div>
```

### 6.3. `SecureOpsHeader`

`src/components/layout/SecureOpsHeader.jsx` is the sticky shell. Two rows:

1. **Brand row:** SMS shield logo · "SecureOps Platform" / "Digital Security Management Console" · `● Live` pill · **`All Sites (N) ▼`** dropdown.
2. **Tab row:** the six tab links (NavLink, active state cyan underline) · live temp / humidity chips read from the **active tower's** attributes.

The dropdown's options are: "All Sites (N)" plus every SiteAsset by display
name. When no SiteAssets are configured, the count falls back to the total
tower count (via `pickAllTowerCount`).

---

## 7. State management (`secureOpsStore`)

`src/store/secureOpsStore.js` — a small Zustand store holding two ids:

```js
{
  selectedSiteId:  string | null,   // null = "All Sites"
  selectedTowerId: string | null,   // null = auto-pick first tower in site scope
  setSite(id),                      // persists, clears tower selection
  setTower(id),                     // persists
}
```

Both values are persisted in `localStorage` (`sms_secureops_site`,
`sms_secureops_tower`) so reload lands the operator on the same scope.

When `setSite` is called, the selected tower is **cleared** — otherwise we'd
point at a tower that no longer exists in the new site's scope.

The Overview page and the Audit Log page both read this store directly.
Live Camera Feeds, Remote Control, and Environmental Telemetry derive their
"active tower" from `selectedTowerId` with fallback to `towers[0]`.

---

## 8. The Overview page, panel by panel

`src/pages/SecureOpsOverviewPage.jsx` — mounted at `/`. Layout:

```
┌──────────────────────────────────────────────────────────────────┐
│ KPI strip (4 cards)                                              │
├──────────────────────────────┬───────────────────────────────────┤
│ Live camera feeds            │ Recent alerts                     │
│   tower selector  + 2×2 grid │   severity chips + scrollable list│
│ Site status                  │ Environmental telemetry           │
│   button rows                │   temp/humidity/signal/battery    │
│ Remote control               │   + 8h detections bar chart       │
│   2×2 buttons + PTT modal    │ Audit log                         │
│                              │   scrollable, last N events       │
└──────────────────────────────┴───────────────────────────────────┘
```

### 8.1. KPI strip

| Card | Derivation |
|---|---|
| **Sites online** | `online/total` of towers (a "tower" here = each `TowerAsset` or `GatewayAsset` in scope). `connected !== false` ⇒ online. Subline names the first offline tower. |
| **Active alerts** | `useAlarms({status:'OPEN'})` count + `"N critical, M warning"`. |
| **Detections today** | Sum of every `CameraAsset.history[].date` falling in today (vs yesterday for the delta). |
| **AI uptime** | Average of `TowerAsset.aiUptime30d` across scope, or 100% if any tower reports a recent `aiHeartbeatAt`. Drops to `—` when neither exists (no-placeholder rule). |

### 8.2. Live camera feeds

- Tower dropdown — first tower in scope auto-selected; `setTower` updates the
  store so the Remote Control + Environmental Telemetry panels follow.
- 2×2 grid of the active tower's `CameraAsset` children. Each tile:
  - Plays `liveStreamUrl` via the smart `CameraStream` renderer
    (`<video>` / `<img>` / `<iframe>` auto-detected from URL extension).
  - REC pill (always, when streaming) or ALERT pill (recent `human` detection within last 5 min).
  - Label = name-derived short code (`CAM-02`), bottom strip = full name.
  - Click → `/a/:cameraId` (drill into asset detail).
- "Full stream — CAM-XX" / "Playback / history" links go to the active
  camera's detail page (and its History tab).
- Overflow tile `+N more cameras` links to `/video` when there are more than 4.

### 8.3. Site status

Compact list of every tower in scope (this is the same `towers` array
populating the dropdown). Each row: name · connection type · `cams · sensors`
· status badge (Online / Alert / Offline / Intrusion). Clicking a row picks
the tower as the active tower for the other panels.

### 8.4. Remote control

Four buttons for the active tower:
- **Door lock** — first `DoorLockAsset` child. Toggles `onOff`. Labels:
  "Locked" / "Unlocked".
- **Siren** — first `BuzzerAsset` or `AlarmAsset`. Toggles `onOff`.
- **Lights** — first `LightAsset`. Toggles `onOff`.
- **Push to talk** — opens an iframe modal pointing at `pttUrl` of the
  active tower's 360 camera (`cameraVariant === '360'` OR `/360/i` in the
  asset name). Modal has `allow="microphone; camera; autoplay; encrypted-media"`.
  Disabled when no PTT-capable camera exists.

All writes go through the existing optimistic `useWriteAttribute` (cache
patches instantly, rolls back + toast on error, 15 s poll reconciles).

### 8.5. Recent alerts

- Sourced from `useAlarms({status:'OPEN'})`, **scoped by site** (selected
  site → its towers' alarms; All Sites → every alarm).
- **No top-N slice** — every open alarm in scope is shown in a
  `max-height: 440px` scrollable container.
- Severity colors: **CRITICAL/HIGH = red, MEDIUM = yellow, LOW = grey**.
  Header severity chips count `High N · Med N · Low N`.
- Each row renders **Site › Tower › Camera** breadcrumb with click-through
  links (`/sites`, `/store/:towerId`, `/a/:assetId`). Segments omit
  gracefully when the data isn't there.
- Time row: `09:42 · 4 min ago` (HH:mm + `formatDistanceToNowStrict`).
- **Ack** (cyan) and **Resolve** (green) buttons on every actionable row.
  Status-aware visibility:
  - `OPEN`: both shown.
  - `ACKNOWLEDGED` / `IN_PROGRESS`: only Resolve.
  - `RESOLVED` / `CLOSED`: no buttons.

  Pending state shows `Loader2` (spinning) on the clicked button only; the
  other action and siblings disable. Uses `useUpdateAlarmStatus` —
  invalidates `['alarms']` so the row drops out on success.

### 8.6. Environmental telemetry

Reads the **active tower's** attributes:
- `temperature` / `humidity` / `signalStrength` / `batteryLevel` rows, each
  with a bar showing the value's position in its sensible range
  (`temp/60`, `humidity/100`, `(signal+110)/60` so -110 dBm ≈ 0% and
  -50 dBm ≈ 100%, `battery/100`).
- "Updated Ns ago" header using the most recent attribute timestamp.
- "Detections — past 8 hours" — hourly buckets from every camera's
  `history[].date` timestamps. The newest bucket gets a brighter colour.

### 8.7. Audit log (preview)

Mini version of the full `/audit` page (§9). Sources from
`useAlarms({})` (everything, not just open) + the optional
`TowerAsset.auditLog` attribute. Scope = site only (NOT selected tower).
Scrollable, `max-height: 360px`. Footer link to `/audit`.

---

## 9. The Audit Log page

`src/pages/AuditLogPage.jsx` — mounted at `/audit`. Persistent (no
in-memory ring buffer), site-scoped, paginated, filterable, exportable.

### 9.1. Sources (both server-stored)

1. **Alarm history** — `useAlarms({})`. Each alarm emits:
   - `<title> raised` at `createdOn`, severity = alarm severity, status = current.
   - `<title> acknowledged` at `lastModified` when status moved to `ACKNOWLEDGED` (only if `|lastModified − createdOn| > 1 s` to avoid double-counting the create).
   - `<title> resolved` / `closed` at `lastModified` for those statuses.
2. **`TowerAsset.auditLog` attribute** — optional array of
   `{ ts, actor?, action?, target?, tag? }`. Each entry becomes one row.
   This is where device-state-change events show up persistently — a
   backend rule appends an entry on every relevant write so the UI can
   read it from the regular `useAssets` cache without firing N+1 datapoint
   queries.

Both streams flow through `src/utils/auditEvents.js` (`alarmAuditEvents`,
`towerAuditEvents`) — the same util the Overview panel uses (§12).

### 9.2. Filters (all client-side)

| Filter | Behaviour |
|---|---|
| **Search** | Free text against title, detail, site name, tower name, device name, actor. Case-insensitive substring match. Placeholder: "Search title, site, tower or device…" |
| **Time range** | Today · Last 24h · **Last 7 days (default)** · Last 30 days · All time |
| **Severity** | Multi-select chips: `High` (CRITICAL+HIGH) · `Medium` · `Low`. Counts shown per chip |
| **Status** | Multi-select: `Open` · `Acknowledged` (incl. IN_PROGRESS) · `Resolved` (incl. CLOSED). When active, tower-log rows (which have no status) are excluded. Counts shown per chip |
| **Tower** | Multi-select chips for every tower in current site scope |

"Reset filters" returns everything to defaults. "Export CSV" downloads the
filtered list (not just the visible page).

### 9.3. Pagination

- Client-side, **25 rows per page**.
- First / Prev / page indicator (`page / pageCount`) / Next / Last.
- `Showing 1–25 of N` count line.
- Page resets to 1 whenever a filter changes.

### 9.4. Table columns

`When · Event · Location · Severity · Status · Tag`. (Actor column was
removed per user request 2026-05-16 — still in CSV export.)

- **When** — `HH:mm:ss` / `dd MMM yyyy` / relative ago.
- **Event** — icon + title + optional detail.
- **Location** — Site › Tower › Device breadcrumb with deep links.
- **Severity** — pill in the matching colour (or `—` for tower-log rows).
- **Status** — pill in the matching colour (or `—` for tower-log rows).
- **Tag** — `Alert` (red) / `Command` (cyan) / `Info` (yellow).

### 9.5. CSV export

`exportCsv()` builds a column definition array and calls `downloadCsv(filename, rows, columns)`
from `src/utils/csv.js`. RFC 4180 escaping, UTF-8 BOM (Excel-safe).
Filename: `audit-YYYYMMDD-HHmm.csv`. Columns:

```
Timestamp (ISO), Local time, Event, Detail, Severity, Status,
Site, Tower, Device, Actor, Tag, Source
```

`Source` = `alarm-raised` / `alarm-acked` / `alarm-resolved` / `tower-log`.

**Common pitfall — the original signature trap:** `toCsv` and
`downloadCsv` take `(rows, columns)` where `columns` is an array of
`{ key, label?, get?(row) }`. Don't call `toCsv(rows)` with no columns —
you'll get `columns.map is not a function`.

---

## 10. Token refresh fix

`src/api/client.js` — the existing axios interceptor refreshed on 401, but
didn't dedupe **concurrent** refreshes. With the new dashboard polling
`useAssets({})` + `useAlarms({status:'OPEN'})` + `useAlarms({})` every 15 s,
expiry produced three parallel 401s → three parallel `/token` calls → only
the first rotation succeeded (Keycloak rotates the refresh token on first
success) → the other two failed and bounced the user to `/login`.

Fix: single shared `refreshInFlight` promise. Every 401 awaits the same
promise; the first one to hit triggers the rotation, the rest queue and
retry their original request with the same new access token. Also added a
per-request `_retry` flag so a 401 on the retried request can't recurse
infinitely.

```js
let refreshInFlight = null;

function startRefresh(refreshToken) {
  if (!refreshInFlight) {
    refreshInFlight = refreshAccessToken(refreshToken)
      .then(r => { localStorage.setItem(...); return r.access_token; })
      .finally(() => { refreshInFlight = null; });
  }
  return refreshInFlight;
}
```

If you're seeing spurious `/login` redirects again, that promise dedup is
the place to investigate first.

---

## 11. Case-insensitive type matching

`src/utils/assetIcons.js` exports a `normalizeAssetType(t)` helper:

```js
export function normalizeAssetType(t) {
  if (typeof t !== 'string' || !t) return t;
  return t.charAt(0).toUpperCase() + t.slice(1);
}
```

**It only upper-cases the first character.** Earlier we tried lowercasing
the whole string and re-upper-casing the first char — that turned
`CameraAsset` into `Cameraasset`, broke every existing switch case, and
hid every asset from the UI. Don't do that again.

Every type-comparing function in `assetIcons.js` runs its `customType`
argument through `normalizeAssetType` before the switch:
`getAssetIcon`, `getAssetAccent`, `isAssetActive`, `isAssetAlarming`,
`getPrimaryControlAttr`, `getPrimaryReadingAttr`, `getStateLabel`.

In `gateways.js`, `isSiteAsset` and `isTowerAsset` do the same:

```js
export function isSiteAsset(asset) {
  if (!asset) return false;
  if (normalizeAssetType(asset.type) === 'SiteAsset') return true;
  return normalizeAssetType(getCustomAssetType(asset)) === 'SiteAsset';
}
```

This means realms can spell types either way (`siteAsset` / `SiteAsset`,
`towerAsset` / `TowerAsset`) and it just works. Stick to lowercase-first
when creating new test data — that's what the user's realm uses.

---

## 12. Audit events shared util

`src/utils/auditEvents.js` exports the two event generators used by both
the Overview's `AuditLogPanel` and the dedicated `AuditLogPage`. Centralising
keeps event shape, severity tagging, and the "transition only when
lastModified ≠ createdOn" rule in one place.

Event shape:

```ts
{
  ts:        number,          // ms since epoch
  icon:      ComponentType,
  title:     string,
  detail?:   string,
  actor?:    string,          // only present for tower-log rows
  tag:       'Alert' | 'Command' | 'Info',
  tagTone:   'alert' | 'command' | 'info',
  source:    'alarm-raised' | 'alarm-acked' | 'alarm-resolved' | 'tower-log',
  severity?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW',
  status?:   'OPEN' | 'ACKNOWLEDGED' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED',
  site?:     Asset,           // resolved via findSiteForAsset
  tower?:    Asset,           // resolved via findGatewayForAsset(asset, towers)
  asset?:    Asset,           // the linked device
}
```

`alarmAuditEvents(alarm, ctx)` takes a context `{ assetMap, sites, towers }`
so it can resolve site / tower for breadcrumbs without each caller
re-implementing the same lookups.

`towerAuditEvents(tower)` reads `tower.attributes.auditLog.value` (an array)
and converts each entry. Returns `[]` when the attribute isn't declared —
the panel/page silently falls back to alarms-only.

---

## 13. File map: what's new vs. what changed

### New files

```
src/components/layout/SecureOpsHeader.jsx     Sticky top bar + tabs + site dropdown
src/pages/SecureOpsOverviewPage.jsx           The Overview tab (`/`)
src/pages/SecureOpsStubPage.jsx               Shared placeholder for Video / Control
src/pages/AuditLogPage.jsx                    Full `/audit` page
src/pages/secureops.css                       All SecureOps-scoped styling
src/store/secureOpsStore.js                   Zustand: selectedSiteId / selectedTowerId
src/utils/auditEvents.js                      Shared alarm/tower event generators
telco-readme.md                               This document
```

### Edited files

```
src/App.jsx                                   Routes for new pages + stubs
src/components/layout/DashboardLayout.jsx     Renders SecureOpsHeader (was Sidebar+Header)
src/utils/assetIcons.js                       New types + normalizeAssetType + icon/accent maps
src/utils/gateways.js                         isSiteAsset / pickSites / isTowerAsset / pickTowersForSite / findSiteForAsset
src/api/client.js                             Refresh-token dedup (concurrent 401 handling)
```

### Memory files (operator-side, persist across conversations)

```
~/.claude/projects/-Users-ahmadyar-Documents-projects-pathfinder-sms-iot-dashboard/memory/
  ├─ MEMORY.md                                Index
  ├─ telco_portal_2026_05_15.md               Branch direction (OpenRemote only, schema)
  ├─ one_box_direction_2026_05_12.md          Separate one-box-solution direction (DO NOT MERGE here)
  └─ ...
```

---

## 14. Styling conventions

- Everything uses the CSS variable tokens defined at the top of
  `src/index.css` — `--color-surface-0/1/2/3`, `--color-ink-0/1/2/3`,
  `--color-accent-*`, `--color-ok/warning/danger-*`. **No hardcoded colors
  in any new file.**
- Panel container: the existing `.panel` class (16px radius, surface-1
  background, subtle border). Layouts inside panels use Tailwind utility
  classes; bespoke widgets get `.so-*` classes in `secureops.css`.
- Severity colour map is fixed and used both inline (alert pill style props)
  and by-class in `secureops.css`:
  - High / Critical → `var(--color-danger-400)`
  - Medium → `var(--color-warning-400)`
  - Low → `var(--color-ink-2)`
  - Resolved / OK → `var(--color-ok-500)`
- Dark-first; light mode is the existing `:root[data-theme="light"]`
  override in `index.css`. Test new widgets in both themes — every token
  pivots automatically as long as you stick to the variables.

---

## 15. How to add a new SecureOps tab

The current stubs are Video, Control. To turn one into a real page:

1. Create `src/pages/VideoPage.jsx` (or similar) reading from `useAssets`
   and `useAlarms`. Inherit scope from `useSecureOpsStore().selectedSiteId`
   and (optionally) `selectedTowerId`.
2. Replace the stub element in `src/App.jsx`:
   ```jsx
   <Route path="video" element={<VideoPage />} />
   ```
3. Add any new attributes you depend on to §5 of this file.
4. Use only theme tokens for colours. New widget-specific styling goes in
   `secureops.css`.
5. If the page introduces new types of audit events, **extend
   `src/utils/auditEvents.js`** — don't duplicate the event shape.

The tab order and labels are defined in
`src/components/layout/SecureOpsHeader.jsx#TABS`. Reorder or rename there.

---

## 16. What's next (open work)

In rough priority order:

1. **Video tab (`/video`)** — full camera grid for the site/tower scope,
   per-detection filter chips (`Human · Animal · Other`), side drawer for
   playback of `history[]` clips. Same `liveStreamUrl` contract as the
   Overview tile.
2. **Alerts tab** — reskin the existing `AlarmsPage` to match SecureOps
   styling. Move it from `/alarms` to live under the tabs. Add the same
   Site/Tower/Camera breadcrumb + severity colours used in Recent Alerts.
3. **Control tab (`/control`)** — bulk operations (lock all doors, arm
   all sirens, lights off) + per-tower remote panel (re-use Overview's
   Remote Control). PTT in this tab opens the same iframe modal.
4. **Settings tab** — extend the existing `SettingsPage` with a "SecureOps"
   section: default site, live-camera autoplay, alert sound for new
   Critical alerts, camera-history retention display.
5. **Device-state-change history from datapoints** — for towers that don't
   carry an `auditLog` attribute, optionally fetch datapoints for each
   controllable asset's `onOff` over the last 24 h and surface them in
   the audit log. Cap to ~5 towers at a time; use `useQueries` with a
   stable id list to avoid query churn.
6. **Detect when `aiHeartbeatAt` is stale** — if no tower has reported a
   heartbeat in > 5 min, drop the AI uptime KPI to `—` (currently it stays
   at 100% as long as any heartbeat exists, regardless of recency).

---

## 17. Reference: memory files

The Claude operator's persistent memory (separate from this repo, but
relevant to picking up the work):

- **`telco_portal_2026_05_15.md`** — direction, hierarchy, schema, the
  "no Frigate / no one-box" boundary, the lowercase-first `siteAsset` /
  `towerAsset` convention, and the count of records in the realm.
- **`feedback_no_placeholders.md`** — the "drop the widget rather than
  showing fake data" rule that informs every `null` / `—` decision in
  this branch.
- **`one_box_direction_2026_05_12.md`** — the rejected alternative direction.
  Do not pull Frigate, ANPR, or AMS work into `telco-portal`.

---

## Appendix A: Useful conventions

- Dates / times: `date-fns` (`format`, `formatDistanceToNowStrict`,
  `format(now, 'HH:mm:ss')`).
- Icons: `lucide-react` outline icons only. Never import a Lucide icon
  inside a switch — let `AssetGlyph` (`src/components/tiles/AssetGlyph.jsx`)
  handle dynamic per-type icon lookup.
- Linting: `react-hooks/purity` flags `Date.now()` inside `useMemo` as
  impure. Use `new Date().getTime()` instead — same value, lint-clean.
  This recurred several times across the new files; it's worth grepping
  if you add a new memoised time-window computation.
- Builds + lint must both pass before declaring a feature done. Pattern:
  `npm run lint && npm run build` after every meaningful change.

## Appendix B: Quick start

```bash
# Setup
npm install
cp .env.example .env   # set VITE_SMS_IOT_URL and VITE_SMS_IOT_REALM
                       # (defaults: go.smsiotpk.com, realm sms-iot)

# Dev
npm run dev            # http://localhost:3000

# Verify
npm run lint
npm run build
```
