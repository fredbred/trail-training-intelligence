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
      intensity: new Set(getSelectOptionNames(plan, "Intensité cible")),
      priority: new Set(getSelectOptionNames(plan, "Priorité")),
      status: new Set(getSelectOptionNames(plan, "Statut"))
    };

    for (const row of seedRows.plan) {
      expect(allowed.phase.has(row.Phase), row.Séance).toBe(true);
      expect(allowed.type.has(row.Type), row.Séance).toBe(true);
      expect(allowed.intensity.has(row["Intensité cible"]), row.Séance).toBe(true);
      expect(allowed.priority.has(row.Priorité), row.Séance).toBe(true);
      expect(allowed.status.has(row.Statut), row.Séance).toBe(true);
    }
  });

  it("adds a usable description to every planned session", () => {
    for (const row of seedRows.plan) {
      expect(row.Description, row.Séance).toBeTruthy();
      expect(row.Description.length, row.Séance).toBeGreaterThan(20);
    }
  });

  it("keeps weekly reviews, phases, library and rules inside allowed options", () => {
    const weeklyDecision = new Set(getSelectOptionNames(databaseSchemas.weeklyReview, "Décision semaine suivante"));
    const libraryType = new Set(getSelectOptionNames(databaseSchemas.sessionLibrary, "Type"));
    const libraryPriority = new Set(getSelectOptionNames(databaseSchemas.sessionLibrary, "Priorité"));

    for (const row of seedRows.weeklyReview) {
      expectIsoDate(row["Semaine du"]);
      expect(phaseOptions).toContain(row.Phase);
      expect(weeklyDecision.has(row["Décision semaine suivante"])).toBe(true);
    }
    for (const row of seedRows.phases) {
      expect(phaseOptions).toContain(row.Phase);
    }
    for (const row of seedRows.sessionLibrary) {
      expect(libraryType.has(row.Type), row.Séance).toBe(true);
      expect(libraryPriority.has(row.Priorité), row.Séance).toBe(true);
    }
    for (const row of seedRows.rules) {
      expect(ruleCategoryOptions).toContain(row.Catégorie);
    }
  });

  it("generates dry-run files without writing tokens", async () => {
    const previousToken = process.env.NOTION_TOKEN;
    process.env.NOTION_TOKEN = "TOKEN_TEST_DO_NOT_LEAK";
    const outputDir = await mkdtemp(join(tmpdir(), "notion-ventoux-dry-run-"));

    await writeDryRunOutput(outputDir);

    const files = [
      "dashboard.md",
      "plan_entrainement.csv",
      "bilan_semaine.csv",
      "phases_ventoux_2027.csv",
      "bibliotheque_seances.csv",
      "regles.csv",
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
