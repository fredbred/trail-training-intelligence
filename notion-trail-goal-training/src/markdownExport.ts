import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { buildDashboardMarkdown } from "./createDashboard.js";
import { weeklyCalendarViewPreview } from "./createViews.js";
import { databaseSchemas } from "./schemas.js";
import { seedRows } from "./seedData.js";
import type { DatabaseKey, Manifest } from "./types.js";

const outputNames: Record<DatabaseKey, string> = {
  plan: "training_plan.csv",
  weeklyReview: "weekly_review.csv",
  phases: "training_phases.csv",
  sessionLibrary: "session_library.csv",
  rules: "rules.csv"
};

function csvEscape(value: unknown): string {
  if (value === undefined || value === null) return "";
  const text = String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function rowsToCsv(rows: Array<Record<string, unknown>>, headers: string[]): string {
  const lines = [headers.map(csvEscape).join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => csvEscape(row[header])).join(","));
  }
  return `${lines.join("\n")}\n`;
}

export async function writeDryRunOutput(outputDir: string): Promise<Manifest> {
  await mkdir(outputDir, { recursive: true });
  await writeFile(join(outputDir, "dashboard.md"), buildDashboardMarkdown(), "utf8");

  for (const key of Object.keys(databaseSchemas) as DatabaseKey[]) {
    const schema = databaseSchemas[key];
    const rows = seedRows[key] as Array<Record<string, unknown>>;
    await writeFile(join(outputDir, outputNames[key]), rowsToCsv(rows, Object.keys(schema.properties)), "utf8");
  }

  const manifest: Manifest = {
    mode: "preview",
    created_at: new Date().toISOString(),
    databases: {},
    data_sources: {},
    views: {
      plan_weekly_calendar: weeklyCalendarViewPreview
    }
  };
  await writeFile(join(outputDir, "manifest.preview.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await assertNoSecretWritten(outputDir);
  return manifest;
}

export async function assertNoSecretWritten(outputDir: string): Promise<void> {
  const forbidden = [process.env.NOTION_TOKEN, "TOKEN_TEST_DO_NOT_LEAK"].filter(Boolean) as string[];
  if (forbidden.length === 0) return;

  const files = [
    "dashboard.md",
    "training_plan.csv",
    "weekly_review.csv",
    "training_phases.csv",
    "session_library.csv",
    "rules.csv",
    "manifest.preview.json",
    "notion_manifest.json",
    "notion_manifest.partial.json"
  ];
  for (const file of files) {
    const path = join(outputDir, file);
    const content = await readFile(path, "utf8").catch(() => "");
    for (const secret of forbidden) {
      if (secret && content.includes(secret)) {
        throw new Error(`Secret détecté dans ${path}.`);
      }
    }
  }
}
