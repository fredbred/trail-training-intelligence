import type { PhaseRow, PlanRow, RuleRow, SeedRowsByDatabase, SessionLibraryRow, WeeklyReviewRow } from "./types.js";

const basePlan = {
  "Phase": "Pre-base reset",
  "Status": "Planned",
  "Completed duration min": undefined,
  "Completed ascent m": undefined,
  "Completed RPE": undefined,
  "Avg HR": undefined,
  "Adaptation": ""
};

type PlanRowInput = Omit<PlanRow, keyof typeof basePlan | "Description"> & Partial<PlanRow>;

function planRow(row: PlanRowInput): PlanRow {
  const merged = { ...basePlan, ...row } as PlanRow;
  return {
    ...merged,
    "Description": row.Description ?? buildPlanDescription(merged)
  };
}

function buildPlanDescription(row: PlanRow): string {
  const base = baseDescriptionForSession(row);
  const details = [
    base,
    row.Notes ? `Note: ${row.Notes}` : "",
    row.Adaptation ? `Adaptation: ${row.Adaptation}` : ""
  ].filter(Boolean);

  return details.join("\n");
}

function baseDescriptionForSession(row: PlanRow): string {
  const session = row.Session.toLowerCase();

  if (row.Type === "Strength A") {
    return [
      "Warm up for 6-8 minutes.",
      "Single-leg strength: split squat, single-leg Romanian deadlift, calves and soleus.",
      "Finish with anti-rotation core or loaded carry.",
      session.includes("short") ? "Short version: moderate load, no soreness target." : "Keep clean execution and stop short of failure."
    ].join("\n");
  }

  if (row.Type === "Strength B") {
    return [
      "Slow step-downs, lunges, wall sit or Spanish squat.",
      "Tibialis, calves, hips and feet.",
      "Goal: downhill durability without creating avoidable soreness."
    ].join("\n");
  }

  if (row.Type === "Hill session") {
    if (session.includes("2 x 6")) {
      return "15 min easy.\n2 x 6 min controlled uphill under HR cap.\nVery easy downhill recovery.\n10 min cool down.";
    }
    if (session.includes("4 x 6")) {
      return "15 min easy.\n4 x 6 min controlled hill tempo.\nVery easy downhill recovery.\n10 min cool down.";
    }
    return "15 min easy.\nControlled uphill block under HR cap.\nVery easy downhill recovery.\n10 min cool down.";
  }

  if (row.Type === "Long run") {
    return [
      "Easy effort with a clear HR cap.",
      "Use poles if they are part of the target race.",
      "Practice 40-70 g carbs per hour depending on duration.",
      "Keep descents clean instead of fast."
    ].join("\n");
  }

  if (row.Type === "Indoor bike" || row.Type === "Incline treadmill") {
    return "Very easy aerobic work, smooth cadence, HR below cap.\nCan be replaced by an easy run, walk or rest when fatigue is high.";
  }

  if (row.Type === "Mobility") {
    return "Gentle hips, calves, feet and back mobility.\nNo intensity; just restore movement.";
  }

  if (row.Type === "Rest") {
    return "Full rest or an easy walk.\nRecovery is the goal; do not compensate for a missed session.";
  }

  if (session.includes("strides")) {
    return "Easy conversational run.\nAdd relaxed strides at the end only if legs feel good.\nFull recovery between strides.";
  }

  if (session.includes("readiness")) {
    return "Very easy readiness run.\nWatch HR, legs and heat; cut the session if signals are poor.";
  }

  return "Easy endurance at conversational effort.\nStay below the planned HR cap and do not add intensity.";
}

