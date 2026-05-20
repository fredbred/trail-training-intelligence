import { describe, expect, it } from "vitest";

import { analyzeCondition, renderConditionMarkdown } from "../src/conditionAnalysis.js";
import type { CorosDirectPull, MorningPull } from "../src/types.js";

function pull(date: string, partial: Partial<MorningPull> = {}): MorningPull {
  return {
    date,
    created_at: `${date}T06:00:00Z`,
    notes: [],
    activities: [],
    health: {},
    ...partial
  };
}

function corosPull(date: string, target: CorosDirectPull["target_day"]): CorosDirectPull {
  return {
    date,
    created_at: `${date}T06:00:00Z`,
    source: "coros_direct",
    target_day: target,
    recent_days: target ? [target] : [],
    notes: []
  };
}

describe("condition analysis", () => {
  it("builds a useful condition report with complete local data", () => {
    const analysis = analyzeCondition(
      [
        pull("2026-05-06", {
          activities: [{ duration: 3600, elevation_up: 320 }],
          health: {
            sleep: { value: 7.5 * 3600 },
            heartRateRest: { value: 48 },
            hrv: { value: 58 }
          }
        })
      ],
      { date: "2026-05-07", pullDate: "2026-05-06", createdAt: "2026-05-07T06:00:00Z" }
    );

    expect(analysis.yesterday_load).toMatchObject({ minutes: 60, ascent_m: 320, activity_count: 1, source: "runalyze" });
    expect(analysis.recovery.score).toBe(100);
    expect(analysis.recovery.level).toBe("green");
    expect(analysis.data_quality.available).toEqual(expect.arrayContaining(["sleep", "hrv", "resting_hr", "runalyze_activities_backup"]));
    expect(analysis.limits).toContain("Un seul pull local disponible : aucune tendance fiable ne peut être calculée.");
    expect(renderConditionMarkdown(analysis)).toContain("## Limites");
  });

  it("signals limits when recovery metrics are missing", () => {
    const analysis = analyzeCondition(
      [
        pull("2026-05-06", {
          activities: [{ duration: 1800, elevation_up: 80 }],
          health: { sleep: null, heartRateRest: null, hrv: null },
          health_details: { sleep: [], heartRateRest: [], hrv: [] }
        })
      ],
      { date: "2026-05-07", pullDate: "2026-05-06", createdAt: "2026-05-07T06:00:00Z" }
    );

    expect(analysis.recovery.score).toBeNull();
    expect(analysis.recovery.level).toBe("orange");
    expect(analysis.data_quality.level).toBe("limited");
    expect(analysis.data_quality.missing).toEqual(expect.arrayContaining(["sleep", "hrv", "resting_hr"]));
    expect(analysis.flags.map((flag) => flag.code)).toEqual(expect.arrayContaining(["recovery_orange", "data_limited"]));
  });

  it("ignores stale dated health metrics when the target date is missing", () => {
    const analysis = analyzeCondition(
      [
        pull("2026-05-04", {
          activities: [],
          health: {
            sleep: { date_time: "2026-04-28T22:27:00+02:00", duration: 522 }
          },
          health_details: {
            sleep: [{ date_time: "2026-04-28T22:27:00+02:00", duration: 522 }]
          }
        })
      ],
      { date: "2026-05-05", pullDate: "2026-05-04", metricsDate: "2026-05-05", createdAt: "2026-05-05T06:00:00Z" },
      [
        corosPull("2026-05-04", {
          date: "2026-05-05",
          rhr_bpm: 47,
          avg_sleep_hrv: 61,
          sleep_hrv_baseline: 47
        })
      ]
    );

    expect(analysis.recovery.metrics.sleep_hours).toBeUndefined();
    expect(analysis.data_quality.missing).toContain("sleep");
  });

  it("does not reuse COROS recovery metrics when target_day does not match metrics date", () => {
    const analysis = analyzeCondition(
      [pull("2026-05-11", { activities: [], health: { sleep: null, heartRateRest: null, hrv: null } })],
      { date: "2026-05-12", pullDate: "2026-05-11", metricsDate: "2026-05-12", createdAt: "2026-05-12T06:00:00Z" },
      [
        {
          ...corosPull("2026-05-11", {
            date: "2026-05-11",
            sleep_hours: 8.7,
            rhr_bpm: 65,
            avg_sleep_hrv: 53,
            sleep_hrv_baseline: 47,
            fatigue_state: 2
          }),
          activity_count: 0,
          activities: []
        }
      ]
    );

    expect(analysis.recovery.metrics.sleep_hours).toBeUndefined();
    expect(analysis.recovery.metrics.resting_hr_bpm).toBeUndefined();
    expect(analysis.recovery.metrics.hrv).toBeUndefined();
    expect(analysis.data_quality.missing).toEqual(expect.arrayContaining(["sleep", "hrv", "resting_hr", "coros_evolab"]));
    expect(analysis.data_quality.available).toContain("coros_activities");
  });

  it("uses COROS activities before Runalyze backup for yesterday load", () => {
    const analysis = analyzeCondition(
      [
        pull("2026-05-06", {
          activities: [{ duration: 1775, elevation_up: 36, elevation_up_file: 92 }],
          health: {
            sleep: { value: 7.5 * 3600 },
            heartRateRest: { value: 48 },
            hrv: { value: 58 }
          }
        })
      ],
      { date: "2026-05-07", pullDate: "2026-05-06", createdAt: "2026-05-07T06:00:00Z" },
      [
        {
          ...corosPull("2026-05-06", {
            date: "2026-05-06",
            rhr_bpm: 48,
            time_in_bed_hours: 7.2,
            avg_sleep_hrv: 52
          }),
          activity_count: 1,
          activities: [
            {
              source: "coros_direct",
              date: "2026-05-06",
              duration_seconds: 1775,
              ascent_m: 92,
              avg_power_w: 236,
              training_load: 53
            }
          ]
        }
      ]
    );

    expect(analysis.yesterday_load).toMatchObject({ minutes: 29.6, ascent_m: 92, activity_count: 1, source: "coros_direct" });
    expect(analysis.source_files).toEqual(["morning_pull_2026-05-06.json", "coros_pull_2026-05-06.json"]);
    expect(analysis.data_quality.available).toEqual(expect.arrayContaining(["coros_activities"]));
    expect(analysis.data_quality.available).not.toContain("runalyze_activities_backup");
  });

  it("aggregates 7d and 28d loads from several local pulls", () => {
    const pulls = Array.from({ length: 10 }, (_, index) => {
      const day = String(index + 1).padStart(2, "0");
      return pull(`2026-05-${day}`, {
        activities: [{ duration: 1800, elevation_up: 100 }],
        health: {
          sleep: { value: 7 * 3600 },
          heartRateRest: { value: 50 },
          hrv: { value: 50 }
        }
      });
    });

    const analysis = analyzeCondition(pulls, { date: "2026-05-11", pullDate: "2026-05-10", createdAt: "2026-05-11T06:00:00Z" });

    expect(analysis.trends.seven_days).toMatchObject({
      minutes: 210,
      ascent_m: 700,
      activity_count: 7,
      available_days: 7,
      complete: true,
      start_date: "2026-05-04",
      end_date: "2026-05-10"
    });
    expect(analysis.trends.twenty_eight_days).toMatchObject({
      minutes: 300,
      ascent_m: 1000,
      activity_count: 10,
      available_days: 10,
      complete: false
    });
    expect(analysis.trends.status).toBe("limited");
  });

  it("uses COROS direct EvoLab metrics when Runalyze health metrics are missing", () => {
    const analysis = analyzeCondition(
      [
        pull("2026-05-06", {
          activities: [{ duration: 1800, elevation_up: 120 }],
          health: { sleep: null, heartRateRest: null, hrv: null }
        })
      ],
      { date: "2026-05-07", pullDate: "2026-05-06", createdAt: "2026-05-07T06:00:00Z" },
      [
        corosPull("2026-05-06", {
          date: "2026-05-07",
          rhr_bpm: 48,
          time_in_bed_hours: 7.2,
          avg_sleep_hrv: 52,
          sleep_hrv_baseline: 50,
          training_load: 42,
          fatigue_state: 2,
          training_load_ratio: 1.1,
          stamina_level: 78,
          vo2max: 51
        })
      ]
    );

    expect(analysis.recovery.score).toBe(100);
    expect(analysis.recovery.level).toBe("green");
    expect(analysis.data_quality.available).toEqual(expect.arrayContaining(["sleep", "hrv", "resting_hr", "coros_evolab"]));
    expect(renderConditionMarkdown(analysis)).toContain("VO2max COROS");
  });

  it("prefers COROS mobile sleep duration over time in bed", () => {
    const analysis = analyzeCondition(
      [
        pull("2026-05-04", {
          activities: [],
          health: { sleep: null, heartRateRest: null, hrv: null }
        })
      ],
      { date: "2026-05-05", pullDate: "2026-05-04", metricsDate: "2026-05-05", createdAt: "2026-05-05T06:00:00Z" },
      [
        corosPull("2026-05-04", {
          date: "2026-05-05",
          rhr_bpm: 47,
          time_in_bed_hours: 7.9,
          sleep_hours: 452 / 60,
          sleep_total_minutes: 452,
          avg_sleep_hrv: 61,
          sleep_hrv_baseline: 47
        })
      ]
    );

    expect(analysis.recovery.metrics.sleep_hours).toBeCloseTo(7.533, 3);
    expect(analysis.data_quality.available).toEqual(expect.arrayContaining(["sleep", "coros_sleep"]));
  });

  it("keeps isolated COROS fatigue state 5 at orange when HRV and load ratio are reassuring", () => {
    const analysis = analyzeCondition(
      [
        pull("2026-05-06", {
          activities: [],
          health: { sleep: null, heartRateRest: null, hrv: null }
        })
      ],
      { date: "2026-05-07", pullDate: "2026-05-06", createdAt: "2026-05-07T06:00:00Z" },
      [
        {
          ...corosPull("2026-05-06", {
            date: "2026-05-07",
            rhr_bpm: 55,
            time_in_bed_hours: 8.2,
            avg_sleep_hrv: 55,
            sleep_hrv_baseline: 44,
            training_load: 0,
            fatigue_state: 5,
            training_load_ratio: 1.4
          }),
          activity_count: 0,
          activities: []
        }
      ]
    );

    expect(analysis.level).toBe("orange");
    expect(analysis.flags).toContainEqual(
      expect.objectContaining({
        level: "orange",
        code: "coros_fatigue_orange"
      })
    );
    expect(analysis.flags.map((flag) => flag.code)).not.toContain("coros_fatigue_red");
  });

  it("raises COROS fatigue state 5 to red when corroborated by high load ratio", () => {
    const analysis = analyzeCondition(
      [
        pull("2026-05-06", {
          activities: [],
          health: { sleep: null, heartRateRest: null, hrv: null }
        })
      ],
      { date: "2026-05-07", pullDate: "2026-05-06", createdAt: "2026-05-07T06:00:00Z" },
      [
        {
          ...corosPull("2026-05-06", {
            date: "2026-05-07",
            rhr_bpm: 55,
            time_in_bed_hours: 8.2,
            avg_sleep_hrv: 55,
            sleep_hrv_baseline: 44,
            training_load: 0,
            fatigue_state: 5,
            training_load_ratio: 1.75
          }),
          activity_count: 0,
          activities: []
        }
      ]
    );

    expect(analysis.level).toBe("red");
    expect(analysis.flags).toContainEqual(
      expect.objectContaining({
        level: "red",
        code: "coros_fatigue_red"
      })
    );
  });

});
