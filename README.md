# Trail Training Intelligence

Local-first training intelligence for trail running. The system turns messy watch exports, training-plan data, and morning recovery/load signals into inspectable reports and guarded recommendations.

This public repository is a safe portfolio version. Examples are synthetic or anonymized, and private exports, credentials, health records, generated reports, Notion IDs, token stores, and undocumented COROS integration details are intentionally excluded.

## What It Does

- Parses local COROS-style ZIP, FIT, and TCX activity exports into normalized activity, record, and lap tables.
- Computes weekly/monthly volume, distance, ascent, trail specificity, long runs, back-to-back blocks, heart-rate zones, estimated load, acute/chronic load ratio, and data-quality flags.
- Generates CSV, Markdown, and chart-oriented report outputs.
- Builds a Notion training-dashboard structure with local Markdown/CSV dry-runs before any Notion write.
- Evaluates morning training context and recommends whether to maintain, reduce, rest, replace with an easy session, or swap sessions within the week.
- Keeps write operations behind dry-run or explicit execution gates.

## Why I Built It

Trail preparation has noisy inputs: device exports, incomplete streams, changing recovery signals, plan changes, terrain specificity, and tools that do not all share clean APIs. I built this to make the data useful without making it fragile or unsafe. The priority is a system that can explain its decisions, run locally, degrade when data is missing, and avoid accidental writes.

The private local version has been validated against a real one-year COROS export. That raw data and its generated personal reports are not published.

## Architecture

```text
Local activity export
  -> Python loaders
  -> normalized activities / records / laps
  -> metrics, data-quality checks, reports

Training plan seed data
  -> TypeScript Notion schema builder
  -> dry-run Markdown/CSV
  -> optional Notion creation with duplication guard

Morning context pulls
  -> recovery/load analysis
  -> recommendation engine
  -> optional guarded planning action
```

More detail: [docs/architecture.md](docs/architecture.md).

## Example Output

Synthetic examples live in [examples/synthetic](examples/synthetic).

| Output | Example |
| --- | --- |
| Pipeline report | [pipeline-report.md](examples/synthetic/pipeline-report.md) |
| Normalized activities | [activities.csv](examples/synthetic/activities.csv) |
| Weekly summary | [summary_weekly.csv](examples/synthetic/summary_weekly.csv) |
| Morning recommendation | [morning-recommendation.md](examples/synthetic/morning-recommendation.md) |
| Notion dry-run preview | [notion-dashboard-preview.md](examples/synthetic/notion-dashboard-preview.md) |

## Tech Stack

- Python, pandas, matplotlib, PyYAML
- FIT parsing via `fitparse`, with `fitdecode` fallback
- TCX parsing via Python XML tooling
- TypeScript, Node.js, Vitest
- Notion SDK for live dashboard creation

## Safety And Privacy

- Public examples are synthetic or anonymized.
- Raw exports, generated private reports, health/recovery output files, HAR/MITM captures, token/cookie/session state, `.env*`, and Notion manifests are ignored.
- Undocumented COROS web adapters are not part of the public-safe surface. The repository keeps the architecture, decision logic, and dry-run posture without publishing private endpoints, payloads, cookies, tokens, or account automation steps.
- Recommendations are training decision support, not medical advice.

See [docs/privacy.md](docs/privacy.md).

## Dry-Run Modes

- Python pipeline writes only to a chosen local output directory.
- Notion dashboard generation supports local Markdown/CSV dry-runs with no Notion API call.
- Morning recommendation logic can be tested from fixtures without credentials.
- Mutating planning paths are private, explicit, and guarded by execution flags in the local system.

See [docs/dry-run-modes.md](docs/dry-run-modes.md).

## Tests

Python pipeline:

```bash
python3 -m pytest
```

Notion dashboard:

```bash
cd notion-ventoux-training
npm test
```

Morning recommendation logic:

```bash
cd runalyze-morning-sync
npm run test:logic
```

Tests use fixtures or synthetic values. Credentialed pulls and private-data tests are intentionally excluded from the public path.

## Public Vs. Intentionally Excluded

Public:

- Parser, normalization, metrics, reporting, and fixture tests.
- Notion schema creation, seed-data checks, and dry-run export tests.
- Recommendation and condition-analysis logic with synthetic test cases.
- Synthetic output examples.

Excluded:

- Raw COROS exports and generated personal reports.
- Local health/recovery pulls and daily routine outputs.
- `.env*`, tokens, cookies, sessions, HAR/MITM captures, Notion manifests, and database IDs.
- Private implementation details for undocumented account integrations.
