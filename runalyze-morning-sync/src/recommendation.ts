import type { ConditionAnalysis, MorningPull, PlannedSession, RecommendationLevel, TrainingRecommendation } from "./types.js";

const hardTypes = new Set(["Hill session", "Long run", "Trail run", "Hike-run"]);
const hardIntensities = new Set(["Controlled steady", "Hill tempo", "Threshold"]);
type YesterdayLoad = { minutes: number; ascent: number; source?: string };

export function recommendToday(plan: PlannedSession[], pull: MorningPull, today: string, condition?: ConditionAnalysis): TrainingRecommendation {
  const todaySession = plan.find((session) => session.Date === today);
  const weekSessions = todaySession ? plan.filter((session) => session.Week === todaySession.Week) : [];
  const remainingWeek = weekSessions.filter((session) => session.Date > today);
  const yesterdayLoad = condition
    ? { minutes: condition.yesterday_load.minutes, ascent: condition.yesterday_load.ascent_m, source: condition.yesterday_load.source }
    : estimateYesterdayLoad(pull);
  const recovery = evaluateRecovery(pull);
  const conditionContext = summarizeCondition(condition);
  const useCondition = condition !== undefined;
  const signalLevel = useCondition ? conditionContext.level : recovery.level;
  const dataQuality = useCondition ? conditionContext.dataQuality : recovery.dataQuality;

  if (!todaySession) {
    return {
      date: today,
      created_at: new Date().toISOString(),
      level: signalLevel,
      decision: "replace_easy",
      recommended_session: easyFallback(signalLevel),
      reasons: unique(["No planned session was found for today.", ...conditionContext.reasons]),
      data_quality: dataQuality
    };
  }

  const hardToday = isHard(todaySession);
  const heavyYesterday = yesterdayLoad.minutes >= 120 || yesterdayLoad.ascent >= 800;
  const missingHealthOnly = !useCondition && signalLevel === "orange" && recovery.reasons.length === 0 && dataQuality.length >= 2;
  const reasons = unique(useCondition ? conditionContext.reasons : recovery.reasons);
  if (heavyYesterday) {
    reasons.push(`Notable previous-day load (${Math.round(yesterdayLoad.minutes)} min, ${Math.round(yesterdayLoad.ascent)} m ascent).`);
  }

  if (signalLevel === "red") {
    return {
      date: today,
      created_at: new Date().toISOString(),
      level: "red",
      decision: hardToday ? "swap" : "rest",
      today: todaySession,
      swap_with: hardToday ? findEasySwap(remainingWeek) : undefined,
      recommended_session: restOrMobility(todaySession),
      reasons: reasons.length ? reasons : ["Recovery signals are insufficient or health metrics are concerning."],
      data_quality: dataQuality
    };
  }

  if (signalLevel === "orange" || heavyYesterday) {
    if (hardToday) {
      const swap = findEasySwap(remainingWeek);
      return {
        date: today,
        created_at: new Date().toISOString(),
        level: "orange",
        decision: swap ? "swap" : "replace_easy",
        today: todaySession,
        swap_with: swap,
        recommended_session: swap ? sessionToRecommendation(swap, "Easy session swapped with today's key session.") : reduceSession(todaySession, 0.65),
        reasons: reasons.length ? reasons : ["A key session was planned while recovery or recent load calls for caution."],
        data_quality: dataQuality
      };
    }

    if (missingHealthOnly && !heavyYesterday) {
      return {
        date: today,
        created_at: new Date().toISOString(),
        level: "orange",
        decision: "maintain",
        today: todaySession,
        recommended_session: sessionToRecommendation(todaySession, "Easy session maintained despite incomplete health metrics. Reassess during warm-up."),
        reasons: ["Health metrics are incomplete, with no other load warning detected."],
        data_quality: dataQuality
      };
    }

    return {
      date: today,
      created_at: new Date().toISOString(),
      level: "orange",
      decision: "reduce",
      today: todaySession,
      recommended_session: reduceSession(todaySession, 0.75),
      reasons: reasons.length ? reasons : ["Keep frequency but reduce today's load."],
      data_quality: dataQuality
    };
  }

  return {
    date: today,
    created_at: new Date().toISOString(),
    level: "green",
    decision: "maintain",
    today: todaySession,
    recommended_session: sessionToRecommendation(todaySession, "Session maintained."),
    reasons: reasons.length ? reasons : ["No warning signal detected in the available data."],
    data_quality: dataQuality
  };
}

