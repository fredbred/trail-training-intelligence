import { describe, expect, it } from "vitest";

import { recommendToday } from "../src/recommendation.js";
import type { ConditionAnalysis, MorningPull, PlannedSession } from "../src/types.js";

const hardSession: PlannedSession = {
  "Séance": "Côte contrôlée",
  "Date": "2026-05-07",
  "Semaine": "2026-W19",
  "Type": "Côte",
  "Durée prévue min": 75,
  "D+ prévu m": 600,
  "Intensité cible": "Tempo côte",
  "FC cap bpm": 162,
  "RPE cible": 6,
  "Priorité": "A",
  "Notes": ""
};

const easySession: PlannedSession = {
  "Séance": "Footing facile",
  "Date": "2026-05-08",
  "Semaine": "2026-W19",
  "Type": "Course facile",
  "Durée prévue min": 45,
  "D+ prévu m": 100,
  "Intensité cible": "Très facile",
  "FC cap bpm": 140,
  "RPE cible": 2,
  "Priorité": "C",
  "Notes": ""
};

function pull(partial: Partial<MorningPull>): MorningPull {
  return {
    date: "2026-05-06",
    created_at: "2026-05-07T06:00:00Z",
    notes: [],
    activities: [],
    health: {},
    ...partial
  };
}

function condition(partial: Partial<ConditionAnalysis>): ConditionAnalysis {
  return {
    date: "2026-05-08",
    pull_date: "2026-05-07",
    metrics_date: "2026-05-08",
    created_at: "2026-05-08T06:00:00Z",
    level: "green",
    source_files: ["morning_pull_2026-05-07.json", "coros_pull_2026-05-07.json"],
    yesterday_load: { minutes: 30, ascent_m: 100, activity_count: 1, source: "coros_direct" },
    recovery: {
      score: 100,
      level: "green",
      metrics: { sleep_hours: 7.5, hrv: 52, resting_hr_bpm: 48, available: ["sleep", "hrv", "resting_hr"], missing: [] },
      reasons: []
    },
    data_quality: { level: "good", available: ["sleep", "hrv", "resting_hr", "activities", "coros_evolab"], missing: [], notes: [] },
    flags: [{ level: "green", code: "no_alert", message: "Aucun signal d’alerte détecté dans les données locales." }],
    trends: {
      status: "available",
      note: "Historique local suffisant.",
      seven_days: { minutes: 210, ascent_m: 700, activity_count: 5, source: "coros_direct", expected_days: 7, available_days: 7, complete: true, start_date: "2026-05-01", end_date: "2026-05-07", dates: [] },
      twenty_eight_days: { minutes: 900, ascent_m: 3000, activity_count: 18, source: "coros_direct", expected_days: 28, available_days: 28, complete: true, start_date: "2026-04-10", end_date: "2026-05-07", dates: [] }
    },
    limits: ["Ce bilan est une aide à la décision d’entraînement, pas un diagnostic médical."],
    summary: ["Condition verte."],
    ...partial
  };
}

