export const SEARCH_PROFILE = Object.freeze({
  id: "gemini-embedding-2-1536-text-v1",
  provider: "google",
  model: "gemini-embedding-2",
  dimensions: 1536,
  distance: "cosine",
  serializerVersion: 1,
  propertySerializerVersion: 1,
  chunkerVersion: 1,
  documentPromptVersion: 1,
  queryPromptVersion: 1,
  chunkTargetBytes: 2400,
  chunkOverlapBytes: 320,
  maxInputBytes: 4096,
} as const);

export type SearchPurpose = "search" | "question_answering";
export type SearchChunkKind = "title" | "body" | "property";
export type SearchChunkMetadata = {
  headingPath: string[];
  blocks?: Array<{ blockIndex: number; start: number; end: number; blockId?: string }>;
  blockId?: string;
  blockIndex?: number;
  start?: number;
  end?: number;
  propertyId?: string;
  definitionRevision?: string;
  valueRevision?: string;
};
export type PreparedSearchChunk = {
  kind: SearchChunkKind;
  sourceKey: string;
  index: number;
  markdown: string;
  input: string;
  inputHash: string;
  byteCount: number;
  metadata: SearchChunkMetadata;
};
export type EmbeddingResult = { embeddings: number[][]; inputTokens?: number };
export interface SearchEmbeddingProvider {
  embedDocuments(inputs: readonly string[], signal?: AbortSignal): Promise<EmbeddingResult>;
  embedQuery(query: string, purpose: SearchPurpose, signal?: AbortSignal): Promise<EmbeddingResult>;
}

export function documentEmbeddingInput(title: string, text: string) {
  return `title: ${title.trim() || "none"} | text: ${text}`;
}
export function queryEmbeddingInput(query: string, purpose: SearchPurpose) {
  return `task: ${purpose === "question_answering" ? "question answering" : "search result"} | query: ${query.trim()}`;
}
