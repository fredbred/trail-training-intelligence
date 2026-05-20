export type PropertyType =
  | "title"
  | "date"
  | "rich_text"
  | "select"
  | "number"
  | "checkbox";

export type SelectOption = {
  name: string;
  color?: string;
};

export type NotionPropertySchema =
  | { title: Record<string, never> }
  | { date: Record<string, never> }
  | { rich_text: Record<string, never> }
  | { number: { format?: string } }
  | { checkbox: Record<string, never> }
  | { select: { options: SelectOption[] } };

export type DatabaseSchema = {
  key: DatabaseKey;
  name: string;
  titleProperty: string;
  properties: Record<string, NotionPropertySchema>;
};

export type DatabaseKey =
  | "plan"
  | "weeklyReview"
  | "phases"
  | "sessionLibrary"
  | "rules";

export type PlanRow = {
  "Session": string;
  "Date": string;
  "Week": string;
  "Phase": string;
  "Type": string;
  "Description": string;
  "Planned duration min": number;
  "Planned ascent m": number;
  "Target intensity": string;
  "HR cap bpm"?: number;
  "Target RPE": number;
  "Priority": string;
  "Status": string;
  "Completed duration min"?: number;
  "Completed ascent m"?: number;
  "Completed RPE"?: number;
  "Avg HR"?: number;
  "Notes": string;
  "Adaptation"?: string;
};

export type WeeklyReviewRow = {
  "Week": string;
  "Week of": string;
  "Phase": string;
  "Week goal": string;
  "Planned hours": number;
  "Completed hours"?: number;
  "Planned ascent m": number;
  "Completed ascent m"?: number;
  "Planned sessions": number;
  "Completed sessions"?: number;
  "Strength completed": boolean;
  "Long run completed": boolean;
  "Avg sleep h"?: number;
  "Avg HRV ms"?: number;
  "Avg resting HR"?: number;
  "Avg recovery %": number | undefined;
  "General fatigue /10"?: number;
  "Legs /10"?: number;
  "Pain / alerts"?: string;
  "Next week decision": string;
};

export type PhaseRow = {
  "Phase": string;
  "Dates": string;
  "Goal": string;
  "Target volume": string;
  "Target ascent": string;
  "Strength": string;
  "Intensity"?: string;
  "Long runs": string;
  "Comments"?: string;
};

export type SessionLibraryRow = {
  "Session": string;
  "Type": string;
  "Goal": string;
  "Description": string;
  "Duration min": number | string;
  "Priority": string;
  "When to use": string;
  "Orange/red adaptation": string;
};

export type RuleRow = {
  "Rule": string;
  "Category": string;
  "Description": string;
  "Triggered action": string;
};

export type SeedRowsByDatabase = {
  plan: PlanRow[];
  weeklyReview: WeeklyReviewRow[];
  phases: PhaseRow[];
  sessionLibrary: SessionLibraryRow[];
  rules: RuleRow[];
};

export type NotionConfig = {
  token: string;
  parentPageId: string;
  notionVersion: string;
};

export type CreatedDatabaseInfo = {
  databaseId: string;
  databaseUrl?: string;
  dataSourceId: string;
};

export type CreatedViewInfo = {
  viewId?: string;
  name: string;
  type: "calendar";
  databaseKey: DatabaseKey;
  dateProperty: string;
  viewRange: "week";
};

export type Manifest = {
  root_page_id?: string;
  root_page_url?: string;
  databases: Partial<Record<DatabaseKey, CreatedDatabaseInfo>>;
  data_sources: Partial<Record<DatabaseKey, string>>;
  views?: Partial<Record<string, CreatedViewInfo>>;
  created_at: string;
  mode?: "preview" | "notion" | "partial";
};