describe("training recommendation", () => {
  it("keeps an easy day when signals are green", () => {
    const recommendation = recommendToday(
      [easySession],
      pull({ health: { sleep: { value: 8 * 3600 }, heartRateRest: { value: 48 }, hrv: { value: 55 } } }),
      "2026-05-08"
    );
    expect(recommendation.decision).toBe("maintain");
    expect(recommendation.level).toBe("green");
  });

  it("continues without a condition analysis file", () => {
    const recommendation = recommendToday(
      [hardSession],
      pull({ health: { sleep: { value: 8 * 3600 }, heartRateRest: { value: 48 }, hrv: { value: 55 } } }),
      "2026-05-07"
    );
    expect(recommendation.decision).toBe("maintain");
    expect(recommendation.level).toBe("green");
  });

  it("swaps a hard day when sleep is poor and an easy session remains this week", () => {
    const recommendation = recommendToday(
      [hardSession, easySession],
      pull({ health: { sleep: { value: 5 * 3600 }, heartRateRest: { value: 62 }, hrv: { value: 30 } } }),
      "2026-05-07"
    );
    expect(recommendation.level).toBe("red");
    expect(recommendation.decision).toBe("swap");
    expect(recommendation.swap_with?.Séance).toBe("Footing facile");
  });

  it("reduces a day after a heavy previous activity", () => {
    const recommendation = recommendToday(
      [easySession],
      pull({
        activities: [{ duration: 3 * 3600, elevation_up: 1000 }],
        health: { sleep: { value: 7 * 3600 }, heartRateRest: { value: 50 }, hrv: { value: 50 } }
      }),
      "2026-05-08"
    );
    expect(recommendation.level).toBe("orange");
    expect(recommendation.decision).toBe("reduce");
  });

  it("keeps an easy day when only health metrics are missing", () => {
    const recommendation = recommendToday([easySession], pull({ health: { sleep: null, heartRateRest: null, hrv: null } }), "2026-05-08");
    expect(recommendation.level).toBe("orange");
    expect(recommendation.decision).toBe("maintain");
    expect(recommendation.data_quality).toEqual(["sleep_missing", "resting_hr_missing", "hrv_missing"]);
  });

  it("does not reuse stale dated health metrics for another day", () => {
    const recommendation = recommendToday(
      [easySession],
      pull({
        health: {
          sleep: { date_time: "2026-04-28T22:27:00+02:00", duration: 522 },
          heartRateRest: { date_time: "2026-04-28T00:00:00+02:00", heart_rate: 51 },
          hrv: { date_time: "2026-04-27T00:00:00+02:00", hrv: 50 }
        }
      }),
      "2026-05-08"
    );

    expect(recommendation.data_quality).toEqual(["sleep_missing", "resting_hr_missing", "hrv_missing"]);
  });

  it("uses detailed health metric sources when latest metrics are null", () => {
    const recommendation = recommendToday(
      [easySession],
      pull({
        health: { sleep: null, heartRateRest: null, hrv: null },
        health_details: {
          sleep: [{ date: "2026-05-06", duration: 7.5 * 3600 }],
          heartRateRest: [{ date: "2026-05-06", value: 48 }],
          hrv: [{ date: "2026-05-06", value: 55 }]
        }
      }),
      "2026-05-08"
    );
    expect(recommendation.level).toBe("green");
    expect(recommendation.data_quality).toEqual([]);
  });

  it("lets condition analysis supersede missing Runalyze health metrics", () => {
    const recommendation = recommendToday(
      [easySession],
      pull({ health: { sleep: null, heartRateRest: null, hrv: null } }),
      "2026-05-08",
      condition({})
    );
    expect(recommendation.level).toBe("green");
    expect(recommendation.decision).toBe("maintain");
    expect(recommendation.data_quality).toEqual([]);
  });

  it("reduces an easy session instead of resting when COROS fatigue is isolated orange", () => {
    const recommendation = recommendToday(
      [easySession],
      pull({ health: { sleep: null, heartRateRest: null, hrv: null } }),
      "2026-05-08",
      condition({
        level: "orange",
        recovery: {
          score: 75,
          level: "orange",
          metrics: {
            sleep_hours: 8.2,
            hrv: 55,
            hrv_baseline: 44,
            resting_hr_bpm: 55,
            coros_training_load: 0,
            coros_training_load_ratio: 1.4,
            coros_fatigue_state: 5,
            available: ["sleep", "hrv", "resting_hr"],
            missing: []
          },
          reasons: ["Fatigue COROS élevée (état 5)."]
        },
        flags: [
          {
            level: "orange",
            code: "coros_fatigue_orange",
            message: "Fatigue COROS élevée isolée (état 5) : réduire la séance plutôt que repos automatique."
          }
        ]
      })
    );

    expect(recommendation.level).toBe("orange");
    expect(recommendation.decision).toBe("reduce");
    expect(recommendation.recommended_session.intensity).toBe("Très facile");
    expect(recommendation.recommended_session.duration_min).toBe(34);
  });
});
