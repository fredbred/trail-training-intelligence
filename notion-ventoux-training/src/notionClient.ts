import type { DatabaseKey, DatabaseSchema, NotionConfig } from "./types.js";

type NotionPageResponse = {
  id: string;
  url?: string;
};

type NotionDatabaseResponse = {
  id: string;
  url?: string;
  data_sources?: Array<{ id: string; name?: string }>;
};

type NotionDataSourceResponse = {
  id: string;
  properties: Record<string, { id: string; type: string }>;
};

type NotionViewResponse = {
  id: string;
  name?: string;
  type?: string;
};

export class NotionApiError extends Error {
  status: number;
  code?: string;
  body?: unknown;

  constructor(status: number, message: string, code?: string, body?: unknown) {
    super(message);
    this.name = "NotionApiError";
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

function notionErrorHint(status: number): string {
  if (status === 401) return "Token Notion invalide ou expiré. Vérifier NOTION_TOKEN.";
  if (status === 403) return "Accès refusé. Vérifier les capacités de l’intégration et le partage de la page parent.";
  if (status === 404) return "Page parent introuvable ou non partagée avec l’intégration.";
  if (status === 429) return "Rate limit Notion atteint. Relancer dans quelques instants.";
  return "Erreur Notion inattendue.";
}

function compactBody(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const record = body as Record<string, unknown>;
  const code = typeof record.code === "string" ? ` ${record.code}` : "";
  const message = typeof record.message === "string" ? ` ${record.message}` : "";
  return `${code}${message}`.trim();
}

export class NotionClient {
  private readonly token: string;
  private readonly notionVersion: string;
  private readonly baseUrl = "https://api.notion.com";

  constructor(config: NotionConfig) {
    this.token = config.token;
    this.notionVersion = config.notionVersion;
  }

  async createRootPage(parentPageId: string, title: string): Promise<NotionPageResponse> {
    return this.request<NotionPageResponse>("POST", "/v1/pages", {
      parent: { type: "page_id", page_id: parentPageId },
      properties: {
        title: {
          title: [{ type: "text", text: { content: title } }]
        }
      }
    });
  }

  async appendBlocks(pageId: string, children: unknown[]): Promise<void> {
    await this.request("PATCH", `/v1/blocks/${pageId}/children`, { children });
  }

  async createDatabase(parentPageId: string, schema: DatabaseSchema): Promise<NotionDatabaseResponse> {
    return this.request<NotionDatabaseResponse>("POST", "/v1/databases", {
      parent: { type: "page_id", page_id: parentPageId },
      title: [{ type: "text", text: { content: schema.name } }],
      is_inline: false,
      initial_data_source: {
        properties: schema.properties
      }
    });
  }

  async createDataSourcePage(dataSourceId: string, properties: Record<string, unknown>): Promise<NotionPageResponse> {
    return this.request<NotionPageResponse>("POST", "/v1/pages", {
      parent: { type: "data_source_id", data_source_id: dataSourceId },
      properties
    });
  }

  async retrieveDataSource(dataSourceId: string): Promise<NotionDataSourceResponse> {
    return this.request<NotionDataSourceResponse>("GET", `/v1/data_sources/${dataSourceId}`);
  }

  async createView(payload: Record<string, unknown>): Promise<NotionViewResponse> {
    return this.request<NotionViewResponse>("POST", "/v1/views", payload);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        "Notion-Version": this.notionVersion
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });

    const responseBody = await response.json().catch(() => undefined);
    if (!response.ok) {
      const record = responseBody as Record<string, unknown> | undefined;
      const code = typeof record?.code === "string" ? record.code : undefined;
      const details = compactBody(responseBody);
      throw new NotionApiError(response.status, `${notionErrorHint(response.status)}${details ? ` (${details})` : ""}`, code, responseBody);
    }
    return responseBody as T;
  }
}

export function requireDataSourceId(response: NotionDatabaseResponse, key: DatabaseKey): string {
  const dataSourceId = response.data_sources?.[0]?.id;
  if (!dataSourceId) {
    throw new Error(`La database ${key} a été créée sans data_sources[0].id dans la réponse Notion.`);
  }
  return dataSourceId;
}
