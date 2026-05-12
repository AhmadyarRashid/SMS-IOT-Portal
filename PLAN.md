# SMS One-Box Solution — Frontend Plan

> Working branch: `one-box-solution`
> Owner: hafiz@bitsoftsolution.com
> Drafted: 2026-05-12

---

> **See also:** `PLAN-IMPLEMENTATION.md` for the delivered-vs-deferred
> log per phase. Update both files in step when scope changes.

## 1. Vision

The current portal is a thin OpenRemote IoT client. We are turning it into a
**unified operations console** for SMS Service customers — one frontend that
fronts multiple backend services (OpenRemote IoT, Frigate VMS, Odoo
attendance / visitor / glue, ANPR, person tracking). Each customer license
enables only the modules they paid for; the UI hides the rest.

The portal is a **security operations console**, not a passive dashboard.
Receptionists, host employees, and security operators use it during their
shift. Every screen is animated, live, and built for an on-duty operator.

### Non-goals

- **No backend work.** All AI/OCR/face/plate/video/access logic stays in
  the backend (Odoo / Frigate / OpenRemote / ANPR service). The portal
  never reasons about pixels or identity in the browser.
- **No tracking the previous architecture into a corner.** Existing IoT
  pages get wrapped into a module, not torn down.
- **No placeholder metrics.** If a customer's enabled modules can't
  produce a number, hide the surface entirely. (Carry-over rule.)

---

## 2. Architecture overview

```
                +---------------------+
                |     Browser (this)  |
                |  React 19 + Vite 8  |
                +----------+----------+
                           |  relative /api/*, /auth/*
                           v
                +---------------------+
                |  Vite proxy / nginx |
                +----------+----------+
                           |
              +-------------------------+
              |    Odoo + gateway       |   <- single API surface
              +-----+-----+-----+-------+
                    |     |     |
              +-----+ +---+ +---+----+
              | IoT | |VMS| | ANPR  |  ... (handled in backend)
              +-----+ +---+ +-------+
```

**Single API surface.** From the portal's point of view there is one
backend — Odoo (or a thin gateway over Odoo) — exposing REST endpoints
under `/api/*`. Vendor specifics (Frigate's HLS URL, OpenRemote attribute
shapes, ANPR plate-read events) are normalised server-side before they
reach us.

**Anti-corruption / translator layer (mandatory).** Every server payload
goes through a per-resource translator into an internal model. Hooks and
pages never see raw server DTOs. See §6.3.

**Module registry (mandatory).** A `useEnabledModules()` hook reads from
`GET /me` and gates routes, sidebar entries, command-palette items,
notifications, and Control Centre tiles.

**Mock-server-first development.** OpenAPI spec at `openapi/spec.yaml` is
the contract with backend and the source of truth for the mock. Frontend
work never blocks on the real backend.

---

## 3. Modules

| Code | Name | One-line role |
|---|---|---|
| `iot` | IoT & Smart Devices | Existing OpenRemote pages (sites, gateway, asset, quick, live, map, alarms) |
| `vms` | Video Management | Live wall, AI alert feed, detection config |
| `ams` | Attendance | Face-gate-driven attendance log, enrolment, anomalies |
| `visitors` | Visitor Management | Receptionist console, host approvals, active visitors, grants |
| `anpr` | License Plate | Vehicle registry, live reads, gate rules |
| `tracking` | Person Tracking | Live floor occupancy, where-is search, path replay, heatmap |
| `alarms` | Unified Alarms | Cross-module inbox (always enabled if any other module is) |
| `admin` | Administration | Users, roles, facility model, module enablement, audit |

A user with no enabled modules sees an "ask your administrator" screen,
not a broken dashboard.

---

## 4. Cross-module concepts

### 4.1 Facility model (foundational)

The single source of truth for *where things are*. Every module references
it.

```
Site
 └─ Building
     ├─ Floor (number, label, optional floor-plan image)
     │   ├─ Room (employee_id assignment, optional)
     │   │   └─ Door  (linked IoT door-lock asset_id)
     │   └─ Zone (polygon on the floor plan; capacity)
     ├─ Lift (id, allowed_floors[])
     ├─ Gate (IN | OUT, position)
     │   ├─ FaceCamera     (linked vms camera_id, AMS source)
     │   ├─ PlateCamera    (linked vms camera_id, ANPR source)
     │   └─ Barrier        (linked IoT actuator asset_id, opened by ANPR/grant)
     └─ Camera (regular vms camera_id, position)
```

