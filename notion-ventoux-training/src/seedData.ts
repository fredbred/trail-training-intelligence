import type { PhaseRow, PlanRow, RuleRow, SeedRowsByDatabase, SessionLibraryRow, WeeklyReviewRow } from "./types.js";

const basePlan = {
  "Phase": "Consolidation avant bébé",
  "Statut": "Prévu",
  "Durée réalisée min": undefined,
  "D+ réalisé m": undefined,
  "RPE réalisé": undefined,
  "FC moyenne": undefined,
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
  const session = row.Séance.toLowerCase();

  if (row.Type === "Renfo A") {
    return [
      "Échauffement 6–8 min.",
      "Split squat ou fente arrière, soulevé de terre roumain une jambe, mollets/soléaires.",
      "Finir par gainage anti-rotation ou suitcase carry.",
      session.includes("réduit") ? "Version courte: charges modérées, pas de DOMS recherchés." : "Garder une exécution propre, sans aller à l'échec."
    ].join("\n");
  }

  if (row.Type === "Renfo B") {
    return [
      "Step-down lent, fentes, wall sit ou Spanish squat.",
      "Tibial antérieur, mollets/soléaires légers, hanches/pieds.",
      "Objectif: quadriceps excentriques et robustesse en descente."
    ].join("\n");
  }

  if (row.Type === "Côte") {
    if (session.includes("2 x 6")) {
      return "15 min facile.\n2 x 6 min en montée contrôlée sous cap FC.\nRécupération descente très facile.\n10 min retour au calme.";
    }
    if (session.includes("8 x 30")) {
      return "15 min facile.\n8 x 30 s en côte modérée, relâché.\nRécupération complète en descente ou marche.\nRetour au calme facile.";
    }
    if (session.includes("4 x 6")) {
      return "15 min facile.\n4 x 6 min en côte tempo contrôlée.\nRécupération descente très facile.\n10 min retour au calme.";
    }
    return "15 min facile.\nBloc de montée contrôlée sous cap FC.\nRécupération descente très facile.\n10 min retour au calme.";
  }

  if (row.Type === "Sortie longue") {
    return [
      "Allure facile, cap FC 145–150.",
      "Bâtons possibles.",
      "Nutrition 40–70 g glucides/h selon durée.",
      "Descente propre, pas de recherche de vitesse."
    ].join("\n");
  }

  if (row.Type === "Home trainer" || row.Type === "Tapis incliné") {
    return "Très facile, cadence souple, FC sous le cap prévu.\nRemplaçable par footing facile, marche ou repos selon fatigue.";
  }

  if (row.Type === "Mobilité") {
    return "Mobilité douce hanches, mollets, pieds et dos.\nAucune intensité, juste remettre du mouvement.";
  }

  if (row.Type === "Repos") {
    return "Repos complet ou marche douce.\nObjectif récupération, sans compensation de séance manquée.";
  }

  if (session.includes("ligne") || session.includes("relâch")) {
    return "Course facile en aisance respiratoire.\nAjouter les lignes relâchées indiquées en fin de séance.\nRécupération complète, sans chercher la vitesse.";
  }

  if (session.includes("chien") || session.includes("marche")) {
    return "Sortie très facile avec marche-course possible.\nAucune intensité, priorité à la récupération.";
  }

  if (session.includes("test état")) {
    return "Footing très facile de test.\nObserver FC, jambes, chaleur et couper si les signaux sont mauvais.";
  }

  return "Endurance facile en aisance respiratoire.\nFC sous le cap prévu, aucune intensité ajoutée.";
}

