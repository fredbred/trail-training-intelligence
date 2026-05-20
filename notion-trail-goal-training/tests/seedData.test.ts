import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import {
  databaseSchemas,
  getSelectOptionNames,
  phaseOptions,
  ruleCategoryOptions
} from "../src/schemas.js";
import { seedRows } from "../src/seedData.js";
import { writeDryRunOutput } from "../src/markdownExport.js";

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

function expectIsoDate(value: string): void {
  expect(value).toMatch(isoDatePattern);
  expect(Number.isNaN(Date.parse(`${value}T00:00:00Z`))).toBe(false);
}

describe("seed data", () => {
  it("has valid ISO dates for every planned session", () => {
    for (const row of seedRows.plan) {
      expectIsoDate(row.Date);
    }
  });

  it("keeps plan values inside allowed select options", () => {
    const plan = databaseSchemas.plan;
    const allowed = {
      phase: new Set(getSelectOptionNames(plan, "Phase")),
      type: new Set(getSelectOptionNames(plan, "Type")),
      intensity: new Set(getSelectOptionNames(plan, "Target intensity")),
      priority: new Set(getSelectOptionNames(plan, "Priority")),
      status: new Set(getSelectOptionNames(plan, "Status"))
    };

    for (const row of seedRows.plan) {
      expect(allowed.phase.has(row.Phase), row.Session).toBe(true);
      expect(allowed.type.has(row.Type), row.Session).toBe(true);
      expect(allowed.intensity.has(row["Target intensity"]), row.Session).toBe(true);
      expect(allowed.priority.has(row.Priority), row.Session).toBe(true);
      expect(allowed.status.has(row.Status), row.Session).toBe(true);
    }
  });

  it("adds a usable description to every planned session", () => {
    for (const row of seedRows.plan) {
      expect(row.Description, row.Session).toBeTruthy();
      expect(row.Description.length, row.Session).toBeGreaterThan(20);
    }
  });

  it("keeps weekly reviews, phases, library and rules inside allowed options", () => {
    const weeklyDecision = new Set(getSelectOptionNames(databaseSchemas.weeklyReview, "Next week decision"));
    const libraryType = new Set(getSelectOptionNames(databaseSchemas.sessionLibrary, "Type"));
    const libraryPriority = new Set(getSelectOptionNames(databaseSchemas.sessionLibrary, "Priority"));

    for (const row of seedRows.weeklyReview) {
      expectIsoDate(row["Week of"]);
      expect(phaseOptions).toContain(row.Phase);
      expect(weeklyDecision.has(row["Next week decision"])).toBe(true);
    }
    for (const row of seedRows.phases) {
      expect(phaseOptions).toContain(row.Phase);
    }
    for (const row of seedRows.sessionLibrary) {
      expect(libraryType.has(row.Type), row.Session).toBe(true);
      expect(libraryPriority.has(row.Priority), row.Session).toBe(true);
    }
    for (const row of seedRows.rules) {
      expect(ruleCategoryOptions).toContain(row.Category);
    }
  });

  it("generates dry-run files without writing tokens", async () => {
    const previousToken = process.env.NOTION_TOKEN;
    process.env.NOTION_TOKEN = "TOKEN_TEST_DO_NOT_LEAK";
    const outputDir = await mkdtemp(join(tmpdir(), "notion-trail-goal-dry-run-"));

    await writeDryRunOutput(outputDir);

    const files = [
      "dashboard.md",
      "training_plan.csv",
      "weekly_review.csv",
      "training_phases.csv",
      "session_library.csv",
      "rules.csv",
      "manifest.preview.json"
    ];

    for (const file of files) {
      const content = await readFile(join(outputDir, file), "utf8");
      expect(content.length, file).toBeGreaterThan(0);
      expect(content).not.toContain("TOKEN_TEST_DO_NOT_LEAK");
    }

    process.env.NOTION_TOKEN = previousToken;
  });
});
