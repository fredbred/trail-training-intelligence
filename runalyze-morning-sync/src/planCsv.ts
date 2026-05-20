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
      "Session": row["Session"],
      "Date": row["Date"],
      "Week": row["Week"],
      "Type": row["Type"],
      "Planned duration min": Number(row["Planned duration min"] || 0),
      "Planned ascent m": Number(row["Planned ascent m"] || 0),
      "Target intensity": row["Target intensity"],
      "HR cap bpm": row["HR cap bpm"] ? Number(row["HR cap bpm"]) : undefined,
      "Target RPE": Number(row["Target RPE"] || 0),
      "Priority": row["Priority"],
      "Notes": row["Notes"] ?? ""
    };
  });
}

export function findPlannedSession(plan: PlannedSession[], date: string, nameContains?: string): PlannedSession | undefined {
  const daySessions = plan.filter((session) => session.Date === date);
  if (!nameContains) return daySessions[0];
  const needle = nameContains.trim().toLowerCase();
  return daySessions.find((session) => session.Session.toLowerCase().includes(needle));
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
