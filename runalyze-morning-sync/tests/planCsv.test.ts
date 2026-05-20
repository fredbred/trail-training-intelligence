import { describe, expect, it } from "vitest";

import { findPlannedSession, parsePlanCsv } from "../src/planCsv.js";

describe("plan CSV", () => {
  it("parses Notion plan rows with quoted notes", () => {
    const plan = parsePlanCsv(
      [
        "Séance,Date,Semaine,Type,Durée prévue min,D+ prévu m,Intensité cible,FC cap bpm,RPE cible,Priorité,Notes",
        'Footing,2026-05-05,2026-W19,Course facile,45,100,Très facile,140,2,C,"Note avec, virgule"',
        "Renfo,2026-05-06,2026-W19,Renfo A,35,0,Renfo,,6,A,"
      ].join("\n")
    );

    expect(plan).toHaveLength(2);
    expect(plan[0]).toMatchObject({
      "Séance": "Footing",
      "Date": "2026-05-05",
      "Durée prévue min": 45,
      "D+ prévu m": 100,
      "FC cap bpm": 140,
      "Notes": "Note avec, virgule"
    });
    expect(plan[1]["FC cap bpm"]).toBeUndefined();
  });

  it("keeps quoted multi-line descriptions within a single row", () => {
    const plan = parsePlanCsv(
      [
        "Séance,Date,Semaine,Phase,Type,Description,Durée prévue min,D+ prévu m,Intensité cible,FC cap bpm,RPE cible,Priorité,Statut,Durée réalisée min,D+ réalisé m,RPE réalisé,FC moyenne,Notes,Adaptation",
        'Sortie longue,2026-05-09,2026-W19,Consolidation,Sortie longue,"Allure facile.',
        'Nutrition 40-60 g/h.',
        'Adaptation: garder contrôle.",135,800,Endurance facile,150,4,A,Prévu,,,,,"Note avec, virgule",Progression lissée',
        'Footing facile,2026-05-10,2026-W19,Consolidation,Home trainer,"Très facile.',
        'Repos possible.",45,0,Très facile,140,2,C,Prévu,,,,,Optionnel,'
      ].join("\n")
    );

    expect(plan).toHaveLength(2);
    expect(plan[0]).toMatchObject({
      "Séance": "Sortie longue",
      "Date": "2026-05-09",
      "Durée prévue min": 135,
      "D+ prévu m": 800,
      "Intensité cible": "Endurance facile",
      "FC cap bpm": 150,
      "RPE cible": 4,
      "Notes": "Note avec, virgule"
    });
    expect(plan[1]).toMatchObject({
      "Séance": "Footing facile",
      "Durée prévue min": 45,
      "Intensité cible": "Très facile"
    });
  });

  it("finds a session by date and optional name filter", () => {
    const plan = parsePlanCsv(
      [
        "Séance,Date,Semaine,Type,Durée prévue min,D+ prévu m,Intensité cible,FC cap bpm,RPE cible,Priorité,Notes",
        "Footing facile,2026-05-05,2026-W19,Course facile,45,100,Très facile,140,2,C,",
        "Côte contrôlée,2026-05-05,2026-W19,Côte,75,600,Tempo côte,162,6,A,"
      ].join("\n")
    );

    expect(findPlannedSession(plan, "2026-05-05")?.Séance).toBe("Footing facile");
    expect(findPlannedSession(plan, "2026-05-05", "côte")?.Séance).toBe("Côte contrôlée");
    expect(findPlannedSession(plan, "2026-05-06")).toBeUndefined();
  });
});
