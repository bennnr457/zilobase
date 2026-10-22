import { createServer } from "node:http";
// Deterministic semantic fixture, deliberately independent of lexical matching.
export function fixtureVector(text: string) {
  const v = Array(1536).fill(0);
  v[0] = 0.001;
  const groups = [
    /orbit|cosmos|satellite|celestial|astronaut|planet/i,
    /ocean|\bsea\b|marine|submarine|coral|aquatic/i,
    /invoice|payment|billing|receipt|money|refund/i,
  ];
  const group = groups.findIndex((pattern) => pattern.test(text));
  v[group < 0 ? 4 : group + 1] = 1;
  return v;
}
export async function startEmbeddingFixture() {
  const state = { calls: 0, documents: 0, queries: 0, holdAt: 0, held: 0, delayMs: 0 };
  const releases = new Set<() => void>();
  const server = createServer(async (req, res) => {
    const parts = [];
    for await (const part of req) parts.push(part);
    const body = JSON.parse(Buffer.concat(parts).toString());
    const inputs = (body.requests ?? [body]).map((x) =>
      x.content.parts.map((p) => p.text ?? "").join(""),
    );
    state.calls++;
    if (inputs[0].startsWith("task:")) state.queries++;
    else state.documents++;
    if (state.holdAt === state.calls) {
      state.held = state.calls;
      await new Promise<void>((resolve) => {
        releases.add(resolve);
        res.once("close", resolve);
      });
    }
    if (state.delayMs) await new Promise((resolve) => setTimeout(resolve, state.delayMs));
    if (res.destroyed) return;
    const embeddings = inputs.map((text) => ({ values: fixtureVector(text) }));
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        ...(body.requests ? { embeddings } : { embedding: embeddings[0] }),
        usageMetadata: { promptTokenCount: inputs.length * 10 },
      }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    state,
    origin: `http://127.0.0.1:${server.address().port}`,
    release: () => {
      state.holdAt = 0;
      for (const resolve of releases) resolve();
      releases.clear();
    },
    close: async () => {
      for (const resolve of releases) resolve();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
