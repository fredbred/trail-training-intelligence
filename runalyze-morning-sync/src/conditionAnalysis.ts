import { readdir, readFile } from "node:fs/promises";
import type { Dirent } from "node:fs";
import { join } from "node:path";

import type {
  ActivityDataSource,
  ConditionAnalysis,
  ConditionDataQuality,
  ConditionFlag,
  ConditionLoad,
  ConditionMetricSnapshot,
  ConditionRecovery,
  ConditionTrend,
  ConditionWindowLoad,
  CorosActivity,
  CorosDailyMetrics,
  CorosDirectPull,
  MorningPull,
  RecommendationLevel
} from "./types.js";

type AnalyzeConditionOptions = {
  date: string;
  pullDate: string;
  metricsDate?: string;
  createdAt?: string;
};

type PullFile = {
  filename: string;
  pull: MorningPull;
};

type CorosPullFile = {
  filename: string;
  pull: CorosDirectPull;
};

const metricLabels: Record<"sleep_hours" | "hrv" | "resting_hr_bpm", string> = {
  sleep_hours: "sleep",
  hrv: "hrv",
  resting_hr_bpm: "resting_hr"
};

export async function analyzeConditionFromOutput(outputDir: string, options: AnalyzeConditionOptions): Promise<ConditionAnalysis> {
  const pullFiles = await readMorningPullFiles(outputDir);
  const corosPullFiles = await readCorosPullFiles(outputDir);
  return analyzeCondition(
    pullFiles.map((file) => file.pull),
    options,
    corosPullFiles.map((file) => file.pull)
  );
}

export function analyzeCondition(pulls: MorningPull[], options: AnalyzeConditionOptions, corosPulls: CorosDirectPull[] = []): ConditionAnalysis {
  const metricsDate = options.metricsDate ?? options.date;
  const history = pulls
    .filter((pull) => isIsoDate(pull.date) && pull.date <= options.pullDate)
    .sort((left, right) => left.date.localeCompare(right.date));
  const corosHistory = corosPulls
    .filter((pull) => isIsoDate(pull.date) && pull.date <= options.pullDate)
    .sort((left, right) => left.date.localeCompare(right.date));
  const targetPull = history.find((pull) => pull.date === options.pullDate);
  const targetCorosPull = corosHistory.find((pull) => pull.date === options.pullDate);
  const targetCorosPullWithMatchingMetrics = withMatchingCorosMetricsDate(targetCorosPull, metricsDate);

  if (!targetPull && !targetCorosPull) {
    throw new Error(`Aucun pull local trouvé pour ${options.pullDate}. Lancer pull-coros-yesterday ou pull-yesterday, ou passer --pull-date.`);
  }

  const effectivePull = targetPull ?? emptyMorningPull(options.pullDate);
  const yesterdayLoad = estimateDailyLoad(effectivePull, targetCorosPull);
  const recovery = evaluateRecovery(effectivePull, targetCorosPullWithMatchingMetrics?.target_day, metricsDate);
  const trends = buildTrend(history, corosHistory, options.pullDate);
  const dataQuality = evaluateDataQuality(effectivePull, recovery.metrics, countCombinedHistoryDays(history, corosHistory), targetCorosPullWithMatchingMetrics, Boolean(targetPull));
  const flags = buildFlags(yesterdayLoad, recovery, dataQuality);
  const level = conditionLevel(recovery, flags);
  const limits = buildLimits(countCombinedHistoryDays(history, corosHistory), recovery.metrics, effectivePull, targetCorosPullWithMatchingMetrics);
  const summary = buildSummary(yesterdayLoad, recovery, flags, trends);

  return {
    date: options.date,
    pull_date: options.pullDate,
    metrics_date: metricsDate,
    created_at: options.createdAt ?? new Date().toISOString(),
    level,
    source_files: buildTargetSourceFiles(targetPull, targetCorosPull, options.pullDate),
    yesterday_load: yesterdayLoad,
    recovery,
    data_quality: dataQuality,
    flags,
    trends,
    limits,
    summary
  };
}

