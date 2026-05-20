import { access, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import dotenv from "dotenv";

import { buildDashboardBlocks } from "./createDashboard.js";
import { createDatabases } from "./createDatabases.js";
import { createRowsForDatabase } from "./createRows.js";
import { createWeeklyPlanCalendarView } from "./createViews.js";
import { writeDryRunOutput } from "./markdownExport.js";
import { NotionApiError, NotionClient } from "./notionClient.js";
import { databaseSchemas } from "./schemas.js";
import { seedRows } from "./seedData.js";
import type { DatabaseKey, Manifest, NotionConfig } from "./types.js";

const ROOT_TITLE = "Grand Raid Ventoux 2027";
const OUTPUT_DIR = "output";
const NOTION_MANIFEST = join(OUTPUT_DIR, "notion_manifest.json");
const PARTIAL_MANIFEST = join(OUTPUT_DIR, "notion_manifest.partial.json");

type CliArgs = {
  command: "dry-run" | "create-notion";
  dryRun: boolean;
  force: boolean;
};

function parseArgs(argv: string[]): CliArgs {
  const [command, ...flags] = argv;
  if (command !== "dry-run" && command !== "create-notion") {
    throw new Error("Commande invalide. Utiliser `dry-run` ou `create-notion`.");
  }
  return {
    command,
    dryRun: command === "dry-run" || flags.includes("--dry-run"),
    force: flags.includes("--force")
  };
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function loadConfig(): NotionConfig {
  dotenv.config({ quiet: true });
  const token = process.env.NOTION_TOKEN;
  const parentPageId = process.env.NOTION_PARENT_PAGE_ID;
  const notionVersion = process.env.NOTION_VERSION || "2026-03-11";

  const missing = [
    ["NOTION_TOKEN", token],
    ["NOTION_PARENT_PAGE_ID", parentPageId]
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(`Variables manquantes: ${missing.join(", ")}. Creer un .env local puis renseigner les valeurs.`);
  }

  return { token: token as string, parentPageId: parentPageId as string, notionVersion };
}

async function writeManifest(path: string, manifest: Manifest): Promise<void> {
  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

async function createNotion(force: boolean): Promise<void> {
  if ((await exists(NOTION_MANIFEST)) && !force) {
    throw new Error("output/notion_manifest.json existe déjà. Relancer avec `npm run create-notion -- --force` pour créer une nouvelle structure.");
  }

  const config = loadConfig();
  const notion = new NotionClient(config);
  const manifest: Manifest = {
    mode: "notion",
    created_at: new Date().toISOString(),
    databases: {},
    data_sources: {},
    views: {}
  };

  try {
    const rootPage = await notion.createRootPage(config.parentPageId, ROOT_TITLE);
    manifest.root_page_id = rootPage.id;
    manifest.root_page_url = rootPage.url;

    await notion.appendBlocks(rootPage.id, buildDashboardBlocks());

    const created = await createDatabases(notion, rootPage.id, (key, info) => {
      manifest.databases[key] = info;
      manifest.data_sources[key] = info.dataSourceId;
    });
    manifest.databases = created.databases;
    manifest.data_sources = created.dataSources;

    manifest.views = {
      plan_weekly_calendar: await createWeeklyPlanCalendarView(notion, created.databases.plan)
    };

    for (const key of Object.keys(databaseSchemas) as DatabaseKey[]) {
      await createRowsForDatabase(
        notion,
        created.dataSources[key],
        databaseSchemas[key],
        seedRows[key] as Array<Record<string, unknown>>
      );
    }

    await writeManifest(NOTION_MANIFEST, manifest);
    console.log(`Structure Notion créée: ${manifest.root_page_url ?? manifest.root_page_id}`);
    console.log(`Manifeste écrit: ${NOTION_MANIFEST}`);
  } catch (error) {
    manifest.mode = "partial";
    await writeManifest(PARTIAL_MANIFEST, manifest);
    throw error;
  }
}

function printError(error: unknown): void {
  if (error instanceof NotionApiError) {
    console.error(error.message);
    console.error(`Statut HTTP Notion: ${error.status}`);
    console.error(`Manifeste partiel éventuel: ${PARTIAL_MANIFEST}`);
    return;
  }
  if (error instanceof Error) {
    console.error(error.message);
    return;
  }
  console.error("Erreur inconnue.");
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.dryRun) {
    await writeDryRunOutput(OUTPUT_DIR);
    console.log("Dry-run généré dans output/.");
    return;
  }
  await createNotion(args.force);
}

main().catch((error: unknown) => {
  printError(error);
  process.exitCode = 1;
});