export const planRows: PlanRow[] = [
  planRow({
    "Date": "2026-01-05",
    "Session": "Easy aerobic reset",
    "Week": "2026-W02",
    "Type": "Easy run",
    "Planned duration min": 45,
    "Planned ascent m": 180,
    "Target intensity": "Very easy",
    "HR cap bpm": 140,
    "Target RPE": 2,
    "Priority": "B",
    "Notes": "First public sample week: simple aerobic work, no intensity."
  }),
  planRow({
    "Date": "2026-01-06",
    "Session": "Strength A - trail durability",
    "Week": "2026-W02",
    "Type": "Strength A",
    "Planned duration min": 40,
    "Planned ascent m": 0,
    "Target intensity": "Strength",
    "Target RPE": 6,
    "Priority": "A",
    "Notes": "Keep quality high and leave the legs usable for hill work."
  }),
  planRow({
    "Date": "2026-01-07",
    "Session": "Controlled hill 2 x 6 min",
    "Week": "2026-W02",
    "Type": "Hill session",
    "Planned duration min": 60,
    "Planned ascent m": 450,
    "Target intensity": "Hill tempo",
    "HR cap bpm": 158,
    "Target RPE": 5,
    "Priority": "A",
    "Notes": "Switch to 45 min easy if sleep or readiness is poor."
  }),
  planRow({
    "Date": "2026-01-08",
    "Session": "Rest or mobility",
    "Week": "2026-W02",
    "Type": "Rest",
    "Planned duration min": 0,
    "Planned ascent m": 0,
    "Target intensity": "Rest",
    "Target RPE": 1,
    "Priority": "B",
    "Notes": ""
  }),
  planRow({
    "Date": "2026-01-10",
    "Session": "Long trail hike-run",
    "Week": "2026-W02",
    "Type": "Long run",
    "Planned duration min": 135,
    "Planned ascent m": 850,
    "Target intensity": "Easy endurance",
    "HR cap bpm": 150,
    "Target RPE": 4,
    "Priority": "A",
    "Notes": "Practice fueling and downhill patience."
  }),
  planRow({
    "Date": "2026-01-11",
    "Session": "Indoor bike flush",
    "Week": "2026-W02",
    "Type": "Indoor bike",
    "Planned duration min": 45,
    "Planned ascent m": 0,
    "Target intensity": "Very easy",
    "HR cap bpm": 135,
    "Target RPE": 2,
    "Priority": "C",
    "Notes": "Optional. Rest if the long run left heavy fatigue."
  }),
  planRow({
    "Date": "2026-01-12",
    "Session": "Easy run + relaxed strides",
    "Week": "2026-W03",
    "Type": "Easy run",
    "Planned duration min": 55,
    "Planned ascent m": 220,
    "Target intensity": "Easy endurance",
    "HR cap bpm": 145,
    "Target RPE": 3,
    "Priority": "B",
    "Notes": "Skip strides if legs are flat."
  }),
  planRow({
    "Date": "2026-01-13",
    "Session": "Strength B - downhill armor",
    "Week": "2026-W03",
    "Type": "Strength B",
    "Planned duration min": 35,
    "Planned ascent m": 0,
    "Target intensity": "Strength",
    "Target RPE": 6,
    "Priority": "A",
    "Notes": ""
  }),
  planRow({
    "Date": "2026-01-15",
    "Session": "Controlled hill tempo 4 x 6 min",
    "Week": "2026-W03",
    "Type": "Hill session",
    "Planned duration min": 70,
    "Planned ascent m": 620,
    "Target intensity": "Hill tempo",
    "HR cap bpm": 162,
    "Target RPE": 6,
    "Priority": "A",
    "Notes": "Only progress if recovery and easy days are clean."
  }),
  planRow({
    "Date": "2026-01-17",
    "Session": "Long run with ascent",
    "Week": "2026-W03",
    "Type": "Long run",
    "Planned duration min": 165,
    "Planned ascent m": 1100,
    "Target intensity": "Easy endurance",
    "HR cap bpm": 150,
    "Target RPE": 5,
    "Priority": "A",
    "Notes": "Smooth climbs, controlled descents, full fueling practice."
  }),
  planRow({
    "Date": "2026-01-18",
    "Session": "Easy walk or rest",
    "Week": "2026-W03",
    "Type": "Rest",
    "Planned duration min": 0,
    "Planned ascent m": 0,
    "Target intensity": "Rest",
    "Target RPE": 1,
    "Priority": "C",
    "Notes": "Protect the next week instead of adding junk volume."
  })
];

