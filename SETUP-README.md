# SMS IoT Client Portal — Setup guide

Everything a new developer needs to run this app locally, deploy it, and
understand the backend it talks to. For architecture and per-page
conventions read `README.md` after this.

---

## 1. Prerequisites

| Tool | Version | Why |
|---|---|---|
| **Node.js** | ≥ 20.10 | Vite 8 requires Node 20+ |
| **npm** | ≥ 10 | bundled with Node 20 |
| A modern browser | Chrome / Edge / Safari / Firefox | The app uses Service Workers, IndexedDB, and the Notification API |
| An SMS IoT backend | Reachable at a stable URL | `go.smsiotpk.com` by default — ask an admin for a test realm |

No Docker/database needed for local dev — the backend is remote.

---

## 2. One-time setup

```bash
# 1. Clone
git clone <repo-url> sms-iot-dashboard
cd sms-iot-dashboard

# 2. Install deps
npm install

# 3. Env config
cp .env.example .env
```

Open `.env` and fill in:

```env
VITE_SMS_IOT_URL=https://go.smsiotpk.com
VITE_SMS_IOT_REALM=sms-iot
```

Legacy names `VITE_OPENREMOTE_URL` / `VITE_OPENREMOTE_REALM` are still
honoured if you inherit a config. Nothing in the code hardcodes these —
all requests use relative `/api/*` + `/auth/*` paths and rely on the
Vite/nginx proxy (see §5).

---

## 3. Running in development

```bash
npm run dev
```

- Serves on `http://localhost:3000` (falls back to 3001 if busy).
- Vite proxies `/api/*` and `/auth/*` to `VITE_SMS_IOT_URL` so the
  browser stays same-origin. No CORS configuration needed.
- HMR is enabled.
- The service worker IS registered in dev (needed for rich browser
  notifications) but bypasses `/@vite/`, `/@fs/`, `/src/`, `?import`,
  `?t=...` so HMR is unaffected.

Log in with any Keycloak user that has at least `read:assets` and
`read:alarms` in the SMS IoT realm — see §4 for role details.

---

## 4. Backend requirements

The portal talks to an OpenRemote-compatible backend via a Keycloak
realm. A user needs these **client-roles** to use the portal fully:

| Role | Needed for |
|---|---|
| `read:assets` | Any page that lists or detail-views an asset (everything except `/login`) |
| `write:assets` | **Only** admins who need to rename assets via the full-asset PUT. The portal's in-app rename does NOT need this — it writes through the `notes` attribute via `write:attributes`. |
| `read:alarms` | `/alarms`, `/live`, the alarm badge, and the overview alarm pipeline |
| `write:alarms` | Ack / Resolve buttons on `/alarms` |
| `write:attributes` | Any icon tap, Controls-tab switch, or device rename |
| any authenticated user | fallback `/asset/user/current` for restricted users |

**Restricted-user mode:** if a user only gets `restricted-user` plus
linked-asset rows, the portal degrades gracefully — `useAssets` falls
back to `/asset/user/current` and the UI shows only the linked subset.
See `src/hooks/useAssets.js#fetchAssetsWithFallback`.

**Keycloak client:** the portal logs in against the `openremote` client
on the SMS IoT realm using OAuth2 Password Grant. Don't rename the
client without updating `src/api/client.js#refreshAccessToken`.

---

## 5. Proxy setup (dev + prod)

The browser never speaks cross-origin to the backend. Instead:

- **Dev:** `vite.config.js` proxies `/api/*` + `/auth/*` to
  `VITE_SMS_IOT_URL` on `localhost:3000`.
- **Prod:** `nginx.conf` (inside the Docker image) proxies the same
  prefixes to `SMS_IOT_BACKEND_URL` at runtime.

If you see CORS errors, check that you're using a **relative** path for
every fetch. Never construct a URL like `${VITE_SMS_IOT_URL}/api/...`.

---

## 6. Available scripts

```bash
npm run dev       # Vite dev server on localhost:3000
npm run build     # Production build into dist/
npm run preview   # Preview the dist/ build locally
npm run lint      # ESLint flat-config across src/
```

**Commit hygiene:** CI isn't wired in this repo, so run `npm run lint`
and `npm run build` yourself before pushing. Both should be green.

---

## 7. Production build (Docker)

Multi-stage Dockerfile bakes the env vars into the bundle at build time.

```bash
docker build \
  --build-arg VITE_SMS_IOT_URL=https://go.smsiotpk.com \
  --build-arg VITE_SMS_IOT_REALM=sms-iot \
  -t sms-iot-dashboard .

docker run -d \
  --name sms-iot-dashboard \
  -p 8080:80 \
  -e SMS_IOT_BACKEND_URL=https://go.smsiotpk.com \
  sms-iot-dashboard
```

Both `VITE_SMS_IOT_*` and legacy `VITE_OPENREMOTE_*` ARGs are accepted.

---

## 8. Where things live (30-second map)

