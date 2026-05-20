import { describe, expect, it } from "vitest";

import { weeklyCalendarViewPreview } from "../src/createViews.js";
import { databaseSchemas, statusOptions } from "../src/schemas.js";

describe("database schemas", () => {
  it("defines exactly one title property per database", () => {
    for (const schema of Object.values(databaseSchemas)) {
      const titleProperties = Object.values(schema.properties).filter((property) => "title" in property);
      expect(titleProperties, schema.name).toHaveLength(1);
      expect(schema.properties[schema.titleProperty]).toHaveProperty("title");
    }
  });

  it("uses a select property for Statut", () => {
    const statut = databaseSchemas.plan.properties["Statut"];
    expect(statut).toHaveProperty("select");
    if ("select" in statut) {
      expect(statut.select.options.map((option) => option.name)).toEqual(statusOptions);
    }
  });

  it("declares the weekly calendar view on the training plan date", () => {
    expect(weeklyCalendarViewPreview).toEqual({
      name: "Calendrier semaine",
      type: "calendar",
      databaseKey: "plan",
      dateProperty: "Date",
      viewRange: "week"
    });
    expect(databaseSchemas.plan.properties.Date).toHaveProperty("date");
  });
});