Managed under `/admin/facility`. JSON import/export so a customer
onboarding is one file. Stored backend-side; the portal renders and edits.

### 4.2 Approval inbox (concept)

Visitor approval is the first instance, but the same inbox plumbing
handles future approvals (after-hours access, overtime, exception punches).
One sidebar badge, one notification format, one approve/deny mutation
shape.

### 4.3 Time-bound access (concept)

First-class internal model:

```js
/** @typedef {object} AccessGrant
 *  @property {string} id
 *  @property {string} subjectId         // visitor_id or employee_id
 *  @property {'visitor'|'employee'} subjectKind
 *  @property {Array<{kind:'floor'|'room'|'lift'|'zone', id:string}>} scope
 *  @property {string} startsAt          // ISO
 *  @property {string} expiresAt         // ISO
 *  @property {'active'|'expired'|'revoked'} status
 */
```

Active grants render with live countdown rings everywhere (visitor panel,
person tracking dot tooltip, Overview "active visitors" tile).

### 4.4 Unified live event stream

A single internal event type for the Overview feed and the `/live` page:

```js
/** @typedef {object} OpsEvent
 *  @property {string} id
 *  @property {'iot'|'vms'|'ams'|'visitors'|'anpr'|'tracking'} source
 *  @property {'check_in'|'check_out'|'gate_open'|'ai_alert'|'visitor_approved'|
 *             'visitor_expired'|'alarm_raised'|'alarm_resolved'|'zone_violation'|
 *             'crowd_warning'|'unknown_plate'} kind
 *  @property {'info'|'warn'|'critical'} severity
 *  @property {string} timestamp
 *  @property {object} payload          // module-specific
 *  @property {Array<{label:string, href:string}>} actions
 */
```

Translators in every module emit this shape. Overview / live feed /
notifications all consume it without knowing which module produced it.

---

## 5. Mock-server-first development

### 5.1 OpenAPI spec

```
openapi/
  spec.yaml                  # OpenAPI 3.1, $ref'd from per-module files
  schemas/
    common.yaml              # User, Module, Page<T>, Error, OpsEvent
    facility.yaml            # Site, Building, Floor, Room, Door, Lift, Gate, Camera
    iot.yaml
    vms.yaml
    ams.yaml
    visitors.yaml
    anpr.yaml
    tracking.yaml
  examples/                  # one rich example per response
```

Spec is the contract handed to backend. The team can change the spec to
match Odoo's reality; the portal stays insulated via the translator layer.

### 5.2 Mock server — Prism

**DECISION (revised 2026-05-12):** Stoplight Prism CLI serving
`openapi/spec.yaml` directly. No hand-written Express. The spec IS the
mock. Listens on `:4010`; Vite proxy points at it when
`VITE_API_BASE=mock`.

```
openapi/
  spec.yaml                  # contract + every example payload
  package.json               # one dev dep: @stoplight/prism-cli
  README.md
```

Run with `npm run mock` (delegates to `openapi/`).

**Tradeoff accepted:** Prism is stateless — toggles return 204 but the
next GET returns the same baked example. Polling reconciles the UI
back to the example state. That's fine for Phase 0 (spec + translator
validation) and most of Phase 1 (read-heavy admin surfaces).

**Faked smart responses arrive when a phase needs them.** If/when a
later phase needs flows that must stick (visitor approval → countdown
ring → auto-expire; ANPR plate reads ticking; tracking dots drifting),
we add a tiny dynamic overlay *in addition to* Prism, not replacing
it. Most likely targets:

| Endpoint | Why dynamic |
|---|---|
| `POST /visitors/{id}/approve` | Status must persist for the countdown |
| `GET /tracking/positions` | Smooth motion needs an interpolating source |
| `GET /vms/events` (or `/ws/vms`) | New AI alerts need to arrive over time |
| `GET /anpr/reads` | Plate-read feed needs a tick |

### 5.3 Switching between mock and real

```bash
VITE_API_BASE=mock      npm run dev     # uses :4010 mock
VITE_API_BASE=staging   npm run dev     # real gateway
```

