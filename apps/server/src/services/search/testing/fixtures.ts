import type { SearchEmbeddingProvider } from "../vector-contracts";

/** Shared acceptance corpus. The vectors encode topics, not lexical overlap. */
export const searchFixturePages = [
  { id: "auth", title: "Access guide", text: "Credentials expire after an hour.", topic: 0 },
  { id: "travel", title: "Trip", text: "The train leaves at noon.", topic: 1 },
  {
    id: "row",
    title: "Release",
    text: "",
    topic: 2,
    property: { name: "Status", value: "Blocked" },
  },
] as const;

export function fixtureEmbedding(topic: number) {
  const vector = Array<number>(1536).fill(0);
  vector[topic] = 1;
  return vector;
}

export function fakeSearchProvider(topic: (input: string) => number): SearchEmbeddingProvider {
  const embed = async (inputs: readonly string[]) => ({
    embeddings: inputs.map((input) => fixtureEmbedding(topic(input))),
    inputTokens: inputs.reduce((sum, input) => sum + input.length, 0),
  });
  return {
    embedDocuments: embed,
    embedQuery: (query) => embed([query]),
  };
}
