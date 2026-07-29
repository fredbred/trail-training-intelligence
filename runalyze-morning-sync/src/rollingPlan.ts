import type { ConditionAnalysis, ConditionLoad, PlannedSession, TrainingRecommendation } from "./types.js";

export type RollingPlanStatus = "planned" | "done" | "modified" | "replaced" | "skipped";

export type RollingPlanUpdateKind =
  | "record_yesterday"
  | "apply_today_recommendation"
  | "swap_today"
  | "swap_future"
  | "carry_missed_strength"
  | "drop_missed_session";

export type RollingPlanPatch = {
  session?: string;
  type?: string;
  duration_min?: number;
  ascent_m?: number;
  intensity?: string;
  fc_cap_bpm?: number;
  rpe?: number;
  priority?: string;
  description?: string;
  notes?: string;
};

export type RollingPlanUpdate = {
  date: string;
  session: PlannedSession;
  kind: RollingPlanUpdateKind;
  status?: RollingPlanStatus;
  completed?: {
    duration_min: number;
    ascent_m: number;
  };
  planned_patch?: RollingPlanPatch;
  adaptation: string;
};

export type RollingPlanResult = {
  date: string;
  created_at: string;
  source: "rolling_plan_v1";
  window_start: string;
  window_end: string;
  yesterday_date: string;
  yesterday: {
    planned_session?: PlannedSession;
    load: ConditionLoad;
    outcome: "completed" | "partial" | "missed" | "rested" | "extra" | "replaced";
    carry_policy: "none" | "strength_only" | "blocked_by_recovery";
  };
  updates: RollingPlanUpdate[];
  notes: string[];
};

export type BuildRollingPlanOptions = {
  today?: string;
  yesterdayDate?: string;
  lookaheadDays?: number;
  createdAt?: string;
  flexibilityMode?: "normal" | "baby";
};

export function buildRollingPlan(
  plan: PlannedSession[],
  condition: ConditionAnalysis,
  recommendation: TrainingRecommendation,
  options: BuildRollingPlanOptions = {}
): RollingPlanResult {
  const today = options.today ?? recommendation.date ?? condition.date;
  const yesterdayDate = options.yesterdayDate ?? condition.pull_date;
  const lookaheadDays = clampInteger(options.lookaheadDays ?? 7, 1, 14);
  const windowStart = today;
  const windowEnd = addIsoDays(today, lookaheadDays - 1);
  const flexibilityMode = options.flexibilityMode ?? "baby";
  const plannedYesterday = firstSessionOn(plan, yesterdayDate);
  const yesterday = assessYesterday(plannedYesterday, condition.yesterday_load);
  const updates: RollingPlanUpdate[] = [];
  const notes: string[] = [
    "Replanification prudente: continuité prioritaire, pas de dette automatique.",
    flexibilityMode === "baby" ? "Mode bébé: seuls les renfos A/B prioritaires peuvent être replacés automatiquement." : "Mode normal: règles de déplacement conservatrices."
  ];

  if (plannedYesterday) {
    updates.push(recordYesterdayUpdate(plannedYesterday, condition.yesterday_load, yesterday.outcome));
  } else if (hasActivity(condition.yesterday_load)) {
    notes.push(`Activité détectée le ${yesterdayDate} sans séance prévue dans le CSV.`);
  }

  const reservedDates = new Set<string>();
  for (const update of todayRecommendationUpdates(plan, recommendation, today)) {
    updates.push(update);
    reservedDates.add(update.date);
  }

  if (plannedYesterday && yesterday.outcome === "missed") {
    const carry = carryMissedSession(plan, plannedYesterday, {
      today,
      windowEnd,
      condition,
      flexibilityMode,
      reservedDates
    });
    if (carry) {
      updates.push(carry);
      reservedDates.add(carry.date);
    } else {
      const name = sessionName(plannedYesterday);
      notes.push(`${name} manquée le ${yesterdayDate}: pas de rattrapage automatique.`);
    }
  }

  return {
    date: today,
    created_at: options.createdAt ?? new Date().toISOString(),
    source: "rolling_plan_v1",
    window_start: windowStart,
    window_end: windowEnd,
    yesterday_date: yesterdayDate,
    yesterday,
    updates: dedupeUpdates(updates),
    notes
  };
}

