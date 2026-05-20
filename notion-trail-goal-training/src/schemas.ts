import type { DatabaseKey, DatabaseSchema, NotionPropertySchema, SelectOption } from "./types.js";

const colors = ["default", "blue", "green", "yellow", "orange", "red", "purple", "pink", "brown", "gray"] as const;

export const phaseOptions = [
  "Pre-base reset",
  "Life-constrained base",
  "Aerobic base + strength",
  "Durable volume",
  "Long-trail specific",
  "Goal-specific block",
  "Taper"
];

export const typeOptions = [
  "Easy run",
  "Trail run",
  "Hill session",
  "Long run",
  "Hike-run",
  "Indoor bike",
  "Incline treadmill",
  "Strength A",
  "Strength B",
  "Mobility",
  "Rest"
];

export const intensityOptions = [
  "Very easy",
  "Easy endurance",
  "Controlled steady",
  "Hill tempo",
  "Threshold",
  "Strength",
  "Rest"
];

export const priorityOptions = ["A", "B", "C"];
export const statusOptions = ["Planned", "Done", "Modified", "Replaced", "Skipped"];
export const decisionOptions = ["Increase", "Maintain", "Reduce", "Deload", "Flexible mode"];
export const ruleCategoryOptions = ["Load", "Recovery", "Intensity", "Strength", "Life constraints", "Heat", "Nutrition", "Injury"];

export function selectProperty(options: string[]): NotionPropertySchema {
  return {
    select: {
      options: options.map((name, index): SelectOption => ({ name, color: colors[index % colors.length] }))
    }
  };
}

const title = (): NotionPropertySchema => ({ title: {} });
const date = (): NotionPropertySchema => ({ date: {} });
const richText = (): NotionPropertySchema => ({ rich_text: {} });
const number = (): NotionPropertySchema => ({ number: { format: "number" } });
const checkbox = (): NotionPropertySchema => ({ checkbox: {} });

export const databaseSchemas: Record<DatabaseKey, DatabaseSchema> = {
  plan: {
    key: "plan",
    name: "Training Plan",
    titleProperty: "Session",
    properties: {
      "Session": title(),
      "Date": date(),
      "Week": richText(),
      "Phase": selectProperty(phaseOptions),
      "Type": selectProperty(typeOptions),
      "Description": richText(),
      "Planned duration min": number(),
      "Planned ascent m": number(),
      "Target intensity": selectProperty(intensityOptions),
      "HR cap bpm": number(),
      "Target RPE": number(),
      "Priority": selectProperty(priorityOptions),
      "Status": selectProperty(statusOptions),
      "Completed duration min": number(),
      "Completed ascent m": number(),
      "Completed RPE": number(),
      "Avg HR": number(),
      "Notes": richText(),
      "Adaptation": richText()
    }
  },
  weeklyReview: {
    key: "weeklyReview",
    name: "Weekly Review",
    titleProperty: "Week",
    properties: {
      "Week": title(),
      "Week of": date(),
      "Phase": selectProperty(phaseOptions),
      "Week goal": richText(),
      "Planned hours": number(),
      "Completed hours": number(),
      "Planned ascent m": number(),
      "Completed ascent m": number(),
      "Planned sessions": number(),
      "Completed sessions": number(),
      "Strength completed": checkbox(),
      "Long run completed": checkbox(),
      "Avg sleep h": number(),
      "Avg HRV ms": number(),
      "Avg resting HR": number(),
      "Avg recovery %": number(),
      "General fatigue /10": number(),
      "Legs /10": number(),
      "Pain / alerts": richText(),
      "Next week decision": selectProperty(decisionOptions)
    }
  },
  phases: {
    key: "phases",
    name: "Training Phases",
    titleProperty: "Phase",
    properties: {
      "Phase": title(),
      "Dates": richText(),
      "Goal": richText(),
      "Target volume": richText(),
      "Target ascent": richText(),
      "Strength": richText(),
      "Intensity": richText(),
      "Long runs": richText(),
      "Comments": richText()
    }
  },
  sessionLibrary: {
    key: "sessionLibrary",
    name: "Session Library",
    titleProperty: "Session",
    properties: {
      "Session": title(),
      "Type": selectProperty(typeOptions),
      "Goal": richText(),
      "Description": richText(),
      "Duration min": number(),
      "Priority": selectProperty(priorityOptions),
      "When to use": richText(),
      "Orange/red adaptation": richText()
    }
  },
  rules: {
    key: "rules",
    name: "Rules",
    titleProperty: "Rule",
    properties: {
      "Rule": title(),
      "Category": selectProperty(ruleCategoryOptions),
      "Description": richText(),
      "Triggered action": richText()
    }
  }
};

export function getSelectOptionNames(schema: DatabaseSchema, propertyName: string): string[] {
  const property = schema.properties[propertyName];
  if (!property || !("select" in property)) {
    return [];
  }
  return property.select.options.map((option) => option.name);
}