export const weeklyReviewRows: WeeklyReviewRow[] = [
  {
    "Week": "2026-W02 - reset",
    "Week of": "2026-01-05",
    "Phase": "Pre-base reset",
    "Week goal": "Restart rhythm with one controlled hill session and one long hike-run.",
    "Planned hours": 5.4,
    "Planned ascent m": 1480,
    "Planned sessions": 6,
    "Strength completed": false,
    "Long run completed": false,
    "Avg recovery %": undefined,
    "Pain / alerts": "Synthetic public example: no personal health notes.",
    "Next week decision": "Maintain"
  },
  {
    "Week": "2026-W03 - build",
    "Week of": "2026-01-12",
    "Phase": "Pre-base reset",
    "Week goal": "Add a little duration and ascent without increasing intensity density.",
    "Planned hours": 5.4,
    "Planned ascent m": 1940,
    "Planned sessions": 5,
    "Strength completed": false,
    "Long run completed": false,
    "Avg recovery %": undefined,
    "Next week decision": "Reduce"
  }
];

export const phaseRows: PhaseRow[] = [
  {
    "Dates": "Now - 4 weeks",
    "Phase": "Pre-base reset",
    "Goal": "Stabilize rhythm and remove obvious overload risks.",
    "Target volume": "4.5 to 7 h/week.",
    "Target ascent": "800 to 2,000 m/week.",
    "Strength": "2x/week if recovery allows.",
    "Intensity": "One controlled hill session maximum.",
    "Long runs": "1h45 to 3h.",
    "Comments": ""
  },
  {
    "Dates": "Next 4-8 weeks",
    "Phase": "Life-constrained base",
    "Goal": "Keep the system alive through real-life schedule pressure.",
    "Target volume": "3 to 6 h/week.",
    "Target ascent": "Variable.",
    "Strength": "One real session plus short maintenance routines.",
    "Intensity": "Very limited.",
    "Long runs": "Optional, 1h30 to 2h30 when possible.",
    "Comments": ""
  },
  {
    "Dates": "Base block",
    "Phase": "Aerobic base + strength",
    "Goal": "Make 7 to 9 h/week feel normal.",
    "Target volume": "7 to 9 h/week.",
    "Target ascent": "1,500 to 3,000 m/week.",
    "Strength": "2x/week.",
    "Intensity": "One short controlled session.",
    "Long runs": "2h30 to 4h.",
    "Comments": ""
  },
  {
    "Dates": "Durability block",
    "Phase": "Durable volume",
    "Goal": "Build durable winter volume without sharp spikes.",
    "Target volume": "8 to 10 h/week.",
    "Target ascent": "1,500 to 3,500 m/week.",
    "Strength": "2x/week.",
    "Intensity": "Controlled.",
    "Long runs": "3h to 4h.",
    "Comments": ""
  },
  {
    "Dates": "Specific block",
    "Phase": "Long-trail specific",
    "Goal": "Back-to-back work, fueling, descents and poles.",
    "Target volume": "9 to 13 h/week.",
    "Target ascent": "2,500 to 4,500 m/week.",
    "Strength": "1 to 2x/week.",
    "Intensity": "",
    "Long runs": "3h30 to 5h.",
    "Comments": ""
  },
  {
    "Dates": "Goal block",
    "Phase": "Goal-specific block",
    "Goal": "Simulate fatigue, terrain, fueling and late-race decision-making.",
    "Target volume": "10 to 16 h/week depending on recovery.",
    "Target ascent": "3,500 to 6,000 m/week on larger weeks.",
    "Strength": "Maintenance.",
    "Intensity": "",
    "Long runs": "A few planned exceptions.",
    "Comments": ""
  },
  {
    "Dates": "Final weeks",
    "Phase": "Taper",
    "Goal": "Freshness, frequency and reduced volume.",
    "Target volume": "Decreasing.",
    "Target ascent": "Reduced.",
    "Strength": "Very light.",
    "Intensity": "Short reminders.",
    "Long runs": "No large long run.",
    "Comments": ""
  }
];