function summarizeCondition(condition: ConditionAnalysis | undefined): { level: RecommendationLevel; reasons: string[]; dataQuality: string[] } {
  if (!condition) return { level: "green", reasons: [], dataQuality: [] };

  const alertFlags = condition.flags.filter((flag) => flag.level !== "green");
  const reasons = alertFlags.map((flag) => `Condition report: ${flag.message}`);
  if (!reasons.length && condition.summary[0]) {
    reasons.push(`Condition report: ${condition.summary[0]}`);
  }

  const dataQuality = condition.data_quality.missing.map((item) => `condition_${item}_missing`);
  if (condition.data_quality.level !== "good") {
    dataQuality.push(`condition_quality_${condition.data_quality.level}`);
  }
  if (condition.trends.status === "limited") {
    dataQuality.push("condition_trend_limited");
  }

  return {
    level: condition.level,
    reasons,
    dataQuality
  };
}

function isHard(session: PlannedSession): boolean {
  return hardTypes.has(session.Type) || hardIntensities.has(session["Target intensity"]) || session["Target RPE"] >= 5 || session["Planned duration min"] >= 120;
}

function findEasySwap(sessions: PlannedSession[]): PlannedSession | undefined {
  return sessions.find((session) => !isHard(session) && session.Type !== "Rest") ?? sessions.find((session) => session.Type === "Rest");
}

function estimateYesterdayLoad(pull: MorningPull): YesterdayLoad {
  const activities = Array.isArray(pull.activities) ? pull.activities : [];
  let minutes = 0;
  let ascent = 0;
  for (const activity of activities) {
    if (!activity || typeof activity !== "object") continue;
    const record = activity as Record<string, unknown>;
    minutes += toNumber(record.duration) / 60;
    ascent += firstPositiveNumber(record, ["elevation_up_file", "elevation_up", "ascent_m", "ascent", "elev_gain", "total_elevation_gain", "altitude_up"]);
  }
  return { minutes, ascent, source: "runalyze" };
}

function evaluateRecovery(pull: MorningPull): { level: RecommendationLevel; reasons: string[]; dataQuality: string[] } {
  const reasons: string[] = [];
  const dataQuality: string[] = [];
  const health = pull.health && typeof pull.health === "object" ? (pull.health as Record<string, unknown>) : undefined;
  const healthDetails = pull.health_details ?? {};
  if (!health && Object.keys(healthDetails).length === 0) {
    return {
      level: "orange",
      reasons: ["Runalyze health metrics are missing; apply light caution."],
      dataQuality: ["health_missing"]
    };
  }

  const sleepHours = extractHours(metricSource("sleep", health, healthDetails), pull.date);
  const restingHr = extractValue(metricSource("heartRateRest", health, healthDetails), pull.date, [
    "heartRateRest",
    "heart_rate_rest",
    "resting_hr",
    "restingHeartRate",
    "value",
    "avg",
    "average"
  ]);
  const hrv = extractValue(metricSource("hrv", health, healthDetails), pull.date, ["hrv", "value", "avg", "average", "rmssd"]);

  if (sleepHours === undefined) dataQuality.push("sleep_missing");
  if (restingHr === undefined) dataQuality.push("resting_hr_missing");
  if (hrv === undefined) dataQuality.push("hrv_missing");

  let score = 0;
  if (sleepHours !== undefined && sleepHours < 5.5) {
    score += 2;
    reasons.push(`Short sleep (${sleepHours.toFixed(1)} h).`);
  } else if (sleepHours !== undefined && sleepHours < 6.5) {
    score += 1;
    reasons.push(`Moderate sleep (${sleepHours.toFixed(1)} h).`);
  }

  if (restingHr !== undefined && restingHr >= 60) {
    score += 1;
    reasons.push(`Resting HR is elevated or worth monitoring (${Math.round(restingHr)} bpm).`);
  }

  if (hrv !== undefined && hrv > 0 && hrv < 35) {
    score += 1;
    reasons.push(`HRV is low or worth monitoring (${Math.round(hrv)}).`);
  }

  if (score >= 2) return { level: "red", reasons, dataQuality };
  if (score === 1 || dataQuality.length >= 2) return { level: "orange", reasons, dataQuality };
  return { level: "green", reasons, dataQuality };
}

function extractValue(metric: unknown, targetDate: string | undefined, preferredKeys: string[], min = 1, max = 300): number | undefined {
  const focused = focusMetric(metric, targetDate);
  const preferred = extractPreferredNumber(focused, preferredKeys);
  if (preferred !== undefined && preferred >= min && preferred <= max) return preferred;
  return collectNumbers(focused).find((candidate) => candidate >= min && candidate <= max);
}