export function renderConditionMarkdown(analysis: ConditionAnalysis): string {
  const recoveryScore = analysis.recovery.score === null ? "non calculable" : `${analysis.recovery.score}/100`;
  return [
    `# Bilan condition — ${analysis.date}`,
    "",
    `Pull source : ${analysis.pull_date}`,
    `Métriques récupération : ${analysis.metrics_date}`,
    `Niveau global : ${analysis.level}`,
    "",
    "## Charge veille",
    `- Durée : ${Math.round(analysis.yesterday_load.minutes)} min`,
    `- D+ : ${Math.round(analysis.yesterday_load.ascent_m)} m`,
    `- Activités : ${analysis.yesterday_load.activity_count}`,
    `- Source : ${loadSourceLabel(analysis.yesterday_load.source)}`,
    "",
    "## Récupération",
    `- Score : ${recoveryScore}`,
    ...metricLines(analysis.recovery.metrics),
    ...(analysis.recovery.reasons.length ? analysis.recovery.reasons.map((reason) => `- ${reason}`) : ["- Aucun signal récupération défavorable détecté."]),
    "",
    "## Drapeaux",
    ...analysis.flags.map((flag) => `- ${flag.level.toUpperCase()} ${flag.code} : ${flag.message}`),
    "",
    "## Tendances locales",
    renderWindowLine("7 jours", analysis.trends.seven_days),
    renderWindowLine("28 jours", analysis.trends.twenty_eight_days),
    `- ${analysis.trends.note}`,
    "",
    "## Qualité des données",
    `- Niveau : ${analysis.data_quality.level}`,
    `- Disponibles : ${analysis.data_quality.available.length ? analysis.data_quality.available.join(", ") : "aucune"}`,
    `- Manquantes : ${analysis.data_quality.missing.length ? analysis.data_quality.missing.join(", ") : "aucune"}`,
    ...(analysis.data_quality.notes.length ? analysis.data_quality.notes.map((note) => `- ${note}`) : []),
    "",
    "## Limites",
    ...analysis.limits.map((limit) => `- ${limit}`),
    ""
  ].join("\n");
}

async function readMorningPullFiles(outputDir: string): Promise<PullFile[]> {
  let entries: Dirent[];
  try {
    entries = await readdir(outputDir, { withFileTypes: true });
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return [];
    throw error;
  }
  const files = entries
    .filter((entry) => entry.isFile() && /^morning_pull_\d{4}-\d{2}-\d{2}\.json$/.test(entry.name))
    .map((entry) => entry.name)
    .sort();

  const pulls: PullFile[] = [];
  for (const filename of files) {
    const raw = await readFile(join(outputDir, filename), "utf8");
    const parsed = JSON.parse(raw) as MorningPull;
    pulls.push({ filename, pull: parsed });
  }
  return pulls;
}

async function readCorosPullFiles(outputDir: string): Promise<CorosPullFile[]> {
  let entries: Dirent[];
  try {
    entries = await readdir(outputDir, { withFileTypes: true });
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return [];
    throw error;
  }
  const files = entries
    .filter((entry) => entry.isFile() && /^coros_pull_\d{4}-\d{2}-\d{2}\.json$/.test(entry.name))
    .map((entry) => entry.name)
    .sort();

  const pulls: CorosPullFile[] = [];
  for (const filename of files) {
    const raw = await readFile(join(outputDir, filename), "utf8");
    const parsed = JSON.parse(raw) as CorosDirectPull;
    pulls.push({ filename, pull: parsed });
  }
  return pulls;
}

function emptyMorningPull(date: string): MorningPull {
  return {
    date,
    created_at: new Date().toISOString(),
    notes: []
  };
}

function buildTargetSourceFiles(targetPull: MorningPull | undefined, targetCorosPull: CorosDirectPull | undefined, pullDate: string): string[] {
  const files: string[] = [];
  if (targetPull) files.push(`morning_pull_${pullDate}.json`);
  if (targetCorosPull) files.push(`coros_pull_${pullDate}.json`);
  return files;
}

function withMatchingCorosMetricsDate(corosPull: CorosDirectPull | undefined, metricsDate: string): CorosDirectPull | undefined {
  if (!corosPull?.target_day) return corosPull;
  if (corosPull.target_day.date === metricsDate) return corosPull;
  return { ...corosPull, target_day: undefined };
}

