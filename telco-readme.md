# Telco Portal — SecureOps Dashboard

> This document is the **handoff brief** for the `telco-portal` branch of the
> SMS IoT Dashboard. Read this first when picking up the work — every
> non-obvious decision, attribute convention, and "why we did it this way" is
> here. It is intentionally long; skim the TOC and dive into the section you
> need.

**Branch:** `telco-portal` (off `main`)
**Source repo:** `sms-iot-dashboard` (React 19 + Vite 8 + Tailwind v4 + React Router v7 + TanStack Query)
**Backend:** OpenRemote (Keycloak OAuth2 + REST) — **no other services**
**Status (2026-06-08):** Overview, Video, Alerts, Control, full Audit, Settings shipped. The most recent wave (commits `6828a67` → `f27d12a`) focused on **performance, viewport-fit polish, and a Device Summary sidebar on Overview**. The 2026-06-07 follow-up rewrote PTZ movement to drive the camera through OR attributes instead of an external HTTP controller. The 2026-06-08 follow-up **rips the entire PTT WebSocket / PCM-streaming pipeline out** — PTT is now a one-line `<a href="mumble://…">` against the OS Mumble client.

**Clip URL + PTT tile polish (2026-06-20):**

- **Clips always resolve from the event id.** Both the Video history sidebar (`CameraHistoryModal`) and the alarm surfaces (`getAlarmClipUrl`) now build the clip URL with `getEventClipUrl(eventId, base)` unconditionally — `${base}/api/events/${id}/clip.mp4`. The time-range branch (`getTimeRangeClipUrl` driven by `start_time` / `end_time` + `cameraId` + `beforeStartClip` / `afterEndClip` padding) was removed from both paths: the media server returns the recorded clip for an event id directly. `findTimestamps` and the `getTimeRangeClipUrl` import were deleted from `src/utils/alarms.js`; the history `useMemo` in `CameraHistoryModal` no longer reads `cameraId` / padding / timestamps. `getTimeRangeClipUrl` still exists in `src/constants/events.js` (now unused — kept exported, harmless). Steps 1 (structured field) + 2 (literal URL) of the alarm resolver and the snapshot URL (always event-id based) are unchanged. (§5.1b.i + §5.2c updated.)
- **PTT tile renders in the default (inactive) state.** The `/control` Controls-grid PTT tile's `ok` branch was hardcoding `data-active="true"`, giving it the accent gradient + border + tinted icon so it looked permanently selected next to the (off-by-default) device tiles. Dropped the attribute — the tile now matches the other Controls tiles for symmetry. Hover, click→Mumble hand-off, and the `missing` / `invalid` branches are unchanged. (§9a.2 updated.)

**PTT pivot (2026-06-08):**

- **PTT is no longer in-browser audio.** The `usePushToTalk` hook, the inline `AudioWorklet` PCM pipeline, the per-press `getUserMedia` mic capture, and the `wss://` socket to the PC speaker are all gone. `PttAsset.socketIP` now holds a full **`mumble://user:pass@host:port/`** URL and the PTT control is a plain `<a href={socketIP}>` — clicking hands off to the OS Mumble client.
- **Three surfaces, one resolver.** `resolvePttForTower(tower, allAssets)` in `src/utils/gateways.js` returns `{status, href}`. Used by (1) the new **PTT tile in the Controls grid on `/control`**, (2) the icon button in `AlarmClipModal`, and (3) a new header button in `CameraHistoryModal` (the camera popup opened from `/video`, `/control`, Overview, and the audit log).
- **Three statuses with consistent UX:**
  - `ok` → `socketIP` starts with `mumble://` → anchor renders, value used verbatim as `href`.
  - `missing` → no PttAsset under the tower, or `socketIP` blank → clickable button that toasts `"PTT not configured for this tower."` on click. We don't disable — a clickable hint beats a dead affordance.
  - `invalid` → `socketIP` is non-empty but doesn't match `^mumble:\/\//i` → **the button is hidden entirely** on every surface. A broken link the operator can't fix from the UI shouldn't be visible.
- **Dead code deleted.** `src/hooks/usePushToTalk.js` (~230 lines: AudioContext + AudioWorklet + WebSocket lifecycle + level meter RAF loop) and `src/constants/ptt.js` (`PTT_WS_URL`, `buildPttWsUrl`) — gone. The `wss://` scheme hard-coding, the `ptt_start` / `ptt_stop` JSON frames, the 16-bit-LE PCM mono 48 kHz framing — none of it is part of the dashboard anymore. The PC-side `server.js` running near the site speaker is no longer the dashboard's concern; it's replaced by a Mumble server somewhere in the deployment. (§5.5 fully rewritten.)
- **Mixed-content caveat is also gone.** No socket → no `ws://` vs `wss://` issue → the dashboard can be served HTTP or HTTPS with no PTT-side TLS dependency.

**PTZ rewrite (2026-06-07):**

- **PTZ no longer hits an external HTTP controller.** `usePtzMove` now writes two attributes on the `PtzCameraAsset` itself: `ptzCommand` (text — `move_up` / `move_down` / `move_left` / `move_right` / `stop`) and `movementDuration` (text, ms — default **3000 ms** when missing / blank / non-numeric). On press the hook writes `move_<dir>`, schedules a `setTimeout(duration)`, then writes `stop`. Same `useWriteAttribute` path every other control surface uses — so the camera's `ptzCommand` flips instantly in the React Query cache and the PUT goes out optimistically.
- **In-flight gate.** While a move is in flight, further presses are ignored — the operator waits for the auto-stop. Decided 2026-06-07 to avoid racing writes against the OR backend and keep the camera predictable. (No throttle window anymore — the gate replaces the old 150 ms double-tap suppressor.)
- **Unmount cleanup.** Closing the modal / navigating away mid-move clears the pending timer **and** fires a synchronous direct `writeAttributeValue(assetId, 'ptzCommand', 'stop')` (bypassing the mutation hook because the component is tearing down), so the camera can't keep panning after the operator loses sight of it.
- **Stable mutate closure.** The scheduled stop reaches into `mutateRef.current` rather than capturing `write.mutate` at schedule time, so React Query polls / parent re-renders can't drop a stale callback into the setTimeout closure.
- **Move failure cancels the pending stop.** If the move write errors, `onError` cancels the timer — the camera never received the command, so there's nothing to stop. Trade-off: if the HTTP response is lost but the device did receive the command, the camera could keep panning until the next intentional stop. Acceptable inside the deployment.
- **Diagnostic logs (temporary).** The hook emits `[PTZ] move`, `[PTZ] auto-stop firing`, `[PTZ] cleanup stop`, and `[PTZ] {move|stop} write failed` to the browser console during the field trial. Strip once stop is confirmed to be reliably reaching OR.
- **Dead code deleted.** `src/constants/ptz.js` (`PTZ_BASE_URL`, `getPtzMoveUrl`) and `getCameraPtzId` in `src/utils/gateways.js` are gone — the new attribute flow doesn't need an AI-side id resolver, a base URL, or a path builder. The `ptzId` / `cameraId` attributes are no longer read. (§5.1e fully rewritten.)

**Post-2026-05-27 wave (commits `6828a67` → `f27d12a`):**

