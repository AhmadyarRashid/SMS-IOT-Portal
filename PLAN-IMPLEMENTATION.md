# Plan Implementation Log

> Tracks what was actually delivered against `PLAN.md`, and what was
> deferred. Update this file at the end of each phase (or each PR within
> a phase) so future readers can see the gap between plan and code at a
> glance.

Last updated: 2026-05-12

---

## Phase 0 — Foundations

**Goal:** ship the chassis so every later phase is straight-line work.
**Status:** delivered, with simplifications.

### Delivered

| Item                                          | Status   | Notes |
|---                                            |---       |---    |
| `openapi/spec.yaml`                            | done     | Identity (`/me`), auth (token endpoint), IoT (assets, alarms, datapoints). Inline examples so Prism serves real responses. |
| `openapi/package.json` (Prism CLI dep)         | done     | `@stoplight/prism-cli` only — zero hand-written handlers. |
| `openapi/README.md`                            | done     | How to run + extend. |
| `npm run mock` script                          | done     | Delegates to `openapi/` (Prism on `:4010`). |
| `npm run dev:mock` script                      | done     | Equivalent to `VITE_API_BASE=mock npm run dev`. |
| `vite.config.js` — `VITE_API_BASE` switching   | done     | `mock` → `http://localhost:4010`, default → `https://go.smsiotpk.com`. |
| `vite.config.js` — strip `/api/{realm}` prefix | done     | Prism mounts paths at root; proxy rewrites the prefix away. |
| `vite.config.js` — attribute-write bypass      | done     | Middleware returns 204 for `PUT /asset/{id}/attribute/{name}` so Prism's strict body parser doesn't 422 on bare-primitive bodies. |
| `src/api/safeGet.js`                            | done     | `safeGet`, `toId`, `mapArray` — used by translators. |
| `src/api/iot/translators.js`                    | done     | `toAttribute`, `toAsset`, `toAlarm`, `toAlarmUpdate`, `toDatapoint`. Pure functions. |
| `src/api/iot/index.js`                          | done     | HTTP + translation consolidated (no separate raw layer). Hooks/pages import from here. |
| `src/hooks/useAssets.js` migrated              | done     | Now imports `queryAssets`, `getAsset`, `getAlarms`, `updateAlarm`, `getDatapoints`, `writeAttributeValue`, `updateAsset`, `getUserAssets` from `../api/iot`. |
| `src/api/index.js` updated                     | done     | Replaced `assetsAPI`/`alarmsAPI`/`datapointsAPI` re-exports with one `iotAPI`. |
| ESLint Node env for `vite.config.js`           | done     | Separate config block; `mock-server/`-related rules removed when the folder went. |

### Removed before merge (originally proposed, deferred to Phase 1)

| Item                                  | Reason                                                                 |
|---                                    |---                                                                     |
| `src/models/{common,iot}.js`           | JSDoc typedefs with no consumer. Add when a hook/component reads them. |
| `src/shell/moduleRegistry.js`          | No sidebar/router actually reads it yet — premature.                    |
| `src/modules/iot/{index,pages/...}.js` | Re-export surface had no importers; would orphan-flag in CI later.      |
| `src/hooks/useEnabledModules.js`       | Depended on registry + `/me`; nothing in the UI gates on it yet.        |
| Stateful Express mock server          | Replaced by Prism per user direction — simpler, contract-driven.         |

### Acceptance criteria — re-checked

| Original criterion                                                | Status |
|---                                                                |---     |
| Existing portal still works identically against real backend       | done   |
| Existing portal works against the mock                             | done   |
| `npm run dev:mock` boots, talks to Prism, no backend needed        | done   |
| `npm run build` clean                                              | done   |
| `npm run lint` clean                                               | done   |
| ~~Disabling `iot` module via `/me` hides every IoT surface~~       | deferred to Phase 1 (registry removed) |

### Decisions made or revised during Phase 0

| Decision                                                          | Outcome |
|---                                                                |---      |
| Mock-server stack — Node/Express vs Prism                          | Prism (revised 2026-05-12) — stateless trade accepted; small dynamic overlay can be added later if a phase needs it. |
| Translator layer split (raw HTTP + translated)                     | Merged into single `src/api/iot/index.js` — one module doesn't justify two files. |
| Module registry / facility model / models layer                    | Pushed to Phase 1 — build when there's a consumer, not earlier. |

---

## Phase 1 — Admin + new Overview shell

**Goal:** facility model, users/roles, module enablement, animated Overview shell.
**Status:** not started.

Pre-Phase-1 work that was deferred from Phase 0 (do these first):

- [ ] `src/models/common.js`, `src/models/iot.js` (JSDoc typedefs).
- [ ] `src/shell/moduleRegistry.js` + per-module entries.
- [ ] `src/hooks/useEnabledModules.js` reading `/me`.
- [ ] Wire `Sidebar.jsx` to read from the registry instead of hardcoded nav.
- [ ] Add `/me` to `src/api/iot/index.js` (or a new `src/api/identity.js`) with translator.
- [ ] Decide whether to physically move IoT pages under `src/modules/iot/pages/` or keep them in `src/pages/` indefinitely.

Phase 1 features (per PLAN §8.2):

- [ ] `/admin/users` — list / invite / deactivate / role assignment.
- [ ] `/admin/roles` — predefined + custom roles, per-module permission matrix.
- [ ] `/admin/facility` — facility graph CRUD; JSON import/export; floor-plan image upload.
- [ ] `/admin/modules` — toggle modules per deployment (or per customer if multi-tenant).
- [ ] `/admin/audit` — paginated admin-action log.
- [ ] New animated Overview shell with per-module tile slots + unified event-stream column.
- [ ] Sidebar grouping (Security / People / Site / Admin).

OpenAPI work for Phase 1:

- [ ] `Facility` schemas (Site / Building / Floor / Room / Door / Lift / Gate / Camera).
- [ ] `User`, `Role`, `Permission`, `Module` admin endpoints.
- [ ] `AuditEntry` schema + endpoint.
- [ ] Examples for every response so Prism serves them.

---

## Phase 2 — Visitors

Not started. See PLAN §8.3.

---

## Phase 3 — VMS

Not started. See PLAN §8.4.

---

## Phase 4 — ANPR

Not started. See PLAN §8.5.

---

## Phase 5 — AMS + Person Tracking

Not started. See PLAN §8.6.

---

## Phase 6 — Polish & branding

Not started. See PLAN §8 (Phase 6 row).

---

## Conventions for this log

- One row per discrete deliverable (file, script, route, or behavioural
  change). Coarser entries lose value over time.
- Status vocabulary: `done`, `partial`, `deferred`, `removed`, `not
  started`. Avoid colours/emoji.
- When a Phase 0 item is reclassified to Phase 1, leave a row in Phase
  0's "Removed before merge" table and a corresponding row in Phase 1's
  pre-work checklist. Don't delete history.
- Update at the end of every PR that touches plan scope.