function estimateDailyLoad(pull: MorningPull | undefined, corosPull: CorosDirectPull | undefined): ConditionLoad {
  if (Array.isArray(corosPull?.activities)) {
    return estimateCorosLoad(corosPull.activities);
  }
  if (pull) return estimateRunalyzeLoad(pull);
  return { minutes: 0, ascent_m: 0, activity_count: 0, source: "none" };
}

function estimateCorosLoad(activities: CorosActivity[]): ConditionLoad {
  let minutes = 0;
  let ascent = 0;

  for (const activity of activities) {
    minutes += (activity.duration_seconds ?? 0) / 60;
    ascent += activity.ascent_m ?? 0;
  }

  return {
    minutes: roundOne(minutes),
    ascent_m: Math.round(ascent),
    activity_count: activities.length,
    source: "coros_direct"
  };
}

function estimateRunalyzeLoad(pull: MorningPull): ConditionLoad {
  const activities = Array.isArray(pull.activities) ? pull.activities : [];
  const activityCount = typeof pull.activity_count === "number" ? pull.activity_count : activities.length;
  let minutes = 0;
  let ascent = 0;

  for (const activity of activities) {
    if (!activity || typeof activity !== "object") continue;
    const record = activity as Record<string, unknown>;
    minutes += extractDurationMinutes(record);
    ascent += firstNumber(record, ["elevation_up_file", "elevation_up", "ascent_m", "ascent", "elev_gain", "total_elevation_gain", "altitude_up"]) ?? 0;
  }

  return {
    minutes: roundOne(minutes),
    ascent_m: Math.round(ascent),
    activity_count: activityCount,
    source: "runalyze"
  };
}

function evaluateRecovery(pull: MorningPull, corosDay?: CorosDailyMetrics, metricsDate = pull.date): ConditionRecovery {
  const health = pull.health && typeof pull.health === "object" ? (pull.health as Record<string, unknown>) : undefined;
  const healthDetails = pull.health_details ?? {};
  const sleepHours = corosDay?.sleep_hours ?? corosDay?.time_in_bed_hours ?? extractHours(metricSource("sleep", health, healthDetails), metricsDate);
  const restingHr = corosDay?.rhr_bpm ?? extractValue(metricSource("heartRateRest", health, healthDetails), metricsDate, [
    "heartRateRest",
    "heart_rate_rest",
    "resting_hr",
    "restingHeartRate",
    "value",
    "avg",
    "average"
  ]);
  const hrv = corosDay?.avg_sleep_hrv ?? extractValue(metricSource("hrv", health, healthDetails), metricsDate, ["hrv", "value", "avg", "average", "rmssd"]);

  const metrics = buildMetricSnapshot({
    sleep_hours: sleepHours,
    hrv,
    hrv_baseline: corosDay?.sleep_hrv_baseline,
    resting_hr_bpm: restingHr,
    coros_training_load: corosDay?.training_load,
    coros_fatigue_index: corosDay?.fatigue_index,
    coros_fatigue_state: corosDay?.fatigue_state,
    coros_training_load_ratio: corosDay?.training_load_ratio,
    coros_stamina_level: corosDay?.stamina_level,
    coros_vo2max: corosDay?.vo2max
  });
  const reasons: string[] = [];
  let penalty = 0;

  if (sleepHours !== undefined && sleepHours < 5.5) {
    penalty += 35;
    reasons.push(`Sommeil court (${sleepHours.toFixed(1)} h).`);
  } else if (sleepHours !== undefined && sleepHours < 6.5) {
    penalty += 18;
    reasons.push(`Sommeil moyen (${sleepHours.toFixed(1)} h).`);
  }

  if (restingHr !== undefined && restingHr >= 65) {
    penalty += 20;
    reasons.push(`FC repos élevée ou à surveiller (${Math.round(restingHr)} bpm).`);
  } else if (restingHr !== undefined && restingHr >= 60) {
    penalty += 10;
    reasons.push(`FC repos un peu haute (${Math.round(restingHr)} bpm).`);
  }

  if (hrv !== undefined && hrv > 0 && hrv < 25) {
    penalty += 22;
    reasons.push(`HRV basse ou à surveiller (${Math.round(hrv)}).`);
  } else if (hrv !== undefined && hrv > 0 && hrv < 35) {
    penalty += 12;
    reasons.push(`HRV sous le seuil de prudence (${Math.round(hrv)}).`);
  }

  if (hrv !== undefined && corosDay?.sleep_hrv_baseline && hrv < corosDay.sleep_hrv_baseline * 0.9) {
    penalty += 25;
    reasons.push(`HRV COROS très sous baseline (${Math.round(hrv)} vs ${Math.round(corosDay.sleep_hrv_baseline)} ms).`);
  } else if (hrv !== undefined && corosDay?.sleep_hrv_baseline && hrv < corosDay.sleep_hrv_baseline) {
    penalty += 10;
    reasons.push(`HRV COROS légèrement sous baseline (${Math.round(hrv)} vs ${Math.round(corosDay.sleep_hrv_baseline)} ms).`);
  }

  if (corosDay?.fatigue_state !== undefined && corosDay.fatigue_state >= 5) {
    penalty += 25;
    reasons.push(`Fatigue COROS élevée (état ${corosDay.fatigue_state}).`);
  } else if (corosDay?.fatigue_state !== undefined && corosDay.fatigue_state >= 4) {
    penalty += 12;
    reasons.push(`Fatigue COROS à surveiller (état ${corosDay.fatigue_state}).`);
  }

  const score = metrics.available.length ? Math.max(0, Math.min(100, 100 - penalty)) : null;
  const level = recoveryLevel(score, metrics);

  return { score, level, metrics, reasons };
}

