import type { DatabaseKey, DatabaseSchema, NotionPropertySchema, SelectOption } from "./types.js";

const colors = ["default", "blue", "green", "yellow", "orange", "red", "purple", "pink", "brown", "gray"] as const;

export const phaseOptions = [
  "Consolidation avant bébé",
  "Mode bébé",
  "Base aérobie + force",
  "Volume sans casse",
  "Spécifique trail long",
  "Bloc Ventoux",
  "Affûtage"
];

export const typeOptions = [
  "Course facile",
  "Trail",
  "Côte",
  "Sortie longue",
  "Rando-course",
  "Home trainer",
  "Tapis incliné",
  "Renfo A",
  "Renfo B",
  "Mobilité",
  "Repos"
];

export const intensityOptions = [
  "Très facile",
  "Endurance facile",
  "Endurance haute contrôlée",
  "Tempo côte",
  "Seuil",
  "Renfo",
  "Repos"
];

export const priorityOptions = ["A", "B", "C"];
export const statusOptions = ["Prévu", "Fait", "Modifié", "Remplacé", "Sauté"];
export const decisionOptions = ["Augmenter", "Maintenir", "Alléger", "Décharger", "Mode bébé / survie"];
export const ruleCategoryOptions = ["Charge", "Récupération", "Intensité", "Renfo", "Famille", "Chaleur", "Nutrition", "Blessure"];

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
    name: "Plan entraînement",
    titleProperty: "Séance",
    properties: {
      "Séance": title(),
      "Date": date(),
      "Semaine": richText(),
      "Phase": selectProperty(phaseOptions),
      "Type": selectProperty(typeOptions),
      "Description": richText(),
      "Durée prévue min": number(),
      "D+ prévu m": number(),
      "Intensité cible": selectProperty(intensityOptions),
      "FC cap bpm": number(),
      "RPE cible": number(),
      "Priorité": selectProperty(priorityOptions),
      "Statut": selectProperty(statusOptions),
      "Durée réalisée min": number(),
      "D+ réalisé m": number(),
      "RPE réalisé": number(),
      "FC moyenne": number(),
      "Notes": richText(),
      "Adaptation": richText()
    }
  },
  weeklyReview: {
    key: "weeklyReview",
    name: "Bilan semaine",
    titleProperty: "Semaine",
    properties: {
      "Semaine": title(),
      "Semaine du": date(),
      "Phase": selectProperty(phaseOptions),
      "Objectif semaine": richText(),
      "Heures prévues": number(),
      "Heures réalisées": number(),
      "D+ prévu m": number(),
      "D+ réalisé m": number(),
      "Séances prévues": number(),
      "Séances réalisées": number(),
      "Renfo réalisé": checkbox(),
      "Sortie longue": checkbox(),
      "Sommeil moyen h": number(),
      "VFC moyenne ms": number(),
      "FC repos moyenne": number(),
      "Récupération COROS moyenne %": number(),
      "Fatigue générale /10": number(),
      "Jambes /10": number(),
      "Douleurs / alertes": richText(),
      "Décision semaine suivante": selectProperty(decisionOptions)
    }
  },
  phases: {
    key: "phases",
    name: "Phases Ventoux 2027",
    titleProperty: "Phase",
    properties: {
      "Phase": title(),
      "Dates": richText(),
      "Objectif": richText(),
      "Volume cible": richText(),
      "D+ cible": richText(),
      "Renfo": richText(),
      "Intensité": richText(),
      "Sorties longues": richText(),
      "Commentaires": richText()
    }
  },
  sessionLibrary: {
    key: "sessionLibrary",
    name: "Bibliothèque séances",
    titleProperty: "Séance",
    properties: {
      "Séance": title(),
      "Type": selectProperty(typeOptions),
      "Objectif": richText(),
      "Description": richText(),
      "Durée min": number(),
      "Priorité": selectProperty(priorityOptions),
      "Quand l’utiliser": richText(),
      "Adaptation orange/rouge": richText()
    }
  },
  rules: {
    key: "rules",
    name: "Règles",
    titleProperty: "Règle",
    properties: {
      "Règle": title(),
      "Catégorie": selectProperty(ruleCategoryOptions),
      "Description": richText(),
      "Action si déclenchée": richText()
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
