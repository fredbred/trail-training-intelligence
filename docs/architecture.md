# Architecture

Trail Training Intelligence is a local-first workspace with five related systems. Each system can be understood and tested without publishing private account data.

```mermaid
flowchart TD
  A["Private local activity export"] --> B["Python loaders: ZIP, FIT, TCX"]
  B --> C["Normalized tables: activities, records, laps"]
  C --> D["Metrics and data-quality checks"]
  D --> E["CSV, Markdown, charts"]

  F["Training plan seed data"] --> G["Notion schema builder"]
  G --> H["Dry-run Markdown and CSV"]
  G --> I["Optional Notion creation"]

  J["Morning context objects"] --> K["Condition analysis"]
  K --> L["Recommendation engine"]
  L --> M["Maintain, reduce, rest, replace, or swap"]
  M --> N["Optional guarded planning action"]

  O["GPX course"] --> P["Course parsing and segmentation"]
  P --> Q["Grade-adjusted pacing model"]
  Q --> R["Per-segment pacing plan: CSV, Markdown"]

  C --> S["Personal grade-speed calibration"]
  S --> Q
```

## Components

| Component | Path | Role | Public-safe surface |
| --- | --- | --- | --- |
| Trail Data Pipeline | `src/trail_data_pipeline/` | Parse activity files, normalize tables, compute trail metrics, render reports | Loaders, normalization, metrics, report code, tests |
| Pacing Planner | `src/trail_data_pipeline/pacing.py` | Parse GPX courses and build grade-adjusted per-segment pacing plans | Parsing, models, segmentation, drift, checkpoints, rendering, CLI, tests |
| Personal Calibration | `src/trail_data_pipeline/calibration.py` | Fit the athlete's own grade-speed curve from normalized records | Profiling, fitting, JSON round-trip, model, CLI, tests |
| Notion Training Dashboard | `notion-trail-goal-training/` | Generate a structured training dashboard and local dry-run exports | Schemas, seed data, dry-run exporter, tests |
| Morning Training Sync | `runalyze-morning-sync/` | Analyze morning context and decide whether to maintain or adapt the day | Recommendation logic, condition analysis, fixture tests |

## Data Flow

1. The Python pipeline accepts a local ZIP, FIT, TCX, or directory input.
2. Loaders convert vendor-specific fields into `LoadedActivity` objects.
3. Normalization creates stable activity, record, and lap tables.
4. Metrics compute volume, distance, ascent, intensity, long-run structure, back-to-back blocks, estimated load, acute/chronic load ratio, and data-quality indicators.
5. Reporting writes CSV and Markdown artifacts to a caller-chosen output directory.
6. The Notion tool can generate local Markdown/CSV first, then create the dashboard only when credentials and a parent page are supplied.
7. The morning logic consumes local context snapshots and produces a recommendation with reasons and data-quality flags.
8. The pacing planner parses a GPX course, splits it into distance segments, weights each segment with a documented grade-adjusted cost model (optionally hiking above a gradient threshold), applies optional first-order fatigue drift, and renders a per-segment plan from a flat pace or a target time, with checkpoint clock times.
9. The calibration tool resamples the athlete's own records on a fixed distance grid, bins speed by gradient, compares the personal curve to Minetti, and exports a model the pacing planner can consume with a literature fallback outside the calibrated range. Calibrations built from real exports stay private.

## Safety Boundaries

- Raw exports and generated private reports are local-only.
- `.env*`, tokens, cookies, sessions, HAR/MITM captures, output files, and Notion manifests are ignored.
- Public examples are synthetic or anonymized.
- The public repository documents the existence of guarded private adapters without publishing undocumented endpoints, payloads, captured traffic, or account automation instructions.

## Design Choices

- Local-first processing keeps sensitive training data on disk instead of in a hosted service.
- Normalized tables make inconsistent FIT/TCX data testable and reportable.
- Missing values are preserved as data-quality signals instead of causing hard failures.
- Dry-run files make Notion/dashboard changes inspectable before live writes.
- Recommendation outputs include both the decision and the reasons, which makes the automation auditable.