function buildMetricSnapshot(values: Omit<ConditionMetricSnapshot, "available" | "missing">): ConditionMetricSnapshot {
  const available: string[] = [];
  const missing: string[] = [];

  for (const [key, label] of Object.entries(metricLabels) as [keyof typeof metricLabels, string][]) {
    if (values[key] !== undefined) {
      available.push(label);
    } else {
      missing.push(label);
    }
  }

  return {
    ...values,
    available,
    missing
  };
}

function recoveryLevel(score: number | null, metrics: ConditionMetricSnapshot): RecommendationLevel {
  if (score === null) return "orange";
  if (score <= 55) return "red";
  if (score <= 80 || metrics.missing.length >= 2) return "orange";
  return "green";
}

function buildTrend(history: MorningPull[], corosHistory: CorosDirectPull[], pullDate: string): ConditionTrend {
  const sevenDays = buildWindowLoad(history, corosHistory, pullDate, 7);
  const twentyEightDays = buildWindowLoad(history, corosHistory, pullDate, 28);
  const status = sevenDays.complete && twentyEightDays.available_days >= 14 ? "available" : "limited";
  const note =
    status === "available"
      ? "Historique local suffisant pour une première lecture de charge, sans modélisation fine."
      : "Tendance très limitée : historique local incomplet, interpréter seulement comme un total des pulls disponibles.";

  return {
    status,
    note,
    seven_days: sevenDays,
    twenty_eight_days: twentyEightDays
  };
}

function buildWindowLoad(history: MorningPull[], corosHistory: CorosDirectPull[], endDate: string, expectedDays: number): ConditionWindowLoad {
  const startDate = shiftIsoDate(endDate, -(expectedDays - 1));
  const windowDates = uniqueStrings([
    ...history.map((pull) => pull.date),
    ...corosHistory.map((pull) => pull.date)
  ]).filter((date) => date >= startDate && date <= endDate);

  const loads = windowDates.map((date) =>
    estimateDailyLoad(
      history.find((pull) => pull.date === date),
      corosHistory.find((pull) => pull.date === date)
    )
  );
  const totals = loads.reduce(
    (accumulator, pull) => {
      accumulator.minutes += pull.minutes;
      accumulator.ascent_m += pull.ascent_m;
      accumulator.activity_count += pull.activity_count;
      return accumulator;
    },
    { minutes: 0, ascent_m: 0, activity_count: 0 }
  );

  return {
    minutes: roundOne(totals.minutes),
    ascent_m: Math.round(totals.ascent_m),
    activity_count: totals.activity_count,
    source: mergeLoadSources(loads.map((load) => load.source)),
    expected_days: expectedDays,
    available_days: windowDates.length,
    complete: windowDates.length >= expectedDays,
    start_date: startDate,
    end_date: endDate,
    dates: windowDates
  };
}

