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
export type BuildContextResult = {
  markdown: string;
  charCount: number;
  trimmedAttachmentIds: string[];
  status: "complete" | "partial" | "blocked";
  manifest: ContextManifestEntry[];
  omissions: string[];
  version: typeof CONTEXT_VERSION;
};
