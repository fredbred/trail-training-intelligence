# Repository Structure

```text
Trail Training Intelligence
  README.md
  config.example.yaml
  pyproject.toml
  setup.py

  src/trail_data_pipeline/          # Python loaders, normalization, metrics, reports
  tests/                            # Python fixture tests

  notion-ventoux-training/          # TypeScript Notion schema and dry-run exporter
    src/
    tests/

  runalyze-morning-sync/            # Public-safe recommendation and condition logic
    src/
    tests/

  docs/                             # Architecture, privacy, dry-run docs
  examples/synthetic/               # Synthetic/anonymized output examples
```

Private local folders are ignored:

- `training/`
- `data/raw/`
- `data/processed/`
- `reports/`
- `**/input/`
- `**/output/`
- `**/.coros-token/`
- `**/.env*`
- dependency, build, and cache folders

The public repository keeps the engineering signal while excluding private exports, account state, generated personal reports, and undocumented integration details.