function evaluateDataQuality(pull: MorningPull, metrics: ConditionMetricSnapshot, historyCount: number, corosPull?: CorosDirectPull, hasMorningPull = true): ConditionDataQuality {
  const available: string[] = [...metrics.available];
  const missing: string[] = [...metrics.missing];
  const notes: string[] = [];

  if (Array.isArray(corosPull?.activities)) {
    available.push("coros_activities");
    if (!corosPull.activities.length) notes.push("COROS direct indique aucune activité pour la date cible.");
  } else if (Array.isArray(pull.activities)) {
    available.push("runalyze_activities_backup");
    notes.push("Activités COROS directes absentes : utilisation du backup Runalyze.");
  } else {
    missing.push("activities");
  }

  if (hasCorosSleepMetrics(corosPull?.target_day)) {
    available.push("coros_sleep");
  }

  if (hasCorosEvolabMetrics(corosPull?.target_day)) {
    available.push("coros_evolab");
  } else {
    missing.push("coros_evolab");
    notes.push("Pull COROS direct absent ou sans métriques EvoLab pour la date cible.");
  }
  if (!hasMorningPull) {
    notes.push("Pull Runalyze absent : backup activités/santé non disponible pour cette date.");
  }

  if (historyCount < 7) {
    notes.push(`Historique court (${historyCount} pull${historyCount > 1 ? "s" : ""} ${historyCount > 1 ? "locaux" : "local"}).`);
  }
  if (historyCount < 28) {
    notes.push("Fenêtre 28 jours incomplète.");
  }

  const level = qualityLevel(available, missing, historyCount);
  return { level, available, missing, notes };
}

function qualityLevel(available: string[], missing: string[], historyCount: number): ConditionDataQuality["level"] {
  if (!available.length || missing.length >= 3) return "limited";
  if (missing.length || historyCount < 7) return "partial";
  return "good";
}

function buildFlags(load: ConditionLoad, recovery: ConditionRecovery, dataQuality: ConditionDataQuality): ConditionFlag[] {
  const flags: ConditionFlag[] = [];

  if (load.minutes >= 180 || load.ascent_m >= 1200) {
    flags.push({ level: "red", code: "heavy_yesterday", message: `Charge de veille très élevée (${Math.round(load.minutes)} min, ${load.ascent_m} m D+).` });
  } else if (load.minutes >= 120 || load.ascent_m >= 800) {
    flags.push({ level: "orange", code: "notable_yesterday", message: `Charge de veille notable (${Math.round(load.minutes)} min, ${load.ascent_m} m D+).` });
  }

  if (recovery.level === "red") {
    flags.push({ level: "red", code: "recovery_red", message: "Score récupération bas avec les métriques disponibles." });
  } else if (recovery.level === "orange") {
    flags.push({ level: "orange", code: "recovery_orange", message: "Récupération à surveiller ou métriques santé incomplètes." });
  }

  if (recovery.metrics.coros_training_load_ratio !== undefined && recovery.metrics.coros_training_load_ratio >= 2) {
    flags.push({ level: "red", code: "coros_load_ratio_red", message: `Ratio de charge COROS élevé (${recovery.metrics.coros_training_load_ratio.toFixed(2)}).` });
  } else if (recovery.metrics.coros_training_load_ratio !== undefined && recovery.metrics.coros_training_load_ratio >= 1.5) {
    flags.push({ level: "orange", code: "coros_load_ratio_orange", message: `Ratio de charge COROS à surveiller (${recovery.metrics.coros_training_load_ratio.toFixed(2)}).` });
  }

  if (recovery.metrics.coros_fatigue_state !== undefined && recovery.metrics.coros_fatigue_state >= 5) {
    const fatigueRisk = corosFatigueRisk(recovery.metrics);
    flags.push({
      level: fatigueRisk.level,
      code: fatigueRisk.level === "red" ? "coros_fatigue_red" : "coros_fatigue_orange",
      message: fatigueRisk.message
    });
  } else if (recovery.metrics.coros_fatigue_state !== undefined && recovery.metrics.coros_fatigue_state >= 4) {
    flags.push({ level: "orange", code: "coros_fatigue_orange", message: `Fatigue COROS à surveiller (état ${recovery.metrics.coros_fatigue_state}).` });
  }

  if (dataQuality.level === "limited") {
    flags.push({ level: "orange", code: "data_limited", message: "Données locales limitées, privilégier une décision prudente." });
  }

  if (!flags.length) {
    flags.push({ level: "green", code: "no_alert", message: "Aucun signal d’alerte détecté dans les données locales." });
  }

  return flags;
}

