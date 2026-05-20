type RichText = {
  type: "text";
  text: { content: string };
};

type NotionBlock =
  | { object: "block"; type: "heading_1"; heading_1: { rich_text: RichText[] } }
  | { object: "block"; type: "heading_2"; heading_2: { rich_text: RichText[] } }
  | { object: "block"; type: "paragraph"; paragraph: { rich_text: RichText[] } }
  | { object: "block"; type: "bulleted_list_item"; bulleted_list_item: { rich_text: RichText[] } }
  | { object: "block"; type: "callout"; callout: { rich_text: RichText[]; icon: { type: "emoji"; emoji: string } } };

function rt(content: string): RichText[] {
  return [{ type: "text", text: { content } }];
}

function heading1(content: string): NotionBlock {
  return { object: "block", type: "heading_1", heading_1: { rich_text: rt(content) } };
}

function heading2(content: string): NotionBlock {
  return { object: "block", type: "heading_2", heading_2: { rich_text: rt(content) } };
}

function paragraph(content: string): NotionBlock {
  return { object: "block", type: "paragraph", paragraph: { rich_text: content ? rt(content) : [] } };
}

function bullet(content: string): NotionBlock {
  return { object: "block", type: "bulleted_list_item", bulleted_list_item: { rich_text: rt(content) } };
}

function callout(content: string): NotionBlock {
  return {
    object: "block",
    type: "callout",
    callout: { rich_text: rt(content), icon: { type: "emoji", emoji: "🎯" } }
  };
}

export function buildDashboardBlocks(): NotionBlock[] {
  return [
    heading1("Grand Raid Ventoux 2027"),
    heading2("Objectif"),
    paragraph("Ultra Géant de Provence / Grand Raid Ventoux 2027 — environ 125 km / 5 700 à 6 000 m D+."),
    heading2("Objectif sportif"),
    bullet("Finir propre."),
    bullet("Cible réaliste : environ 20 h."),
    bullet("Cible ambitieuse : 18 h."),
    heading2("Phase actuelle"),
    paragraph("Consolidation avant bébé."),
    heading2("Focus actuel"),
    bullet("Régularité."),
    bullet("Renforcement musculaire."),
    bullet("Récupération."),
    bullet("Ne pas empiler volume + D+ + intensité."),
    bullet("Préparer la période bébé de juin-juillet 2026."),
    heading2("Règle stratégique"),
    callout("Le but 2026 n’est pas d’être fort en mai. Le but est d’être construit en janvier 2027."),
    heading2("Indicateurs hebdo à suivre"),
    bullet("Heures prévues / réalisées."),
    bullet("D+ prévu / réalisé."),
    bullet("Renfo réalisé."),
    bullet("Sommeil moyen."),
    bullet("VFC moyenne."),
    bullet("FC repos moyenne."),
    bullet("Récupération COROS."),
    bullet("Fatigue /10."),
    bullet("Décision : augmenter, maintenir, alléger, décharger.")
  ];
}

export function buildDashboardMarkdown(): string {
  return [
    "# Grand Raid Ventoux 2027",
    "",
    "## Objectif",
    "Ultra Géant de Provence / Grand Raid Ventoux 2027 — environ 125 km / 5 700 à 6 000 m D+.",
    "",
    "## Objectif sportif",
    "- Finir propre.",
    "- Cible réaliste : environ 20 h.",
    "- Cible ambitieuse : 18 h.",
    "",
    "## Phase actuelle",
    "Consolidation avant bébé.",
    "",
    "## Focus actuel",
    "- Régularité.",
    "- Renforcement musculaire.",
    "- Récupération.",
    "- Ne pas empiler volume + D+ + intensité.",
    "- Préparer la période bébé de juin-juillet 2026.",
    "",
    "## Règle stratégique",
    "Le but 2026 n’est pas d’être fort en mai. Le but est d’être construit en janvier 2027.",
    "",
    "## Indicateurs hebdo à suivre",
    "- Heures prévues / réalisées.",
    "- D+ prévu / réalisé.",
    "- Renfo réalisé.",
    "- Sommeil moyen.",
    "- VFC moyenne.",
    "- FC repos moyenne.",
    "- Récupération COROS.",
    "- Fatigue /10.",
    "- Décision : augmenter, maintenir, alléger, décharger.",
    ""
  ].join("\n");
}