export const planRows: PlanRow[] = [
  planRow({
    "Date": "2026-04-29",
    "Séance": "Footing ou marche-course avec chien",
    "Semaine": "2026-W18",
    "Type": "Course facile",
    "Durée prévue min": 45,
    "D+ prévu m": 200,
    "Intensité cible": "Très facile",
    "FC cap bpm": 145,
    "RPE cible": 2,
    "Priorité": "B",
    "Notes": "Reprise facile, aucune intensité."
  }),
  planRow({
    "Date": "2026-04-30",
    "Séance": "Endurance facile",
    "Semaine": "2026-W18",
    "Type": "Course facile",
    "Durée prévue min": 60,
    "D+ prévu m": 300,
    "Intensité cible": "Endurance facile",
    "FC cap bpm": 145,
    "RPE cible": 3,
    "Priorité": "B",
    "Notes": "Garder la FC basse."
  }),
  planRow({
    "Date": "2026-05-01",
    "Séance": "Renfo B léger — descente/tendon/dos",
    "Semaine": "2026-W18",
    "Type": "Renfo B",
    "Durée prévue min": 30,
    "D+ prévu m": 0,
    "Intensité cible": "Renfo",
    "RPE cible": 6,
    "Priorité": "A",
    "Notes": "Step-down lent, soléaires, mollets, gainage, hanches/pieds."
  }),
  planRow({
    "Date": "2026-05-02",
    "Séance": "Sortie longue courte trail/rando-course",
    "Semaine": "2026-W18",
    "Type": "Sortie longue",
    "Durée prévue min": 135,
    "D+ prévu m": 800,
    "Intensité cible": "Endurance facile",
    "FC cap bpm": 150,
    "RPE cible": 4,
    "Priorité": "A",
    "Statut": "Sauté",
    "Durée réalisée min": 0,
    "D+ réalisé m": 0,
    "Notes": "Nutrition 40–60 g glucides/h. Éviter les heures chaudes.",
    "Adaptation": "Sauté: week-end solo avec enfant. Ne pas rattraper; reprendre avec une semaine W19 réduite."
  }),
  planRow({
    "Date": "2026-05-03",
    "Séance": "Home trainer ou footing très facile",
    "Semaine": "2026-W18",
    "Type": "Home trainer",
    "Durée prévue min": 60,
    "D+ prévu m": 0,
    "Intensité cible": "Très facile",
    "FC cap bpm": 140,
    "RPE cible": 2,
    "Priorité": "C",
    "Statut": "Sauté",
    "Durée réalisée min": 0,
    "D+ réalisé m": 0,
    "Notes": "Optionnel selon récupération.",
    "Adaptation": "Optionnel sauté: pas de compensation nécessaire."
  }),
  planRow({
    "Date": "2026-05-04",
    "Séance": "30 min facile + mobilité",
    "Semaine": "2026-W19",
    "Type": "Course facile",
    "Durée prévue min": 40,
    "D+ prévu m": 100,
    "Intensité cible": "Très facile",
    "FC cap bpm": 140,
    "RPE cible": 2,
    "Priorité": "C",
    "Notes": ""
  }),
  planRow({
    "Date": "2026-05-05",
    "Séance": "Endurance facile + 4 x 20 s relâchées",
    "Semaine": "2026-W19",
    "Type": "Course facile",
    "Durée prévue min": 55,
    "D+ prévu m": 300,
    "Intensité cible": "Endurance facile",
    "FC cap bpm": 145,
    "RPE cible": 3,
    "Priorité": "B",
    "Notes": "Cap 145 hors lignes; supprimer les lignes si jambes lourdes.",
    "Adaptation": "Après week-end sans séances: reprise facile, pas de rattrapage."
  }),
  planRow({
    "Date": "2026-05-06",
    "Séance": "Renfo A réduit — force utile trail",
    "Semaine": "2026-W19",
    "Type": "Renfo A",
    "Durée prévue min": 30,
    "D+ prévu m": 0,
    "Intensité cible": "Renfo",
    "RPE cible": 6,
    "Priorité": "A",
    "Notes": "Réduire charges, éviter DOMS avant la côte et la sortie longue.",
    "Adaptation": "Renfo raccourci pour garder de la fraîcheur musculaire."
  }),
  planRow({
    "Date": "2026-05-07",
    "Séance": "Côte contrôlée réduite 2 x 6 min",
    "Semaine": "2026-W19",
    "Type": "Côte",
    "Durée prévue min": 60,
    "D+ prévu m": 400,
    "Intensité cible": "Tempo côte",
    "FC cap bpm": 158,
    "RPE cible": 5,
    "Priorité": "A",
    "Notes": "2 x 6 min en contrôle; basculer en 45 min facile si fatigue/sommeil mauvais.",
    "Adaptation": "Séance clé conservée mais dosage réduit après la sortie longue manquée."
  }),
  planRow({
    "Date": "2026-05-08",
    "Séance": "Repos ou marche",
    "Semaine": "2026-W19",
    "Type": "Repos",
    "Durée prévue min": 0,
    "D+ prévu m": 0,
    "Intensité cible": "Repos",
    "RPE cible": 1,
    "Priorité": "B",
    "Notes": ""
  }),
  planRow({
    "Date": "2026-05-09",
    "Séance": "Sortie longue rando-course réduite",
    "Semaine": "2026-W19",
    "Type": "Sortie longue",
    "Durée prévue min": 135,
    "D+ prévu m": 800,
    "Intensité cible": "Endurance facile",
    "FC cap bpm": 150,
    "RPE cible": 4,
    "Priorité": "A",
    "Notes": "Remplace la progression prévue, sans ajouter le volume manqué; nutrition 40–60 g/h.",
    "Adaptation": "Ramener la sortie longue au format W18 plutôt que passer directement à 165 min."
  }),
  planRow({
    "Date": "2026-05-10",
    "Séance": "Footing/home trainer très facile optionnel",
    "Semaine": "2026-W19",
    "Type": "Home trainer",
    "Durée prévue min": 45,
    "D+ prévu m": 0,
    "Intensité cible": "Très facile",
    "FC cap bpm": 140,
    "RPE cible": 2,
    "Priorité": "C",
    "Notes": "Optionnel; repos si fatigue familiale ou jambes chargées.",
    "Adaptation": "Séance allégée pour absorber la sortie longue."
  }),
  planRow({
    "Date": "2026-05-11",
    "Séance": "30 min chien ou repos",
    "Semaine": "2026-W20",
    "Type": "Course facile",
    "Durée prévue min": 30,
    "D+ prévu m": 100,
    "Intensité cible": "Très facile",
    "FC cap bpm": 140,
    "RPE cible": 2,
    "Priorité": "C",
    "Notes": ""
  }),
  planRow({
    "Date": "2026-05-12",
    "Séance": "8 x 30 s côte modérée",
    "Semaine": "2026-W20",
    "Type": "Côte",
    "Durée prévue min": 60,
    "D+ prévu m": 500,
    "Intensité cible": "Endurance haute contrôlée",
    "FC cap bpm": 153,
    "RPE cible": 5,
    "Priorité": "B",
    "Notes": "Cap 153 hors fractions."
  }),
  planRow({
    "Date": "2026-05-13",
    "Séance": "Renfo B — quadris descente + mollets + dos",
    "Semaine": "2026-W20",
    "Type": "Renfo B",
    "Durée prévue min": 35,
    "D+ prévu m": 0,
    "Intensité cible": "Renfo",
    "RPE cible": 6,
    "Priorité": "A",
    "Notes": ""
  }),
  planRow({
    "Date": "2026-05-14",
    "Séance": "Côte tempo 4 x 6 min",
    "Semaine": "2026-W20",
    "Type": "Côte",
    "Durée prévue min": 70,
    "D+ prévu m": 600,
    "Intensité cible": "Tempo côte",
    "FC cap bpm": 162,
    "RPE cible": 6,
    "Priorité": "A",
    "Notes": ""
  }),
  planRow({
    "Date": "2026-05-15",
    "Séance": "Footing très facile",
    "Semaine": "2026-W20",
    "Type": "Course facile",
    "Durée prévue min": 45,
    "D+ prévu m": 200,
    "Intensité cible": "Très facile",
    "FC cap bpm": 140,
    "RPE cible": 2,
    "Priorité": "C",
    "Notes": ""
  }),
  planRow({
    "Date": "2026-05-16",
    "Séance": "Sortie longue D+ trail/rando-course contrôlée",
    "Semaine": "2026-W20",
    "Type": "Sortie longue",
    "Durée prévue min": 165,
    "D+ prévu m": 1000,
    "Intensité cible": "Endurance facile",
    "FC cap bpm": 150,
    "RPE cible": 5,
    "Priorité": "A",
    "Notes": "Ne monter vers 180–195 min que si W19 passe très bien.",
    "Adaptation": "Progression lissée après le week-end W18 manqué."
  }),
  planRow({
    "Date": "2026-05-17",
    "Séance": "Home trainer ou footing facile",
    "Semaine": "2026-W20",
    "Type": "Home trainer",
    "Durée prévue min": 90,
    "D+ prévu m": 0,
    "Intensité cible": "Très facile",
    "FC cap bpm": 140,
    "RPE cible": 2,
    "Priorité": "B",
    "Notes": ""
  }),
  planRow({
    "Date": "2026-05-18",
    "Séance": "Repos ou marche",
    "Semaine": "2026-W21",
    "Type": "Repos",
    "Durée prévue min": 0,
    "D+ prévu m": 0,
    "Intensité cible": "Repos",
    "RPE cible": 1,
    "Priorité": "B",
    "Notes": ""
  }),
  planRow({
    "Date": "2026-05-19",
    "Séance": "Endurance facile",
    "Semaine": "2026-W21",
    "Type": "Course facile",
    "Durée prévue min": 60,
    "D+ prévu m": 300,
    "Intensité cible": "Endurance facile",
    "FC cap bpm": 145,
    "RPE cible": 3,
    "Priorité": "B",
    "Notes": ""
  }),
  planRow({
    "Date": "2026-05-20",
    "Séance": "Renfo A réduit",
    "Semaine": "2026-W21",
    "Type": "Renfo A",
    "Durée prévue min": 30,
    "D+ prévu m": 0,
    "Intensité cible": "Renfo",
    "RPE cible": 6,
    "Priorité": "A",
    "Notes": ""
  }),
  planRow({
    "Date": "2026-05-21",
    "Séance": "45 min facile + 5 x 20 s relâchées",
    "Semaine": "2026-W21",
    "Type": "Course facile",
    "Durée prévue min": 55,
    "D+ prévu m": 250,
    "Intensité cible": "Endurance facile",
    "FC cap bpm": 145,
    "RPE cible": 3,
    "Priorité": "B",
    "Notes": ""
  }),
  planRow({
    "Date": "2026-05-22",
    "Séance": "Repos",
    "Semaine": "2026-W21",
    "Type": "Repos",
    "Durée prévue min": 0,
    "D+ prévu m": 0,
    "Intensité cible": "Repos",
    "RPE cible": 1,
    "Priorité": "B",
    "Notes": ""
  }),
  planRow({
    "Date": "2026-05-23",
    "Séance": "Sortie longue réduite",
    "Semaine": "2026-W21",
    "Type": "Sortie longue",
    "Durée prévue min": 135,
    "D+ prévu m": 800,
    "Intensité cible": "Endurance facile",
    "FC cap bpm": 150,
    "RPE cible": 4,
    "Priorité": "A",
    "Notes": ""
  }),
  planRow({
    "Date": "2026-05-24",
    "Séance": "Home trainer ou footing facile",
    "Semaine": "2026-W21",
    "Type": "Home trainer",
    "Durée prévue min": 60,
    "D+ prévu m": 0,
    "Intensité cible": "Très facile",
    "FC cap bpm": 140,
    "RPE cible": 2,
    "Priorité": "C",
    "Notes": ""
  }),
  planRow({
    "Date": "2026-05-25",
    "Séance": "Mobilité",
    "Semaine": "2026-W22",
    "Type": "Mobilité",
    "Durée prévue min": 20,
    "D+ prévu m": 0,
    "Intensité cible": "Très facile",
    "RPE cible": 1,
    "Priorité": "C",
    "Notes": ""
  }),
  planRow({
    "Date": "2026-05-26",
    "Séance": "Test état facile",
    "Semaine": "2026-W22",
    "Type": "Course facile",
    "Durée prévue min": 45,
    "D+ prévu m": 200,
    "Intensité cible": "Très facile",
    "FC cap bpm": 145,
    "RPE cible": 2,
    "Priorité": "B",
    "Notes": ""
  })
];

