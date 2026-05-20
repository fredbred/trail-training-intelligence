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
  "Séance": string;
  "Date": string;
  "Semaine": string;
  "Phase": string;
  "Type": string;
  "Description": string;
  "Durée prévue min": number;
  "D+ prévu m": number;
  "Intensité cible": string;
  "FC cap bpm"?: number;
  "RPE cible": number;
  "Priorité": string;
  "Statut": string;
  "Durée réalisée min"?: number;
  "D+ réalisé m"?: number;
  "RPE réalisé"?: number;
  "FC moyenne"?: number;
  "Notes": string;
  "Adaptation"?: string;
};

export type WeeklyReviewRow = {
  "Semaine": string;
  "Semaine du": string;
  "Phase": string;
  "Objectif semaine": string;
  "Heures prévues": number;
  "Heures réalisées"?: number;
  "D+ prévu m": number;
  "D+ réalisé m"?: number;
  "Séances prévues": number;
  "Séances réalisées"?: number;
  "Renfo réalisé": boolean;
  "Sortie longue": boolean;
  "Sommeil moyen h"?: number;
  "VFC moyenne ms"?: number;
  "FC repos moyenne"?: number;
  "Récupération COROS moyenne %": number | undefined;
  "Fatigue générale /10"?: number;
  "Jambes /10"?: number;
  "Douleurs / alertes"?: string;
  "Décision semaine suivante": string;
};

export type PhaseRow = {
  "Phase": string;
  "Dates": string;
  "Objectif": string;
  "Volume cible": string;
  "D+ cible": string;
  "Renfo": string;
  "Intensité"?: string;
  "Sorties longues": string;
  "Commentaires"?: string;
};

export type SessionLibraryRow = {
  "Séance": string;
  "Type": string;
  "Objectif": string;
  "Description": string;
  "Durée min": number | string;
  "Priorité": string;
  "Quand l’utiliser": string;
  "Adaptation orange/rouge": string;
};

export type RuleRow = {
  "Règle": string;
  "Catégorie": string;
  "Description": string;
  "Action si déclenchée": string;
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