function corosFatigueRisk(metrics: ConditionMetricSnapshot): ConditionFlag {
  const corroboratingSignals: string[] = [];

  if (metrics.hrv !== undefined && metrics.hrv_baseline !== undefined && metrics.hrv < metrics.hrv_baseline * 0.9) {
    corroboratingSignals.push(`HRV très sous baseline (${Math.round(metrics.hrv)} vs ${Math.round(metrics.hrv_baseline)} ms)`);
  }
  if (metrics.resting_hr_bpm !== undefined && metrics.resting_hr_bpm >= 60) {
    corroboratingSignals.push(`FC repos haute (${Math.round(metrics.resting_hr_bpm)} bpm)`);
  }
  if (metrics.coros_training_load_ratio !== undefined && metrics.coros_training_load_ratio >= 1.7) {
    corroboratingSignals.push(`ratio charge élevé (${metrics.coros_training_load_ratio.toFixed(2)})`);
  }

  if (corroboratingSignals.length) {
    return {
      level: "red",
      code: "coros_fatigue_red",
      message: `Fatigue COROS élevée (état ${metrics.coros_fatigue_state}) avec signal(s) défavorable(s) : ${corroboratingSignals.join(", ")}.`
    };
  }

  return {
    level: "orange",
    code: "coros_fatigue_orange",
    message: `Fatigue COROS élevée isolée (état ${metrics.coros_fatigue_state}) : réduire la séance plutôt que repos automatique.`
  };
}

function buildLimits(historyCount: number, metrics: ConditionMetricSnapshot, pull: MorningPull, corosPull?: CorosDirectPull): string[] {
  const limits: string[] = ["Ce bilan est une aide à la décision d’entraînement, pas un diagnostic médical."];

  if (historyCount < 2) {
    limits.push("Un seul pull local disponible : aucune tendance fiable ne peut être calculée.");
  } else if (historyCount < 7) {
    limits.push("Moins de 7 pulls locaux disponibles : tendance hebdomadaire partielle.");
  }
  if (historyCount < 28) {
    limits.push("Moins de 28 pulls locaux disponibles : pas de tendance longue fiable.");
  }
  if (metrics.missing.length) {
    limits.push(`Métriques santé manquantes : ${metrics.missing.join(", ")}.`);
  }
  if (!Array.isArray(corosPull?.activities) && !Array.isArray(pull.activities)) {
    limits.push("Activités absentes du pull : la charge de veille peut être sous-estimée.");
  } else if (!Array.isArray(corosPull?.activities) && Array.isArray(pull.activities)) {
    limits.push("Activités COROS directes absentes : charge de veille issue du backup Runalyze.");
  }
  if (!hasCorosEvolabMetrics(corosPull?.target_day)) {
    limits.push("Métriques EvoLab COROS absentes : HRV, fatigue et stamina COROS peuvent manquer.");
  }

  return limits;
}

function hasCorosSleepMetrics(day: CorosDailyMetrics | undefined): boolean {
  return day?.sleep_hours !== undefined || day?.sleep_total_minutes !== undefined;
}

function hasCorosEvolabMetrics(day: CorosDailyMetrics | undefined): boolean {
  if (!day) return false;
  return [
    day.rhr_bpm,
    day.avg_sleep_hrv,
    day.sleep_hrv_baseline,
    day.training_load,
    day.fatigue_index,
    day.fatigue_state,
    day.training_load_ratio,
    day.stamina_level,
    day.vo2max,
    day.lthr_bpm,
    day.lt_pace_sec_per_km
  ].some((value) => value !== undefined);
}

