# Dry-Run Modes

The project is designed so a reviewer can inspect useful behavior without credentials or private data.

## Trail Data Pipeline

The Python pipeline is file-based and local-only. It does not contact COROS or any external service.

```bash
python3 -m pytest
```

For private local use, `trail-data-pipeline analyze` writes to the caller's chosen output directory. Public examples are provided as synthetic output files rather than raw activity exports.

Safety controls:

- input path is explicit
- output path is explicit
- generated reports are ignored by default
- missing FIT/TCX fields are captured as data-quality signals

## Notion Training Dashboard

The Notion tool has a local dry-run that writes Markdown and CSV files without calling Notion.

```bash
cd notion-ventoux-training
npm run dry-run
npm test
```

Safety controls:

- dry-run output is local
- token values are not written to dry-run files
- live creation requires credentials and a parent page
- creation mode checks for an existing manifest to avoid duplicate dashboard creation

## Morning Training Sync

The public-safe morning-sync surface is tested through fixtures and synthetic objects.

```bash
cd runalyze-morning-sync
npm run build:logic
npm run test:logic
```

Safety controls:

- tests do not require credentials
- recommendation output includes reasons and data-quality flags
- missing health or trend data degrades to cautious recommendations
- private account adapters and captured traffic are excluded from the public repository

## Live Write Policy

Any workflow that can write to a third-party system should follow these rules:

- dry-run by default
- explicit execution flag for real writes
- no raw payloads in committed output
- no tokens, cookies, sessions, or private IDs in logs
- clear refusal or no-op behavior when required context is missing
