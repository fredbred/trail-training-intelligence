# Notion Trail Goal Training

Local TypeScript project for creating a generic Notion training dashboard for a trail goal.

The script does not hardcode secrets, does not log the Notion token, never deletes existing Notion content, and can generate a local Markdown/CSV preview without contacting Notion.

## Install

```bash
npm install
```

## Create A Notion Integration

1. Open [Notion Developers](https://www.notion.so/profile/integrations).
2. Create a new internal integration.
3. Grant the minimum capabilities for reading, inserting and updating content.
4. Store the integration secret locally as `NOTION_TOKEN`.

## Share A Parent Page

1. In Notion, create or choose an empty parent page.
2. Open the `...` menu in the top-right corner.
3. Choose `Add connections`.
4. Select the integration.

## Get The Parent Page ID

1. Open the parent page in Notion.
2. Use `Share` and copy the link.
3. The page ID is the long identifier in the URL.
4. Hyphenated and non-hyphenated IDs both work; the script passes the value through to Notion.

## Configure `.env`

Create a local, uncommitted `.env` file:

```dotenv
NOTION_TOKEN=<your_notion_token>
NOTION_PARENT_PAGE_ID=...
NOTION_VERSION=2026-03-11
```

Never commit `.env`; it is ignored by `.gitignore`.

## Local Dry Run

```bash
npm run dry-run
```

Generates files under `output/`:

- `dashboard.md`
- `training_plan.csv`
- `weekly_review.csv`
- `training_phases.csv`
- `session_library.csv`
- `rules.csv`
- `manifest.preview.json`

This command does not contact Notion.

## Create The Notion Structure

```bash
npm run create-notion
```

The command:

1. checks `NOTION_TOKEN` and `NOTION_PARENT_PAGE_ID`;
2. creates the root page `Your Trail Goal`;
3. appends dashboard content to that page;
4. creates five databases below that page;
5. adds a weekly calendar view named `Weekly calendar` on the `Training Plan` database;
6. inserts the initial rows;
7. writes `output/notion_manifest.json` with IDs, URLs and view metadata.

Equivalent dry-run mode:

```bash
npm run create-notion -- --dry-run
```

## Rerun Without Duplicates

If `output/notion_manifest.json` already exists, `npm run create-notion` stops to avoid creating a duplicate dashboard.

To explicitly create a new structure:

```bash
npm run create-notion -- --force
```

The script never deletes old Notion pages. If creation fails halfway through, it writes `output/notion_manifest.partial.json` with any IDs already returned by Notion.

## Build And Tests

```bash
npm run build
npm test
```

The tests check:

- exactly one `title` property per database;
- seed values stay inside allowed `select` options;
- plan dates are valid ISO dates;
- dry-run files do not contain token values.

## Useful Notion Errors

- `401`: invalid or expired token; check `NOTION_TOKEN`.
- `403`: integration lacks capabilities or the parent page was not shared with it.
- `404`: parent page is missing or inaccessible.
- `429`: Notion rate limit; retry later.

## Limits

The API creates databases, schemas, rows and page content. More advanced Notion views, filters, sorts and layouts may still need manual adjustment in Notion.

The script also creates a simple weekly calendar view on `Training Plan`, based on the `Date` property, with useful card properties visible: type, duration, ascent, intensity, priority, status and notes.
