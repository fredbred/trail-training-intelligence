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
    heading1("Your Trail Goal"),
    heading2("Goal"),
    paragraph("A customizable long-trail preparation dashboard. Replace distance, ascent, dates, and constraints with your own target race."),
    heading2("Outcome targets"),
    bullet("Finish with controlled effort."),
    bullet("Keep training consistent without chasing single-week hero numbers."),
    bullet("Arrive healthy enough to execute the plan."),
    heading2("Current phase"),
    paragraph("Pre-base reset."),
    heading2("Current focus"),
    bullet("Consistency."),
    bullet("Strength durability."),
    bullet("Recovery quality."),
    bullet("Do not stack volume, ascent, and intensity in the same week."),
    bullet("Keep the plan flexible around real-life constraints."),
    heading2("Strategic rule"),
    callout("The goal is not to look fit this week. The goal is to be durable on race day."),
    heading2("Weekly indicators"),
    bullet("Planned vs completed hours."),
    bullet("Planned vs completed ascent."),
    bullet("Strength completed."),
    bullet("Average sleep."),
    bullet("Average HRV."),
    bullet("Average resting HR."),
    bullet("Recovery signal."),
    bullet("Fatigue /10."),
    bullet("Decision: increase, maintain, reduce, or deload.")
  ];
}

export function buildDashboardMarkdown(): string {
  return [
    "# Your Trail Goal",
    "",
    "## Goal",
    "A customizable long-trail preparation dashboard. Replace distance, ascent, dates, and constraints with your own target race.",
    "",
    "## Outcome targets",
    "- Finish with controlled effort.",
    "- Keep training consistent without chasing single-week hero numbers.",
    "- Arrive healthy enough to execute the plan.",
    "",
    "## Current phase",
    "Pre-base reset.",
    "",
    "## Current focus",
    "- Consistency.",
    "- Strength durability.",
    "- Recovery quality.",
    "- Do not stack volume, ascent, and intensity in the same week.",
    "- Keep the plan flexible around real-life constraints.",
    "",
    "## Strategic rule",
    "The goal is not to look fit this week. The goal is to be durable on race day.",
    "",
    "## Weekly indicators",
    "- Planned vs completed hours.",
    "- Planned vs completed ascent.",
    "- Strength completed.",
    "- Average sleep.",
    "- Average HRV.",
    "- Average resting HR.",
    "- Recovery signal.",
    "- Fatigue /10.",
    "- Decision: increase, maintain, reduce, or deload.",
    ""
  ].join("\n");
}
