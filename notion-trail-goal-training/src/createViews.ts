import { databaseSchemas } from "./schemas.js";
import type { CreatedDatabaseInfo, CreatedViewInfo } from "./types.js";
import type { NotionClient } from "./notionClient.js";

const calendarProperties = [
  "Type",
  "Description",
  "Planned duration min",
  "Planned ascent m",
  "Target intensity",
  "Priority",
  "Status",
  "Notes",
  "Adaptation"
];

export const weeklyCalendarViewPreview: CreatedViewInfo = {
  name: "Weekly calendar",
  type: "calendar",
  databaseKey: "plan",
  dateProperty: "Date",
  viewRange: "week"
};

export async function createWeeklyPlanCalendarView(
  notion: NotionClient,
  planDatabase: CreatedDatabaseInfo
): Promise<CreatedViewInfo> {
  const dataSource = await notion.retrieveDataSource(planDatabase.dataSourceId);
  const datePropertyId = dataSource.properties["Date"]?.id;
  if (!datePropertyId) {
    throw new Error("Unable to create the calendar view: `Date` property was not found on the plan data source.");
  }

  const response = await notion.createView({
    database_id: planDatabase.databaseId,
    data_source_id: planDatabase.dataSourceId,
    name: weeklyCalendarViewPreview.name,
    type: "calendar",
    sorts: [{ property: "Date", direction: "ascending" }],
    position: { type: "end" },
    configuration: {
      type: "calendar",
      date_property_id: datePropertyId,
      view_range: "week",
      show_weekends: true,
      properties: calendarProperties
        .filter((propertyName) => propertyName in databaseSchemas.plan.properties)
        .map((propertyName) => ({
          property_id: dataSource.properties[propertyName]?.id ?? propertyName,
          visible: true,
          wrap: propertyName === "Description" || propertyName === "Notes" || propertyName === "Adaptation"
        }))
    }
  });

  return {
    ...weeklyCalendarViewPreview,
    viewId: response.id
  };
}