export const weeklyReviewRows: WeeklyReviewRow[] = [
  {
    "Semaine": "2026-W18 — absorption",
    "Semaine du": "2026-04-29",
    "Phase": "Consolidation avant bébé",
    "Objectif semaine": "Absorber la reprise, chaleur et charge haute.",
    "Heures prévues": 5,
    "D+ prévu m": 1300,
    "Séances prévues": 5,
    "Renfo réalisé": false,
    "Sortie longue": false,
    "Récupération COROS moyenne %": undefined,
    "Douleurs / alertes": "Sortie longue du 2026-05-02 et séance optionnelle du 2026-05-03 sautées pour contrainte familiale.",
    "Décision semaine suivante": "Alléger"
  },
  {
    "Semaine": "2026-W19 — reprise productive",
    "Semaine du": "2026-05-04",
    "Phase": "Consolidation avant bébé",
    "Objectif semaine": "Reprendre sans rattraper: une côte réduite, renfo court, sortie longue contrôlée.",
    "Heures prévues": 6,
    "D+ prévu m": 1600,
    "Séances prévues": 6,
    "Renfo réalisé": false,
    "Sortie longue": false,
    "Récupération COROS moyenne %": undefined,
    "Décision semaine suivante": "Maintenir"
  },
  {
    "Semaine": "2026-W20 — semaine solide",
    "Semaine du": "2026-05-11",
    "Phase": "Consolidation avant bébé",
    "Objectif semaine": "Plus grosse semaine du bloc, mais sans pic idiot.",
    "Heures prévues": 8,
    "D+ prévu m": 2400,
    "Séances prévues": 7,
    "Renfo réalisé": false,
    "Sortie longue": false,
    "Récupération COROS moyenne %": undefined,
    "Décision semaine suivante": "Alléger"
  },
  {
    "Semaine": "2026-W21 — décharge / bébé-watch",
    "Semaine du": "2026-05-18",
    "Phase": "Consolidation avant bébé",
    "Objectif semaine": "Décharger et basculer vers flexibilité naissance.",
    "Heures prévues": 5,
    "D+ prévu m": 1550,
    "Séances prévues": 7,
    "Renfo réalisé": false,
    "Sortie longue": false,
    "Récupération COROS moyenne %": undefined,
    "Décision semaine suivante": "Mode bébé / survie"
  }
];

