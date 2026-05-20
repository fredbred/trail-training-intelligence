import { databaseSchemas } from "./schemas.js";
import type { CreatedDatabaseInfo, DatabaseKey } from "./types.js";
import { NotionClient, requireDataSourceId } from "./notionClient.js";

export async function createDatabases(
  notion: NotionClient,
  rootPageId: string,
  onCreated?: (key: DatabaseKey, info: CreatedDatabaseInfo) => void
): Promise<{
  databases: Record<DatabaseKey, CreatedDatabaseInfo>;
  dataSources: Record<DatabaseKey, string>;
}> {
  const databases = {} as Record<DatabaseKey, CreatedDatabaseInfo>;
  const dataSources = {} as Record<DatabaseKey, string>;

  for (const key of Object.keys(databaseSchemas) as DatabaseKey[]) {
    const schema = databaseSchemas[key];
    const response = await notion.createDatabase(rootPageId, schema);
    const dataSourceId = requireDataSourceId(response, key);
    databases[key] = {
      databaseId: response.id,
      databaseUrl: response.url,
      dataSourceId
    };
    dataSources[key] = dataSourceId;
    onCreated?.(key, databases[key]);
  }

  return { databases, dataSources };
}
