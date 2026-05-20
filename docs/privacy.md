# Privacy And Publication Policy

This repository is intended to be public-safe. It should demonstrate system design and implementation quality without exposing private training data or account details.

## Never Publish

- `.env*` files or credential templates that contain real values.
- Tokens, cookies, session stores, access keys, API secrets, or account identifiers.
- Raw COROS exports, FIT/TCX files from a real account, or ZIP exports.
- Generated personal reports, daily health pulls, recovery snapshots, or private charts.
- HAR/MITM captures or any captured browser/mobile traffic.
- Notion database IDs, page IDs, manifests, or URLs from a private workspace.
- Private endpoints, raw payloads, or step-by-step instructions for undocumented account automation.

## Safe To Publish

- Source code for local parsing, normalization, metrics, reporting, and pure recommendation logic.
- Tests that use synthetic values or small fixtures.
- Architecture docs that describe boundaries without private request details.
- Dry-run documentation that explains safety controls without credentials.
- Synthetic or anonymized CSV/Markdown outputs.

## Redaction Rules

- Replace real activity exports with synthetic examples that preserve schema shape only.
- Replace personal output folders with short sample files under `examples/synthetic/`.
- Describe private validation runs without publishing the underlying files or reports.
- Keep write-capable integrations behind explicit dry-run or execution flags.
- Document missing-data behavior and safety limits honestly.

## Pre-Push Checklist

Run this checklist before creating a commit for the public repository:

1. Confirm `git status --short` does not show private data folders or hidden secret files.
2. Confirm raw exports, generated reports, `input/`, `output/`, `.env*`, token stores, and manifests are ignored.
3. Search only safe source/docs for accidental secrets or identifiers.
4. Run fixture-based tests that do not require credentials.
5. Do not run credentialed pulls, account discovery, or live write tests as part of public verification.

## Medical And Training Disclaimer

The recommendation logic is training decision support. It is not a medical device, diagnosis, or replacement for professional coaching or healthcare advice.