export const phaseRows: PhaseRow[] = [
  {
    "Dates": "Maintenant – fin mai 2026",
    "Phase": "Consolidation avant bébé",
    "Objectif": "Stabiliser, absorber, ne pas surcharger.",
    "Volume cible": "4h30 à 8h/semaine.",
    "D+ cible": "800 à 2 000 m/semaine.",
    "Renfo": "2x/semaine si sommeil OK.",
    "Intensité": "1 séance côte contrôlée maximum.",
    "Sorties longues": "1h45 à 3h15.",
    "Commentaires": ""
  },
  {
    "Dates": "Juin – juillet 2026",
    "Phase": "Mode bébé",
    "Objectif": "Continuité minimale.",
    "Volume cible": "3 à 6h/semaine.",
    "D+ cible": "variable.",
    "Renfo": "1 vraie séance + mini-routines.",
    "Intensité": "très limitée.",
    "Sorties longues": "optionnelles, 1h30 à 2h30 si possible.",
    "Commentaires": ""
  },
  {
    "Dates": "Août – octobre 2026",
    "Phase": "Base aérobie + force",
    "Objectif": "Rendre 7 à 9h/semaine banales.",
    "Volume cible": "7 à 9h/semaine.",
    "D+ cible": "1 500 à 3 000 m/semaine.",
    "Renfo": "2x/semaine.",
    "Intensité": "1 séance courte contrôlée.",
    "Sorties longues": "2h30 à 4h.",
    "Commentaires": ""
  },
  {
    "Dates": "Novembre – décembre 2026",
    "Phase": "Volume sans casse",
    "Objectif": "Régularité hivernale.",
    "Volume cible": "8 à 10h/semaine.",
    "D+ cible": "1 500 à 3 500 m/semaine.",
    "Renfo": "2x/semaine.",
    "Intensité": "contrôlée.",
    "Sorties longues": "3h à 4h.",
    "Commentaires": ""
  },
  {
    "Dates": "Janvier – février 2027",
    "Phase": "Spécifique trail long",
    "Objectif": "Back-to-back, nutrition, descentes, bâtons.",
    "Volume cible": "9 à 13h/semaine.",
    "D+ cible": "2 500 à 4 500 m/semaine.",
    "Renfo": "1 à 2x/semaine.",
    "Intensité": "",
    "Sorties longues": "3h30 à 5h.",
    "Commentaires": ""
  },
  {
    "Dates": "Mars – début avril 2027",
    "Phase": "Bloc Ventoux",
    "Objectif": "Simulation fatigue + nutrition + nuit/chaleur.",
    "Volume cible": "10 à 16h/semaine selon récupération.",
    "D+ cible": "3 500 à 6 000 m/semaine sur grosses semaines.",
    "Renfo": "maintien.",
    "Intensité": "",
    "Sorties longues": "quelques exceptions planifiées.",
    "Commentaires": ""
  },
  {
    "Dates": "Avril 2027",
    "Phase": "Affûtage",
    "Objectif": "Fraîcheur, fréquence maintenue, volume réduit.",
    "Volume cible": "décroissant.",
    "D+ cible": "réduit.",
    "Renfo": "très léger.",
    "Intensité": "rappels courts.",
    "Sorties longues": "plus de grosse sortie.",
    "Commentaires": ""
  }
];

