import { describe, expect, it } from "vitest";

import { buildRollingPlan } from "../src/rollingPlan.js";
import type { ConditionAnalysis, PlannedSession, TrainingRecommendation } from "../src/types.js";

function session(partial: Partial<PlannedSession>): PlannedSession {
  const name = partial.Session ?? partial.Séance ?? "Easy run";
  return {
    "Session": name,
    "Séance": name,
    "Date": "2026-06-18",
    "Week": "2026-W25",
    "Semaine": "2026-W25",
    "Type": "Course facile",
    "Planned duration min": 45,
    "Durée prévue min": 45,
    "Planned ascent m": 200,
    "D+ prévu m": 200,
    "Target intensity": "Très facile",
    "Intensité cible": "Très facile",
    "HR cap bpm": 145,
    "FC cap bpm": 145,
    "Target RPE": 3,
    "RPE cible": 3,
    "Priority": "B",
    "Priorité": "B",
    "Notes": "",
    ...partial
  };
}

function condition(partial: Partial<ConditionAnalysis> = {}): ConditionAnalysis {
  return {
    date: "2026-06-19",
    pull_date: "2026-06-18",
    metrics_date: "2026-06-19",
    created_at: "2026-06-19T06:30:00Z",
    level: "green",
    source_files: ["coros_pull_2026-06-18.json"],
    yesterday_load: { minutes: 45, ascent_m: 190, activity_count: 1, source: "coros_direct" },
    recovery: {
      score: 95,
      level: "green",
      metrics: { sleep_hours: 8, hrv: 55, resting_hr_bpm: 48, available: ["sleep", "hrv", "resting_hr"], missing: [] },
      reasons: []
    },
    data_quality: { level: "good", available: [], missing: [], notes: [] },
    flags: [{ level: "green", code: "no_alert", message: "ok" }],
    trends: {
      status: "available",
      note: "ok",
      seven_days: { minutes: 200, ascent_m: 800, activity_count: 4, source: "coros_direct", expected_days: 7, available_days: 7, complete: true, start_date: "2026-06-12", end_date: "2026-06-18", dates: [] },
      twenty_eight_days: { minutes: 800, ascent_m: 3000, activity_count: 16, source: "coros_direct", expected_days: 28, available_days: 28, complete: true, start_date: "2026-05-22", end_date: "2026-06-18", dates: [] }
    },
    limits: [],
    summary: [],
    ...partial
  };
}

function recommendation(partial: Partial<TrainingRecommendation> = {}): TrainingRecommendation {
  const today = session({
    "Session": "Repos",
    "Séance": "Repos",
    "Date": "2026-06-19",
    "Type": "Repos",
    "Planned duration min": 0,
    "Durée prévue min": 0,
    "Planned ascent m": 0,
    "D+ prévu m": 0,
    "Target intensity": "Repos",
    "Intensité cible": "Repos",
    "Target RPE": 1,
    "RPE cible": 1
  });
  return {
    date: "2026-06-19",
    created_at: "2026-06-19T06:31:00Z",
    level: "green",
    decision: "maintain",
    today,
    recommended_session: {
      name: "Repos",
      duration_min: 0,
      ascent_m: 0,
      intensity: "Repos",
      notes: "Session maintained."
    },
    reasons: [],
    data_quality: [],
    ...partial
  };
}