export function renderRollingPlanMarkdown(result: RollingPlanResult): string {
  const planned = result.yesterday.planned_session;
  return [
    `# Replanification glissante — ${result.date}`,
    "",
    `Fenêtre : ${result.window_start} → ${result.window_end}`,
    `Source : ${result.source}`,
    "",
    "## Veille",
    `- Date : ${result.yesterday_date}`,
    `- Séance prévue : ${planned ? sessionName(planned) : "aucune"}`,
    `- Charge réelle : ${Math.round(result.yesterday.load.minutes)} min, ${result.yesterday.load.ascent_m} m D+, ${result.yesterday.load.activity_count} activité(s)`,
    `- Issue : ${result.yesterday.outcome}`,
    `- Politique rattrapage : ${result.yesterday.carry_policy}`,
    "",
    "## Updates Notion proposées",
    ...(result.updates.length ? result.updates.flatMap(renderUpdate) : ["- Aucune mise à jour de plan nécessaire."]),
    "",
    "## Notes",
    ...result.notes.map((note) => `- ${note}`),
    ""
  ].join("\n");
}

function renderUpdate(update: RollingPlanUpdate): string[] {
  const patch = update.planned_patch;
  const patchParts = [
    patch?.session ? `séance=${patch.session}` : undefined,
    patch?.type ? `type=${patch.type}` : undefined,
    patch?.duration_min !== undefined ? `durée=${patch.duration_min} min` : undefined,
    patch?.ascent_m !== undefined ? `D+=${patch.ascent_m} m` : undefined,
    patch?.intensity ? `intensité=${patch.intensity}` : undefined,
    patch?.fc_cap_bpm !== undefined ? `FC cap=${patch.fc_cap_bpm}` : undefined
  ].filter(Boolean);

  return [
    `- ${update.date} — ${sessionName(update.session)} : ${update.kind}${update.status ? ` / ${update.status}` : ""}`,
    `  - ${update.adaptation}`,
    ...(update.completed ? [`  - Réalisé : ${update.completed.duration_min} min, ${update.completed.ascent_m} m D+`] : []),
    ...(patchParts.length ? [`  - Plan révisé : ${patchParts.join(", ")}`] : [])
  ];
}

function assessYesterday(
  plannedSession: PlannedSession | undefined,
  load: ConditionLoad
): RollingPlanResult["yesterday"] {
  const activity = hasActivity(load);
  if (!plannedSession) {
    return {
      load,
      outcome: activity ? "extra" : "rested",
      carry_policy: "none"
    };
  }

  if (!activity) {
    return {
      planned_session: plannedSession,
      load,
      outcome: isRest(plannedSession) ? "rested" : "missed",
      carry_policy: isStrength(plannedSession) ? "strength_only" : "none"
    };
  }

  if (isRest(plannedSession)) {
    return {
      planned_session: plannedSession,
      load,
      outcome: "extra",
      carry_policy: "none"
    };
  }

  if (isStrength(plannedSession)) {
    return {
      planned_session: plannedSession,
      load,
      outcome: strengthOutcome(plannedSession, load),
      carry_policy: "none"
    };
  }

  const completion = completionRatio(plannedSession, load);
  const outcome = completion >= 0.75 ? "completed" : completion >= 0.35 || load.minutes >= 20 ? "partial" : "replaced";
  return {
    planned_session: plannedSession,
    load,
    outcome,
    carry_policy: "none"
  };
}

function strengthOutcome(session: PlannedSession, load: ConditionLoad): RollingPlanResult["yesterday"]["outcome"] {
  if (load.ascent_m >= 50) return "replaced";
  const durationRatio = sessionDuration(session) > 0 ? load.minutes / sessionDuration(session) : 0;
  if (durationRatio >= 0.75) return "completed";
  if (durationRatio >= 0.35 || load.minutes >= 10) return "partial";
  return "replaced";
}

function recordYesterdayUpdate(session: PlannedSession, load: ConditionLoad, outcome: RollingPlanResult["yesterday"]["outcome"]): RollingPlanUpdate {
  const status: RollingPlanStatus =
    outcome === "completed" || outcome === "rested"
      ? "done"
      : outcome === "missed"
        ? "skipped"
        : outcome === "extra" || outcome === "partial"
          ? "modified"
          : "replaced";
  return {
    date: session.Date,
    session,
    kind: outcome === "missed" ? "drop_missed_session" : "record_yesterday",
    status,
    completed: {
      duration_min: Math.round(load.minutes),
      ascent_m: Math.round(load.ascent_m)
    },
    adaptation: yesterdayAdaptationText(session, load, outcome)
  };
}

