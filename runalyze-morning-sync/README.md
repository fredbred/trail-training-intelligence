# Morning Training Sync

TypeScript recommendation layer for morning training decisions.

This public version keeps the safe engineering signal: condition analysis, trend handling, recommendation rules, fixture tests, and dry-run-first design. Private account adapters, captured traffic, token state, raw output files, and undocumented service details are intentionally excluded from the public repository.

## What It Does

- Reads local morning context objects when available.
- Scores recovery and recent load from sleep, HRV, resting heart rate, fatigue/load signals, ascent, duration, and trend history.
- Recommends one of: maintain, reduce, replace with easy, rest, or swap with another session in the week.
- Handles missing data explicitly through data-quality flags.
- Keeps mutating planning actions outside the public-safe surface.

## Public-Safe Commands

```bash
npm install
npm run build:logic
npm run test:logic
```

`test:logic` runs fixture-based tests for recommendation, condition analysis, date handling, retry behavior, and plan CSV parsing. It does not require credentials or network access.

## Privacy Boundary

Excluded from the public repository:

- `.env*`
- token, cookie, and session directories
- HAR/MITM captures
- local `input/` and `output/`
- generated daily health/recovery files
- Notion manifests and database IDs
- private adapters for undocumented account workflows

The local private system may contain additional dry-run and guarded execution commands. Public documentation describes their safety posture at the architectural level only, without endpoints, payloads, account automation steps, or captured request details.

## Safety Model

- Dry-run is the default posture for planning actions.
- Real writes require an explicit execution flag in the private local workflow.
- Generated reports should avoid raw payloads and identifiers.
- Recommendations are training decision support, not medical advice.