`vite.config.js` reads `VITE_API_BASE` and configures the proxy target.

---

## 6. Frontend code structure

### 6.1 Folder layout

Layout below shows both what's **in repo today** (Phase 0 delivered) and
what **arrives by phase** so the target shape is visible without a
separate roadmap doc. See `PLAN-IMPLEMENTATION.md` for the exact
delivery state.

```
src/
  components/                # existing — layout, tiles, commandpalette, ui, …
                             # (Phase 1: split into shell/ + per-module/)

  pages/                     # existing IoT pages — stay put until a phase
                             # needs them moved (avoids 14-file shuffle PR)

  api/
    client.js                # axios instance + interceptors                            [done]
    safeGet.js               # defensive getter + mapArray + toId                       [done]
    iot/
      index.js               # HTTP + translation, public surface                       [done]
      translators.js         # toAsset / toAlarm / toAlarmUpdate / toDatapoint          [done]
    # ↓ added in later phases
    identity.js              # /me — module enablement + permissions                    [Phase 1]
    facility.js                                                                          [Phase 1]
    admin.js                                                                             [Phase 1]
    visitors/                                                                            [Phase 2]
    vms/                                                                                 [Phase 3]
    anpr/                                                                                [Phase 4]
    ams/        + tracking/                                                              [Phase 5]

  hooks/
    useAssets.js             # existing — now consumes api/iot                           [done]
    useLiveEvents.js         # existing
    useAlarmNotifications.js # existing
    # ↓ added in later phases
    useEnabledModules.js     # reads /me                                                 [Phase 1]
    useOpsEvents.js          # unified event stream                                      [Phase 2+]

  shell/                                                                                 [Phase 1]
    moduleRegistry.js        # single registry; routes/sidebar/palette read from here

  modules/                                                                               [Phase 1+]
    iot/        # registry entry; pages may physically relocate here later
    vms/        # …                                                                       [Phase 3]
    ...

  models/                                                                                [Phase 1+]
    common.js                # User, OpsEvent, AccessGrant — added when a hook reads them
    iot.js                   # added when the translated shape diverges from wire

  store/                     # existing zustand stores
  utils/                     # existing utils — assetIcons, gateways, helpers, csv, prefs

openapi/
  spec.yaml                  # contract + Prism examples                                 [done, grows per phase]
  package.json               # Prism CLI                                                 [done]
  README.md                                                                              [done]

public/                      # sw.js, manifest, icons (existing)
```

**Principle:** the chassis is added **just before** the consumer that
needs it. We avoid orphan-flagging files that no component imports.

### 6.2 Module registry contract  *(Phase 1 — not yet in repo)*

Every module will export a registry entry:

```js
// src/modules/visitors/index.js
export default {
  code: 'visitors',
  label: 'Visitors',
  icon: BadgeCheck,        // Lucide
  accent: 'amber',         // signature accent colour
  permissions: ['visitors.read'],
  routes: [
    { path: '/visitors',          element: ActiveVisitorsPage, requires: 'visitors.read' },
    { path: '/visitors/reception', element: ReceptionConsole,  requires: 'visitors.write' },
    { path: '/visitors/approvals', element: ApprovalsInbox,    requires: 'visitors.host' },
    { path: '/visitors/log',       element: VisitorLogPage,    requires: 'visitors.read' },
    { path: '/visitors/config',    element: VisitorConfigPage, requires: 'visitors.admin' },
  ],
  sidebar: {
    group: 'security',                     // Security group header in sidebar
    items: [
      { to: '/visitors',           label: 'Active'       },
      { to: '/visitors/reception', label: 'Reception'    },
      { to: '/visitors/approvals', label: 'Approvals', badge: 'pendingApprovals' },
      { to: '/visitors/log',       label: 'Log'          },
    ],
  },
  commands: (ctx) => [                     // command-palette entries
    { id: 'visitors.new',   title: 'New visitor (Reception)', action: () => ctx.go('/visitors/reception') },
    { id: 'visitors.appr',  title: 'My approvals',            action: () => ctx.go('/visitors/approvals')  },
  ],
  overviewTile: ActiveVisitorsTile,        // rendered on / when module enabled
  notifications: {
    handle: 'visitor_approval_request',    // events this module owns
  },
};
```