function todayRecommendationUpdates(plan: PlannedSession[], recommendation: TrainingRecommendation, today: string): RollingPlanUpdate[] {
  const todaySession = recommendation.today ?? firstSessionOn(plan, today);
  if (!todaySession) return [];
  if (recommendation.decision === "maintain") return [];

  if (recommendation.decision === "swap" && recommendation.swap_with) {
    return [
      {
        date: today,
        session: todaySession,
        kind: "swap_today",
        status: "replaced",
        planned_patch: patchFromSession(recommendation.swap_with, `Échange depuis ${recommendation.swap_with.Date}`),
        adaptation: recommendationAdaptationText(recommendation, `Aujourd'hui remplacé par ${sessionName(recommendation.swap_with)}.`)
      },
      {
        date: recommendation.swap_with.Date,
        session: recommendation.swap_with,
        kind: "swap_future",
        status: "replaced",
        planned_patch: patchFromSession(todaySession, `Séance déplacée depuis ${today}`),
        adaptation: recommendationAdaptationText(recommendation, `${sessionName(todaySession)} déplacée depuis ${today}.`)
      }
    ];
  }

  return [
    {
      date: today,
      session: todaySession,
      kind: "apply_today_recommendation",
      status: recommendation.decision === "rest" || recommendation.decision === "replace_easy" ? "replaced" : "modified",
      planned_patch: patchFromRecommendation(recommendation, todaySession),
      adaptation: recommendationAdaptationText(recommendation, "Recommandation du matin appliquée aux champs planifiés.")
    }
  ];
}

function carryMissedSession(
  plan: PlannedSession[],
  missed: PlannedSession,
  options: {
    today: string;
    windowEnd: string;
    condition: ConditionAnalysis;
    flexibilityMode: "normal" | "baby";
    reservedDates: Set<string>;
  }
): RollingPlanUpdate | undefined {
  if (!isStrength(missed)) return undefined;
  if (options.condition.level === "red") return undefined;
  if (options.flexibilityMode === "baby" && sessionPriority(missed) !== "A") return undefined;

  const latestDate = minIsoDate(addIsoDays(options.today, 3), options.windowEnd);
  const candidate = plan
    .filter((session) => session.Date >= options.today && session.Date <= latestDate)
    .filter((session) => !options.reservedDates.has(session.Date))
    .find((session) => isCarryTarget(session));

  if (!candidate) return undefined;
  const reducedStrength = Math.min(sessionDuration(missed), 30);
  return {
    date: candidate.Date,
    session: candidate,
    kind: "carry_missed_strength",
    status: "replaced",
    planned_patch: {
      ...patchFromSession(missed, `Renfo déplacé depuis ${missed.Date}`),
      duration_min: reducedStrength,
      ascent_m: 0,
      intensity: "Renfo",
      notes: "Version courte: arrêter à RPE 6-7, aucune dette si la fenêtre disparaît."
    },
    adaptation: `Renfo manqué le ${missed.Date} replacé ici en version courte. Remplace ${sessionName(candidate)}. Pas de rattrapage si sommeil/logistique mauvais.`
  };
}

function patchFromRecommendation(recommendation: TrainingRecommendation, todaySession: PlannedSession): RollingPlanPatch {
  const session = recommendation.recommended_session;
  if (recommendation.decision === "rest") {
    return {
      session: "Repos / mobilité",
      type: "Repos",
      duration_min: Math.min(session.duration_min, 20),
      ascent_m: 0,
      intensity: "Repos",
      rpe: 1,
      priority: sessionPriority(todaySession),
      notes: session.notes
    };
  }
  return {
    session: session.name,
    type: recommendation.decision === "replace_easy" ? "Course facile" : todaySession.Type,
    duration_min: session.duration_min,
    ascent_m: session.ascent_m,
    intensity: frenchIntensity(session.intensity),
    fc_cap_bpm: session.fc_cap_bpm,
    rpe: recommendation.decision === "replace_easy" ? 2 : Math.min(sessionRpe(todaySession), 3),
    priority: sessionPriority(todaySession),
    notes: session.notes
  };
}

function patchFromSession(session: PlannedSession, notes: string): RollingPlanPatch {
  return {
    session: sessionName(session),
    type: session.Type,
    duration_min: sessionDuration(session),
    ascent_m: sessionAscent(session),
    intensity: frenchIntensity(sessionIntensity(session)),
    fc_cap_bpm: sessionHrCap(session),
    rpe: sessionRpe(session),
    priority: sessionPriority(session),
    description: session.Description,
    notes
  };
}

function yesterdayAdaptationText(session: PlannedSession, load: ConditionLoad, outcome: RollingPlanResult["yesterday"]["outcome"]): string {
  const loadText = `${Math.round(load.minutes)} min, ${Math.round(load.ascent_m)} m D+, ${load.activity_count} activité(s)`;
  if (outcome === "completed") return `Réalisée automatiquement depuis les données d'activité (${loadText}).`;
  if (outcome === "partial") return `Partiellement réalisée ou adaptée (${loadText}). Pas de compensation automatique.`;
  if (outcome === "missed") return `Sautée: aucune activité détectée. Pas de dette automatique; reprise par continuité.`;
  if (outcome === "rested") return `Repos/mobilité confirmé (${loadText}).`;
  if (outcome === "extra") return `Activité non prévue détectée (${loadText}). Garder la suite prudente si fatigue.`;
  return `Remplacée par une activité différente (${loadText}). Pas de rattrapage automatique de ${sessionName(session)}.`;
}

