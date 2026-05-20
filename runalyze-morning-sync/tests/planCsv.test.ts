import { describe, expect, it } from "vitest";

import { findPlannedSession, parsePlanCsv } from "../src/planCsv.js";

describe("plan CSV", () => {
  it("parses Notion plan rows with quoted notes", () => {
    const plan = parsePlanCsv(
      [
        "Session,Date,Week,Type,Planned duration min,Planned ascent m,Target intensity,HR cap bpm,Target RPE,Priority,Notes",
        'Easy run,2026-05-05,2026-W19,Easy run,45,100,Very easy,140,2,C,"Note with, comma"',
        "Strength,2026-05-06,2026-W19,Strength A,35,0,Strength,,6,A,"
      ].join("\n")
    );

    expect(plan).toHaveLength(2);
    expect(plan[0]).toMatchObject({
      "Session": "Easy run",
      "Date": "2026-05-05",
      "Planned duration min": 45,
      "Planned ascent m": 100,
      "HR cap bpm": 140,
      "Notes": "Note with, comma"
    });
    expect(plan[1]["HR cap bpm"]).toBeUndefined();
  });

  it("keeps quoted multi-line descriptions within a single row", () => {
    const plan = parsePlanCsv(
      [
        "Session,Date,Week,Phase,Type,Description,Planned duration min,Planned ascent m,Target intensity,HR cap bpm,Target RPE,Priority,Status,Completed duration min,Completed ascent m,Completed RPE,Avg HR,Notes,Adaptation",
        'Long run,2026-05-09,2026-W19,Pre-base reset,Long run,"Easy effort.',
        'Fuel 40-60 g/h.',
        'Adaptation: keep control.",135,800,Easy endurance,150,4,A,Planned,,,,,"Note with, comma",Smoothed progression',
        'Easy run,2026-05-10,2026-W19,Pre-base reset,Indoor bike,"Very easy.',
        'Rest allowed.",45,0,Very easy,140,2,C,Planned,,,,,Optional,'
      ].join("\n")
    );

    expect(plan).toHaveLength(2);
    expect(plan[0]).toMatchObject({
      "Session": "Long run",
      "Date": "2026-05-09",
      "Planned duration min": 135,
      "Planned ascent m": 800,
      "Target intensity": "Easy endurance",
      "HR cap bpm": 150,
      "Target RPE": 4,
      "Notes": "Note with, comma"
    });
    expect(plan[1]).toMatchObject({
      "Session": "Easy run",
      "Planned duration min": 45,
      "Target intensity": "Very easy"
    });
  });

  it("finds a session by date and optional name filter", () => {
    const plan = parsePlanCsv(
      [
        "Session,Date,Week,Type,Planned duration min,Planned ascent m,Target intensity,HR cap bpm,Target RPE,Priority,Notes",
        "Easy run,2026-05-05,2026-W19,Easy run,45,100,Very easy,140,2,C,",
        "Controlled hill,2026-05-05,2026-W19,Hill session,75,600,Hill tempo,162,6,A,"
      ].join("\n")
    );

    expect(findPlannedSession(plan, "2026-05-05")?.Session).toBe("Easy run");
    expect(findPlannedSession(plan, "2026-05-05", "hill")?.Session).toBe("Controlled hill");
    expect(findPlannedSession(plan, "2026-05-06")).toBeUndefined();
  });
});