- **Header env-chips removed entirely (commit `6828a67` dropped temp+humidity; follow-up dropped signal+battery).** Row 2 of `SecureOpsHeader` is now just the tab strip — **no per-tower telemetry chips at all**. The header no longer reads `signalStrength`, `batteryLevel`, or the `HeatSensorAsset` child; the per-page poll lookup that used to live on every route is gone. Rationale: per-tower telemetry doesn't belong on a global shell that follows the operator everywhere; signal+battery for the active tower (and temp/humidity, and the BatteryAsset reading) all live on `/control`'s Environment panel where they're actually actionable. The KPI strip on `/` carries the realm-wide health signal (Sites online / AI uptime). (§6.3 updated.)
- **Overview Recent Alerts is now an infinite-scroll list (commit `6828a67`).** First page renders 30 rows; an `IntersectionObserver` on a sentinel bumps the visible count by 30 each time the operator scrolls past it. Filter changes (severity / tower) reset visible count back to 30; mutation-driven list shrinkage (Ack / Resolve) **preserves** the operator's scroll position. (§8.3 updated.)
- **Overview perf refactor (commit `6828a67`).** Three precomputed Maps replace the per-row, per-render `findGatewayForAsset` + `alarmBelongsToGateway` work: `assetMap` (assetId → asset), `alarmTowerMap` (alarmId → `Set<towerId>`), `alarmContextMap` (alarmId → `{asset, tower, site, clipUrl}`). `AlertRow` is wrapped in `React.memo` and receives **individual primitive/stable-ref props** (NOT a wrapping `{ctx}` object — shallow compare would always look "changed"). Background polls no longer thrash 1k+ alert rows. (§8.3 + §8.7 updated.)
- **Overview only fires ONE `useAlarms({})` query (commit `6828a67`).** Used to fire both `useAlarms({})` and `useAlarms({status:'OPEN'})` every 15 s. Open list is now derived client-side from the full list. The Alerts page also flipped to `useAlarms({})` so navigating Overview → Alerts reuses the cached query slot (instant, no extra round-trip).
- **Overview default time range is now `All` (commit `6828a67`).** Was `24h`. Fresh load now shows every alert in the realm; operators narrow via the chip strip. The `Sites online` / `AI uptime` KPIs still ignore the range (they're now-state snapshots).
- **Video page defaults to the first tower (commit `94da9a4`).** Tower chips are now multi-select **checkboxes**; fresh mount checks only the first tower, so only one tower's MJPEG/HLS streams mount up front. Clicking other chips adds them; an empty Set (after unchecking everything) shows all towers (original semantics). Tracked in **local page state** — NOT `secureOpsStore.selectedTowerId` (which Control persists to localStorage and would override the default). (§16 item 1 updated.)
- **Camera tiles defer the stream fetch (commit `94da9a4`).** `CameraCard` no longer mounts `<CameraStream>` on render — it renders a `PlayCircle` poster (dim dark tile) until the operator clicks. The modal still plays the stream on open. Previously the Video wall + Control's Cameras panel fired N concurrent stream requests on mount. Offline tiles still render `<CameraStream offline>` so the offline UI is unchanged. (§5.1a updated.)
- **Alerts page perf refactor + infinite scroll (commit `76ae4cf`).** Same shape as Overview — shared `alarmTowerMap` + `alarmContextMap`, memoized `AlertRow` with primitive props, IntersectionObserver-based infinite scroll. Difference: the Alerts page itself scrolls (no internal `overflow:auto` container), so the observer's `root` is `null` (viewport). (§8.7 NEW.)
- **Control Environment panel now shows Battery (commit `8b103e9`).** When the active tower has a `BatteryAsset` child, a third tile appears alongside Temperature / Humidity reading `energyLevelPercentage`. Tile tint is threshold-coloured: ≥50% green, 20-49% yellow, <20% red, null → grey. Empty state copy widened from "No HeatSensorAsset" to "No environment sensors". (§9a.2 updated.)
- **Device Summary sidebar on Overview (commit `f27d12a`).** Right column (lg+) alongside Recent Alerts shows three rows: Doors unlocked · Lights on · Sirens sounding. Each row's active count is the big number, with a `<active verb> · <idle verb> · total` subline. Click a row → full-page modal listing every device in that category across scope, grouped by tower, with inline Turn on/Turn off toggles via `useWriteAttribute`. Sidebar collapses below Recent Alerts on narrow screens (`grid-cols-1`). (§8.6 NEW.)

**Overview redesign (2026-05-27):** the page is now slimmed to **KPI strip + full-width Recent Alerts**, sized to fit the viewport (`h-[calc(100dvh-112px)]`) so the page itself never scrolls — only the alert list does, internally (§8). The Live Camera Feeds, Site Status, Remote Control, Environmental Telemetry, and Audit Log panels were all removed from this surface (Remote Control + Env Telemetry's data moved into the `AlarmClipModal` and the header chips respectively; the Control / Audit tabs still hold the full versions). A **time-range filter** (Today · 24h · 7d · 30d · All, default 24h) drives both KPIs and the Recent Alerts list (§8.1). The Recent Alerts panel now carries the same **Severity + Tower chip filters** as `/alarms` (§8.4) and a loader overlay for filter transitions (`useTransition`, not React-Query `isFetching` — background polls don't blink the loader). The **"Active alerts" KPI is site+range scoped** so its total always equals the sum of the panel's chip badges. The **"Human detections" KPI** counts CRITICAL + HIGH only (`isHighPrioritySeverity` — these are the AI-side human-detection events).

**Header chips (current state — see post-2026-05-27 wave above):** the env telemetry strip on `SecureOpsHeader` row 2 has been **removed entirely**. Row 2 is now just the tab strip — no temp, humidity, signal, or battery chips. All per-tower readings live on `/control`'s Environment panel (§9a.2) where the operator has the device picker context to act on them. The header no longer reads any tower attributes at all. (§6.3 reflects this.)

**AlarmClipModal (2026-05-27):** the URL-only `ClipModal` is gone — every alert surface (Overview, `/alarms`, `/audit`) opens the new rich `AlarmClipModal` (§5.1b). It carries: severity pill + alarm title + **Prev/Next tower-scoped queue navigation with `N / M` counter** (← / → keys also work); meta strip with Site › Tower breadcrumb, time, camera name, best-effort detection chip (human/animal/vehicle); compact **Quick controls** (Door / Siren / Lights) targeting the camera's tower; **Push-to-talk button** per the tower's `PttAsset.socketIP`; segmented **Snapshot / Clip / Live** tabs in the footer; native `<video controls>` on the Clip tab with a primary-accent **Download** button (blob fetch + `createObjectURL` for cross-origin reliability); **Ack + Resolve** action buttons that **auto-advance to the next queued alarm** on success (or close if at end). PTZ pad renders on Live view only when the asset is a `PtzCameraAsset`. Modal is `h-95vh` × `w-1280px` so the video viewport is generous. Internal state resets per-alarm via `key={alarm.id}` on the modal (project-standard "reset on prop change" pattern — sidesteps the `react-hooks/set-state-in-effect` lint rule). See §5.1b for the modal anatomy, §11 for the helper additions (`getAlarmEventId`, `getAlarmSnapshotUrl`, `getAlarmDetectionLabel`).

**Loader UX + action toasts (2026-05-27):** `useUpdateAlarmStatus` accepts optional `successMessage` / `errorMessage` variables — every Ack/Resolve callsite passes action-specific copy (`"Alarm acknowledged — <title>"`). Alert row dims while its mutation is pending. Background React-Query polls no longer flash the loader (cause: previously included `isFetching` in the loader signal).

Earlier wins still in place: in-app `AlarmNotificationStack` replacing `react-hot-toast` for alarm cards (§6.4); brand swap to the SMS Sentinel AI logo (§14); shared `CameraCard` + `CameraHistoryModal` on every camera surface (§5.1a); `PtzCameraAsset` recognised alongside `CameraAsset` (§5.1, §5.1e); `eventId`-datapoints history sidebar on the Video modal (§5.2b); snapshot-preview-then-play (§5.2c); `auditLog` attribute on towers feeding the full audit page (§9.1).

---

## Table of contents

1. [TL;DR](#1-tldr)
2. [What this portal is, and isn't](#2-what-this-portal-is-and-isnt)
3. [Decisions you should NOT reverse](#3-decisions-you-should-not-reverse)
4. [The hierarchy: Site → Tower → IoT](#4-the-hierarchy-site--tower--iot)
5. [Required OpenRemote attribute schema](#5-required-openremote-attribute-schema)
   - 5.1b [Alarm clip modal — AlarmClipModal](#51b-alarm-clip-modal--alarmclipmodal)
6. [Routing + the SecureOps shell](#6-routing--the-secureops-shell)
   - 6.4 [Alarm notification stack](#64-alarm-notification-stack)
7. [State management (`secureOpsStore`)](#7-state-management-secureopsstore)
8. [The Overview page](#8-the-overview-page)
   - 8.1 [Time-range filter](#81-time-range-filter) · 8.2 [KPI strip](#82-kpi-strip) · 8.3 [Recent Alerts panel](#83-recent-alerts-panel) · 8.4 [Modal queue handoff](#84-modal-queue-handoff) · 8.5 [Loader UX](#85-loader-ux) · 8.6 [Device summary sidebar](#86-device-summary-sidebar) · 8.7 [Perf — shared lookup Maps + memoized rows](#87-perf--shared-lookup-maps--memoized-rows)
9. [The Audit Log page](#9-the-audit-log-page)
9a. [The Control page, panel by panel](#9a-the-control-page-panel-by-panel)
10. [Token refresh fix](#10-token-refresh-fix)
10b. [Alarm status mutation — per-call toast copy](#10b-alarm-status-mutation--per-call-toast-copy)
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
- **Devices** = `CameraAsset` (fixed), **`PtzCameraAsset` (pan/tilt/zoom — 180°
  or 360°)**, `DoorLockAsset` (or `ToggleableDoorLockAsset` — treated
  identically), `AlarmAsset`, `LightAsset`, `BatteryAsset`, `SolarAsset`,
  `BuzzerAsset`, + the original 14 SMS IoT types.
- **Camera attributes added:** `liveStreamUrl` (string),
  `history` (array of `{id, url, date, detection}`), `cameraVariant`
  (`fixed | 360`). The legacy `pttUrl` attribute is no longer read —
  push-to-talk lives on a tower-scoped `PttAsset.socketIP` (§5.5), not
  per-camera.
- **Per-tower `PttAsset`** (optional) carries `socketIP` — a full
  `mumble://user:pass@host:port/` URL. The PTT control is just an
  `<a href={socketIP}>` that hands off to the OS Mumble client. Rendered
  in three places: a tile in `/control`'s Controls grid, an icon button
  in `AlarmClipModal`, a header button in `CameraHistoryModal`. Hidden
  entirely when `socketIP` is set but doesn't start with `mumble://`
  (§5.5).
- **Alarm notifications** surface in the in-app `AlarmNotificationStack`
  (Mac-style, top-right below header) — replaces the previous `react-hot-toast`
  flow that blocked the site dropdown. See §6.4.
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
- An in-browser intercom. PTT is now a **protocol-handler link** —
  the dashboard does no audio capture, no streaming, no socket. It
  just renders an `<a href="mumble://…">` and lets the OS hand off to
  the Mumble desktop client where the operator's PTT actually happens.
  See §5.5 for the resolver + the three render surfaces.
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
| **Site dropdown is the only global scope** | The site dropdown in the header is the single source of truth for "which towers do I care about". Per-panel tower selectors on `/control` and inside Recent Alerts filters are **local** selections inside that scope. The Audit Log filters by site scope only, never by selected tower. |
| **Severity colors:** High = red, Medium = yellow, Low = grey | User-specified 2026-05-16. CRITICAL maps to the same red as HIGH. |
| **PTT is per-tower, not per-camera** | User decided 2026-05-23. Each tower may carry a `PttAsset` child with a `socketIP` attribute. Don't bring back `pttUrl` on cameras, don't gate the button on a 360 / PTZ camera. |
| **PTT has no global fallback URL** | User decided 2026-05-23. When the active tower has no `PttAsset` (or its `socketIP` is blank) the button shows a "not configured" state — do not fall back to a deployment-wide URL. |
| **PTT is a protocol-handler link, not an in-browser audio pipeline** | User decided 2026-06-08. `socketIP` holds a full `mumble://user:pass@host:port/` URL and the PTT control is just `<a href={socketIP}>` — the OS handles the hand-off to the Mumble client. Don't reintroduce `usePushToTalk`, an `AudioWorklet`, `getUserMedia`, or any WebSocket pipeline. The operator already has Mumble installed; the dashboard's job is just to open it with the right credentials and host. |
| **Hide PTT on invalid URL, toast on missing** | User decided 2026-06-08. Three resolver statuses (`ok` / `missing` / `invalid`) and the same render rule on every surface. `ok` → anchor renders. `missing` → clickable button that toasts a "not configured" hint pointing at the OR attribute (clickable beats disabled so the configurer learns where to look). `invalid` → render `null` entirely; a malformed `socketIP` the operator can't fix from the UI shouldn't show as a broken affordance. Don't disable instead of hiding on `invalid` — the operator was getting "click does nothing" with no recourse. |
| **PTT lives in the Controls grid on `/control`** | User decided 2026-06-08. On the per-tower control surface, PTT renders as a regular `ControllableTile`-shaped tile alongside Door / Siren / Lights, NOT in the header. Operators triage one tower at a time; PTT sits next to the other "act on this tower" affordances, not next to the tower picker. |
| **PTT is inline UI, not a popup** | User decided 2026-05-23. Don't reintroduce `PttModal` or any popup for PTT. As of 2026-06-08 the inline surfaces are: the `AlarmClipModal` quick-controls cluster, the `CameraHistoryModal` header, and the `/control` Controls grid. |
| **Alarm notifications are an in-app stack, not toasts** | User decided 2026-05-23. The `react-hot-toast` flow stacked 3 un-dismissible cards in the top-right corner and covered the site dropdown. The replacement (`AlarmNotificationStack` — §6.4) is positioned below the header, has per-card close + "Close all", and a Mac-style collapsed peek when 2+ items are active. Don't route alarms back through `react-hot-toast`. |
| **Overview is viewport-fit, no page scroll** | User decided 2026-05-27. `h-[calc(100dvh-112px)]` + `overflow:hidden` on the shell; only the Recent Alerts list scrolls internally. Don't reintroduce vertical panel stacks that would push the page taller. |
| **Active alerts KPI === sum of Recent Alerts chip counts** | User decided 2026-05-27. Apply site+range scope at the page level so KPI and panel share the same source. Don't go back to a KPI that's "realm-wide but the panel below is site-scoped" — operators read the discrepancy as a bug. |
| **All alert surfaces use AlarmClipModal** | User decided 2026-05-27. Don't reintroduce `ClipModal` or a "just play the URL" variant. The rich modal carries the operator's whole triage workflow (preview / clip / live / controls / PTT / Ack / Resolve / Prev / Next / Download) — the old single-purpose modal forced operators to close and reopen for every action. |
| **Loader signal is user-action only, NOT React-Query `isFetching`** | User decided 2026-05-27. The 15s background poll would flash the loader every cycle for no operator-meaningful reason. Drive the soft loader overlay from `useTransition` pending states only. |
| **`SecureOpsHeader` carries no per-tower telemetry chips at all** | User decided 2026-05-30 → 2026-06-06. First temp+humidity were dropped (commit `6828a67`), then signal+battery — the entire env-chip strip is gone. Per-tower telemetry doesn't belong on the global shell because it follows the operator across every route (and re-reads on every poll); `/control`'s Environment panel is where the operator has device-picker context to act on it. Don't reintroduce any tower-attribute chip on the header. |
| **Camera tiles render a poster, not a live stream, until clicked** | User decided 2026-05-30 (commit `94da9a4`). Mounting `<img>`/`<video>`/`<iframe>` against the stream URL on every render fired N concurrent MJPEG/HLS requests when the Video wall opened. The poster (PlayCircle on a dim tile) keeps tiles cheap; the modal still plays the stream on open. Offline tiles bypass the poster and render `<CameraStream offline>` as before — the offline UI is part of the operator's status read. |
| **Video page defaults to FIRST tower checked, not all towers** | User decided 2026-05-30 (commit `94da9a4`). Same load-bounding reason as the poster — a wall of every camera in the realm mounts N concurrent streams at once. Tower chips are local page state, NOT `secureOpsStore.selectedTowerId` — the store is persisted to localStorage and shared with Control, which would override the default. Empty Set after the operator unchecks everything = show all towers (original semantics). |
| **AlertRow is memoized with primitive props, NOT a context object** | User decided 2026-05-31 (commits `76ae4cf` / `6828a67`). `React.memo`'s shallow compare treats a fresh `{asset, tower, site, clipUrl}` object as "changed" on every poll, defeating the memo entirely. Pass each value as its own prop, derived at the parent from cached Maps. Same rule for handlers — `useCallback` them once so identity is stable. Don't bundle them into an object "for cleanliness". |
| **Overview's default time range is `All`, not `24h`** | User decided 2026-05-30 (commit `6828a67`). Operators land on the page expecting to see everything; narrowing is a chip click away. The `Sites online` and `AI uptime` KPIs still ignore the range (they're now-state snapshots). |
| **One `useAlarms({})` query, derive OPEN client-side** | User decided 2026-05-30 (commit `6828a67`). The Overview and Alerts pages used to fire both `useAlarms({})` AND `useAlarms({status:'OPEN'})` every 15 s; the OPEN list is trivially derivable from the full list. Sharing one cache key also makes Overview → Alerts navigation instant. |
| **Infinite scroll on Recent Alerts + /alarms, not pagination** | User decided 2026-05-31 (commits `76ae4cf` / `6828a67`). Operators triage top-to-bottom and don't want to click a "next" button mid-scroll. PAGE_SIZE = 30, bump = 30, sentinel `IntersectionObserver` with `rootMargin: '200px 0px'` so the next page is fetched a touch before the operator hits the bottom. Filter changes reset to 30; mutation-driven shrinkage preserves scroll position. |
| **PTZ drives the camera through OR attributes, not an external HTTP controller** | User decided 2026-06-07. `ptzCommand` (`move_<dir>` then `stop`) + `movementDuration` (ms, default 3000 when missing) on the `PtzCameraAsset` itself, written via `useWriteAttribute`. The earlier `PTZ_BASE_URL` / `getPtzMoveUrl` / `getCameraPtzId` flow is gone — don't reintroduce it. The attribute path keeps PTZ inside OR's audit + permission story and avoids the mixed-content + cert headaches of a plain-HTTP AI-side controller. |
| **PTZ presses during an in-flight move are IGNORED** | User decided 2026-06-07. The hook's `inFlightRef` gate drops presses until the auto-stop completes. Don't replace this with cancel-and-restart or queueing — racing writes against OR makes the camera unpredictable and the operator can't tell which command is "live". The 150 ms double-tap throttle is gone (the gate replaces it). |
| **PTZ stops on unmount via a direct API call, not the mutation hook** | User decided 2026-06-07. `useEffect` cleanup fires `writeAttributeValue(assetId, 'ptzCommand', 'stop')` synchronously when a move is in flight at teardown. React Query's mutation hook can't be relied on while the component is unmounting; the raw axios call still goes out. Don't replace with a `mutate()` call in cleanup. |

---

## 4. The hierarchy: Site → Tower → IoT

```
SiteAsset                          (e.g. "Karachi District A")
├── TowerAsset (or GatewayAsset)   (e.g. "Tower 3 — North")
│   ├── CameraAsset                  (CAM-01 Gate entrance, fixed)
│   ├── CameraAsset                  (CAM-02 Perimeter NW, 360)
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
to render: `siteAsset`, `towerAsset`, `CameraAsset`, **`PtzCameraAsset`**,
`DoorLockAsset`, `AlarmAsset`, `LightAsset`, `BatteryAsset`, `SolarAsset`,
`BuzzerAsset`, plus the 14 original SMS IoT types (`HeatSensorAsset`,
`HumanPresenceSensorAsset`, `MotionSensorAsset`, `SmokeSensorAsset`,
`DoorSensorAsset`, `VibrationSensorAsset`, `SOSAsset`, `FanAsset`,
`PanelAsset`, `PlugAsset`).

**Two camera variants.** Cameras come in two flavours and are matched
together by the single helper `isCameraAsset(asset)` in
`src/utils/gateways.js`:
- `CameraAsset`    — fixed-position. Plays a single live stream.
- `PtzCameraAsset` — pan/tilt/zoom (180° or 360°). Plays a live stream
                     AND surfaces the directional pad described in §5.1e.

Every camera-iterating filter in the dashboard (Overview's Live Camera
Feeds, Video wall, Control's Cameras panel, Audit Log breadcrumb) goes
through `isCameraAsset`, so adding a third variant later is a one-line
change there. Use `isPtzCamera(asset)` for the PTZ-only branch.

Case-insensitive — `normalizeAssetType` (§11) uppercases the first letter of
whatever it gets.

### 5.1a. Shared camera tile + unified history modal

Every surface that renders a live camera tile — Overview's Live Camera
Feeds, the Video wall, Control's Cameras panel, the Audit Log breadcrumb
pop-out — uses the **same `CameraCard` component**
(`src/components/cameras/CameraCard.jsx`). Previously each page had its
own near-identical tile implementation; consolidating means a change to
the live-tile chrome (pills, footer, PTZ overlay) lands everywhere in
one edit.

Click anywhere on a tile opens the **unified `CameraHistoryModal`**
(`src/components/cameras/CameraHistoryModal.jsx`) — the same modal that
powers the Video tab, with the scrollable detection-history sidebar
(§5.2b), time-window chips, detection filter chips, and the three-state
player (live → snapshot preview → clip mp4, §5.2c). Owners of the modal
state are the `CameraCard` instances themselves — each card manages
`open` internally so parents don't have to plumb a `setFullCam` handler.

The card's footer always shows the camera display name with a small
maximise hint; pass `showTower` to also render the tower name on a
second line (Video wall uses this). The modal closes on Esc or backdrop
click. **No "Detail" / asset-page affordance** inside the modal — the
tile is monitoring-only; reach the asset detail page via the audit log
or alarm row breadcrumbs when you need Controls / History / Alarms tabs.

**Poster, not a live stream, until clicked (commit `94da9a4`).** The
card body **does not mount `<CameraStream>` on render** for online
cameras. Instead it renders a dim `PlayCircle` poster (centred icon
on a near-black tile). The modal still plays the stream on open via
the same `CameraStream` renderer. Rationale: each `<img>`/`<video>`/
`<iframe>` against the stream URL fires a network request on mount,
and the Video wall + Control's Cameras panel were mounting N
concurrent MJPEG/HLS feeds before the operator had picked a tile.

**Exception: offline cameras.** When `getCameraStreamUrl(camera)` is
empty OR `getCameraOffline(camera) === true`, the card falls through
to `<CameraStream url={url} offline={offline}/>` so the offline-state
UI (the existing "Camera offline" message) is preserved. That branch
doesn't open a connection — the offline render is local.

**The legacy `CameraFullView` simple-preview modal is no longer used.**
It still exists on disk for now but is unimported; future cleanup may
delete it. `ClipModal` (alarm-clip playback) is unchanged.

### 5.1e. PTZ directional pad (`PtzCameraAsset`)

When the asset is a `PtzCameraAsset`, the **modal's live view only**
overlays a four-button **directional pad** (up · left · right · down)
on the live frame. The pad is rendered by
`src/components/cameras/PtzControls.jsx` and lives above the bottom edge
so it doesn't overlap the browser's native `<video>` controls. The pad
hides on snapshot/clip playback frames so historical media doesn't look
interactive.

Tiles deliberately do **not** carry the d-pad — a tile's job is to be
glanceable, not actionable, and stacking a control over a 200-pixel
thumbnail is too fiddly. Operators open the modal to drive a PTZ feed.

A small **`PTZ` pill** appears in the tile's top-right pill cluster
(alongside `REC` / `ALERT`) and as a chip next to the camera name in the
modal header, so the operator knows at a glance which feeds are
controllable.

**Wire-up (2026-06-07).** Each button calls `onMove(direction)` where
direction is one of `'up' | 'down' | 'left' | 'right'`.
`CameraHistoryModal` and `AlarmClipModal` both pass
`usePtzMove(camera).move` as that callback. The hook drives the camera
entirely through **two OpenRemote attributes on the `PtzCameraAsset`
itself** — there is no AI-side HTTP controller anymore. The earlier
external endpoint (`{PTZ_BASE_URL}/{ptzId}/ptz/MOVE_*`),
`src/constants/ptz.js`, and the `getCameraPtzId` resolver in
`src/utils/gateways.js` were all removed.

**Required attributes on `PtzCameraAsset`:**

| Attribute | Type | Required? | Purpose |
|---|---|---|---|
| `ptzCommand` | text | **yes** | The hook writes one of `move_up` · `move_down` · `move_left` · `move_right` · `stop` here. Other values OR may accept (`preset_home`, `zoom_in`, `zoom_out`) aren't wired to the d-pad yet — the UI surface only carries four arrows. |
| `movementDuration` | text | optional | How long, in **milliseconds**, the hook holds the move command before writing `stop`. Missing / blank / non-numeric / `≤ 0` ⇒ default **3000 ms**. Parsed via `Number(raw)`. |

**Flow on press.** `usePtzMove` (`src/hooks/usePtzMove.js`):

1. Resolves `command = DIRECTION_COMMAND[direction]` (e.g. `move_left`).
2. Resolves `duration` from the camera's `movementDuration` attribute
   (3000 ms fallback).
3. Marks the move **in-flight** (`inFlightRef.current = true`).
4. Fires `useWriteAttribute().mutate({assetId, attributeName:'ptzCommand', value:command})`.
   The same optimistic-cache path every other write uses (§9a.2-style),
   so the camera's `ptzCommand` flips instantly in the cache and the
   network PUT goes out.
5. Schedules `setTimeout(autoStop, duration)`. On fire, writes
   `ptzCommand = "stop"` through the same mutation and clears the
   in-flight flag on settle.

**Press handling.**

- **While a move is in flight, further presses are ignored** — the
  operator waits for the auto-stop to complete (decided 2026-06-07 to
  avoid racing writes against OR and keep the camera predictable).
  Compare to the old fire-and-forget GET model, which let multiple
  nudges queue server-side.
- **Move write failure cancels the pending stop.** If the move PUT
  errors, `onError` clears `inFlightRef` and `clearTimeout`s the
  scheduled stop — there's nothing to stop because the camera never
  received the command. Trade-off: if the request actually reached the
  device but the HTTP response was lost, the camera could keep panning
  until the next intentional stop. Acceptable given OR's reliability
  inside the deployment.
- **Stable mutate reference.** The setTimeout's stop write goes through
  `mutateRef.current` rather than capturing `write.mutate` directly so
  parent re-renders (React Query polls every 15s, alarm list updates)
  can't put a stale callback into the closure.

**Cleanup on unmount / modal close.** A `useEffect(() => () => {...}, [])`
cleanup runs `clearTimeout(stopTimerRef.current)` and, if a move is
still in flight, fires a **synchronous direct `writeAttributeValue(
assetIdRef.current, 'ptzCommand', 'stop')`** (bypassing React Query's
mutation hook because the component is tearing down). This guarantees
the camera doesn't keep panning when the operator closes the modal mid-
move. `assetIdRef` and `mutateRef` are kept fresh by per-dep effects so
they read the latest values at cleanup time.

**Diagnostic logs (temporary).** The hook currently emits
`[PTZ] move`, `[PTZ] auto-stop firing`, `[PTZ] cleanup stop`, and
`[PTZ] {move|stop} write failed` to the console. Strip once the field
trial confirms stop is reliably reaching the device.

PTT (push-to-talk) is no longer routed through any camera attribute —
it's a per-tower `PttAsset.socketIP` `mumble://…` link (§5.5). The
legacy behaviour of opening a `pttUrl` iframe modal under a 360 / PTZ
camera was removed 2026-05-23.

### 5.1d. CameraStream URL routing

`src/components/cameras/CameraStream.jsx` is the single renderer used by
every live tile, the full-view modal, the Video wall, and `ClipModal`. It
picks an HTML element from the URL alone:

| URL shape | Element | Why |
|---|---|---|
| `.jpg` / `.jpeg` / `.png` / `.webp` / `.gif` | `<img>` | Snapshot or single-frame |
| **Extensionless path** — e.g. `https://.../api/cam238` | `<img>` | Backend MJPEG endpoint (`multipart/x-mixed-replace`). Browsers render MJPEG natively inside `<img>`; `<video>` can't decode it and would show a blank box. `<img>` also passes clicks through to the wrapping tile so the full-view modal still opens. |
| `.mp4` / `.webm` / `.ogg` / `.m3u8` / `.mov` | `<video>` | Standard HTML5 video containers (autoplay, muted, playsinline, loop). |
| Any other URL (e.g. `viewer.html`, `index.php`) | `<iframe>` | Vendor web UI / RTSP-to-HLS proxy page. Iframes capture clicks, so this branch is intentionally last-resort. |

**Why the extensionless rule matters.** Telco cameras are often proxied via
Cloudflare tunnels (`https://<random>.trycloudflare.com/api/cam238`). These
endpoints serve MJPEG but expose no extension, so a naive extension switch
would either (a) fall through to `<iframe>` and break tile-click → modal
open, or (b) try `<video>` and render a blank box because the browser
can't decode MJPEG as a video container. The path-segment heuristic
(`new URL(url).pathname` → last segment → no `.` ⇒ `<img>`) handles both
problems.

If a future deployment serves HLS or progressive MP4 from an extensionless
URL, we'll need an explicit hint (e.g. a `streamFormat` attribute) — the
URL alone won't tell us. For now, MJPEG is the assumed default for
extensionless paths.

### 5.2. CameraAsset attributes

| Attribute | Type | Required? | Purpose |
|---|---|---|---|
| `liveStreamUrl` **or** `streamUrl` | string | **yes** for live tiles | Rendered by `CameraStream` (see §5.1d for the full URL routing rules). Both attribute names are accepted — `getCameraStreamUrl(camera)` in `utils/gateways.js` tries `liveStreamUrl` first, then falls back to `streamUrl`. Every consumer (Overview tile, Control tile, Video wall card, full-view modal, Video modal history sidebar) reads through this helper. |
| `eventId` | datapoints (object) | **yes** for the Video modal history sidebar | Per-detection event stream stored as OR datapoints. Each datapoint value is `[{ id, label }]` or `{ id, label }` (id = AI-side event identifier, label = raw category — "person" / "animal" / anything else). The Video modal fetches this attribute via `useCameraEvents(cameraId, {from, to})` (`src/hooks/useCameraEvents.js`) using the OR datapoints endpoint with `type: 'ALL'`, and renders one history row per datapoint. The attribute key is centralised as `CAMERA_EVENT_ATTRIBUTE` in `src/constants/events.js` — rename in one place if the OR-side schema changes. See §5.2b for the full datapoints contract and §5.2c for how clip / snapshot URLs are derived from the event id. |
| `history` | array | **deprecated** (optional fallback) | Legacy `[{id, url, date, detection}]` array. Still read by the Overview's Live Camera tile + the Video wall tile for the on-tile ALERT pill (`isRecentHumanDetection` checks `history[0]` within the last 5 min). New deployments should populate `eventId` datapoints instead — the Video modal history sidebar **no longer reads `history`**, only `eventId` datapoints. See §5.2a for the legacy JSON shape. |
| `cameraVariant` | string | optional | `fixed` or `360`. Historical hint only — no longer routes any UI (PTT moved to per-tower, see §5.5). |
| `connected` | boolean | optional | If `false`, tile shows "Camera offline" instead of playing. |
| `ptzCommand` | text | **yes for `PtzCameraAsset`** | Written by `usePtzMove` to drive PTZ movement. Possible values: `move_up` · `move_down` · `move_left` · `move_right` · `stop` (and per the OR-side enum, also `preset_home` · `zoom_in` · `zoom_out` — not wired to the d-pad yet). The hook always pairs each `move_*` write with a follow-up `stop` write after `movementDuration`. See §5.1e. |
| `movementDuration` | text (ms) | optional, PtzCameraAsset only | How long, in milliseconds, `usePtzMove` holds a `move_*` command before writing `stop`. Missing / blank / non-numeric / `≤ 0` ⇒ default **3000 ms**. See §5.1e. |
| `eventsBaseUrl` | string | **yes** for clip / snapshot playback | Per-camera media-server origin that serves the clip / snapshot bytes — e.g. `https://100.84.108.142:8443`. Read via `getCameraEventsBaseUrl(camera)` in `utils/gateways.js` and fed to `getEventClipUrl` / `getEventSnapshotUrl` (the clip is always resolved from the event id as of 2026-06-20 — see §5.2c). Kept dynamic per camera like `liveStreamUrl`. **No fallback** — missing / malformed (not an http(s) origin or a `/`-relative path) ⇒ resolves to `null`, the builders return `null`, and the clip surfaces show a **black frame + play icon**; pressing play raises a friendly toast (no attribute names / no "OpenRemote"). Trailing slash is trimmed before building the path. See §5.2c. |

### 5.1b. Alarm clip modal — `AlarmClipModal`

> **2026-05-27:** the URL-only `ClipModal` was deleted. Every alert
> surface (Overview, `/alarms`, `/audit`) now opens
> `src/components/cameras/AlarmClipModal.jsx` instead. The previous
> 5-line clip modal grew into a triage cockpit — operators can review,
> act on, and navigate between sibling alarms without closing it.

**Anatomy (top → bottom):**

| Region | Contents |
|---|---|
| **Header** | Severity pill · alarm title · **Prev / Next chevrons + `N / M` counter** (only when queue length > 1) · Close button. Esc closes. ←/→ keys navigate (ignored when focus is inside `<video>` or a form field so they don't fight the video scrubber). |
| **Meta strip** | Row 1: `Site › Tower` breadcrumb · `🕐 HH:mm:ss · dd MMM yyyy (X min ago)`. Row 2: `📷 Camera name` · detection chip (`Human / Animal / Vehicle` detected — best-effort from `getAlarmDetectionLabel`) · **Quick controls cluster** (Door / Siren / Lights icon-only toggles + Push-to-talk button) anchored right-edge. |
| **Stage** | Black canvas, flex-fills remaining height. One of: snapshot `<img>` with centred play overlay (default when a snapshot URL resolves), native `<video controls autoPlay>` playing the clip mp4, or `CameraStream` on the live feed with red `● LIVE` pill top-left and (for `PtzCameraAsset`) the PTZ pad bottom-right. |
| **Footer** | Left: segmented `[Snapshot] [Clip] [Live]` tabs — only renders the tabs whose URL is available (no greyed stubs). Right: `[Ack] [Resolve]` (status-aware visibility, same as alert row) + `[Download clip]` (Clip tab only). |

**Sizing.** Modal is `w-[min(1280px,96vw)] h-[95vh]` — **fixed** height
(not max-height) so the stage flexes into the same generous area
regardless of whether the current view is an `<img>` (intrinsic size)
or `<video>` (300 px placeholder during load). Without the fixed
height the panel would shrink to natural content size and Live looked
smaller than Snapshot.

**Queue navigation (Prev / Next).** The queue is built from the
parent's `alarms` list filtered to:
1. Open alarms (already filtered upstream — parent passes
   `openAlarmsInScope`)
2. Same tower as the current alarm (`alarmBelongsToGateway`)
3. Has a resolvable clip URL (`getAlarmClipUrl`)

Sorted newest-first to match the row list. Parent stores only the
**alarm id** (`clipAlarmId`) — current / prev / next / position are
all recomputed from the live `alarms` array each render, so when an
alarm is acked/resolved the queue shrinks automatically.

The modal is keyed on `alarm.id` so a navigation step **remounts** —
fresh `view` (snapshot-first), fresh download state, fresh mutation
hook. This is the project's "reset state when a prop changes" idiom
(per §11 and the React-hooks lint rule).

**Auto-advance on Ack / Resolve.** Each action button captures
`next` at click time and uses per-call `onSuccess` to either
`onSelect(next.alarm.id)` or `onClose()` if at end. Toast fires from
the hook's onSuccess (action-specific copy via `successMessage`
variable) before the modal advances. There is **no auto-close
`useEffect`** — that pattern got replaced because it didn't have
access to the captured `next`.

**Snapshot URL.** `getAlarmSnapshotUrl(alarm)` →
`getAlarmEventId(alarm)` → `getEventSnapshotUrl(id)` — resolution
mirrors `getAlarmClipUrl` (structured `eventId` field → bare event id
in description / content). When no id is available the modal opens
straight on the Clip tab.

**PTZ pad.** Rendered only inside the Live view, only when
`isPtzCamera(asset)` is true. Uses the existing `PtzControls`
component + `usePtzMove(asset)` hook — same as the Video modal, so a
PTZ change ships to both surfaces.

**Quick controls cluster.** Compact icon-only buttons for Door /
Siren / Lights (28 × 28 px each, accent-tinted when active). Hides
the slot entirely when no matching child asset exists under the tower
(no greyed stubs). The siren resolver preserves
**BuzzerAsset-over-AlarmAsset preference** — same selection logic as
the (now-removed) Overview `RemoteControlPanel`. Writes go through
the same optimistic `useWriteAttribute` path.

**Push-to-talk button.** Sits next to the quick controls. As of
2026-06-08 this is no longer a hold-to-talk audio control — it's a
single 28 × 28 icon resolved via `resolvePttForTower` (§5.5). Three
render branches based on the status:
- `ok` → `<a href={socketIP}>` clicking which hands off to the OS
  Mumble client. No mic permission, no socket, no audio pipeline.
- `missing` → `<button>` with `title="PTT not configured for this
  tower"`. Click fires a toast pointing at the OR attribute.
- `invalid` → component returns `null` — the button is hidden so a
  malformed `socketIP` isn't presented as a working affordance.

**Download.** Native `<video>` carries `controlsList="nodownload"` so
the browser's built-in menu doesn't compete with our button. The
button fetches the clip as a blob (`fetch({mode:'cors'})`), creates a
`URL.createObjectURL` blob URL, triggers a temporary `<a download>`
click, then revokes after 1 s (Safari needs the delay). Filename via
`buildClipFilename`: prefers event id (matches media server path),
falls back to alarm id, then `yyyyMMdd-HHmmss` slug. Always `.mp4`.
CORS / network failure → opens in a new tab + toast `"Couldn't
auto-download (...). Opened in new tab."` so the operator can still
right-click → Save As.

### 5.1b.i. Alarm clip URL resolution

Every actionable alert row carries a **View clip** button when the
alarm references a recorded clip. The dashboard resolves the URL via
`getAlarmClipUrl(alarm, asset)` in `src/utils/alarms.js`, in this order:

1. **Structured field** on the alarm — `clipUrl`, `videoUrl`, or
   `streamUrl` (first non-empty wins). Recommended for new installations:
   the backend rule writes the clip URL straight onto the alarm as it's
   raised.
2. **Literal URL in the description** — first `http(s)://...` URL found
   in the `content` or `description` fields. Useful when the AI side
   dumps `"Person detected — https://media/.../clip.mp4"` into the alarm
   body. Returned verbatim.
3. **Bare event id in the description** — same id shape the Video page
   reads from the `eventId` datapoints stream (e.g.
   `1779269865.828876-zcx508`). The clip URL is always built from the
   event id via `getEventClipUrl(id, baseUrl)` —
   `${base}/api/events/${id}/clip.mp4` — pointed at the camera's
   per-camera media origin (`eventsBaseUrl`).

> **2026-06-20: event id always wins — time-range URL removed.** The
> alarm clip resolver no longer extracts `start_time` / `end_time` from
> the description or builds a `getTimeRangeClipUrl` time-window URL. When
> an event id is present the media server returns the recorded clip for
> that event directly, so `getAlarmClipUrl` returns
> `getEventClipUrl(eventId, baseUrl)` unconditionally. The
> `findTimestamps` helper and the `getTimeRangeClipUrl` import were
> deleted from `src/utils/alarms.js`; the camera's `beforeStartClip` /
> `afterEndClip` padding attributes are no longer read by the alarm path.
> `getTimeRangeClipUrl` itself still exists in `src/constants/events.js`
> (now unused — kept exported, harmless). The same change was made to the
> Video history page (see §5.2c). Steps 1 (structured field) and 2
> (literal URL) are unchanged — an explicit URL still wins verbatim.

The event-id matcher is **strict** — `\b\d{10,}(?:\.\d+)?-[A-Za-z0-9]+\b`,
i.e. unix timestamp (optionally fractional) + dash + alphanumeric suffix
— so arbitrary hyphenated numbers in alarm bodies (timestamps, counts)
don't false-match. The matcher also **strips URLs from the text first**
before searching for ids, so an event id embedded inside a URL path
(`https://media/api/events/1779…-zcx508/clip.mp4`) doesn't get re-extracted
and rebuilt against the wrong host — step 2 wins for that case.

When none of the three steps resolves a URL the View clip button hides
itself (no placeholder data). Click → `AlarmClipModal` plays the URL via
the same `CameraStream` renderer (see §5.1d for the full URL routing
table — same rules apply to clips, including extensionless MJPEG
endpoints).

**Description text is no longer rendered on alert cards (2026-05-22)
or in OS notifications (2026-05-23).**
The Overview's Recent Alerts panel, the `/alarms` page, and the `/audit`
page all show **only** the alarm title, breadcrumb (Site › Tower ›
Asset), timestamp, and the action cluster (clip icon / Ack / Resolve).
The free-text body is intentionally hidden — operators triage on the
title + asset + severity; the description rarely added signal and often
duplicated the title.

**OS notifications (2026-05-23)** follow the same policy.
`buildAlarmNotificationPayload(alarm)` in `src/hooks/useAlarmNotifications.js`
no longer concatenates `alarm.content` into the notification body — the
payload is now strictly `{ title: "🚨 <severity emoji> <alarm title>",
body: <sourceName | fallback> }`. The fallback `"Tap to open the alarms
page."` kicks in only when the alarm has no `sourceName` (rare — OR
populates it for any alarm tied to an asset). This keeps the OS
notification's two visible lines mirroring the in-app row exactly:
emoji + title on top, asset name underneath.

`getAlarmContentText(alarm)` in `src/utils/alarms.js` is still used by
`src/utils/auditEvents.js` to populate `e.detail`, so the cleaned text
is still indexed by the Audit Log search field and exported by the CSV
"Detail" column — it's just not rendered on the row or in notifications.
If a future UI wants to surface it again (e.g. an expanded-row drawer),
pull it back through that helper; the URL/event-id stripping still works.

The stripping rules `getAlarmContentText` applies (URLs out, bare event
ids out — both extracted only for the clip icon, never shown as text):

- `"Person at gate — https://.../cam02.mp4"` → search/CSV: `"Person at gate"`; row: title only + 🎬
- `"Person at gate — 1779269865.828876-zcx508"` → search/CSV: `"Person at gate"`; row: title only + 🎬
- `"Person at gate"` (no URL, no id) → search/CSV: `"Person at gate"`; row: title only, no 🎬

### 5.1c. Breadcrumb click behaviour

Site › Tower › Camera breadcrumbs are rendered differently depending on
where they appear:

- **Overview Recent Alerts + Alerts page** — **display-only**. Crumbs
  use `<span class="so-crumb so-crumb-static">` — same look, no hover
  effect, no cursor, no action. The only interactive element on alert
  rows is the 🎬 Clip icon (and Ack / Resolve).
- **Audit Log page** — **interactive buttons that trigger in-app store
  actions** (no route change):
  - Site click → `secureOpsStore.setSite(id)` → global filter updates,
    every panel re-scopes.
  - Tower click → `secureOpsStore.setTower(id)` → Overview's Live Camera
    Feeds, Remote Control, and Environmental Telemetry follow.
  - Camera click → opens the shared `CameraFullView` modal in place.

The split is deliberate: the operator's job on alert cards is to **act**
(Ack / Resolve / view clip). On the audit log it's to **investigate**,
where pivoting the dashboard scope is useful. Keeping alert-row crumbs
inert prevents accidental scope changes during a triage flurry.

### 5.2a. CameraAsset.history — JSON contract (legacy)

> **Status (2026-05-20):** Deprecated as the Video modal's history source.
> The modal now fetches per-detection events from the `eventId` datapoints
> stream (§5.2b). `history` is still read by the on-tile ALERT pill on
> the Overview's Live Camera Feeds and the Video wall tile via
> `isRecentHumanDetection` — it peeks at `history[0]` to decide whether to
> show the red ALERT pill. New deployments may safely omit this attribute;
> the pill simply won't render.

`CameraAsset.history` is an OpenRemote array attribute. Each element is
one detection clip, written by the AI side whenever it records a triggered
event. The dashboard consumes it read-only.

**Entry shape:**

```jsonc
{
  "id":        "string",       // stable per clip, dedupes re-pushes
  "url":       "string",       // playable URL (same renderer as liveStreamUrl)
  "date":      "ISO 8601 string OR ms-since-epoch number",
  "detection": "human" | "animal" | "other"
}
```

**Field details:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | Stable identifier — the modal uses it as the React `key` and to compare against `activeClip.id` when highlighting the row currently playing. If the AI side doesn't have a natural id, `${cameraId}-${date.getTime()}` works fine. |
| `url` | string | yes | Anything `CameraStream` can play — see §5.1d for the routing table. `.mp4` / `.webm` / `.m3u8` etc. → `<video>`; `.jpg` / `.png` etc. and extensionless MJPEG paths (e.g. `/api/cam238`) → `<img>`; other URLs → `<iframe>`. |
| `date` | ISO string OR number | yes | Parsed via `new Date(value).getTime()`. Both `"2026-05-16T09:42:01Z"` and `1779111721000` work. Entries without a parseable date are silently dropped. |
| `detection` | enum string | recommended | Case-insensitive. Anything other than `"human"` / `"animal"` falls into the `Other` bucket — including `null`, `undefined`, and unknown labels like `"vehicle"` (until/unless we add chips for those). |

**Ordering:** newest first. The Overview's `isCameraAlerting` and
`isRecentHumanDetection` peek at `history[0]` as the latest clip. The
Video modal's sidebar re-sorts defensively, but the rest of the
dashboard trusts `history[0]` is the most recent.

**Retention is the backend's job.** The portal never trims this array.
If clips accumulate forever the attribute payload grows — a backend
rule (or OR retention policy) should cap the array length (e.g. last
500 clips or last 14 days).

**Worked example.** Two cameras under Tower 3 — North, ~5 detections
each over the past day:

```json
{
  "id": "ToggleableCameraAsset_6tq7PgloJBRxUmCveeslIk_history",
  "name": "history",
  "type": "Array",
  "value": [
    {
      "id": "cam02-2026-05-16T09:42:01",
      "url": "https://media.smsiotpk.com/clips/cam02/2026-05-16T09-42-01.mp4",
      "date": "2026-05-16T09:42:01Z",
      "detection": "human"
    },
    {
      "id": "cam02-2026-05-16T09:30:14",
      "url": "https://media.smsiotpk.com/clips/cam02/2026-05-16T09-30-14.mp4",
      "date": "2026-05-16T09:30:14Z",
      "detection": "animal"
    },
    {
      "id": "cam02-2026-05-16T08:55:00",
      "url": "https://media.smsiotpk.com/clips/cam02/2026-05-16T08-55-00.mp4",
      "date": 1779093300000,
      "detection": "human"
    },
    {
      "id": "cam02-2026-05-16T03:12:47",
      "url": "https://media.smsiotpk.com/clips/cam02/2026-05-16T03-12-47.mp4",
      "date": "2026-05-16T03:12:47Z",
      "detection": "other"
    }
  ]
}
```

**How the dashboard uses each field at a glance:**

| Field | Used by |
|---|---|
| `id` | `key` for React lists, `activeClip` highlight, dedup logic |
| `url` | Playback in Video modal sidebar (click a clip → `setActiveClip` → `CameraStream` switches source via `key={url}` to force re-mount) |
| `date` | Sort order, "X min ago" labels, 24-h window for the Video tab detection filter chips, 5-min window for the on-tile ALERT pill |
| `detection` | Detection-type chip filter (page-level on Video, sidebar on the camera modal), colour of the clip pill / bullet |

If you start sending a new detection label (e.g. `"vehicle"`) it just
buckets into `Other` automatically — adding a dedicated chip is a
one-liner in `DETECTION_TYPES` inside `SecureOpsVideoPage.jsx`.

### 5.2b. CameraAsset.eventId — datapoints contract (canonical)

The Video modal's history sidebar is driven by the **`eventId` attribute**
on the camera, queried via the OR datapoints endpoint
(`POST /asset/datapoint/{cameraId}/{eventId}` with `type: 'ALL'`). The
hook `useCameraEvents(cameraId, {from, to})`
(`src/hooks/useCameraEvents.js`) wraps the call; the attribute name is
exported as `CAMERA_EVENT_ATTRIBUTE` from `src/constants/events.js` so
an OR-side rename is a one-line change.

**Why datapoints, not an array attribute.** `history` blew up the
attribute payload as clips accumulated and forced full-list rewrites
for every new detection. Datapoints append cheaply, the OR retention
policy handles cap / TTL automatically, and a time-window query lets
the operator fetch only what they're looking at instead of every clip
ever recorded.

**Per-datapoint shape returned by OR:**

```jsonc
{
  "x": 1779269865828,         // ms since epoch (timestamp)
  "y": [                       // value column from the OR datapoints table
    { "id": "1779269865.828876-zcx508", "label": "person" }
  ]
}
```

The parser in the Video modal (`unwrapEventValue` +
`SecureOpsVideoPage.jsx` history `useMemo`) is intentionally lenient
and accepts every shape OR can ship:

| Wire shape | Why it happens |
|---|---|
| `{ x, y }` — object form | Default for modern OR server versions |
| `[ ts, value ]` — tuple form | Older OR versions / chart endpoints |
| `y` as `[{ id, label }]` | Native OR list-of-object value (what you see in the OR datapoints table) |
| `y` as `{ id, label }` | Already-unwrapped object |
| `y` as `'{"id":"…","label":"…"}'` | OR stringifies complex types for some attribute kinds |
| `y` as `"1779269865.828876-zcx508"` | Bare event id string (no label — falls into `Other`) |

**Label mapping.** Raw AI labels are normalised to the three telco
buckets via `normalizeEventLabel` in `src/constants/events.js`:

| Raw label | Bucket |
|---|---|
| `person`, `human` | `human` |
| `animal` | `animal` |
| anything else (`vehicle`, `null`, …) | `other` |

To add a new dedicated bucket, extend both `LABEL_MAP` in
`src/constants/events.js` *and* `DETECTION_TYPES` in
`SecureOpsVideoPage.jsx`.

**Pagination.** The OR datapoints endpoint has **no cursor** — it's a
time-window query. The modal "pages" in two layers:

1. **Server-side (time window).** A `Last 24h / 7d / 30d` chip row
   anchors a fresh `Date.now()` as `to` and subtracts the window for
   `from`. Default is **24h** so first-open is cheap on busy cameras.
   The anchor is stored in component state — recomputing on every
   render would shift the React Query key every millisecond and
   thrash the cache.
2. **Client-side (rows per page).** Within the fetched window the
   sidebar reveals `PAGE_SIZE = 20` rows at a time; a "Load more
   (N remaining)" button appends the next 20. Changing the time
   window, the detection chips, or the underlying response resets
   the visible count back to 20 (handled via the
   `resetSignature` / "reset state when a value changes" pattern,
   not a `setState` in `useEffect`, per the `react-hooks/set-state-in-effect`
   lint rule).

**Refresh.** The header has a small spinner-icon refresh button that
re-anchors `to = Date.now()` and calls `refetch()`. There's also a
60s `refetchInterval` for the modal's "live" feel.

**Dev-mode diagnostic.** `useCameraEvents` logs
`[useCameraEvents]` to the console with the asset id, attribute name,
window, count, and the first three points — open DevTools when an
empty sidebar surprises you to confirm the attribute key is right.

**404 handling.** When the camera has no `eventId` attribute (or that
attribute has no `STORE_DATA_POINTS` meta), OR returns `404`. The hook
catches that one status, returns `[]` from `queryFn`, and never sets
the query into `isError`. The modal sidebar then falls through to its
normal empty state and shows **"No history data found for this
camera."** — same copy used when the window genuinely has zero
events. The previous red "Couldn't load events for this camera"
message and the dev-mode attribute-name hint are gone; the operator
shouldn't have to distinguish "attribute missing" from "attribute
empty" when deciding what to do next (nothing). Any other status
(401/403/5xx) still rejects normally and surfaces as an error.

### 5.2c. Event clip + snapshot URLs

Clip and snapshot media live on a **separate media server** from the
OR manager. The **media-server origin is per-camera** — read from the
camera's `eventsBaseUrl` attribute (§5.2) via
`getCameraEventsBaseUrl(camera)` in `utils/gateways.js`, so each camera
points at its own host. **There is no fallback constant** — only the
path layout is centralised in `src/constants/events.js`:

```js
export const CAMERA_EVENT_ATTRIBUTE = 'eventId';

// Each builder takes the resolved per-camera base URL. The base is
// trimmed (trailing slash stripped); a missing / blank base ⇒ null.
getEventSnapshotUrl(id, base)          → `${base}/api/events/${id}/snapshot.jpg`
getEventClipUrl(id, base)              → `${base}/api/events/${id}/clip.mp4`
getTimeRangeClipUrl(camId, s, e, base) → `${base}/api/${camId}/start/${s}/end/${e}/clip.mp4`
```

Resolution: `getCameraEventsBaseUrl(camera)` returns the trimmed
`eventsBaseUrl` attribute when it's a usable origin (an http(s) URL or a
`/`-relative reverse-proxy path), or **`null`** when the attribute is
missing **or malformed**. The callsites that resolve a base from the
linked camera are `CameraHistoryModal` (Video page),
`getAlarmClipUrl(alarm, asset)` and `getAlarmSnapshotUrl(alarm, asset)`
in `utils/alarms.js`.

**Missing / malformed config behaviour (no fallback, no placeholder,
no jargon).** When the base resolves to `null`, all three builders
return `null`. The UX is deliberately uniform across surfaces and never
exposes the attribute name or "OpenRemote" to the operator:

- **`CameraHistoryModal` (Video / Control / audit camera pop-out).** The
  full detection-history list still renders exactly as normal. Selecting
  a row shows a **black frame with the play icon** instead of a snapshot;
  pressing play raises the toast `EVENT_CLIP_MISSING_MESSAGE` — *"Event
  clip configuration is missing. Please contact your administrator."*
  The live stream still plays (it comes from `liveStreamUrl`).
- **Alarm surfaces (Overview / `/alarms` / `/audit`).** The clip icon is
  gated on **`hasClip`** = a resolvable clip URL **or** an event id (via
  `getAlarmEventId`) — so an event-backed alarm still shows the icon even
  when the base is unconfigured. Opening it lands on the Clip tab with
  the same black-frame + play-icon → toast behaviour as the history
  modal. The Download button is hidden while no clip URL exists. A clip
  URL provided directly (literal URL / structured field) is unaffected
  and plays normally.

`EVENT_CLIP_MISSING_MESSAGE` is exported from `src/constants/events.js`
so the wording lives in one place. The `hasClip` flag is precomputed
into each page's `alarmContextMap` (and the audit event payload)
alongside `clipUrl`.

**Clip URL is always built from the event id (2026-06-20).** The Video
history sidebar (`CameraHistoryModal`) builds each row's clip URL with
`getEventClipUrl(eventId, eventsBase)` — `${base}/api/events/${id}/clip.mp4`.

> **2026-06-20: time-range URL removed (Video + alarm surfaces).** The
> history `useMemo` no longer reads the datapoint's `start_time` /
> `end_time` or the camera's `cameraId` / `beforeStartClip` /
> `afterEndClip` attributes, and no longer calls `getTimeRangeClipUrl`.
> The media server returns the recorded clip for an event id directly, so
> both `CameraHistoryModal` and `getAlarmClipUrl` (§5.1b.i) now resolve
> the clip via the event id unconditionally. `getTimeRangeClipUrl` is
> still exported from `src/constants/events.js` but has no callers.
> `unwrapEventValue` still parses `start_time` / `end_time` into the entry
> (harmless, unused). The snapshot URL was always event-id based and is
> unchanged.

**Modal playback flow (three-state player):**

| Operator action | Player shows | URL source |
|---|---|---|
| Modal opens | Live stream | `liveStreamUrl` / `streamUrl` |
| Click a clip row in sidebar | Snapshot preview + centred play overlay | `getEventSnapshotUrl(eventId)` |
| Click the play overlay (or anywhere on the snapshot) | Clip mp4, autoplaying | `getEventClipUrl(eventId)` |
| Click "Show snapshot" | Snapshot again | `getEventSnapshotUrl(eventId)` |
| Click "← Back to live" | Live stream | `liveStreamUrl` |

The snapshot-first preview is deliberate: it's a cheap peek that
doesn't pull video bytes until the operator commits, and it lets the
operator scan through many events without burning bandwidth on each
one. Switching the time window or picking a different sidebar clip
always resets to the snapshot-preview step (avoids mid-playback
confusion). The whole snapshot area is the click target — the
centred disc is just the visual affordance.

The `<video>` / `<img>` element selection is still handled by
`CameraStream` (§5.1d) — `.mp4` → `<video>`, `.jpg` → `<img>`.

**Mixed-content caveat (HTTPS deployments).** If the portal is served
over HTTPS, browsers block plain-HTTP video/snapshot requests from
the events host as "mixed content" (`<video>` always; modern Chrome /
Firefox also block `<img>`). Three fixes, cheapest first:

1. **Reverse-proxy** the events host through the dashboard origin
   (Vite dev proxy + nginx/caddy in prod). Set each camera's
   `eventsBaseUrl` to the relative path (e.g. `/events`) and the
   browser only sees one HTTPS origin.
2. **Give the events host its own TLS cert** (Let's Encrypt /
   certbot, or front with Cloudflare) and set `eventsBaseUrl`
   to `https://…`. Cleanest long-term — `<video>` and `<img>` need
   no CORS headers for cross-origin playback as long as the cert is
   valid and the SAN matches the hostname. (The current value
   `https://100.84.108.142:8443` is a bare-IP origin whose cert
   almost certainly won't match — expect a trust prompt until this
   is addressed.)
3. **Serve the portal over HTTP.** Works but throws away TLS for OR
   auth too — not recommended.

### 5.3. TowerAsset attributes

| Attribute | Type | Required? | Purpose |
|---|---|---|---|
| `connected` | boolean | optional | `false` puts the tower in the "Offline" badge + bumps the Sites-online KPI. |
| `signalStrength` | number (dBm) | optional | **Currently unread** — the header chips that consumed it were removed (§6.3). Kept in the schema for future panels. |
| `batteryLevel` | number (%) | optional | **Currently unread** — same as `signalStrength`. The on-screen battery reading now comes from a `BatteryAsset` child via `energyLevelPercentage` (§9a.2), not this tower-level attribute. |
| `aiHeartbeatAt` | timestamp | optional | Drives the "AI uptime" KPI (falls back to 100% if any tower in scope reports a recent heartbeat). |
| `aiUptime30d` | number (%) | optional | If present, used directly for the AI uptime KPI. |
| `connectionType` / `network` | string | optional | Shown next to the tower in Site Status (e.g. "4G"). |
| `auditLog` | array | optional | `[{ts, actor?, action?, target?, tag?}]`. Backend rules write to this on every device write so device-state-change rows can show up persistently in the audit log without a per-attribute datapoint fetch. |

**Note on temperature + humidity:** these do NOT live on the TowerAsset
directly. Each tower carries a **`HeatSensorAsset` child** (the packaged
temp/humidity sensor inside the IP67 box). The Control page's
Environment card reads `temperature` and `humidity` from this child
asset via `getWeatherAssetForTower(tower, assets)`. If a tower has no
HeatSensorAsset child, the tile hides itself. (The header used to
mirror these chips but no longer does — see §6.3.)

**Note on battery (on-screen reading):** the `/control` Environment
panel shows the Battery tile when the tower has a per-tower
**`BatteryAsset` child** (matched case-insensitively via
`normalizeAssetType(getCustomAssetType) === 'BatteryAsset'`); if there's
no BatteryAsset child, the tile hides itself. **The displayed value is
currently simulated** from the time of day — `energyLevelPercentage`
(and the TowerAsset-level `batteryLevel`) are **not read** for now. See
§9a.2 for the solar/battery model and how to switch back to the real
attribute.

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

### 5.5. Push-to-talk anchor

> **2026-06-08 rewrite.** The previous `usePushToTalk` hook,
> `AudioWorklet` PCM pipeline, `wss://` socket, and PC-side
> `server.js` are all gone (see top-of-file changelog + §3
> decisions). PTT is now a **protocol-handler link** —
> `<a href="mumble://…">` — and the dashboard never touches the mic.

PTT is **per-tower, not per-camera**. Each tower may carry a single
`PttAsset` child whose `socketIP` attribute holds a full **`mumble://`
URL** — typically `mumble://user:pass@host:port/`. Clicking the PTT
control opens the OS Mumble desktop client with the embedded
credentials; the operator's actual talk session happens entirely in
Mumble, not in the browser.

**Asset contract.** The PTT asset is matched **case-insensitively** by
either:

| Match | What it accepts |
|---|---|
| `customAssetType` lowercased equals `pttasset` | `PttAsset`, `pttAsset`, `PTTASSET`, … |
| display `name` lowercased equals `ptt asset` or `ptt assest` | `PTT Asset`, `ptt asset`, `Ptt Asset`, also the common `PTT Assest` typo |

Resolution lives in `findPttAssetForTower(tower, allAssets)` in
`src/utils/gateways.js`. It walks `isDescendantOfGateway` rather than
`pickGatewayChildren` because `PttAsset` is **not** in `DEVICE_TYPES`
(it's a configuration asset, not a controllable device).

**Resolver — `resolvePttForTower(tower, allAssets)`** in
`src/utils/gateways.js` — returns `{ status, href }` with three states:

| Status | When | What the UI does |
|---|---|---|
| `ok` | `socketIP` matches `^mumble:\/\//i` after trim. | `href` is the trimmed value; callsite renders an `<a href={href}>` that opens the OS handler. |
| `missing` | no PttAsset under the tower OR `socketIP` is blank / non-string. | `href = null`; callsite renders a clickable `<button>` that toasts `"PTT not configured for this tower."` on click. **We don't disable** — a clickable button beats a dead one because it tells the configurer what to fix. |
| `invalid` | `socketIP` non-empty but doesn't start with `mumble://`. | `href = null`; **callsite returns `null` (hides the control entirely).** A broken affordance the operator can't fix from the UI shouldn't be visible. |

The mumble-scheme check is intentionally lenient (no host / port /
auth validation). The OS handler is the authority on whether a given
`mumble://` URL actually opens; we only filter out values that
clearly aren't protocol links at all.

**Three render surfaces (same resolver, same rules):**

| Surface | File | Shape |
|---|---|---|
| `/control` Controls grid tile | `src/pages/SecureOpsControlPage.jsx → PttTile` | `.so-control-tile` chrome alongside Door / Siren / Lights. State line shows `Ready` (accent) or `Not configured` (warning). Renders in the **default (inactive) tile state** — no `data-active="true"` — so it matches the other Controls tiles for symmetry (changed 2026-06-20; previously the `ok` tile was hardcoded `data-active="true"`, which made it look permanently selected). |
| `AlarmClipModal` quick-controls | `src/components/cameras/AlarmClipModal.jsx → PttButton` | 28×28 icon button in the modal's right-edge quick-controls cluster. Uses the existing `.so-clip-modal-quick-btn` classes. |
| `CameraHistoryModal` header | `src/components/cameras/CameraHistoryModal.jsx → PttHeaderButton` | `.audit-btn` styled button placed next to the Close button. Mounts on every surface that opens the camera popup — Video wall, `/control`'s Cameras panel, Overview's (legacy) Live Camera Feeds, audit-log breadcrumbs. |

Each component calls `resolvePttForTower(tower, assets)` (the
`tower` prop is the active tower; `assets` comes from
`useAssets({})` which is already cached). Each one early-returns
`null` on `invalid`. Each one renders an anchor on `ok` and a
toast-button on `missing` — UX is identical across all three so
operators learn the affordance once.

**Control grid count handling.** `ControlsPanel` resolves the
status once at the parent level (`useMemo`) and adds 1 to the
header's `N controls` count only when `status !== 'invalid'`, so the
header stays in sync with what's actually rendered. The empty-state
copy (`"No controllable devices under this tower."`) reappears only
when there are zero device tiles AND PTT is hidden.

**No global fallback, no environment variable.** Each tower's PTT
target is whatever `socketIP` says — there is no `PTT_WS_URL`,
no `.env`-level override, no "deployment-wide default" to fall back
to. A new tower without a `PttAsset` simply shows the `missing`
state until one is created in OR.

**No mixed-content caveat anymore.** The previous flow needed
`wss://` (and so HTTPS + TLS on the PC speaker), or a reverse proxy.
A `mumble://` link doesn't trigger any same-origin / content-policy
check — the browser hands it straight to the OS handler regardless of
the dashboard's scheme.

---

## 6. Routing + the SecureOps shell

### 6.1. Routes (`src/App.jsx`)

| Path | Component | Status |
|---|---|---|
| `/` | `SecureOpsOverviewPage` | **built** |
| `/video` | `SecureOpsVideoPage` | **built** |
| `/alarms` | `SecureOpsAlertsPage` | **built** |
| `/legacy-alarms` | original `AlarmsPage` (legacy) | reachable by URL, not in nav |
| `/control` | `SecureOpsControlPage` | **built** |
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

1. **Brand row:** SMS Sentinel AI logo (clickable → `/`) · `● Live` pill · **`All Sites (N) ▼`** dropdown.
2. **Tab row:** the six tab links (NavLink, active state cyan underline). **No telemetry chips.**

**History — env chips removed entirely.** Row 2 used to carry 4 chips
(temp · humidity · signal · battery) for the active tower; temp + humidity
were dropped in commit `6828a67`, then signal + battery in commit `f27d12a`.
The header no longer reads `selectedTowerId`, `signalStrength`,
`batteryLevel`, or the `HeatSensorAsset` child of any tower — it's now
fully scope-agnostic. Per-tower telemetry lives on `/control`'s
Environment panel (§9a.2). The KPI strip on `/` carries the realm-wide
health signal (Sites online / AI uptime). The `useEffect` for telemetry
and the `readNumber` helper are both gone from this file.

The dropdown's options are: "All Sites (N)" plus every SiteAsset by display
name. When no SiteAssets are configured, the count falls back to the total
tower count (via `pickAllTowerCount`).

### 6.4. Alarm notification stack

`src/components/notifications/AlarmNotificationStack.jsx` — mounted in
`DashboardLayout` alongside the `Toaster`, but ONLY this stack carries
alarm notifications. The previous `react-hot-toast`-based flow stacked
3 un-dismissible cards in the same top-right region as the site
dropdown, blocking it until they auto-expired — the new stack lives
**below** the sticky header so the dropdown stays clickable, every
card has its own close button, and "Close all" empties the list in
one click.

**Layout:**

- Fixed position: `top: 124px; right: 16px; width: 360px; z-index: 20`.
  The header sits at z-30, the site dropdown menu at z-40 — both
  overlay the stack when their geometry intersects (e.g. an open
  site dropdown extends down past the header).
- Container is `pointer-events: none`; only the visible cards opt
  back in via `.alarm-stack > *`. Empty gaps in the stack column
  click through to the page beneath.
- **1 alarm** → single card.
- **2+ alarms** → Mac-style collapsed peek: top card fully visible,
  two more shifted down (`top: 8px`, `top: 16px`) with scale-down
  (1.0 → 0.92) and opacity fade (1.0 → 0.56). Click anywhere on the
  stack (or Enter/Space when focused) to expand into a vertical
  list. The Expand/Collapse button in the header bar toggles
  programmatically.
- Always-visible header bar: count (`3 alarms`), Expand/Collapse
  (hidden when only 1 item), red **Close all** button.
- Per-card X dismisses one item; the collapsed view exposes X on
  the top card only.
- Clicking a card body (when expanded) navigates to `/alarms`.

**Data flow.**

```
useLiveEvents (alarm watcher diff)
  ↓ for each fresh alarm
useAlarmNotificationsStore.getState().push(alarm)
  ↓ stored as { id, alarm, ts }
AlarmNotificationStack (subscribed to store)
```

The store (`src/store/alarmNotificationsStore.js`) is a tiny Zustand
slice: `items[]`, `push(alarm)` (de-dupes by alarm id, caps at
`MAX_ITEMS = 25`), `dismiss(id)`, `dismissAll()`. No persistence —
this is purely a transient UI overlay, not a mutation against
OpenRemote. Dismissing a card here doesn't acknowledge the alarm;
the alarm itself stays in OR's history and on the `/alarms` page
until the operator Acks or Resolves it.

**Why a custom stack over `react-hot-toast`.** `react-hot-toast`
doesn't expose collapsed/expanded states, doesn't natively support a
"close all" action across its toasts, and its positioning options
conflict with the site dropdown's location. Building our own is
~250 lines including CSS and lets every interaction match the
operator's expectations (close, close all, expand, click-to-jump).

**Suppressed on the Alerts page.** `useLiveEvents` skips the push
when `location.pathname.startsWith('/alarms')` — when the operator
is already looking at the alerts inbox, surfacing the same alarms
as floating cards is redundant.

**OS notifications unchanged.** `fireAlarmNotification` still runs
per fresh alarm (when the tab is hidden, permission is granted, and
the user has enabled them in Settings). Only the in-app surface
moved.

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

## 8. The Overview page

`src/pages/SecureOpsOverviewPage.jsx` — mounted at `/`. **Viewport-fit** —
the page is sized `h-[calc(100dvh-112px)]` and `overflow:hidden`; only the
Recent Alerts list (and the Device Summary sidebar if it overflows) scrolls
internally. The page itself never scrolls.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ⏱ Time range  [Today] [24h] [7d] [30d] [All*]                                │   chip strip
├──────────────────────────────────────────────────────────────────────────────┤
│ Sites online · Active alerts·All · Human detections·All · AI uptime          │   KPI strip
├────────────────────────────────────────────────────┬─────────────────────────┤
│ Recent alerts · All time      N active   [Reset]   │  Device summary         │
│   Severity   [High N] [Med N] [Low N]              │   ┌─────────────────┐   │   2-col grid
│   Tower      [Tower 1] [Tower 2] [Tower 3] …       │   │ Doors unlocked  │   │   (lg+)
│   ────────────────────────────────────────────     │   │  N unlocked …  N│   │
│   ┌──────────────────────────────────────────┐    │   ├─────────────────┤   │
│   │ alert row · breadcrumb · time · actions  │    │   │ Lights on       │   │   stacks vertically
│   │ alert row · …                            │    │   │  N on …        N│   │   below lg
│   │  …                                       │    │   ├─────────────────┤   │
│   │ Loading more… (123 remaining)            │    │   │ Sirens sounding │   │
│   └──────────────────────────────────────────┘    │   │  N sounding   N │   │
│   All alerts ›                                     │   └─────────────────┘   │
└────────────────────────────────────────────────────┴─────────────────────────┘
```

Layout: `grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]`,
`flex-1 min-h-0`, gap-4. Each panel is its own internal-scroll container.
Default time range is **All** (changed from `24h` in commit `6828a67`).

The five panels that used to live here are gone — none deleted in spirit,
just relocated:

| Old panel | Where it lives now |
|---|---|
| Live Camera Feeds | `/video` page (full grid) and inside `AlarmClipModal` (per-alarm Live tab) |
| Site Status | (dropped) — the `Sites online` KPI carries the realm-wide signal |
| Remote Control (Door/Siren/Lights) | `AlarmClipModal` compact Quick controls (§5.1b) and `/control` page (full tiles) |
| Push-to-talk card | `AlarmClipModal` compact PTT button (§5.1b), `CameraHistoryModal` header (§5.5), and the `/control` Controls grid tile (§9a.2 + §5.5) |
| Environmental telemetry | `SecureOpsHeader` chips (§6.3) — temp/humidity/signal/battery |
| Audit log preview | `/audit` page (link in the alert panel footer) |

### 8.1. Time-range filter

`TimeRangeBar` (a `useState('all')` + `useTransition`) sits above the
KPI strip. Options: `Today | 24h | 7d | 30d | All` — **default `all`**
as of commit `6828a67` (was `24h`). Fresh load now surfaces every alert
in the realm; the operator narrows via the chips. The setter is wrapped
in `startRangeTransition` so React keeps the previous KPI / alert list
visible during the re-derive instead of flashing an empty intermediate
frame; `isRangePending` is surfaced to the Recent Alerts panel as a
soft loader overlay (§8.5).

The range drives:
- The **Active alerts** KPI count + critical/warning split
- The **Human detections** KPI count + delta vs the immediately-preceding
  equal window
- The Recent Alerts list (alarms filtered to `createdOn ≥ rangeStart`)

The **Sites online** and **AI uptime** KPIs **ignore** the range —
they're "now" snapshots (current state of the realm), not time-bound
counts. Filtering them by `createdOn` would be misleading.

Window computation lives in `getRangeWindow(range)`, which returns
`{start, prevStart, label, shortLabel}`. `today` snaps to local
midnight (so the count doesn't drift second-by-second); rolling
windows use `new Date().getTime()` as the anchor (`Date.now()` would
trip the `react-hooks/purity` lint rule inside the consuming
`useMemo`). For `all`, both timestamps are `null` — the delta line
collapses to `All time`.

### 8.2. KPI strip

All four KPIs derive from the parent-level scope filter
`scopeAlarmsToTowers(filterAlarmsByCreatedOn(...))` so they're
consistent with the Recent Alerts panel (specifically: **`Active
alerts` total === sum of the panel's High + Medium + Low chip
counts**). Picking a site or changing the range shrinks both the KPI
and the panel chips in lockstep.

| Card | Derivation |
|---|---|
| **Sites online** | `online/total` of **SiteAssets across the entire realm** (not scoped — realm-wide health indicator). Online unless (a) SiteAsset has `connected === false`, OR (b) it has towers and every one is offline. A tower is online unless `connected` is explicitly `false` (undefined ⇒ online — avoids phantom-offline on freshly-added assets). Subline names the first offline site + `+more`. No SiteAssets in realm → synthetic "Towers" entry from every gateway/towerAsset. |
| **Active alerts · `<range>`** | `openAlarmsInScope.length` — open alarms in current site + range scope. Subline: `"N critical, M warning"` where critical = CRITICAL + HIGH (`isHighPrioritySeverity`). **Clickable** — Link to `/alarms`. Label changes per range (e.g. `Active alerts · 24h`). |
| **Human detections · `<range>`** | CRITICAL + HIGH alarms in scope+range (`isHighPrioritySeverity`). On this deployment the AI side raises human-detection events at HIGH severity, so this is the KPI that maps to "people seen on cameras". Subline: `+N vs prev <range>` (delta vs the immediately-preceding equal window — both windows pass through the same severity + scope filter). For `All` the delta is meaningless, subline shows `All time`. Lower-severity alarms (animal / vehicle / "other") still appear in the Recent Alerts list — they're just not inflating the KPI. |
| **AI uptime** | Average of `TowerAsset.aiUptime30d` across scope, or 100% if any tower reports a recent `aiHeartbeatAt`. Drops to `—` when neither exists (no-placeholder rule). Ignores range filter. |

`KpiCard` accepts an optional `to` prop to render the card as a `<Link>`
with a subtle hover lift — currently used only by Active alerts.

### 8.3. Recent Alerts panel

Full-width inside the viewport-fit shell. Flexes to fill remaining height
after the time-range bar + KPI strip — `.so-panel-fit` + `.so-alert-list`
flex chain (see §14 *Styling conventions* for the pattern).

**Header:** title `Recent alerts · Last 24h` (range label) · `N active`
counter (or `X of Y active` when filters are on) · `Reset` button (only
when filters are on) · small `Loader2` spinner during transitions
(§8.5).

**Filter rows** (inline below the header, mirroring the `/alarms` page —
same `.audit-chip` styling, same `ToggleChip` primitive, same
`SEVERITY_GROUPS` config with `expandSeverity` helper):

- **Severity** — multi-select chips `High` / `Medium` / `Low` with counts.
  CRITICAL folds into HIGH (three buckets map cleanly to three colour rails).
- **Tower** — multi-select chips for every tower in scope. Hides when scope
  has no towers.

Both setters wrap in `useTransition` so the list stays visible during the
re-derive — clicking a chip with thousands of alarms doesn't blank the panel.

**Rows.** Same `AlertRow` component as before: severity-colored left rail,
`Site › Tower › Asset` breadcrumb (display-only `.so-crumb-static` chips),
`HH:mm · X min ago` time, severity pill, action cluster (`Clip` /
`Ack` / `Resolve`). Row dims while its own mutation is pending (`data-pending`).
**`AlertRow` is wrapped in `React.memo`** as of commit `6828a67`; see §8.7
for the prop-shape rules that make the memo effective.

**Infinite scroll** (commit `6828a67`). First render = **30 rows** (`PAGE_SIZE`).
An `IntersectionObserver` on a sentinel `<div>` at the list bottom bumps
the visible count by 30 (`VISIBLE_BUMP`) each time it enters view. The
observer's `root` is **the scrolling element itself** (`.so-alert-list-wrap`)
via a `scrollRootRef` — the page doesn't scroll, the list does, so a
viewport-root observer would never fire. `rootMargin: '200px 0px'`
prefetches the next page just before the operator hits the bottom. While
more rows exist, a "Loading more… (N remaining)" line is rendered next to
the sentinel.

- **Filter changes** (severity / tower chips) reset visible count back to
  `PAGE_SIZE` via the **"reset state when a value changes" pattern**
  (compare `filterSig` against a stored `prevFilterSig` and call
  `setVisibleCount(PAGE_SIZE)` directly during render). NOT a setState in
  `useEffect` (lint flags that as the cascading-renders anti-pattern).
- **Mutation-driven shrinkage** (Ack / Resolve) does NOT touch the filter
  signature, so `visibleCount` is preserved — the operator's scroll
  position survives an ack.
- Header counter widens to `<visible>/<sorted> of <total> active` while
  filtering, and to `<visible> of <sorted> active` while more pages exist
  unfiltered. Plain `<sorted> active` when fully loaded and unfiltered.

**Severity colors:** **CRITICAL/HIGH = red, MEDIUM = yellow, LOW = grey**.

**Action buttons (Ack / Resolve)**
- Status-aware visibility: `OPEN` → both, `ACKNOWLEDGED`/`IN_PROGRESS` → only Resolve, `RESOLVED`/`CLOSED` → none.
- Pending state: clicked button shows `Loader2` + label flips to "Acking…" / "Resolving…"; other actions on the row disable.
- Action-specific toasts: `"Alarm acknowledged — <title>"` / `"Alarm resolved — <title>"` (via the `successMessage` variable on `useUpdateAlarmStatus` — see §10b).

**Clip button.** Opens `AlarmClipModal` (§5.1b) for the row's alarm,
seeding the modal's tower-scoped queue (§8.4).

**Footer:** `All alerts ›` link to `/alarms` (the full inbox with search
+ all the same filters in a richer layout).

### 8.4. Modal queue handoff

The clip modal is state-managed by `RecentAlertsPanel` — but instead of
storing the full payload (`{alarm, asset, tower, site}`), it stores only
the **alarm id** (`clipAlarmId`). Each render the panel rebuilds the
queue context from the live `alarms` array:

```
clipAlarmId          → alarms.find(a => a.id === clipAlarmId)
                     → resolveAlarmContext({alarm, asset, tower, site})
                     → queue = openAlarmsInSameTowerWithClipUrl
                     → {current, prev, next, position}
                     → passed to <AlarmClipModal key={alarm.id} ... />
```

This is what makes auto-advance work cleanly. When the operator Acks/
Resolves inside the modal, the mutation invalidates `['alarms']`, the
panel re-renders with the shrunk list, and the modal (still mounted at
`clipAlarmId = <originally-next>.alarm.id`) finds the new "current" is
the alarm we wanted to advance to. The `key={alarm.id}` on the modal
forces a fresh mount for the new alarm — view resets to snapshot-first,
download state clears, mutation hook starts fresh. This is the
project's "reset state when a prop changes" idiom (per §11 + the
React-hooks `set-state-in-effect` lint rule).

Severity/tower chip filters in the panel are deliberately **NOT** applied
to the queue — the operator triaging clip-by-clip wants every alarm in
the tower in the queue regardless of which chips happen to be active.

### 8.5. Loader UX

The Recent Alerts panel renders a soft loader overlay (semi-transparent
scrim + spinner) when `externalLoading || isFilterPending`:

- `externalLoading` = parent's time-range `useTransition` `isPending`
- `isFilterPending` = panel's own severity/tower `useTransition` `isPending`

React-Query's `isFetching` is **deliberately NOT** in this signal —
background polls would otherwise blink the loader every 15s for no
operator-meaningful reason. The initial fetch still uses the full-page
`LoadingSpinner` via the parent's `isLoading` check.

**Combined assets+alarms gate.** The full-page spinner is now gated on
**BOTH** `assetsLoading` and `alarmsLoading`. Previously assets landed
first, alarms briefly empty, and the Recent Alerts panel flashed
"No alerts in last 24h" before the alarms query resolved. Hold the
spinner up through the slowest of the two.

### 8.6. Device summary sidebar

Right column of the Overview grid (lg+; stacks below Recent Alerts on
narrow screens). `DeviceSummaryPanel` lists three rows — one per category
the operator can act on across the current scope:

| Category | Verb (active) | Verb (idle) | Source asset types | Icon · Color |
|---|---|---|---|---|
| Doors unlocked | `unlocked` | `locked` | `DoorLockAsset` · `ToggleableDoorLockAsset` | Lock · warning-400 |
| Lights on | `on` | `off` | `LightAsset` | Lightbulb · accent-400 |
| Sirens sounding | `sounding` | `idle` | `AlarmAsset` · `BuzzerAsset` | Volume2 · danger-400 |

**Source data.** `deviceSummary` is a single `useMemo` over the scoped
`towers` array — walks each tower's children (`pickGatewayChildren`),
partitions them into the three buckets, and computes each one's
`{ all: Array<{asset, tower, active}>, activeCount: number }`.

**"Active" semantics differ per category:**
- **Doors** — `isAssetActive` returns "locked" for DoorLockAsset (project
  convention from §5.4), so `active = !isAssetActive(asset, ct)` —
  unlocked = active in *this* panel's sense.
- **Lights / Sirens** — `active = isAssetActive(asset, ct)` directly.

**Each row's body** shows the active count as a big number on the right
(coloured if > 0, grey if 0), with an `<active> <activeVerb> · <idle>
<idleVerb> · <total> total` subline. Rows with `total === 0` render
disabled (cursor not-allowed, opacity 55%) with a tooltip explaining
nothing matches the current scope. Otherwise click opens
`DeviceListModal` for that category (state: `summaryCategory` in the
page-level `useState`).

**`DeviceListModal`** — full-page overlay (`fixed inset-0 z-50`, max
720px wide, `max-h-[85vh]`). Header carries the category icon + label
+ `<activeCount>/<total>` chip + close button. Body groups every item
by its tower (preserving iteration order), with a tower-name banner
(`RadioTower` icon + tower display name) above each group. Each row
renders via `DeviceToggleRow` — coloured status dot + name + type label
+ `Turn on` / `Turn off` button. The button colours itself with the
category's accent when `active`, neutral grey otherwise. Pressing it
fires `useWriteAttribute` against `getPrimaryControlAttr(asset,
customType)` with `nextToggleValue` — same path as the Control page's
`ControllableTile`. Esc closes; backdrop click closes; the inner panel
click `stopPropagation`s so accidentally clicking the modal body
doesn't dismiss it.

The modal uses `useEffect` for the Esc listener (window-level keydown).
The "reset state when a prop changes" idiom doesn't apply here because
the modal is conditionally mounted by the page (`summaryCategory &&
<DeviceListModal/>`) — closing destroys it, opening creates a fresh
instance.

### 8.7. Perf — shared lookup Maps + memoized rows

Commits `76ae4cf` / `6828a67` rewrote the Overview's and Alerts page's
filter/render pipelines because the old shape ran nested
`O(alarms × towers)` `findGatewayForAsset` / `alarmBelongsToGateway`
loops on every React Query poll, and `AlertRow` allocated a fresh `Map<id,
asset>` per row per render via `findGatewayForAsset`. With ~1,000
alarms in scope this churned ~1M Map ops every 15 s.

**The four precomputed Maps** (built once at the page level, in this
order):

1. `assetMap` — `assetId → asset`. Mirrors the old per-render Map but
   shared with all downstream consumers (including child panels via
   props).
2. `alarmTowerMap` — `alarmId → Set<towerId>`. For each alarm, walks
   every linked-asset field the alarm may carry (`asset` / `assets` /
   `linkedAssets` / `assetId` / `sourceId`) and collects ALL the towers
   those assets sit under. Mirrors the original
   `alarmBelongsToGateway` "match if ANY linked asset lives under the
   tower" semantics exactly. Multi-asset alarms get multi-entry sets.
3. `siteTowerIdSets` — `siteId → Set<towerId>`. Powers the per-site
   summary used by the `Sites online` KPI.
4. `alarmContextMap` — `alarmId → {asset, tower, site, clipUrl}`.
   Resolves breadcrumb context once, over the **full** alarm list
   (not just the scoped subset), so the modal queue handoff can reuse
   it. Tower resolution prefers the precomputed
   `alarmTowerMap.get(id)` first entry; falls back to
   `findGatewayForAsset` only for alarms not in the map (e.g. site-
   level alarms). Site resolution walks `tower.parentId` → `tower.path`
   against `siteById`, with a final `findSiteForAsset(asset, sites)`
   fallback.

**`scopeAlarms` helper** — replaces the old `scopeAlarmsToTowers`
factory. `useCallback` over `(alarmTowerMap, scopeTowerIdSet)`. Each
alarm is filtered with a single `Set.has` against its precomputed
tower set — O(scoped-towers) per alarm, no nested Map allocations.

**`AlertRow` is `React.memo`.** The shallow compare only skips work
when **every** prop's identity is stable across renders. So props are
designed for shallow-compare friendliness:

- `alarm` — React Query preserves object identity across polls when
  the payload hasn't changed (structural sharing).
- `asset` / `tower` / `site` — destructured at the call site from
  `alarmContextMap.get(al.id)`. These are references into cached Maps
  (`assetMap`, `towerByIdAll`, `siteById`) that only rebuild when the
  asset list changes, NOT on each alarm poll.
- `clipUrl` — primitive string from the same cached `alarmContextMap`.
- `pendingStatus` — a primitive string (`'ACKNOWLEDGED'` /
  `'RESOLVED'` / `null`), derived at the parent from `update.isPending
  && update.variables?.alarm?.id === al.id`. The whole React-Query
  `update` object is NOT passed down because its identity changes on
  every fetch tick.
- `onClipClick` / `onAck` / `onResolve` — `useCallback`'d at the parent
  so identity is stable across renders.

**Anti-pattern to avoid: bundling context into a wrapping object.**
`<AlertRow context={{asset, tower, site, clipUrl}}/>` defeats
`React.memo` entirely — a fresh `{...}` literal every render always
shallow-compares as "changed". Pass each value as its own prop. This
rule is now in §3 as a non-reversible decision.

**One `useAlarms({})` query, OPEN derived client-side.** Both the
Overview and Alerts pages flipped from `useAlarms({status:'OPEN'})` to
`useAlarms({})` and a `useMemo` filter on the result. Saves one network
round-trip every 15 s and shares the React Query cache slot — Overview
→ Alerts navigation is now instant (no extra fetch).

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
- **Event** — icon + title + **🎬 Clip icon button (when the alarm
  carries a URL)** + optional detail line. The clip button sits right
  next to the title so it's discoverable without scanning to the end of
  the row. Click → opens the shared `ClipModal`.
- **Location** — Site › Tower › Device breadcrumb. **Crumbs are
  interactive here** (see §5.1c) — Site/Tower set the global filter;
  Camera opens the full-view modal in place. Non-camera assets are
  display-only.
- **Severity** — pill in the matching colour (or `—` for tower-log rows).
- **Status** — pill in the matching colour (or `—` for tower-log rows).
- **Tag** — `Alert` (red) / `Command` (cyan) / `Info` (yellow). No clip
  button here anymore — it moved to the Event column 2026-05-16.

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

## 9a. The Control page, panel by panel

`SecureOpsControlPage` (`src/pages/SecureOpsControlPage.jsx`) is the
per-tower operator surface at `/control`. Layout, top to bottom:

```
┌──────────────────────────────────────────────────────────┐
│ Control · Tower-level controls for <Tower>  [ Tower ▾ ]  │   header
├─────────────────────────────────┬────────────────────────┤
│  Cameras (first 2 of tower)     │  Environment           │   row 1
│  ─ CameraCard · CameraCard      │  Temp / Humidity tiles │
├─────────────────────────────────┴────────────────────────┤
│  Controls grid (every controllable device)               │   row 2
├──────────────────────────────────────────────────────────┤
│  Asset history                              [ Asset ▾ ]  │   row 3
│  ─ chip strip (attributes) ─ chip strip (1h/6h/24h/7d/30d)│
│  ─ Recharts AreaChart, h-72                              │
└──────────────────────────────────────────────────────────┘
```

### 9a.1. Scope

Tower scope is the global `secureOpsStore.selectedTowerId`. The tower
dropdown in the header writes back to the store so the Overview tab
follows the same selection (Live Camera Feeds, Remote Control,
Environmental Telemetry all re-scope). The site scope (from the
`SecureOpsHeader` site dropdown) bounds the tower dropdown's options.

### 9a.2. Cameras + Environment + Controls

`CamerasPanel` shows the first two children matching `isCameraAsset`
(fixed or PTZ); each tile uses the shared `CameraCard`, which renders
a **PlayCircle poster** until clicked rather than mounting a live
stream on render (see §5.1a + commit `94da9a4`).

`EnvironmentPanel` (commit `8b103e9`) now reads **three** tower-scoped
readings, each rendered as its own `EnvBigStat` tile when the source
asset is present:

| Tile | Source | Attribute | Tile tone |
|---|---|---|---|
| Temperature | `HeatSensorAsset` child of tower (via `getWeatherAssetForTower`) | `temperature` | `warning` (orange) |
| Humidity | same `HeatSensorAsset` | `humidity` | `accent` (cyan) |
| Battery | `BatteryAsset` child of tower (matched via `normalizeAssetType(getCustomAssetType) === 'BatteryAsset'`) | **simulated — see below** | **threshold-coloured**: ≥50 % → `ok` (green) · 20-49 % → `warning` (yellow) · <20 % → `danger` (red) · null → `accent` (grey) |

The Battery tile uses a `batteryTone(pct)` helper to map the reading
to a tone, and `EnvBigStat` was extended to accept `tone: 'ok' |
'danger'` (was only `warning` / `accent`).

**Battery value is simulated (2026-06-18).** The backend doesn't report
`energyLevelPercentage` reliably yet, so the tile shows a synthesised
state-of-charge from `getSimulatedBatteryPercent()` in
`src/utils/batterySim.js` — the OR attribute value is **intentionally
not read** for now. The towers run on solar + battery, so the model is a
time-of-day triangle wave in **Pakistan time (Asia/Karachi)**:

- **Daylight (sunrise → sunset): charging.** SoC ramps up from the daily
  minimum at sunrise to the daily maximum at sunset.
- **Night (sunset → sunrise): discharging.** SoC ramps back down to the
  minimum at the next sunrise (wraps across midnight).
- Range is **`BATTERY_SIM_MIN` (42 %) → `BATTERY_SIM_MAX` (83 %)**, always
  a **rounded integer**. Sunrise / sunset are named constants
  (`05:30` / `19:15` PKT) so they can be nudged per season. Time-of-day
  is resolved via `Intl.DateTimeFormat({ timeZone: 'Asia/Karachi' })` so
  the curve is correct regardless of the browser's own timezone.

`EnvironmentPanel` runs a 60 s `setInterval` tick so the value visibly
creeps on screen between the 15 s asset polls. **To restore the real
reading later:** read `energyLevelPercentage` again in `EnvironmentPanel`
(the line is commented in the code) — the tone helper and tile markup
need no change. The tile still renders only when the tower has a
`BatteryAsset` child.

**Empty state.** The panel hides itself only when **neither**
HeatSensorAsset nor BatteryAsset is present (`!hasAny`). Previously
the empty message said "No HeatSensorAsset under this tower" — it now
reads "No environment sensors under this tower" so a tower with
battery-only or sensor-only still surfaces what it has. The "updated
N ago" line picks the freshest timestamp across all available
attributes (temperature → humidity → battery → fallback lastModified).

**Why not put battery on the header?** The header is now scope-agnostic
(§6.3); per-tower battery is operator-actionable on `/control` where
the device-picker context exists. Putting it on the header would also
mean re-querying every poll across every route.

`ControlsPanel` filters tower children to `CONTROLLABLE_TYPES` and
renders a `ControllableTile` per device, each toggling via
`useWriteAttribute(getPrimaryControlAttr(asset, customType))`. As of
2026-06-08 the grid also carries a **PTT tile** rendered by `PttTile`
— same `.so-control-tile` chrome as the device tiles, but the action
is a hand-off to the OS Mumble client via `PttAsset.socketIP` (see
§5.5 for the full resolver contract). The tile renders in the
**default (inactive) tile state** — it does NOT set `data-active="true"`
(removed 2026-06-20). The earlier `ok` branch hardcoded the active flag,
giving the tile the accent gradient + border + tinted icon so it looked
permanently selected next to the (off-by-default) device tiles; dropping
it restores symmetry — PTT now reads as just another idle control. The
panel resolves the PTT status once via
`resolvePttForTower(activeTower, towerAssets)` and:
- adds 1 to the header's `N controls` count only when status isn't
  `invalid`,
- renders `<PttTile />` only when status isn't `invalid` (so a
  malformed `socketIP` doesn't take up grid space),
- shows the legacy `"No controllable devices under this tower."`
  empty-state copy only when the total tile count is 0 (i.e. no
  devices AND PTT hidden).

### 9a.3. Asset history panel (added 2026-05-22)

The bottom panel charts a single tower-child asset's history. It is the
same renderer as `AssetPage`'s History tab — `AssetHistoryCard` in
`src/components/charts/AssetHistoryCard.jsx`. The Control page wraps it
in a local `HistoryPanel` that owns the asset dropdown; the dropdown's
options are the tower's children **filtered to those with at least one
chartable (numeric or boolean) attribute** via `hasChartableAttributes`
(`src/utils/chartable.js`). Without the filter the dropdown would
offer assets that always render the card's empty state.

The `AssetHistoryCard` itself:

- Picks chartable attributes via `isChartableAttr` (`src/utils/chartable.js`)
  and renders one chip per attribute name; default is the asset's
  primary reading attribute (`getPrimaryReadingAttr`, falls back to the
  first chartable).
- Time-range chips: `1h / 6h / 24h / 7d / 30d`. The selected range is
  memoised via `getTimeRanges()[range]` — **must be `useMemo`'d**
  because `getTimeRanges()` calls `Date.now()`, and a fresh object
  every render would change the React Query key every tick and put the
  datapoints hook in an infinite refetch loop.
- Datapoints come from `useAssetDatapoints(assetId, attr, timeRange)`
  which hits the OR `/asset/datapoint/{assetId}/{attributeName}` endpoint.
  The backend can return points as `{x, y}` objects, `{timestamp, value}`
  objects, or `[ts, v]` tuples depending on server version — all three
  are accepted. Booleans are coerced to `0/1` so Recharts can plot them.
- Booleans render as a step line with a `[0, 1]` Y domain and an
  `Off / On` tick formatter; numbers render as a smooth monotone area
  with `auto` domain.

**Key-on-remount pattern (anti-flicker).** `AssetHistoryCard` does NOT
reset its internal `attr` state when the `asset` prop changes — that
would require a setState inside `useEffect`, which eslint flags as
the "cascading renders" anti-pattern. Parents that swap assets must
pass `key={asset.id}`. The Control page does this in both directions:

- `HistoryPanel` is keyed on `activeTower.id` → switching tower
  remounts the panel and resets `assetId` to the new tower's first
  chartable child.
- The inner `AssetHistoryCard` is keyed on `selected.id` → picking a
  different asset in the dropdown remounts the card and resets `attr`
  to the new asset's preferred reading.

This pattern matches React's official recommendation for "reset state
when a prop changes" — preferred over `useEffect(setState, [prop])`.

### 9a.4. Why the chart lives on /control

The Control page is the per-tower operator surface — the place you go
to *act* on a single tower. Pulling up an attribute trend (battery
voltage over 24 h, signal strength over 7 d, door-lock state over 6 h)
is part of the same workflow: the operator has already picked a tower
and now wants to see how a specific device has been behaving. Putting
the chart here means no context switch to the asset detail page just
to glance at a graph; the dropdown surfaces every chartable child in
one place. The `AssetPage` History tab still exists for deep links and
the "Open in asset page" flow — both surfaces now share `AssetHistoryCard`.

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

## 10b. Alarm status mutation — per-call toast copy

`useUpdateAlarmStatus()` (`src/hooks/useAssets.js`) accepts two
**optional** variables alongside the usual `{alarm, status}` payload:

```js
update.mutate({
  alarm,
  status: 'ACKNOWLEDGED',
  successMessage: 'Alarm acknowledged — Person at gate',
  errorMessage:   'Failed to acknowledge alarm',
});
```

When omitted, the hook falls back to the generic copy `"Alarm status
updated"` / `"Failed to update alarm"` — so legacy callsites
(`SecureOpsAlertsPage`, the original `AlarmsPage`, `StorePage`,
`OverviewPage` etc.) keep their existing toast wording without any
change.

The Overview's `RecentAlertsPanel` AlertRow and the `AlarmClipModal`
both pass action-specific copy so the operator sees a clear
confirmation that names the alarm they just acted on.

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

`src/utils/auditEvents.js` exports the two event generators used by the
`AuditLogPage`. (The Overview's audit-log preview panel was removed
2026-05-27 — see §8 — but the util stays single-source so any future
re-introduction lands a consistent event shape.) Centralising keeps
event shape, severity tagging, and the "transition only when
`lastModified ≠ createdOn`" rule in one place.

**As of 2026-05-27** each event also carries the raw `alarm` ref on
the common payload so the `AlarmClipModal` (opened from audit row clip
buttons) can derive snapshot URL + detection label from the same source
the row already shows.

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
src/components/layout/SecureOpsHeader.jsx     Sticky top bar + tabs + site dropdown.
                                              Left-side brand is the SMS Sentinel AI
                                              logo (`/telco-logo.jpeg`), wrapped in a
                                              `<NavLink to="/" end>` so click returns
                                              to Overview. Replaces the legacy
                                              ShieldCheck icon + two-line title.
src/components/cameras/CameraCard.jsx         Shared camera tile — used on Overview,
                                              Video wall, Control, Audit Log. Owns
                                              its own history-modal state.
src/components/cameras/CameraHistoryModal.jsx Unified history modal — live stream +
                                              detection sidebar + 3-state player.
                                              Extracted from SecureOpsVideoPage.
src/components/cameras/PtzControls.jsx        Up/down/left/right pad overlaid on
                                              PtzCameraAsset live frames inside the
                                              history modal. onMove stub for now.
src/components/cameras/AlarmClipModal.jsx     Rich alarm clip modal (§5.1b). Replaces
                                              the deleted ClipModal. Header severity +
                                              title + Prev/Next queue nav + Close;
                                              meta strip w/ breadcrumb + time + camera +
                                              detection chip + Quick controls + PTT;
                                              Snapshot/Clip/Live tabbed stage with
                                              native <video controls>, snapshot preview
                                              w/ play overlay, CameraStream for live;
                                              PtzControls overlay when PtzCameraAsset;
                                              footer Ack/Resolve (auto-advance) +
                                              Download (blob fetch). Used by Overview,
                                              /alarms, /audit clip buttons.
src/pages/SecureOpsOverviewPage.jsx           The Overview tab (`/`)
src/pages/SecureOpsVideoPage.jsx              The Video wall (`/video`)
src/pages/SecureOpsAlertsPage.jsx             Actionable alerts inbox (`/alarms`)
src/pages/SecureOpsControlPage.jsx            Per-tower device control panel (`/control`).
                                              Also hosts the Asset history
                                              panel below Controls — dropdown
                                              of tower children with chartable
                                              attributes + AssetHistoryCard.
                                              Panel is keyed on activeTower.id
                                              so a tower change remounts it.
src/pages/SecureOpsStubPage.jsx               Shared placeholder (now unused — Video/Alerts/Control shipped)
src/pages/AuditLogPage.jsx                    Full `/audit` page
src/pages/secureops.css                       All SecureOps-scoped styling
src/store/secureOpsStore.js                   Zustand: selectedSiteId / selectedTowerId
src/store/alarmNotificationsStore.js          Zustand: in-app alarm notification stack.
                                              items[], push(alarm) (de-dupes by id,
                                              capped at 25), dismiss(id), dismissAll().
                                              Fed by useLiveEvents on each fresh alarm.
src/components/notifications/AlarmNotificationStack.jsx
                                              Mac-style notification stack mounted in
                                              DashboardLayout. Collapses 2+ alarms into
                                              a peek stack; click to expand. Header bar:
                                              count, Expand/Collapse, Close all. Per-
                                              card X. Card click → /alarms.
src/components/notifications/alarmNotifications.css
                                              Scoped styles for the stack. Fixed
                                              top:124px / right:16px / z:20 so the
                                              site dropdown (z-40) overlays it when
                                              open. Container pointer-events:none so
                                              empty space click-throughs work.
src/utils/auditEvents.js                      Shared alarm/tower event generators
src/constants/events.js                       CAMERA_EVENT_ATTRIBUTE,
                                              getEventClipUrl / getEventSnapshotUrl —
                                              each takes a per-camera base URL arg
                                              (returns null when the base is missing —
                                              no fallback constant). getTimeRangeClipUrl
                                              still exported but UNUSED as of 2026-06-20
                                              (clips always resolve from the event id).
                                              normalizeEventLabel (person→human etc.)
src/hooks/useCameraEvents.js                  React Query hook around the OR datapoints
                                              endpoint for the eventId attribute (type: 'ALL')
src/hooks/usePtzMove.js                       Drives a PtzCameraAsset via two OR
                                              attributes: writes ptzCommand="move_<dir>"
                                              then sets a setTimeout for movementDuration
                                              ms (default 3000 when the attribute is
                                              missing) and writes ptzCommand="stop". In-
                                              flight gate ignores presses until the auto-
                                              stop completes. Unmount cleanup clears the
                                              timer and fires a direct writeAttributeValue
                                              for stop so the camera doesn't keep panning
                                              when the modal closes mid-move. Uses a
                                              mutateRef so a parent re-render can't stale
                                              out the scheduled stop call. See §5.1e.
src/components/charts/AssetHistoryCard.jsx    Reusable history chart for a single asset
                                              (Recharts AreaChart). Picks chartable
                                              attributes automatically, defaults to the
                                              asset's primary reading attribute, has its
                                              own attribute + time-range chips. Used by
                                              AssetPage's History tab AND the /control
                                              page's Asset history panel. NOT
                                              self-resetting on asset change — parents
                                              that swap assets must pass `key={asset.id}`.
src/utils/chartable.js                        `isChartableAttr` / `hasChartableAttributes`
                                              predicates. Lives in utils/ so eslint's
                                              `react-refresh/only-export-components`
                                              rule stays happy (non-component exports
                                              would break Fast Refresh in
                                              AssetHistoryCard.jsx).
telco-readme.md                               This document
public/telco-logo.jpeg                        SMS Sentinel AI brand logo. Served from
                                              the Vite static root (so referenced as
                                              `/telco-logo.jpeg` — no import). Used by
                                              SecureOpsHeader's left-side brand block.
                                              See §14 Brand asset for sizing rules.
```

### Edited files

```
src/App.jsx                                   Routes for new pages + stubs
src/components/layout/DashboardLayout.jsx     Renders SecureOpsHeader (was Sidebar+Header)
                                              + mounts AlarmNotificationStack alongside
                                              the existing Toaster
src/utils/assetIcons.js                       Asset types (incl. PtzCameraAsset) + normalizeAssetType
                                              + icon/accent maps + isAssetActive / getStateLabel
src/utils/gateways.js                         isSiteAsset / pickSites / isTowerAsset / pickTowersForSite
                                              / findSiteForAsset / isCameraAsset / isPtzCamera
                                              / findPttAssetForTower (case-insensitive
                                              PttAsset / "PTT Asset" matcher; walks
                                              isDescendantOfGateway because PttAsset
                                              is not in DEVICE_TYPES) / resolvePttForTower
                                              (2026-06-08; returns {status, href} with
                                              ok/missing/invalid — validates socketIP
                                              starts with mumble:// and is the single
                                              source of truth shared by every PTT
                                              surface — §5.5)
src/hooks/useLiveEvents.js                    Alarm watcher now pushes to
                                              alarmNotificationsStore instead of
                                              firing react-hot-toast cards. Skips the
                                              push when the user is already on /alarms.
                                              OS notifications via fireAlarmNotification
                                              unchanged.
src/api/client.js                             Refresh-token dedup (concurrent 401 handling)
src/utils/alarms.js                           getAlarmClipUrl(alarm, asset) resolves the
                                              clip from the event id via
                                              getEventClipUrl (2026-06-20 — the
                                              time-range branch + findTimestamps helper
                                              were removed; asset still supplies the
                                              per-camera eventsBaseUrl). + getAlarmEventId
                                              / getAlarmSnapshotUrl /
                                              getAlarmDetectionLabel helpers feeding
                                              AlarmClipModal (§5.1b). getAlarmContentText
                                              still strips URLs + event ids + bare
                                              timestamps from display text.
src/utils/auditEvents.js                      Each event payload now carries the raw
                                              `alarm` ref so /audit's clip click can
                                              open AlarmClipModal with full context.
src/hooks/useAssets.js                        useUpdateAlarmStatus reads optional
                                              successMessage / errorMessage from mutate
                                              variables — backwards-compatible toast
                                              copy override (§10b).
src/pages/SecureOpsOverviewPage.jsx           2026-05-27: full rewrite to KPI strip +
                                              full-width Recent Alerts only (§8).
                                              Live Camera Feeds / Site Status / Remote
                                              Control / Env Telemetry / Audit log panels
                                              all removed (relocated — see §8 table).
                                              Adds TimeRangeBar (§8.1), Severity + Tower
                                              filter chips inside the panel (§8.3),
                                              clipAlarmId state + queue derivation for
                                              the AlarmClipModal handoff (§8.4), loader
                                              UX via useTransition (§8.5).
src/pages/SecureOpsAlertsPage.jsx             Clip button → AlarmClipModal (was ClipModal).
                                              2026-05-31 (commit 76ae4cf): perf refactor —
                                              shared assetMap + alarmTowerMap +
                                              alarmContextMap, memoized AlertRow with
                                              primitive props, IntersectionObserver-based
                                              infinite scroll (PAGE_SIZE=30, bump=30,
                                              root=viewport because the Alerts page
                                              itself scrolls — no internal overflow:auto
                                              container). Flipped to useAlarms({}) to
                                              share the cache key with Overview.
src/pages/AuditLogPage.jsx                    Clip button → AlarmClipModal (was ClipModal)
src/components/layout/SecureOpsHeader.jsx     2026-05-30 (commit 6828a67): dropped temp +
                                              humidity chips. 2026-06-06: dropped signal
                                              + battery chips. Row 2 is now just the tab
                                              strip — no telemetry chips at all. Header
                                              no longer reads selectedTowerId or any
                                              tower attribute. readNumber helper removed.
src/pages/SecureOpsOverviewPage.jsx           2026-05-30 (commit 6828a67): perf refactor —
                                              shared lookup Maps (assetMap +
                                              alarmTowerMap + siteTowerIdSets +
                                              alarmContextMap), memoized AlertRow with
                                              primitive props, infinite scroll on
                                              RecentAlertsPanel (PAGE_SIZE=30, sentinel
                                              root = .so-alert-list-wrap because the
                                              page itself doesn't scroll). Default time
                                              range now 'all' (was '24h'). Single
                                              useAlarms({}) query (OPEN derived
                                              client-side). Combined assets+alarms
                                              loading gate to stop the "no alerts"
                                              flash. 2026-06-06 (commit f27d12a):
                                              DeviceSummaryPanel + DeviceListModal +
                                              deviceSummary memo (doors/lights/sirens
                                              categorised across scoped towers, with
                                              "active" semantics flipped for doors —
                                              unlocked = active in this panel's sense).
                                              Modal renders Turn on/Turn off toggles
                                              via useWriteAttribute.
src/pages/SecureOpsVideoPage.jsx              2026-05-30 (commit 94da9a4): tower chips
                                              are now multi-select checkboxes; default
                                              = first tower checked so only one tower's
                                              streams mount up front. Local state, NOT
                                              secureOpsStore.selectedTowerId. Re-seeded
                                              via the towersSig / prevTowersSig
                                              "reset state when a value changes"
                                              pattern. clearFilters returns to default-
                                              first, not empty. towerCounts memo
                                              rebuilt to count cameras per tower
                                              directly (was per-camera tower lookup).
src/components/cameras/CameraCard.jsx         2026-05-30 (commit 94da9a4): live-stream
                                              fetch deferred — renders PlayCircle
                                              poster until clicked. Offline cameras
                                              still render <CameraStream offline> so
                                              the offline UI is preserved.
src/hooks/usePtzMove.js                       2026-06-07: rewritten to drive PTZ via
                                              OR attribute writes on the camera
                                              (ptzCommand + movementDuration) instead
                                              of the deleted AI-side HTTP controller.
                                              In-flight gate, mutateRef-stable closure,
                                              unmount cleanup with direct stop write.
                                              See §5.1e.
src/utils/gateways.js                         2026-06-07: removed getCameraPtzId — the
                                              new ptzCommand attribute flow doesn't
                                              need an AI-side id resolver. isPtzCamera
                                              unchanged.
src/pages/SecureOpsControlPage.jsx            2026-05-31 (commit 8b103e9): Environment
                                              panel now also reads BatteryAsset child
                                              (matched via normalizeAssetType) and
                                              renders an energyLevelPercentage tile
                                              with threshold-coloured tone (batteryTone
                                              helper). EnvBigStat extended to accept
                                              'ok' / 'danger' tones. Empty-state copy
                                              widened to "No environment sensors under
                                              this tower" (was HeatSensorAsset-only).
                                              2026-06-08: added PttTile inside
                                              ControlsPanel (anchor on ok / toast button
                                              on missing / null on invalid) and lifted
                                              the resolvePttForTower call to
                                              ControlsPanel so the header count
                                              ("N controls") only includes PTT when
                                              status isn't invalid. See §9a.2 + §5.5.
src/components/cameras/AlarmClipModal.jsx     2026-06-08: PttButton rewritten to use
                                              resolvePttForTower. ok → <a href> opens
                                              the mumble:// link; missing → click-toast
                                              button; invalid → component returns null
                                              (button hidden). Dropped usePushToTalk +
                                              buildPttWsUrl imports.
src/components/cameras/CameraHistoryModal.jsx 2026-06-08: added PttHeaderButton next to
                                              the Close button. Same three-status shape
                                              as the Control tile / AlarmClipModal. Uses
                                              useAssets({}) (cached) to resolve the per-
                                              tower PttAsset.
```

### Deleted files

```
src/components/cameras/ClipModal.jsx          Replaced by AlarmClipModal (2026-05-27).
                                              No remaining importers.
src/constants/ptz.js                          2026-06-07: deleted. PTZ_BASE_URL +
                                              getPtzMoveUrl(id, dir) targeted the
                                              external AI-side controller, which the
                                              new ptzCommand attribute flow replaces.
                                              No remaining importers.
src/hooks/usePushToTalk.js                    2026-06-08: deleted. Held the entire
                                              hold-to-talk PCM-over-WebSocket pipeline
                                              (~230 lines: AudioContext + inline
                                              AudioWorklet that converted Float32→Int16,
                                              WebSocket lifecycle, getUserMedia mic
                                              capture, RAF-paced level meter). All
                                              replaced by a plain <a href={socketIP}>
                                              that hands off to the OS Mumble client.
                                              No remaining importers.
src/constants/ptt.js                          2026-06-08: deleted. PTT_WS_URL (the
                                              global PC-speaker URL) + buildPttWsUrl
                                              (hard-coded wss:// scheme + prefix strip).
                                              Neither is needed once socketIP carries
                                              the full mumble:// URL and there is no
                                              client-side socket. No remaining importers.
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
- **Light-first** (changed 2026-05-22). First-time visitors load with
  `data-theme="light"`; dark mode is the `:root[data-theme="dark"]`
  override in `index.css`. The default is driven by the localStorage
  fallback in `src/store/appStore.js` — `localStorage.getItem('sms_theme') || 'light'`.
  Users who have explicitly toggled via the Settings tab keep their saved
  preference (we only set the default; we don't clobber a saved value).
  Test new widgets in both themes — every token pivots automatically as
  long as you stick to the variables.

### Brand asset

- The SecureOps top-bar identity is the **SMS Sentinel AI logo** at
  `public/telco-logo.jpeg`. It's served from the Vite static root, so the
  reference in `SecureOpsHeader.jsx` is a plain string `/telco-logo.jpeg`
  — no `import` and no Vite asset hashing. Replace the file in place to
  swap the logo; no code change needed.
- Render rules (kept in `SecureOpsHeader.jsx` row 1):
  - `h-10 md:h-12 w-auto object-contain` — height-anchored so the row
    height stays consistent across breakpoints, width follows the image's
    intrinsic aspect ratio (~4.7:1) so the logo never squashes.
  - Wrapped in `<NavLink to="/" end>` with `aria-label="SMS Sentinel AI
    — Overview"` so the brand mark doubles as a "home" affordance.
  - **No accompanying inline title text.** The logo's bitmap already
    carries "SMS Sentinel AI" + the "Intelligence that protects" tagline;
    re-stating them next to the image is redundant and creates two
    competing wordmarks. If a future redesign needs a text-only brand
    (e.g. on a narrow device or in print), generate a separate SVG —
    don't try to crop the JPEG.
- The image is a JPEG, not an SVG or PNG-with-alpha. It assumes the row
  background is light/white-ish — currently `var(--color-surface-1)` in
  the dark theme is dark, but the logo's solid white-ish background
  blends visually with the row by happy coincidence of the JPEG having
  no transparent regions. If you re-theme the chrome, audit the logo at
  the same time — swap to a transparent PNG/SVG or a dark-theme variant
  if you see a white rectangle around it.

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

1. **Video tab — ✅ shipped 2026-05-16, history rewired 2026-05-20, load-bounded 2026-05-30** as
   `SecureOpsVideoPage` at `/video`. Responsive grid of cameras for the
   currently-checked towers. **Each wall tile renders a PlayCircle
   poster** (see §5.1a + commit `94da9a4`); the modal plays the live
   stream on open via the shared `CameraStream` renderer. Page-level
   filters: **tower multi-select checkbox chips** (default = first
   tower in scope checked, so only one tower's streams mount up front)
   + free-text search. Click any tile → modal opens.

   The tower filter is tracked in **local page state**, NOT
   `secureOpsStore.selectedTowerId` — the store is persisted to
   localStorage and shared with Control, which would otherwise
   override the default-first behaviour. Re-seeded via the project's
   "reset state when a value changes" pattern (`towersSig` /
   `prevTowersSig` compare during render — NOT setState in
   `useEffect`). Re-seed only fires when the tower list identity
   actually changes (initial load, site switch); mutation-driven
   asset polls preserve the operator's current selection. Empty Set
   (after unchecking everything) means "show all towers" (original
   semantics). `clearFilters` returns to the default-first state, not
   empty. `isDefaultTowerFilter` lets the Reset button stay
   un-highlighted when the operator hasn't made a deliberate choice
   yet.

   **Modal sidebar is now driven by the `eventId` datapoints stream**
   (§5.2b), not the legacy `history` array attribute. Layered
   pagination: server-side **`Last 24h / 7d / 30d` window chips** keep
   the first-open query cheap on busy cameras; client-side **"Load more
   (N remaining)" button** reveals the next 20 rows from the fetched
   window. Detection chips (Human / Animal / Other) filter the visible
   list and reset paging on every change. Refresh icon re-anchors `to`
   to `Date.now()` and refetches. Auto-poll every 60s.

   **Three-state player** (§5.2c): live stream → click a clip in the
   sidebar → **snapshot preview + centred play overlay** → click the
   overlay → mp4 plays. "← Back to live" returns to the live feed;
   "Show snapshot" drops back to the preview while playing. Snapshot
   URLs use `getEventSnapshotUrl(id, base)`. Clip URLs always use
   `getEventClipUrl(id, base)` (2026-06-20 — the time-range branch was
   removed; the media server returns the recorded clip for an event id
   directly). The `base` is the camera's per-camera `eventsBaseUrl`
   attribute (§5.2c) — when it's missing / malformed, selecting a history
   row shows a black frame + play icon and pressing play toasts a friendly
   config error (the list itself still renders normally). Path layout
   lives in `src/constants/events.js`; the host is per-camera in OR.
2. **Alerts tab — ✅ shipped 2026-05-16** as `SecureOpsAlertsPage` at
   `/alarms`. Actionable inbox: only `status:'OPEN'` alarms, severity
   chips (High/Medium/Low), tower chips scoped to the selected site, free
   text search, Ack + Resolve on every row. Acknowledged or resolved
   alarms drop off this view and appear in the Audit log instead.
3. **Control tab — ✅ shipped 2026-05-16, Asset history added 2026-05-22**
   as `SecureOpsControlPage` at `/control`. Tower dropdown (auto-pick
   first, syncs with global `selectedTowerId`), first 2 cameras via the
   shared `CameraCard`, Environment card (temp/humidity from the tower's
   HeatSensorAsset), a grid of every controllable device under the
   tower (each tile is its own toggle via `useWriteAttribute`), **and
   an Asset history panel** that charts any tower child's numeric or
   boolean attribute over 1h/6h/24h/7d/30d. See §9a for the full
   layout. Bulk operations (lock-all-doors, lights-off, etc.) still TODO.
4. **Push-to-talk — ✅ shipped 2026-05-23, pivoted to mumble:// anchor 2026-06-08.**
   Originally a hold-to-talk PCM-over-WebSocket pipeline
   (`usePushToTalk` + inline `AudioWorklet` + per-press `getUserMedia`
   against a PC-side `server.js` near the site speaker). As of
   2026-06-08 that's all deleted — `PttAsset.socketIP` now carries a
   full `mumble://user:pass@host:port/` URL and the control is just
   `<a href={socketIP}>` that opens the OS Mumble client. The dashboard
   does no audio capture, no streaming, no socket. Three render
   surfaces share `resolvePttForTower` (§5.5): the `/control` Controls
   grid tile, the `AlarmClipModal` icon button, the
   `CameraHistoryModal` header button. `ok` → anchor; `missing` →
   click-toast button (`"PTT not configured for this tower."`);
   `invalid` (`socketIP` doesn't start with `mumble://`) → render
   `null` so a malformed link doesn't show as a broken affordance.
   **Open polish:** a Settings tab that lists every tower's PTT status
   so the configurer can fix `missing` / `invalid` rows in bulk; a
   small "?" tooltip explaining the URL format next to the toast.
5. **In-app alarm notification stack — ✅ shipped 2026-05-23** as
   `AlarmNotificationStack` mounted in `DashboardLayout`. Replaces the
   prior `react-hot-toast` flow that blocked the site dropdown. See
   §6.4. **Open polish:** optional auto-dismiss after N minutes
   (currently explicit-close only — items pile up to MAX_ITEMS=25
   then drop the oldest); a "Snooze" affordance per card for
   triage-in-progress alarms; persist `items` to sessionStorage so a
   page refresh during triage doesn't lose the stack.
6. **Settings tab** — extend the existing `SettingsPage` with a "SecureOps"
   section: default site, live-camera autoplay, alert sound for new
   Critical alerts, camera-history retention display. The per-deployment
   PTT URL override is no longer needed — it's now an OR attribute on
   the tower's `PttAsset` child (§5.5).
7. **Device-state-change history from datapoints** — for towers that don't
   carry an `auditLog` attribute, optionally fetch datapoints for each
   controllable asset's `onOff` over the last 24 h and surface them in
   the audit log. Cap to ~5 towers at a time; use `useQueries` with a
   stable id list to avoid query churn.
8. **Detect when `aiHeartbeatAt` is stale** — if no tower has reported a
   heartbeat in > 5 min, drop the AI uptime KPI to `—` (currently it stays
   at 100% as long as any heartbeat exists, regardless of recency).
9. **AlarmClipModal — ✅ shipped 2026-05-27** as
   `src/components/cameras/AlarmClipModal.jsx`, fully replacing the
   URL-only `ClipModal` on every alert surface (Overview / `/alarms` /
   `/audit`). Header severity + title + Prev/Next tower-scoped queue
   navigation; meta strip with breadcrumb + time + camera + detection
   chip + compact Quick controls (Door / Siren / Lights) + PTT button
   targeting the camera's tower; Snapshot / Clip / Live segmented tabs
   with native `<video controls autoPlay>` on Clip + blob-fetch
   Download + LIVE pill on Live + PTZ pad on Live when
   `PtzCameraAsset`; footer Ack / Resolve with auto-advance to the
   next queued alarm. Modal sized `w-1280 × h-95vh` for a generous
   video viewport. **Open polish:** prefetch the next snapshot URL on
   render so navigation feels instant; "Snooze for 5 min" action that
   pushes the alarm to the back of the queue instead of Ack/Resolve;
   queue ordering option (by severity vs time).
10. **Overview redesign — ✅ shipped 2026-05-27** — see §8. Slimmed to
    KPI strip + Recent Alerts. Open polish: persist the time-range
    selection to localStorage so reload lands on the operator's last
    chosen window (currently session-only, defaults to 24h on every
    fresh load).

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