```
src/
├── api/                 thin axios wrappers (client.js, assets.js, alarms.js, …)
├── hooks/               React Query + custom hooks
│   ├── useAssets.js           all device/alarm/datapoint hooks + mutations
│   ├── useLiveEvents.js       mounted once in DashboardLayout — alarm toast,
│   │                          asset diff watcher, best-effort WebSocket
│   └── useAlarmNotifications.js  OS notification preference + fireAlarmNotification()
├── components/
│   ├── layout/          DashboardLayout, Sidebar, Header
│   ├── commandpalette/  ⌘K launcher
│   ├── pwa/             InstallPrompt (bottom-left toast)
│   ├── tiles/           AssetTile, GatewayCard, AssetGlyph
│   └── ui/              Button, Modal, Skeleton, Tip, EmptyState, …
├── pages/               one file per route + per-page CSS module
├── store/               zustand stores (auth, app, activity, pwa)
└── utils/
    ├── assetIcons.js    DEVICE_TYPES, CONTROLLABLE_TYPES, getAssetDisplayName,
    │                    NOTES_USED_FOR_DATA, primary-attr resolution
    ├── gateways.js      site/device/path helpers
    ├── prefs.js         IndexedDB preference helpers (idb-keyval)
    ├── helpers.js       date/time/number helpers
    └── csv.js           CSV export

public/
├── favicon.svg          cyan shield-check
├── manifest.webmanifest PWA manifest
└── sw.js                service worker — app-shell cache + rich notifications
```

Full per-file descriptions are in `README.md` §7.

---

## 9. Environment quickref

| Env var | Where set | Purpose |
|---|---|---|
| `VITE_SMS_IOT_URL` | `.env` (dev) / Docker build-arg (prod) | Origin the Vite/nginx proxy forwards to |
| `VITE_SMS_IOT_REALM` | same | Keycloak realm for auth |
| `SMS_IOT_BACKEND_URL` | Docker runtime env var (`-e`) | Nginx upstream in prod |
| `VITE_OPENREMOTE_URL` / `VITE_OPENREMOTE_REALM` | legacy | Same meaning, kept for back-compat |

`import.meta.env.VITE_*` reads resolve at **build time** — changing an
env var means rebuilding. `SMS_IOT_BACKEND_URL` is read by nginx at
container start, so a `docker run -e ...` switch is enough to retarget
the backend without rebuilding.

---

## 10. Common setup snags

**`npm install` fails with peer-dep warnings**
The repo uses React 19 — a few libs (e.g. react-leaflet) have warnings
against React 18 peer ranges. These are safe to ignore; the app
compiles and runs fine. If install fully errors, re-run with
`npm install --legacy-peer-deps`.

**Login works but every page shows "No sites yet"**
The user lacks `read:assets`. Check Keycloak → Users → *your-user* →
Roles. See §4 for the minimal role set.

**Icon taps don't do anything**
The user lacks `write:attributes`. The portal still renders but silently
drops mutations. Check the Network tab for 403 on
`PUT /asset/*/attribute/*`.

**Rename pencil doesn't appear on a device**
That device's type is in `NOTES_USED_FOR_DATA` (HumanPresenceSensor
today). See `src/utils/assetIcons.js`. By design — those types reuse
`notes` for sensor data and must not be overwritten.

**Alarm Ack/Resolve buttons 500**
The alarm update body must be minimal. `src/api/alarms.js#updateAlarm`
strips denormalised fields (`sourceName`, `assetId`) and server-managed
timestamps before sending. Re-adding a field there is the usual cause.

**OS notifications never fire even though the Settings toggle is on**
Three causes: (1) macOS System Settings → Notifications → Chrome must
be allowed; (2) DO NOT DISTURB / Focus must be off; (3) `useAssets` /
`useAlarms` **must** have `refetchIntervalInBackground: true` so polling
keeps running when the tab is hidden. See `README.md` §18 and §24.

**The app goes blank when clicking a sidebar link**
Regression guardrail: `DashboardLayout` must NOT wrap its `Outlet` in
`<AnimatePresence mode="wait">`. A hung exit animation in `mode="wait"`
would stall the new page's mount. See `README.md` §23 (Troubleshooting).

**Map markers appear over the sidebar / command palette**
Leaflet's internal z-indexes (400–800) must be isolated. The map
container on `/map` has `isolation: isolate; position: relative;
z-index: 0` — don't remove.

---

## 11. Upgrading the backend

If the SMS IoT / OpenRemote version changes, three integration points
are most likely to shift:

1. **Alarm response shape** — `resolveAlarmAsset` in `AlarmsPage.jsx`
   currently reads `alarm.asset[0]`. If the field is renamed, widen the
   resolver's priority list. All other display surfaces call
   `getAssetDisplayName` so they inherit the fix automatically.
2. **Alarm PUT body** — the server's strict SentAlarm deserializer
   can choke on extra fields. If renames start 500'ing, check
   `src/api/alarms.js#updateAlarm` and strip whatever new field the
   server dislikes.
3. **WebSocket events URL** — `/websocket/events` subscribe message
   format has changed across OR releases. `useLiveEvents` sends both
   legacy and modern subscribe payloads and falls back silently on
   handshake failure. Update the two `subscribes` entries there if a
   new wire format ships.

---

## 12. Getting help

- README.md — full architecture, per-page conventions, troubleshooting
- `/tutorial` in-app — illustrated walkthrough of every feature
- `support@smsiotpk.com` — linked from Settings → About

Everything else is code — 100% JSX, no TypeScript, no monorepo.
Follow the rules in §24 Conventions of `README.md` and you won't regress
anything that's been hard-won.