`src/shell/moduleRegistry.js` imports every module's default export. The
router, sidebar, palette, and Overview all iterate this list filtered by
`useEnabledModules()`.

### 6.3 Translator template

```js
// src/api/visitors/translators.js
import { safeGet } from '../safeGet';

export const toVisitor = (dto) => ({
  id: String(dto.id),
  name: safeGet(dto, 'full_name', dto.name ?? ''),
  cnic: safeGet(dto, 'id_card.number', null),
  photoUrl: safeGet(dto, 'photo.url', null),
  host: dto.host_id ? { id: String(dto.host_id), name: dto.host_name ?? '' } : null,
  reason: dto.reason ?? '',
  status: ({
    pending: 'pending', approved: 'active', expired: 'expired',
    revoked: 'revoked', denied: 'denied',
  })[dto.state] ?? 'pending',
  grant: dto.grant ? toAccessGrant(dto.grant) : null,
  createdAt: dto.created_at,
});

export const toVisitorCreate = (model) => ({
  full_name: model.name,
  id_card: { number: model.cnic },
  reason: model.reason,
  host_id: model.host?.id,
  photo_b64: model.photoB64,
});
```

Rules:
- Translators are pure. No side effects, no React.
- Internal model fields use camelCase.
- IDs always coerced to string.
- Nullable fields normalised to `null`, never `undefined`.
- Enum-ish server values mapped to a closed internal vocabulary.

### 6.4 Hook template

```js
// src/api/visitors/index.js
import { client } from '../client';
import { toVisitor, toVisitorCreate } from './translators';

export async function fetchActiveVisitors() {
  const { data } = await client.get('/visitors', { params: { state: 'approved' } });
  return (data.items ?? []).map(toVisitor);
}

export async function createVisitor(model) {
  const { data } = await client.post('/visitors', toVisitorCreate(model));
  return toVisitor(data);
}
```

```js
// src/modules/visitors/hooks.js
export function useActiveVisitors() {
  return useQuery({
    queryKey: ['visitors', 'active'],
    queryFn: fetchActiveVisitors,
    refetchInterval: 15_000,
    refetchIntervalInBackground: true,
  });
}
```

---

## 7. Animation budget

Each module gets a **signature** animation plus the shared library.

**Shared (already present, keep).** Drifting halos, count-ups, breathing
pulses, tilt cards, layout-animated reflows, shine sweeps.

**Per-module signatures.**

| Module | Hero animation | Duration ceiling |
|---|---|---|
| IoT | (existing) cyan glow, fan spin, lock flip, alarm breathe | n/a |
| VMS | AI alert lands with clip thumb + bounding-box draw-in | 600 ms |
| AMS | Photo flies into roster + presence ring fills | 500 ms |
| Visitors | Lock-open ripple on approve, countdown ring tick | 450 ms (then continuous) |
| ANPR | Plate-scan sweep + barrier-rise spring | 700 ms |
| Tracking | Person dots drift with motion trails; heatmap bloom | continuous |
| Overview | Event cards slide-in with module-coloured rail | 250 ms |

**Constraints:**

- All animations respect `prefers-reduced-motion`. The `motion.js` util
  exports `usePresets()` that returns `null` transitions when reduced.
- No single transition >800 ms.
- Layout transitions (Framer `layout`) keep delay-free entry per existing
  README §24.
- All hovers use `whileHover` (no CSS transform competing).

---

## 8. Per-module feature inventory (Phase mapping)

### 8.1 IoT (existing)
**Status:** keep as-is; refactor into `modules/iot/` in Phase 0. No
user-visible change.

### 8.2 Admin (Phase 1)
- `/admin/users` — list / invite / deactivate / reset password / role
- `/admin/roles` — predefined (Owner / Manager / Operator / Viewer /
  Receptionist / HostEmployee) + per-module permission matrix
- `/admin/facility` — build the facility graph; JSON import/export;
  floor-plan image upload per floor
- `/admin/modules` — enable / disable per customer (or per deployment if
  single-tenant)
- `/admin/audit` — paginated log of admin actions
- `/admin/branding` — deferred (Phase 6)

### 8.3 Visitors (Phase 2)
- `/visitors` — active visitors live panel (countdown rings, revoke,
  extend)