export const sessionLibraryRows: SessionLibraryRow[] = [
  {
    "Séance": "Renfo A — force utile trail",
    "Type": "Renfo A",
    "Durée min": 45,
    "Priorité": "A",
    "Objectif": "Force utile pour trail long, montée, descente et robustesse.",
    "Description": "Échauffement 6–8 min.\nSplit squat ou fente arrière lourde 4 x 4–6 / jambe.\nSoulevé de terre roumain une jambe 3 x 5–8 / jambe.\nMollets genou tendu 4 x 6–10.\nSoléaires genou fléchi 4 x 8–12.\nSuitcase carry ou Pallof press 3 x 30–45 s / côté.",
    "Quand l’utiliser": "Semaine normale, hors grosse fatigue.",
    "Adaptation orange/rouge": "Réduire charges, passer à RPE 5–6, supprimer exercice lourd si sommeil mauvais."
  },
  {
    "Séance": "Renfo B — armure descente",
    "Type": "Renfo B",
    "Durée min": 35,
    "Priorité": "A",
    "Objectif": "Quadriceps excentriques, mollets, soléaires, dos, hanches.",
    "Description": "Step-down lent 3 x 6–8 / jambe.\nFentes marchées ou fentes arrière 3 x 8 / jambe.\nWall sit ou Spanish squat 3 x 30–45 s.\nTibial antérieur 3 x 15–20.\nMollets/soléaires légers 2–3 x 12–15.\nHanches / pieds / rotation tibiale 5–8 min.",
    "Quand l’utiliser": "Après footing facile ou jour dédié.",
    "Adaptation orange/rouge": "Garder mobilité, supprimer excentrique si DOMS ou descente récente."
  },
  {
    "Séance": "Côte contrôlée 3 x 8 min",
    "Type": "Côte",
    "Durée min": 75,
    "Priorité": "A",
    "Objectif": "Endurance de montée contrôlée.",
    "Description": "15 min facile.\n3 x 8 min montée à 154–162 bpm.\nRécupération descente très facile.\n10 min retour au calme.",
    "Quand l’utiliser": "Quand récupération COROS >=90 %, FC repos stable, VFC correcte.",
    "Adaptation orange/rouge": "Remplacer par 45–60 min facile."
  },
  {
    "Séance": "Sortie longue trail/rando-course",
    "Type": "Sortie longue",
    "Durée min": 135,
    "Priorité": "A",
    "Objectif": "Temps d’effort, D+, nutrition, économie musculaire.",
    "Description": "Allure facile, cap FC 145–150.\nBâtons possibles.\nNutrition 40–70 g glucides/h selon durée.\nDescente propre, pas de recherche de vitesse.\nDurée adaptable de 135 à 195 min.",
    "Quand l’utiliser": "Week-end, tôt le matin.",
    "Adaptation orange/rouge": "Réduire de 20–30 % ou remplacer par home trainer."
  },
  {
    "Séance": "Footing facile + lignes relâchées",
    "Type": "Course facile",
    "Durée min": 60,
    "Priorité": "B",
    "Objectif": "Endurance + rappel neuromusculaire.",
    "Description": "45–55 min facile.\n5 à 8 x 15–20 s relâchées.\nRécupération complète.",
    "Quand l’utiliser": "Semaine normale, jambes fraîches.",
    "Adaptation orange/rouge": "Supprimer les lignes droites."
  }
];