function buildSummary(load: ConditionLoad, recovery: ConditionRecovery, flags: ConditionFlag[], trends: ConditionTrend): string[] {
  return [
    `Niveau condition ${conditionLevel(recovery, flags)} avec score récupération ${recovery.score === null ? "non calculable" : `${recovery.score}/100`}.`,
    `Charge veille : ${Math.round(load.minutes)} min, ${load.ascent_m} m D+, ${load.activity_count} activité(s), source ${loadSourceLabel(load.source)}.`,
    trends.note
  ];
}

function conditionLevel(recovery: ConditionRecovery, flags: ConditionFlag[]): RecommendationLevel {
  return flags.reduce<RecommendationLevel>((worst, flag) => maxLevel(worst, flag.level), recovery.level);
}

function metricLines(metrics: ConditionMetricSnapshot): string[] {
  const lines: string[] = [];
  if (metrics.sleep_hours !== undefined) lines.push(`- Sommeil : ${metrics.sleep_hours.toFixed(1)} h`);
  if (metrics.resting_hr_bpm !== undefined) lines.push(`- FC repos : ${Math.round(metrics.resting_hr_bpm)} bpm`);
  if (metrics.hrv !== undefined) {
    const baseline = metrics.hrv_baseline !== undefined ? ` / baseline ${Math.round(metrics.hrv_baseline)} ms` : "";
    lines.push(`- HRV : ${Math.round(metrics.hrv)} ms${baseline}`);
  }
  if (metrics.coros_training_load !== undefined) lines.push(`- Charge COROS : ${Math.round(metrics.coros_training_load)}`);
  if (metrics.coros_training_load_ratio !== undefined) lines.push(`- Ratio charge COROS : ${metrics.coros_training_load_ratio.toFixed(2)}`);
  if (metrics.coros_fatigue_state !== undefined) lines.push(`- Fatigue COROS : état ${metrics.coros_fatigue_state}`);
  if (metrics.coros_stamina_level !== undefined) lines.push(`- Stamina COROS : ${Math.round(metrics.coros_stamina_level)}/100`);
  if (metrics.coros_vo2max !== undefined) lines.push(`- VO2max COROS : ${Math.round(metrics.coros_vo2max)}`);
  if (!lines.length) lines.push("- Métriques sommeil/HRV/FC repos absentes.");
  return lines;
}

function renderWindowLine(label: string, window: ConditionWindowLoad): string {
  const coverage = window.complete ? "complet" : `${window.available_days}/${window.expected_days} jours disponibles`;
  return `- ${label} : ${Math.round(window.minutes)} min, ${window.ascent_m} m D+, ${window.activity_count} activité(s), ${coverage}, source ${loadSourceLabel(window.source)}`;
}

function countCombinedHistoryDays(history: MorningPull[], corosHistory: CorosDirectPull[]): number {
  return uniqueStrings([...history.map((pull) => pull.date), ...corosHistory.map((pull) => pull.date)]).length;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(isIsoDate))].sort();
}

function mergeLoadSources(sources: ActivityDataSource[]): ActivityDataSource {
  const meaningful = [...new Set(sources.filter((source) => source !== "none"))];
  if (!meaningful.length) return "none";
  if (meaningful.length === 1) return meaningful[0]!;
  return "mixed";
}

function loadSourceLabel(source: ActivityDataSource): string {
  if (source === "coros_direct") return "COROS direct";
  if (source === "runalyze") return "Runalyze backup";
  if (source === "mixed") return "mix COROS/Runalyze";
  return "aucune";
}

function extractDurationMinutes(record: Record<string, unknown>): number {
  const raw = firstNumber(record, ["duration", "moving_time", "elapsed_time", "time", "duration_s", "duration_sec"]);
  if (raw === undefined) return 0;
  if (raw > 24 * 60) return raw / 60;
  return raw;
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
  if (!sources.length) return undefined;
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
  const direct = firstNumber(record, preferredKeys);
  if (direct !== undefined && direct > 0) return direct;
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

function firstNumber(record: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = toNumber(record[key]);
    if (value !== undefined) return value;
  }
  return undefined;
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}

function maxLevel(left: RecommendationLevel, right: RecommendationLevel): RecommendationLevel {
  const order: Record<RecommendationLevel, number> = { green: 0, orange: 1, red: 2 };
  return order[right] > order[left] ? right : left;
}

function shiftIsoDate(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day));
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