- `/visitors/reception` — receptionist console (scan ID → OCR auto-fill,
  photo capture, reason, host search, submit). Big-tap layout for desk.
- `/visitors/approvals` — host approval inbox (one-tap approve with
  duration override, deny with reason)
- `/visitors/pre-register` — host invites known visitor ahead of time;
  sends QR badge
- `/visitors/log` — historical, searchable, filter by host / date
- `/visitors/config` — default duration, default access scope per host
  role, watchlist, badge template, kiosk PIN

### 8.4 VMS (Phase 3)
- `/vms` — live wall (1 / 4 / 9 / 16); single-cam fullscreen; audio toggle
- `/vms/alerts` — AI alert feed (severity-sorted; clip preview + AI
  bounding-box overlay; Acknowledge / Escalate / Dismiss)
- `/vms/cameras` — camera browser (online / FPS / disk)
- `/vms/search` — search by AI label + time + camera
- `/vms/config` — per-camera detection rules (models, sensitivity,
  schedule, zone masks); retention info read-only

### 8.5 ANPR (Phase 4)
- `/anpr` — live plate-read feed (scan-sweep animation)
- `/anpr/vehicles` — vehicle registry; CRUD; per-employee multi-car
- `/anpr/log` — entries report
- `/anpr/config` — per-gate rules (allow-listed / visitor-only /
  alert-unknown); gate → barrier mapping (uses facility model)

### 8.6 AMS + Tracking (Phase 5, combined)
**AMS:**
- `/ams` — today's roster (presence rings, gate, time)
- `/ams/employees` — directory, profile, face-enrolment wizard
- `/ams/log` — attendance log, filter by employee / date
- `/ams/anomalies` — tailgating, unknown-face attempts, exit-without-entry
- `/ams/reports` — daily / weekly / monthly + CSV export
- `/ams/config` — gate-camera → entry-point mapping; work-week; late
  threshold

**Tracking:**
- `/tracking` — live floor view (dot-per-person, employee / visitor /
  unknown colour-coded; tap → side panel)
- `/tracking/occupancy` — per-floor / per-zone / per-lift counters
- `/tracking/find` — where-is search; zoom + pulse
- `/tracking/replay` — path replay for a person + time range
- `/tracking/heatmap` — time-of-day activity bloom

### 8.7 Alarms (always-on, evolves through phases)
Existing alarms inbox extended with **source-module chip filter** and the
unified `OpsEvent` type so VMS AI alerts, ANPR unknown-plate, tracking
zone-violations all funnel through the same triage UI.

### 8.8 Overview (Phase 1 first cut; refined every phase)
- Live counters (one per enabled module)
- Facility map canvas (becomes the tracking floor view in Phase 5)
- Top alerts (3 cards)
- Live event stream column (`useOpsEvents`)

---

## 9. Phased delivery

### Phase 0 — Foundations (no user-visible change)
**Goal:** ship the chassis so every later phase is straight-line work.
**Status:** delivered 2026-05-12. See `PLAN-IMPLEMENTATION.md` for the
per-item log; summary below reflects what's actually in repo.

Delivered:
- `openapi/spec.yaml` + `openapi/package.json` (Prism) + README — identity,
  auth (token endpoint), IoT (assets, alarms, datapoints) with inline
  examples.
- `npm run mock` + `npm run dev:mock` scripts.
- `vite.config.js` — `VITE_API_BASE` switching, `/api/{realm}` rewrite for
  Prism, attribute-write bypass middleware.
- `src/api/safeGet.js`.
- `src/api/iot/{index,translators}.js` — HTTP + translator, single file pair.
- `src/hooks/useAssets.js` migrated to consume `api/iot`.

Pushed to Phase 1 (no consumer yet):
- `src/shell/moduleRegistry.js`, `src/hooks/useEnabledModules.js`,
  `src/models/*` JSDoc typedefs.
- IoT page physical move under `src/modules/iot/pages/`.
- `motion.js` util.

**Acceptance (re-checked 2026-05-12):**
- Existing portal works identically against real backend and mock — yes.
- `VITE_API_BASE=mock npm run dev` boots without backend — yes.
- `npm run lint` + `npm run build` clean — yes.
- ~~Disabling `iot` module via `/me` hides every IoT surface~~ — moved to
  Phase 1 with the registry.

