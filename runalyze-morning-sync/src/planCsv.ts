import { readFile } from "node:fs/promises";

import type { PlannedSession } from "./types.js";

export async function loadPlanFromCsv(path: string): Promise<PlannedSession[]> {
  const csv = await readFile(path, "utf8");
  return parsePlanCsv(csv);
}

export function parsePlanCsv(csv: string): PlannedSession[] {
  const records = parseCsvRecords(csv);
  if (!records.length) return [];

  const [headers, ...lines] = records;
  return lines.filter((values) => values.some(Boolean)).map((values) => {
    const row = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
    const session = firstText(row, ["Session", "Séance", "Seance"]);
    const week = firstText(row, ["Week", "Semaine"]);
    const duration = firstNumber(row, ["Planned duration min", "Durée prévue min", "Duree prevue min"]);
    const ascent = firstNumber(row, ["Planned ascent m", "D+ prévu m", "D+ prevu m"]);
    const intensity = firstText(row, ["Target intensity", "Intensité cible", "Intensite cible"]);
    const hrCap = firstOptionalNumber(row, ["HR cap bpm", "FC cap bpm"]);
    const rpe = firstNumber(row, ["Target RPE", "RPE cible"]);
    const priority = firstText(row, ["Priority", "Priorité", "Priorite"]);
    const status = firstText(row, ["Status", "Statut"]);
    const completedDuration = firstOptionalNumber(row, ["Completed duration min", "Durée réalisée min", "Duree realisee min"]);
    const completedAscent = firstOptionalNumber(row, ["Completed ascent m", "D+ réalisé m", "D+ realise m"]);
    const completedRpe = firstOptionalNumber(row, ["Completed RPE", "RPE réalisé", "RPE realise"]);
    const avgHr = firstOptionalNumber(row, ["Avg HR", "FC moyenne"]);
    return {
      "Session": session,
      "Séance": session,
      "Date": firstText(row, ["Date"]),
      "Week": week,
      "Semaine": week,
      "Phase": firstText(row, ["Phase"]),
      "Type": firstText(row, ["Type"]),
      "Description": firstText(row, ["Description"]),
      "Planned duration min": duration,
      "Durée prévue min": duration,
      "Planned ascent m": ascent,
      "D+ prévu m": ascent,
      "Target intensity": intensity,
      "Intensité cible": intensity,
      "HR cap bpm": hrCap,
      "FC cap bpm": hrCap,
      "Target RPE": rpe,
      "RPE cible": rpe,
      "Priority": priority,
      "Priorité": priority,
      "Status": status,
      "Statut": status,
      "Completed duration min": completedDuration,
      "Durée réalisée min": completedDuration,
      "Completed ascent m": completedAscent,
      "D+ réalisé m": completedAscent,
      "Completed RPE": completedRpe,
      "RPE réalisé": completedRpe,
      "Avg HR": avgHr,
      "FC moyenne": avgHr,
      "Notes": firstText(row, ["Notes"]),
      "Adaptation": firstText(row, ["Adaptation"])
    };
  });
}

export function findPlannedSession(plan: PlannedSession[], date: string, nameContains?: string): PlannedSession | undefined {
  const daySessions = plan.filter((session) => session.Date === date);
  if (!nameContains) return daySessions[0];
  const needle = nameContains.trim().toLowerCase();
  return daySessions.find((session) => sessionName(session).toLowerCase().includes(needle));
}

function sessionName(session: PlannedSession): string {
  return session.Session ?? session.Séance ?? "";
}

function firstText(row: Record<string, string>, keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== "") return value;
  }
  return "";
}

function firstNumber(row: Record<string, string>, keys: string[]): number {
  return firstOptionalNumber(row, keys) ?? 0;
}

function firstOptionalNumber(row: Record<string, string>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = row[key];
    if (value === undefined || value === "") continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function parseCsvRecords(csv: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    const next = csv[index + 1];
    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      record.push(current);
      current = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      record.push(current);
      current = "";
      if (record.some(Boolean)) records.push(record);
      record = [];
      if (char === "\r" && next === "\n") index += 1;
    } else {
      current += char;
    }
  }

  record.push(current);
  if (record.some(Boolean)) records.push(record);
  return records;
}
