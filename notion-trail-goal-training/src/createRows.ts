import type { DatabaseSchema, NotionPropertySchema } from "./types.js";
import type { NotionClient } from "./notionClient.js";

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}

function textValue(value: unknown): string {
  if (isBlank(value)) return "";
  return String(value);
}

export function toNotionProperties(row: Record<string, unknown>, schema: DatabaseSchema): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  for (const [name, propertySchema] of Object.entries(schema.properties)) {
    const value = row[name];
    if (isBlank(value) && !isTitleProperty(propertySchema)) {
      continue;
    }
    properties[name] = toNotionPropertyValue(propertySchema, value);
  }
  return properties;
}

export async function createRowsForDatabase(
  notion: NotionClient,
  dataSourceId: string,
  schema: DatabaseSchema,
  rows: Array<Record<string, unknown>>
): Promise<void> {
  for (const row of rows) {
    await notion.createDataSourcePage(dataSourceId, toNotionProperties(row, schema));
  }
}

function isTitleProperty(schema: NotionPropertySchema): boolean {
  return "title" in schema;
}

function toNotionPropertyValue(schema: NotionPropertySchema, value: unknown): unknown {
  if ("title" in schema) {
    return {
      type: "title",
      title: [{ type: "text", text: { content: textValue(value) } }]
    };
  }
  if ("rich_text" in schema) {
    const content = textValue(value);
    return {
      type: "rich_text",
      rich_text: content ? [{ type: "text", text: { content } }] : []
    };
  }
  if ("date" in schema) {
    return {
      type: "date",
      date: { start: textValue(value) }
    };
  }
  if ("select" in schema) {
    return {
      type: "select",
      select: { name: textValue(value) }
    };
  }
  if ("number" in schema) {
    const number = typeof value === "number" ? value : Number(value);
    return {
      type: "number",
      number: Number.isFinite(number) ? number : null
    };
  }
  if ("checkbox" in schema) {
    return {
      type: "checkbox",
      checkbox: Boolean(value)
    };
  }
  throw new Error("Type de propriété Notion non supporté.");
}