### Phase 1 — Admin + new Overview shell

**Pre-work (deferred chassis from Phase 0 — do first):**
- `src/models/common.js`, `src/models/iot.js` JSDoc typedefs.
- `src/shell/moduleRegistry.js` + per-module entry contract (see §6.2).
- `src/hooks/useEnabledModules.js` reading `/me`.
- Wire `Sidebar.jsx` (currently hardcoded nav) to render from the registry.
- Add `GET /me` translator + endpoint to `src/api/identity.js`.
- `src/utils/motion.js` shared presets + `prefers-reduced-motion` gate.

**Features:**
- Facility model schema in spec.
- `/admin/users`, `/admin/roles`, `/admin/facility`, `/admin/modules`,
  `/admin/audit`.
- New animated Overview with per-module tile slots (only IoT tile lit
  in this phase) and unified event stream column.
- Sidebar grouping (Security / People / Site / Admin) with gated items.

**Acceptance:**
- Customer admin can build the facility graph and toggle modules from
  the UI.
- Disabling a module hides every surface within 1 render.
- All Phase 0 acceptance criteria still pass.

### Phase 2 — Visitors
- `/visitors/*` routes per §8.3
- ID-scan endpoint with mocked OCR
- Approval flow end-to-end (submit → push notification → approve →
  countdown starts)
- Active visitor countdown rings + extend / revoke
- Watchlist scan check
- Overview tile: "Active visitors (n) · Expiring next: ..."

**Acceptance:**
- A receptionist persona can submit a visitor in <30 seconds in the
  mock.
- A host persona gets a push notification, approves in one tap,
  countdown begins.
- Live event stream shows the approval and the auto-expiry.

### Phase 3 — VMS
- HLS player component (`<LiveStream src=... />`)
- Live wall (1 / 4 / 9 / 16) with motion-ripple
- AI alert feed with bounding-box overlay
- `/vms/config` detection rules editor
- Overview tile: "AI alerts today (n) · last: weapon @ Camera 4"

**Acceptance:**
- Mock fires an AI alert every ~5 min; it lands in the feed and the
  Overview event stream with a working clip preview.
- Acknowledge / Escalate / Dismiss mutates state via the gateway.

### Phase 4 — ANPR
- Live plate-read feed with scan-sweep animation
- Vehicle registry CRUD
- Per-gate rule editor
- Overview tile: "Today: n entries · m unknown"

**Acceptance:**
- Mock plate-read every ~30 s alternates known vs unknown; known
  triggers a barrier-rise animation, unknown raises a triageable alert.

### Phase 5 — AMS + Person Tracking (delivered together)
- Face-enrolment wizard
- Live roster with presence rings
- Anomaly review
- Tracking live floor view with dots + heatmap toggle
- Where-is search + path replay
- Overview tile becomes the floor canvas with live dots

**Acceptance:**
- Mock check-in / check-out animates onto the roster and updates the
  floor counter.
- 30 mock people drift on the floor view smoothly at 2 s update rate.

### Phase 6 — Polish & Branding
- Per-customer branding (logo, accent)
- Hardware ID-scanner integration (deferred per §10)
- Multi-tenant admin if required
- Tutorial cards updated for new modules

---

## 10. Decisions — proposed defaults

Each item is a **DECISION** to confirm. I've chosen the simplest default
that unblocks work; reply to override.

1. **Phasing** — order above (0 → 6).
   **DECISION:** approved unless you redirect.

2. **Multi-tenant** — single-tenant per deployment for v1; one customer
   per portal install. Module enablement still configurable per portal.
   **DECISION:** single-tenant v1; revisit before Phase 6.

3. **ID scanner** — MVP uses webcam OCR via a backend endpoint (camera
   takes a still, backend parses). Hardware reader (HID keyboard wedge)
   support reserved for Phase 6.
   **DECISION:** webcam OCR for v1.

4. **Branding per customer** — deferred to Phase 6.
   **DECISION:** deferred.

5. **Types** — JSDoc typedefs in `src/models/`; no TypeScript migration.
   Aligns with existing JSX-only constraint in README §1.
   **DECISION:** JSDoc.

