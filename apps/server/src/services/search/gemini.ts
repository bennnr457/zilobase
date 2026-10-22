import { byteLength } from "./chunking";
import {
  queryEmbeddingInput,
  SEARCH_PROFILE,
  type EmbeddingResult,
  type SearchEmbeddingProvider,
  type SearchPurpose,
} from "./vector-contracts";

export class SearchEmbeddingError extends Error {
  constructor(
    public readonly code: string,
    public readonly retryable: boolean,
    public readonly retryAfterMs?: number,
  ) {
    super(code);
    this.name = "SearchEmbeddingError";
  }
}

export function validateSearchVector(value: unknown): number[] {
  if (
    !Array.isArray(value) ||
    value.length !== SEARCH_PROFILE.dimensions ||
    value.some((x) => typeof x !== "number" || !Number.isFinite(x))
  )
    throw new SearchEmbeddingError("SEARCH_PROVIDER_VECTOR_INVALID", false);
  let norm = 0;
  for (const x of value) norm += x * x;
  if (!Number.isFinite(norm) || norm <= 0)
    throw new SearchEmbeddingError("SEARCH_PROVIDER_VECTOR_INVALID", false);
  // Cosine is magnitude-independent; normalization makes stored values predictable.
  return value.map((x) => x / Math.sqrt(norm));
}

export function createGeminiEmbeddingProvider(
  apiKey: string,
  request: typeof fetch = fetch,
): SearchEmbeddingProvider {
  if (!apiKey.trim()) throw new SearchEmbeddingError("SEARCH_PROVIDER_NOT_CONFIGURED", false);
  async function call(
    inputs: readonly string[],
    timeout: number,
    signal?: AbortSignal,
  ): Promise<EmbeddingResult> {
    if (
      !inputs.length ||
      inputs.length > 16 ||
      inputs.some((x) => !x.trim() || byteLength(x) > SEARCH_PROFILE.maxInputBytes)
    )
      throw new SearchEmbeddingError("SEARCH_EMBEDDING_INPUT_INVALID", false);
    const content = (text: string) => ({
      model: `models/${SEARCH_PROFILE.model}`,
      content: { parts: [{ text }] },
      embedContentConfig: { outputDimensionality: SEARCH_PROFILE.dimensions, autoTruncate: false },
    });
    const batch = inputs.length > 1;
    let response: Response;
    try {
      response = await request(
        `https://generativelanguage.googleapis.com/v1beta/models/${SEARCH_PROFILE.model}:${batch ? "batchEmbedContents" : "embedContent"}`,
        {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify(batch ? { requests: inputs.map(content) } : content(inputs[0])),
          signal: signal
            ? AbortSignal.any([signal, AbortSignal.timeout(timeout)])
            : AbortSignal.timeout(timeout),
        },
      );
    } catch {
      throw new SearchEmbeddingError(
        signal?.aborted ? "SEARCH_PROVIDER_ABORTED" : "SEARCH_PROVIDER_UNAVAILABLE",
        !signal?.aborted,
      );
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      if (response.status === 429) {
        const value = response.headers.get("retry-after");
        const delay =
          value && /^\d+(\.\d+)?$/.test(value)
            ? Number(value) * 1000
            : value
              ? Date.parse(value) - Date.now()
              : 60000;
        throw new SearchEmbeddingError(
          "SEARCH_PROVIDER_RATE_LIMIT",
          true,
          Math.max(1000, Math.min(43200000, Number.isFinite(delay) ? delay : 60000)),
        );
      }
      throw new SearchEmbeddingError(
        response.status === 401 || response.status === 403
          ? "SEARCH_PROVIDER_AUTH"
          : response.status >= 500
            ? "SEARCH_PROVIDER_UNAVAILABLE"
            : "SEARCH_PROVIDER_REQUEST_INVALID",
        response.status >= 500 || response.status === 408,
      );
    }
    let body: {
      embedding?: { values?: unknown };
      embeddings?: Array<{ values?: unknown }>;
      usageMetadata?: { promptTokenCount?: number };
    };
    try {
      body = (await response.json()) as typeof body;
    } catch {
      throw new SearchEmbeddingError("SEARCH_PROVIDER_RESPONSE_INVALID", false);
    }
    const embeddings = batch ? body.embeddings : body.embedding ? [body.embedding] : undefined;
    if (!Array.isArray(embeddings) || embeddings.length !== inputs.length)
      throw new SearchEmbeddingError("SEARCH_PROVIDER_RESPONSE_INVALID", false);
    const usage = body.usageMetadata?.promptTokenCount;
    return {
      embeddings: embeddings.map((item) => validateSearchVector(item?.values)),
      ...(Number.isSafeInteger(usage) && usage! >= 0 ? { inputTokens: usage } : {}),
    };
  }
  return {
    embedDocuments: (inputs, signal) => call(inputs, 20000, signal),
    embedQuery: (query: string, purpose: SearchPurpose, signal) =>
      call([queryEmbeddingInput(query, purpose)], 1800, signal),
  };
}