export const ruleRows: RuleRow[] = [
  {
    "Règle": "Règle 1",
    "Catégorie": "Charge",
    "Description": "Ne pas monter volume + D+ + intensité la même semaine.",
    "Action si déclenchée": "Choisir un seul levier de progression."
  },
  {
    "Règle": "Règle 2",
    "Catégorie": "Récupération",
    "Description": "Si fatigue familiale ou sommeil mauvais, garder la fréquence mais baisser l’intensité.",
    "Action si déclenchée": "Transformer séance dure en facile."
  },
  {
    "Règle": "Règle 3",
    "Catégorie": "Charge",
    "Description": "Une séance clé ratée n’est pas rattrapée.",
    "Action si déclenchée": "Abandonner ou remplacer, ne pas empiler."
  },
  {
    "Règle": "Règle 4",
    "Catégorie": "Renfo",
    "Description": "Le renfo est une séance d’entraînement, pas un bonus.",
    "Action si déclenchée": "Le suivre dans le bilan hebdomadaire."
  },
  {
    "Règle": "Règle 5",
    "Catégorie": "Récupération",
    "Description": "Si récupération COROS <75 %, VFC basse 2 jours, FC repos haute ou fatigue forte, pas de séance dure.",
    "Action si déclenchée": "Footing facile, home trainer, mobilité ou repos."
  },
  {
    "Règle": "Règle 6",
    "Catégorie": "Chaleur",
    "Description": "Lors d’arrivée brutale de chaleur, réduire intensité et FC cible pendant 10–14 jours.",
    "Action si déclenchée": "Baisser FC cible de 5–10 bpm, hydratation plus précoce."
  },
  {
    "Règle": "Règle 7",
    "Catégorie": "Nutrition",
    "Description": "Sur les sorties longues, entraîner le système digestif.",
    "Action si déclenchée": "40–60 g/h sur sorties courtes, 60–75 g/h sur longues, tester plus seulement si toléré."
  },
  {
    "Règle": "Règle 8",
    "Catégorie": "Blessure",
    "Description": "L’Achille droit est un capteur de surcharge chronique stabilisé, pas la contrainte principale.",
    "Action si déclenchée": "Réduire impact uniquement si douleur au-dessus de la baseline, raideur inhabituelle ou foulée modifiée."
  }
];

export const seedRows: SeedRowsByDatabase = {
  plan: planRows,
  weeklyReview: weeklyReviewRows,
  phases: phaseRows,
  sessionLibrary: sessionLibraryRows,
  rules: ruleRows
};