6. **Mock-server stack** — Stoplight Prism CLI reading
   `openapi/spec.yaml`. Zero hand-written handlers. Statefulness
   added as a small overlay only if/when a phase needs it.
   **DECISION:** Prism (revised 2026-05-12).

7. **Camera streams** — HLS for v1 (broadest browser support, single
   `<video>` element with `hls.js` polyfill on Chrome/Firefox; native on
   Safari). WebRTC noted as Phase 6 upgrade if low-latency is required.
   **DECISION:** HLS.

8. **Person-tracking update channel** — WebSocket-first to
   `/ws/tracking`; fall back to 2 s polling on `/tracking/positions` if
   the socket is unavailable. Re-uses the existing best-effort
   WebSocket pattern in `useLiveEvents.js`.
   **DECISION:** WebSocket + 2 s poll fallback.

---

## 11. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Backend API shapes change mid-flight | Translator layer absorbs the change; pages untouched |
| Odoo response inconsistency | Snapshot tests on translators run on a fixture set |
| Mock drifts from real backend | Backend devs run portal against their staging weekly; diff observed via translator failures |
| HLS playback failures on some browsers | `hls.js` polyfill detection; degrade to "snapshot every 2s" mode |
| WebSocket flakiness in customer networks | 2 s poll fallback is identical-behaviour, just slower |
| Animation perf on lower-end laptops | Reduced-motion + density "compact" auto-applied below a measured FPS threshold |
| Permission creep — over-eager module visibility | Every gate goes through `useEnabledModules` + permission name; no `customType==='admin'` shortcuts |

---

## 12. Out-of-scope (explicit)

- Building Odoo modules / Frigate integration / ANPR algorithms.
- Face recognition / OCR / plate match / AI inference in the browser.
- Direct calls to OpenRemote / Frigate / Odoo from the browser.
  Everything flows through the gateway.
- Email / SMS sending (backend).
- Long-term clip storage (Frigate handles).

---

## 13. Definition of done per phase

A phase is "done" when:

1. All routes in §8 for that phase are reachable and animated.
2. Every endpoint that phase needs is present in `openapi/spec.yaml`
   with a working example and the mock server returns it.
3. Translator coverage: 100 % of fields the UI reads pass through a
   translator (no `dto.foo_bar` in `pages/` or `components/`).
4. Module-disable test passes (toggle the module off in `/me`, all
   surfaces hide cleanly).
5. `npm run lint` clean. `npm run build` clean.
6. Manual demo run end-to-end on the mock without backend running.

---

## 14. Open items still to clarify

These don't block Phase 0. Confirm before the corresponding phase starts.

- [ ] **Phase 2** — visitor ID type: CNIC, passport, both? Photo on
  card requires real OCR; we'll need a sample card from a real card.
- [ ] **Phase 2** — approval push channel: in-app OS notification only,
  or also SMS / email via gateway?
- [ ] **Phase 3** — Frigate clip URL format and auth. Are clip URLs
  signed, or fronted by the gateway with bearer auth?
- [ ] **Phase 4** — barrier control: ANPR gate auto-opens via direct
  IoT actuator call from gateway, or via a "GateController" abstraction?
- [ ] **Phase 5** — tracking source: which backend service emits
  positions, what coordinate system, what update rate?
- [ ] **Phase 5** — face enrolment storage: where does the face
  template live? We send the photo; do we get a `face_id` back?
- [ ] **Phase 6** — multi-tenant requirement.
- [ ] **Phase 6** — hardware ID-scanner make / model.

---

## 15. Next step

Phase 0 is delivered (see `PLAN-IMPLEMENTATION.md`). The next task is
**Phase 1 pre-work**:

1. Add `src/models/common.js`, `src/models/iot.js` JSDoc typedefs (only
   the fields a Phase 1 component will actually read).
2. Add `GET /me` to `openapi/spec.yaml`, add `src/api/identity.js`
   (`fetchMe` + `toMe`).
3. Add `src/shell/moduleRegistry.js` + an IoT entry; refactor
   `Sidebar.jsx` to render from the registry.
4. Add `src/hooks/useEnabledModules.js` and wire it into the sidebar
   gating.
5. Verify: flipping `iot.enabled: false` in the mock's `/me` example
   hides every IoT sidebar item within one render.

Then Phase 1 features proper (facility model + admin pages).
