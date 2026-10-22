import { describe, expect, it, vi } from "vitest";
import { createGeminiEmbeddingProvider, validateSearchVector } from "./gemini";
import { fixtureEmbedding } from "./testing/fixtures";

describe("Gemini Embedding 2 transport", () => {
  it("uses the current model, explicit dimensions, and no truncation", async () => {
    const request = vi.fn().mockResolvedValue(
      Response.json({
        embedding: { values: fixtureEmbedding(0) },
        usageMetadata: { promptTokenCount: 7 },
      }),
    );
    const result = await createGeminiEmbeddingProvider("test-secret", request).embedQuery(
      "API Auth",
      "search",
    );
    expect(result.inputTokens).toBe(7);
    const [url, options] = request.mock.calls[0];
    expect(url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent",
    );
    expect(options.headers["x-goog-api-key"]).toBe("test-secret");
    expect(JSON.parse(options.body)).toEqual({
      model: "models/gemini-embedding-2",
      content: { parts: [{ text: "task: search result | query: API Auth" }] },
      embedContentConfig: { outputDimensionality: 1536, autoTruncate: false },
    });
  });
  it("sends independent batch entries in matching order", async () => {
    const request = vi.fn().mockResolvedValue(
      Response.json({
        embeddings: [{ values: fixtureEmbedding(0) }, { values: fixtureEmbedding(1) }],
      }),
    );
    const result = await createGeminiEmbeddingProvider("test", request).embedDocuments([
      "title: A | text: first",
      "title: B | text: second",
    ]);
    expect(request.mock.calls[0][0]).toContain(":batchEmbedContents");
    expect(
      JSON.parse(request.mock.calls[0][1].body).requests.map(
        (x: { content: { parts: unknown[] } }) => x.content.parts,
      ),
    ).toHaveLength(2);
    expect(result.embeddings).toEqual([fixtureEmbedding(0), fixtureEmbedding(1)]);
  });
  it("uses a different query instruction for question answering", async () => {
    const request = vi
      .fn()
      .mockResolvedValue(Response.json({ embedding: { values: fixtureEmbedding(0) } }));
    await createGeminiEmbeddingProvider("test", request).embedQuery("Why?", "question_answering");
    expect(JSON.parse(request.mock.calls[0][1].body).content.parts[0].text).toContain(
      "task: question answering",
    );
  });
  it.each([401, 403, 400, 408, 429, 500, 503])(
    "classifies HTTP %s without leaking response content",
    async (status) => {
      const request = vi
        .fn()
        .mockResolvedValue(
          new Response("private provider payload", { status, headers: { "retry-after": "2" } }),
        );
      try {
        await createGeminiEmbeddingProvider("private-key", request).embedDocuments([
          "private text",
        ]);
        throw new Error("expected failure");
      } catch (error) {
        expect(String(error)).not.toMatch(/private/);
        expect(error).toMatchObject({ retryable: [408, 429, 500, 503].includes(status) });
        if (status === 429) expect(error).toMatchObject({ retryAfterMs: 2000 });
      }
    },
  );
  it("rejects incorrect counts and malformed vectors", async () => {
    const request = vi
      .fn()
      .mockResolvedValue(Response.json({ embeddings: [{ values: fixtureEmbedding(0) }] }));
    await expect(
      createGeminiEmbeddingProvider("test", request).embedDocuments(["a", "b"]),
    ).rejects.toThrow("RESPONSE_INVALID");
    for (const value of [
      [],
      Array(1536).fill(0),
      [...fixtureEmbedding(0).slice(0, -1), NaN],
      [...fixtureEmbedding(0).slice(0, -1), Infinity],
    ])
      expect(() => validateSearchVector(value)).toThrow("VECTOR_INVALID");
  });
  it("classifies its own timeout separately from caller cancellation", async () => {
    const timeout = new AbortController();
    const clock = vi.spyOn(AbortSignal, "timeout").mockReturnValue(timeout.signal);
    try {
      const request: typeof fetch = async (_url, options) =>
        new Promise((_resolve, reject) => {
          options!.signal!.addEventListener(
            "abort",
            () => reject(new Error("private network error")),
            { once: true },
          );
        });
      const pending = createGeminiEmbeddingProvider("test", request).embedQuery("test", "search");
      const assertion = expect(pending).rejects.toMatchObject({
        code: "SEARCH_PROVIDER_TIMEOUT",
        retryable: true,
      });
      timeout.abort();
      await assertion;
    } finally {
      clock.mockRestore();
    }
  });
  it("bounds requests before HTTP and propagates cancellation", async () => {
    const request = vi.fn().mockRejectedValue(new Error("sensitive network detail"));
    const provider = createGeminiEmbeddingProvider("test", request);
    await expect(provider.embedDocuments(["x".repeat(4097)])).rejects.toThrow("INPUT_INVALID");
    expect(request).not.toHaveBeenCalled();
    const controller = new AbortController();
    controller.abort();
    await expect(provider.embedDocuments(["text"], controller.signal)).rejects.toMatchObject({
      code: "SEARCH_PROVIDER_ABORTED",
      retryable: false,
    });
  });
});
