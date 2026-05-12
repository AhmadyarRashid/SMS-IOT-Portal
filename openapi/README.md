# OpenAPI spec — source of truth + Prism mock

`spec.yaml` is the contract between the SMS One-Box portal (this repo)
and the gateway backend. Every endpoint carries an `example` payload —
that is what the [Prism](https://meta.stoplight.io/docs/prism) mock
returns when the portal points at it.

## Run the mock

```bash
cd openapi
npm install          # one-off, installs @stoplight/prism-cli
npm run mock         # serves spec.yaml on :4010 (static, deterministic)
# or, for response variety:
npm run mock:dynamic # Prism generates values from each schema
```

From the repo root:

```bash
npm run mock         # delegates to openapi/
npm run dev:mock     # Vite proxies /api and /auth to localhost:4010
```

## What you get

- Static responses driven by `example:` payloads in `spec.yaml`.
- No statefulness — toggling a light returns 204, but the next GET of
  that asset returns the same baked example. Polling reconciles the UI
  back to that state on the next tick.
- One example per endpoint for now. Multiple named examples can be
  selected by adding the `Prefer: example=<name>` header (Prism feature).

## When to upgrade beyond Prism

If a future phase needs flows that *have to stick* (visitor approval
followed by an "active visitors" list update; ANPR plate reads ticking
in; person dots drifting across the floor), we add a small dynamic
overlay process *in addition to* Prism, not replacing it. Prism stays
as the contract source.

## Phases

- **Phase 0** (this commit) — identity + existing IoT surface (assets,
  alarms, datapoints).
- **Phase 1** — Facility model, users, roles, audit log, module
  enablement endpoints.
- **Phase 2** — Visitors.
- **Phase 3** — VMS.
- **Phase 4** — ANPR.
- **Phase 5** — AMS + Person Tracking.

## Conventions

- All operations are realm-scoped under `/api/{realm}`.
- IDs are strings on the wire; the translator layer coerces to string
  defensively.
- Legacy IoT endpoints emit epoch-ms timestamps (`createdOn`); new
  endpoints emit ISO 8601. The translator exposes both.
- Every field the portal reads must have an example value in
  `spec.yaml`. Otherwise Prism returns nothing for it.

## Editing the spec

1. Edit `spec.yaml`.
2. `prism mock` reloads on file save; just restart `npm run mock` if it
   gets out of sync.
3. Update the matching translator in
   `../src/api/<module>/translators.js`.
4. If a wire field renamed, the translator absorbs it; no page change.

## Validate

Prism validates the spec on boot. To check ahead of time:

```bash
npx @apidevtools/swagger-cli validate spec.yaml
```
