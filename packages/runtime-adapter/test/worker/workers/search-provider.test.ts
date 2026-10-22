import { expect, it } from "vitest";
import { createGeminiEmbeddingProvider } from "../../../../../apps/server/src/services/search/gemini";
import { chunkPageMarkdown } from "../../../../../apps/server/src/services/search/chunking";

it("runs Markdown chunking and independent Gemini embedding requests in workerd", async () => {
  const chunks = chunkPageMarkdown("Guide", {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "Credentials expire." }] }],
  });
  const vector = Array.from({ length: 1536 }, (_, i) => (i === 0 ? 1 : 0));
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const provider = createGeminiEmbeddingProvider("fixture-key", async (url, init) => {
    const body = JSON.parse(String(init?.body));
    calls.push({ url: String(url), body });
    return Response.json(
      body.requests
        ? { embeddings: body.requests.map(() => ({ values: vector })) }
        : { embedding: { values: vector } },
    );
  });
  const documents = await provider.embedDocuments(chunks.map((c) => c.input));
  const query = await provider.embedQuery("Why authenticate again?", "question_answering");
  expect(documents.embeddings).toHaveLength(2);
  expect(query.embeddings[0]).toHaveLength(1536);
  expect(calls[0].url).toContain(":batchEmbedContents");
  expect(calls[1].url).toContain(":embedContent");
  expect(JSON.stringify(calls[1].body)).toContain("question answering");
});
