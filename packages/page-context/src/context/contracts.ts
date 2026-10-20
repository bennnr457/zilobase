export type ContextSourceRole = "primary" | "attached";

export type ContextAttachment = {
  id: string;
  type: "page" | "database" | "person";
  title: string;
  path: string;
  emoji?: string | null;
  email?: string;
  mode?: "skill";
};

export type ContextSourceRef = {
  type: "page" | "database";
  id: string;
  role: ContextSourceRole;
};

export type DatabasePropertySchema = {
  id: string;
  propertyId: string;
  position: number;
  property: {
    id: string;
    name: string;
    type: string;
    config?: unknown;
  };
};

export type DatabaseViewSchema = {
  id: string;
  dataSourceId: string;
  type: string;
  name: string;
  config?: unknown;
  position: number;
};

export type DataSourceContext = {
  id: string;
  name: string;
  parentDatabaseId: string;
  config?: unknown;
};

export type DatabaseRowContext = {
  id: string;
  pageId: string;
  parentRowId?: string | null;
  position: number;
  name: string;
  emoji?: string | null;
};

export const CONTEXT_VERSION = 1 as const;

export type ResourceRef = { type: "page" | "database"; id: string };
export type ContextProvenance = {
  capturedAt: string;
  origin: "saved" | "local-editor";
  revision?: string;
};
export type ContextCoverage = {
  complete: boolean;
  totalRows?: number;
  includedRows?: number;
  omittedRows?: number;
  reasons: string[];
};
export type ContextPage = {
  id: string;
  title: string;
  emoji?: string | null;
  path: string;
  content: unknown;
  databaseIds: string[];
  provenance: ContextProvenance;
  coverage: ContextCoverage;
};
export type ContextDatabase = {
  id: string;
  name: string;
  emoji?: string | null;
  pageId: string | null;
  sourceIds: string[];
  views: DatabaseViewSchema[];
  config?: unknown;
  provenance: ContextProvenance;
  coverage: ContextCoverage;
};
export type ContextDataSource = {
  id: string;
  name: string;
  emoji?: string | null;
  parentDatabaseId: string;
  hostDatabaseIds: string[];
  config?: unknown;
  properties: DatabasePropertySchema[];
  rows: DatabaseRowContext[];
  values: DatabaseValueContext[];
  provenance: ContextProvenance;
  coverage: ContextCoverage;
};
export type WorkspaceContext = {
  version: typeof CONTEXT_VERSION;
  roots: ResourceRef[];
  pages: ContextPage[];
  databases: ContextDatabase[];
  sources: ContextDataSource[];
  // Only retain the authorized parent reference when an embedded resource cannot be read.
  unavailable: Array<{ parent: ResourceRef; reason: string }>;
};
export type ContextManifestEntry = {
  key: string;
  type: "page" | "database" | "source" | "record";
  id: string;
  title: string;
  emoji?: string | null;
  pageId?: string;
  databaseId?: string;
  sourceId?: string;
  provenance: ContextProvenance;
  coverage?: ContextCoverage;
};

export type DatabaseValueContext = {
  propertyId: string;
  value: unknown;
  pageId: string;
};

export type DatabaseContextPayload = {
  activeDataSource: DataSourceContext | null;
  dataSources: DataSourceContext[];
  database: {
    id: string;
    name: string;
    pageId: string | null;
    config?: unknown;
  };
  properties: DatabasePropertySchema[];
  views: DatabaseViewSchema[];
  rowCount: number;
  rows: DatabaseRowContext[];
  values: DatabaseValueContext[];
};

export type PageDatabaseContext = {
  schema: DatabaseContextPayload;
  dataSourceSchemas: Record<string, DatabaseContextPayload>;
};

export type PageContextSection = {
  kind: "page";
  role: ContextSourceRole;
  id: string;
  title: string;
  path: string;
  content: unknown;
  databases: PageDatabaseContext[];
};

export type DatabaseContextSection = {
  kind: "database";
  role: ContextSourceRole;
  schema: DatabaseContextPayload;
  dataSourceSchemas: Record<string, DatabaseContextPayload>;
};

export type ContextSection = PageContextSection | DatabaseContextSection;

export type BuildContextInput = {
  context: WorkspaceContext;
  maxChars?: number;
  maxBytes?: number;
};

export type BuildContextResult = {
  markdown: string;
  charCount: number;
  trimmedAttachmentIds: string[];
  status: "complete" | "partial" | "blocked";
  manifest: ContextManifestEntry[];
  omissions: string[];
  version: typeof CONTEXT_VERSION;
};