describe("rolling plan", () => {
  it("records yesterday as done when the activity matches the plan", () => {
    const result = buildRollingPlan([session({})], condition(), recommendation());

    expect(result.yesterday.outcome).toBe("completed");
    expect(result.updates[0]).toMatchObject({
      date: "2026-06-18",
      kind: "record_yesterday",
      status: "done",
      completed: { duration_min: 45, ascent_m: 190 }
    });
  });

  it("drops a missed optional easy session without carrying debt", () => {
    const missedEasy = session({ "Priority": "C", "Priorité": "C" });
    const result = buildRollingPlan(
      [missedEasy, recommendation().today!],
      condition({ yesterday_load: { minutes: 0, ascent_m: 0, activity_count: 0, source: "coros_direct" } }),
      recommendation()
    );

    expect(result.yesterday.outcome).toBe("missed");
    expect(result.updates).toHaveLength(1);
    expect(result.updates[0].status).toBe("skipped");
    expect(result.notes.join(" ")).toContain("pas de rattrapage automatique");
  });

  it("does not mark strength as done when it was replaced by an uphill endurance activity", () => {
    const plannedStrength = session({
      "Session": "Renfo A bébé-compatible",
      "Séance": "Renfo A bébé-compatible",
      "Type": "Renfo A",
      "Planned duration min": 35,
      "Durée prévue min": 35,
      "Planned ascent m": 0,
      "D+ prévu m": 0,
      "Target intensity": "Renfo",
      "Intensité cible": "Renfo",
      "Target RPE": 6,
      "RPE cible": 6,
      "Priority": "A",
      "Priorité": "A"
    });

    const result = buildRollingPlan(
      [plannedStrength, recommendation().today!],
      condition({ yesterday_load: { minutes: 49, ascent_m: 322, activity_count: 1, source: "coros_direct" } }),
      recommendation()
    );

    expect(result.yesterday.outcome).toBe("replaced");
    expect(result.updates[0]).toMatchObject({
      date: "2026-06-18",
      kind: "record_yesterday",
      status: "replaced",
      completed: { duration_min: 49, ascent_m: 322 }
    });
    expect(result.updates[0].adaptation).toContain("Remplacée par une activité différente");
  });

  it("can mark strength as done when the completed activity has no ascent signal", () => {
    const plannedStrength = session({
      "Session": "Renfo B mini",
      "Séance": "Renfo B mini",
      "Type": "Renfo B",
      "Planned duration min": 25,
      "Durée prévue min": 25,
      "Planned ascent m": 0,
      "D+ prévu m": 0,
      "Target intensity": "Renfo",
      "Intensité cible": "Renfo",
      "Target RPE": 5,
      "RPE cible": 5,
      "Priority": "A",
      "Priorité": "A"
    });

    const result = buildRollingPlan(
      [plannedStrength, recommendation().today!],
      condition({ yesterday_load: { minutes: 26, ascent_m: 0, activity_count: 1, source: "coros_direct" } }),
      recommendation()
    );

    expect(result.yesterday.outcome).toBe("completed");
    expect(result.updates[0].status).toBe("done");
  });

  it("carries a missed priority strength session to the first easy slot in baby mode", () => {
    const missedStrength = session({
      "Session": "Renfo A bébé-compatible",
      "Séance": "Renfo A bébé-compatible",
      "Type": "Renfo A",
      "Planned duration min": 35,
      "Durée prévue min": 35,
      "Planned ascent m": 0,
      "D+ prévu m": 0,
      "Target intensity": "Renfo",
      "Intensité cible": "Renfo",
      "Target RPE": 6,
      "RPE cible": 6,
      "Priority": "A",
      "Priorité": "A"
    });
    const easySlot = session({
      "Session": "Tapis facile",
      "Séance": "Tapis facile",
      "Date": "2026-06-20",
      "Type": "Tapis incliné",
      "Priority": "B",
      "Priorité": "B",
      "Target RPE": 3,
      "RPE cible": 3
    });

    const result = buildRollingPlan(
      [missedStrength, recommendation().today!, easySlot],
      condition({ yesterday_load: { minutes: 0, ascent_m: 0, activity_count: 0, source: "coros_direct" } }),
      recommendation()
    );

    expect(result.updates.map((update) => update.kind)).toContain("carry_missed_strength");
    const carry = result.updates.find((update) => update.kind === "carry_missed_strength");
    expect(carry).toMatchObject({
      date: "2026-06-19",
      status: "replaced",
      planned_patch: {
        session: "Renfo A bébé-compatible",
        duration_min: 30,
        intensity: "Renfo"
      }
    });
  });

  it("applies a reduced recommendation to today's planned fields", () => {
    const today = session({
      "Session": "Sortie longue modulable",
      "Séance": "Sortie longue modulable",
      "Date": "2026-06-19",
      "Type": "Sortie longue",
      "Planned duration min": 120,
      "Durée prévue min": 120,
      "Planned ascent m": 800,
      "D+ prévu m": 800,
      "Target RPE": 4,
      "RPE cible": 4,
      "Priority": "A",
      "Priorité": "A"
    });
    const result = buildRollingPlan(
      [session({}), today],
      condition(),
      recommendation({
        level: "orange",
        decision: "reduce",
        today,
        recommended_session: {
          name: "Sortie longue modulable - reduced version",
          duration_min: 75,
          ascent_m: 400,
          intensity: "Very easy",
          fc_cap_bpm: 140,
          notes: "Reduce load."
        },
        reasons: ["Charge veille notable."]
      })
    );

    const todayUpdate = result.updates.find((update) => update.kind === "apply_today_recommendation");
    expect(todayUpdate).toMatchObject({
      date: "2026-06-19",
      status: "modified",
      planned_patch: {
        duration_min: 75,
        ascent_m: 400,
        intensity: "Très facile",
        fc_cap_bpm: 140
      }
    });
  });

  it("swaps today's hard session with a future easy session", () => {
    const hardToday = session({
      "Session": "Côtes contrôlées",
      "Séance": "Côtes contrôlées",
      "Date": "2026-06-19",
      "Type": "Côte",
      "Target RPE": 5,
      "RPE cible": 5,
      "Priority": "A",
      "Priorité": "A"
    });
    const easyFuture = session({
      "Session": "Footing facile",
      "Séance": "Footing facile",
      "Date": "2026-06-21",
      "Type": "Course facile",
      "Priority": "B",
      "Priorité": "B"
    });

    const result = buildRollingPlan(
      [session({}), hardToday, easyFuture],
      condition({ level: "red" }),
      recommendation({
        level: "red",
        decision: "swap",
        today: hardToday,
        swap_with: easyFuture,
        recommended_session: {
          name: "Footing facile",
          duration_min: 45,
          ascent_m: 200,
          intensity: "Très facile",
          fc_cap_bpm: 145,
          notes: "Easy session swapped."
        },
        reasons: ["Récupération rouge."]
      })
    );

    expect(result.updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ date: "2026-06-19", kind: "swap_today", planned_patch: expect.objectContaining({ session: "Footing facile" }) }),
        expect.objectContaining({ date: "2026-06-21", kind: "swap_future", planned_patch: expect.objectContaining({ session: "Côtes contrôlées" }) })
      ])
    );
  });
});