export const sessionLibraryRows: SessionLibraryRow[] = [
  {
    "Session": "Strength A - trail durability",
    "Type": "Strength A",
    "Duration min": 45,
    "Priority": "A",
    "Goal": "Useful strength for climbing, descending and late-race durability.",
    "Description": "Warm up 6-8 min.\nHeavy split squat 4 x 4-6 / leg.\nSingle-leg Romanian deadlift 3 x 5-8 / leg.\nStanding calf raise 4 x 6-10.\nSoleus raise 4 x 8-12.\nLoaded carry or Pallof press 3 x 30-45 s / side.",
    "When to use": "Normal week, away from high fatigue.",
    "Orange/red adaptation": "Reduce load, use RPE 5-6, remove heavy exercise if sleep is poor."
  },
  {
    "Session": "Strength B - downhill armor",
    "Type": "Strength B",
    "Duration min": 35,
    "Priority": "A",
    "Goal": "Eccentric quads, calves, soleus, hips and back.",
    "Description": "Slow step-down 3 x 6-8 / leg.\nWalking or reverse lunge 3 x 8 / leg.\nWall sit or Spanish squat 3 x 30-45 s.\nTibialis 3 x 15-20.\nLight calves and soleus 2-3 x 12-15.\nHips, feet and tibial rotation 5-8 min.",
    "When to use": "After an easy run or as a dedicated day.",
    "Orange/red adaptation": "Keep mobility, remove eccentric work if soreness or recent downhill load is high."
  },
  {
    "Session": "Controlled hill 3 x 8 min",
    "Type": "Hill session",
    "Duration min": 75,
    "Priority": "A",
    "Goal": "Controlled uphill endurance.",
    "Description": "15 min easy.\n3 x 8 min uphill at controlled effort.\nVery easy downhill recovery.\n10 min cool down.",
    "When to use": "When recovery is stable and easy days are truly easy.",
    "Orange/red adaptation": "Replace with 45-60 min easy."
  },
  {
    "Session": "Long trail hike-run",
    "Type": "Long run",
    "Duration min": 135,
    "Priority": "A",
    "Goal": "Time on feet, ascent, fueling and muscular economy.",
    "Description": "Easy effort with HR cap.\nPoles if relevant.\nFuel 40-70 g carbs/h depending on duration.\nClean descents, no speed chasing.\nDuration can scale from 135 to 195 min.",
    "When to use": "Weekend or schedule-protected block.",
    "Orange/red adaptation": "Reduce by 20-30% or replace with indoor bike."
  },
  {
    "Session": "Easy run + relaxed strides",
    "Type": "Easy run",
    "Duration min": 60,
    "Priority": "B",
    "Goal": "Aerobic volume plus light neuromuscular reminder.",
    "Description": "45-55 min easy.\n5 to 8 x 15-20 s relaxed strides.\nFull recovery.",
    "When to use": "Normal week, fresh legs.",
    "Orange/red adaptation": "Remove strides."
  }
];

export const ruleRows: RuleRow[] = [
  {
    "Rule": "Rule 1",
    "Category": "Load",
    "Description": "Do not increase volume, ascent and intensity in the same week.",
    "Triggered action": "Choose one progression lever."
  },
  {
    "Rule": "Rule 2",
    "Category": "Recovery",
    "Description": "When sleep or life stress is poor, keep frequency but lower intensity.",
    "Triggered action": "Turn the hard session into an easy session."
  },
  {
    "Rule": "Rule 3",
    "Category": "Load",
    "Description": "A missed key session is not repaid with interest.",
    "Triggered action": "Drop it or replace it; do not stack it."
  },
  {
    "Rule": "Rule 4",
    "Category": "Strength",
    "Description": "Strength is a training session, not a bonus.",
    "Triggered action": "Track it in the weekly review."
  },
  {
    "Rule": "Rule 5",
    "Category": "Recovery",
    "Description": "If recovery signals are poor, there is no hard session.",
    "Triggered action": "Use easy running, indoor bike, mobility or rest."
  },
  {
    "Rule": "Rule 6",
    "Category": "Heat",
    "Description": "When heat arrives suddenly, reduce intensity and HR targets for 10-14 days.",
    "Triggered action": "Lower the HR cap by 5-10 bpm and hydrate earlier."
  },
  {
    "Rule": "Rule 7",
    "Category": "Nutrition",
    "Description": "Long runs should train the gut as well as the legs.",
    "Triggered action": "Practice 40-60 g/h on shorter long runs and 60-75 g/h on longer ones."
  },
  {
    "Rule": "Rule 8",
    "Category": "Injury",
    "Description": "A recurring niggle is a load-management signal.",
    "Triggered action": "Reduce impact if pain rises above baseline, stiffness changes or stride changes."
  }
];

export const seedRows: SeedRowsByDatabase = {
  plan: planRows,
  weeklyReview: weeklyReviewRows,
  phases: phaseRows,
  sessionLibrary: sessionLibraryRows,
  rules: ruleRows
};