function extractHours(metric: unknown, targetDate: string): number | undefined {
  const focused = focusMetric(metric, targetDate);
  const value =
    extractPreferredNumber(focused, ["duration", "sleep_duration", "sleepDuration", "total", "total_sleep", "time_in_bed", "value"]) ??
    collectNumbers(focused).find((candidate) => candidate > 0);
  if (value === undefined) return undefined;
  if (value > 24 * 60) return value / 3600;
  if (value > 24) return value / 60;
  return value;
}

function metricSource(key: string, health: Record<string, unknown> | undefined, healthDetails: Record<string, unknown>): unknown {
  const sources = [health?.[key], healthDetails[key]].filter((source) => source !== undefined && source !== null);
  if (sources.length === 0) return undefined;
  if (sources.length === 1) return sources[0];
  return sources;
}

function focusMetric(metric: unknown, targetDate: string | undefined): unknown {
  if (!targetDate) return metric;
  const dated = findDatedEntry(metric, targetDate);
  if (dated !== undefined) return dated;
  return containsDatedEntry(metric) ? undefined : metric;
}

function containsDatedEntry(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(containsDatedEntry);
  const record = value as Record<string, unknown>;
  if (entryDate(record) !== undefined) return true;
  return Object.values(record).some(containsDatedEntry);
}

function findDatedEntry(value: unknown, targetDate: string): unknown {
  if (!value || typeof value !== "object") return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findDatedEntry(item, targetDate);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  const record = value as Record<string, unknown>;
  if (entryDate(record) === targetDate) return record;
  for (const child of Object.values(record)) {
    const found = findDatedEntry(child, targetDate);
    if (found !== undefined) return found;
  }
  return undefined;
}

function entryDate(record: Record<string, unknown>): string | undefined {
  for (const key of ["date", "day", "datetime", "date_time", "created_at", "time"]) {
    const value = record[key];
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  }
  return undefined;
}

function extractPreferredNumber(value: unknown, preferredKeys: string[]): number | undefined {
  if (!value || typeof value !== "object") return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = extractPreferredNumber(item, preferredKeys);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  const record = value as Record<string, unknown>;
  for (const key of preferredKeys) {
    const number = toNumber(record[key]);
    if (number > 0) return number;
  }
  for (const child of Object.values(record)) {
    const found = extractPreferredNumber(child, preferredKeys);
    if (found !== undefined) return found;
  }
  return undefined;
}

function collectNumbers(value: unknown): number[] {
  if (typeof value === "number" && Number.isFinite(value)) return [value];
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap(collectNumbers);
  return Object.values(value).flatMap(collectNumbers);
}

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function firstPositiveNumber(record: Record<string, unknown>, keys: string[]): number {
  for (const key of keys) {
    const value = toNumber(record[key]);
    if (value > 0) return value;
  }
  return 0;
}

function sessionToRecommendation(session: PlannedSession, notes: string) {
  return {
    name: session.Session,
    duration_min: session["Planned duration min"],
    ascent_m: session["Planned ascent m"],
    intensity: session["Target intensity"],
    fc_cap_bpm: session["HR cap bpm"],
    notes
  };
}

function reduceSession(session: PlannedSession, factor: number) {
  return {
    name: `${session.Session} - reduced version`,
    duration_min: Math.max(20, Math.round(session["Planned duration min"] * factor)),
    ascent_m: Math.round(session["Planned ascent m"] * factor),
    intensity: session["Target intensity"] === "Rest" ? "Rest" : "Very easy",
    fc_cap_bpm: Math.min(session["HR cap bpm"] ?? 140, 140),
    notes: "Reduce load, remove intervals or fast strides, and stay easy."
  };
}

function restOrMobility(session: PlannedSession) {
  return {
    name: `${session.Session} - replaced by rest/mobility`,
    duration_min: 20,
    ascent_m: 0,
    intensity: "Rest",
    fc_cap_bpm: undefined,
    notes: "Rest, gentle mobility or walking. Do not make up the session tomorrow."
  };
}

function easyFallback(level: RecommendationLevel) {
  return {
    name: level === "red" ? "Rest / mobility" : "Very easy endurance",
    duration_min: level === "red" ? 20 : 40,
    ascent_m: 0,
    intensity: level === "red" ? "Rest" : "Very easy",
    fc_cap_bpm: level === "red" ? undefined : 140,
    notes: "Default suggestion because no planned session was found."
  };
}

function maxLevel(left: RecommendationLevel, right: RecommendationLevel): RecommendationLevel {
  const order: Record<RecommendationLevel, number> = { green: 0, orange: 1, red: 2 };
  return order[right] > order[left] ? right : left;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