function recommendationAdaptationText(recommendation: TrainingRecommendation, prefix: string): string {
  const session = recommendation.recommended_session;
  const fc = session.fc_cap_bpm ? `, FC cap ${session.fc_cap_bpm} bpm` : "";
  const reasons = recommendation.reasons.length ? ` Raisons: ${recommendation.reasons.join(" | ")}` : "";
  return `${prefix} Reco matin ${recommendation.date} (${recommendation.level}/${recommendation.decision}): ${session.name}, ${session.duration_min} min, D+ ${session.ascent_m} m, ${frenchIntensity(session.intensity)}${fc}.${reasons}`;
}

function dedupeUpdates(updates: RollingPlanUpdate[]): RollingPlanUpdate[] {
  const seen = new Set<string>();
  const result: RollingPlanUpdate[] = [];
  for (const update of updates) {
    const key = `${update.date}:${sessionName(update.session)}:${update.kind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(update);
  }
  return result;
}

function firstSessionOn(plan: PlannedSession[], date: string): PlannedSession | undefined {
  return plan.find((session) => session.Date === date);
}

function hasActivity(load: ConditionLoad): boolean {
  return load.activity_count > 0 || load.minutes >= 10 || load.ascent_m >= 50;
}

function completionRatio(session: PlannedSession, load: ConditionLoad): number {
  const duration = sessionDuration(session);
  const ascent = sessionAscent(session);
  const durationRatio = duration > 0 ? load.minutes / duration : 0;
  const ascentRatio = ascent > 0 ? load.ascent_m / ascent : 0;
  return Math.max(durationRatio, ascentRatio);
}

function isCarryTarget(session: PlannedSession): boolean {
  if (isHard(session) || sessionPriority(session) === "A") return false;
  return isRest(session) || isEasy(session) || sessionPriority(session) === "C";
}

function isHard(session: PlannedSession): boolean {
  return sessionRpe(session) >= 5 || sessionDuration(session) >= 100 || ["Côte", "Hill session", "Long run", "Sortie longue", "Trail", "Rando-course"].includes(session.Type);
}

function isStrength(session: PlannedSession): boolean {
  const type = session.Type.toLowerCase();
  return type.includes("renfo") || type.includes("strength");
}

function isRest(session: PlannedSession): boolean {
  const type = session.Type.toLowerCase();
  const intensity = sessionIntensity(session).toLowerCase();
  return type.includes("repos") || type.includes("rest") || intensity.includes("repos") || intensity.includes("rest");
}

function isEasy(session: PlannedSession): boolean {
  const type = session.Type.toLowerCase();
  const intensity = sessionIntensity(session).toLowerCase();
  return (
    type.includes("facile") ||
    type.includes("easy") ||
    type.includes("mobilité") ||
    type.includes("mobility") ||
    type.includes("tapis") ||
    intensity.includes("facile") ||
    intensity.includes("easy")
  );
}

function sessionName(session: PlannedSession): string {
  return session.Session ?? session.Séance ?? "Séance planifiée";
}

function sessionDuration(session: PlannedSession): number {
  return session["Planned duration min"] ?? session["Durée prévue min"] ?? 0;
}

function sessionAscent(session: PlannedSession): number {
  return session["Planned ascent m"] ?? session["D+ prévu m"] ?? 0;
}

function sessionIntensity(session: PlannedSession): string {
  return session["Target intensity"] ?? session["Intensité cible"] ?? "";
}

function sessionHrCap(session: PlannedSession): number | undefined {
  return session["HR cap bpm"] ?? session["FC cap bpm"];
}

function sessionRpe(session: PlannedSession): number {
  return session["Target RPE"] ?? session["RPE cible"] ?? 0;
}

function sessionPriority(session: PlannedSession): string {
  return session.Priority ?? session.Priorité ?? "";
}

function frenchIntensity(intensity: string): string {
  const map: Record<string, string> = {
    Rest: "Repos",
    "Very easy": "Très facile",
    "Easy endurance": "Endurance facile",
    "Controlled steady": "Endurance haute contrôlée",
    "Hill tempo": "Tempo côte",
    Threshold: "Seuil",
    Strength: "Renfo"
  };
  return map[intensity] ?? intensity;
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isInteger(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function addIsoDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day));
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

function minIsoDate(left: string, right: string): string {
  return left <= right ? left : right;
}
