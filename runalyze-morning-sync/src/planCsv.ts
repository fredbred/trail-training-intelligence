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
    return {
      "Séance": row["Séance"],
      "Date": row["Date"],
      "Semaine": row["Semaine"],
      "Type": row["Type"],
      "Durée prévue min": Number(row["Durée prévue min"] || 0),
      "D+ prévu m": Number(row["D+ prévu m"] || 0),
      "Intensité cible": row["Intensité cible"],
      "FC cap bpm": row["FC cap bpm"] ? Number(row["FC cap bpm"]) : undefined,
      "RPE cible": Number(row["RPE cible"] || 0),
      "Priorité": row["Priorité"],
      "Notes": row["Notes"] ?? ""
    };
  });
}

export function findPlannedSession(plan: PlannedSession[], date: string, nameContains?: string): PlannedSession | undefined {
  const daySessions = plan.filter((session) => session.Date === date);
  if (!nameContains) return daySessions[0];
  const needle = nameContains.trim().toLowerCase();
  return daySessions.find((session) => session.Séance.toLowerCase().includes(needle));
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
