import { describe, expect, it } from "vitest";
import { documentEmbeddingInput, queryEmbeddingInput, SEARCH_PROFILE } from "./vector-contracts";
import { fakeSearchProvider, searchFixturePages } from "./testing/fixtures";

describe("search embedding contract", () => {
  it("fixes one immutable embedding space", () => {
    expect(SEARCH_PROFILE.dimensions).toBe(1536);
    expect(SEARCH_PROFILE.model).toBe("gemini-embedding-2");
    expect(Object.isFrozen(SEARCH_PROFILE)).toBe(true);
  });
  it("has a semantic fixture independent of lexical overlap", async () => {
    const provider = fakeSearchProvider((input) =>
      /credential|authentication/i.test(input) ? 0 : 1,
    );
    const doc = await provider.embedDocuments([searchFixturePages[0].text]);
    const query = await provider.embedQuery("authentication", "search");
    expect(doc.embeddings).toEqual(query.embeddings);
    expect(searchFixturePages[0].text).not.toContain("authentication");
  });
  it("keeps query purposes and document input distinct", () => {
    expect(documentEmbeddingInput("", "Body")).toBe("title: none | text: Body");
    expect(queryEmbeddingInput(" API Auth ", "search")).toBe(
      "task: search result | query: API Auth",
    );
    expect(queryEmbeddingInput("API Auth", "question_answering")).toContain("question answering");
  });
});
