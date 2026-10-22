import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { CLOUDFLARE_CELL_QUEUE_NAMES } from "../src/operations/cloudflare-queues";

const read = async (name: string) =>
  JSON.parse(
    (await readFile(new URL(`../deploy/worker/${name}.template.jsonc`, import.meta.url), "utf8"))
      .replace(/^\s*\/\/.*$/gm, "")
      .replace(/,(\s*[}\]])/g, "$1"),
  );
it("declares the complete queue inventory and bounded search consumer in community Workers", async () => {
  const api = await read("wrangler"),
    background = await read("background");
  expect(new Set(background.queues.consumers.map((c: { queue: string }) => c.queue))).toEqual(
    new Set(CLOUDFLARE_CELL_QUEUE_NAMES),
  );
  for (const config of [api, background]) {
    expect(config.queues.producers).toContainEqual({
      binding: "SEARCH_INDEXING",
      queue: "zilobase-search-indexing",
    });
    expect(config.vars.SEARCH_EMBEDDINGS_ENABLED).toBe("false");
    expect(config.secrets.required).not.toContain("GEMINI_API_KEY");
  }
  expect(
    background.queues.consumers.find(
      (c: { queue: string }) => c.queue === "zilobase-search-indexing",
    ),
  ).toMatchObject({
    max_batch_size: 1,
    max_concurrency: 4,
    max_retries: 5,
    dead_letter_queue: "zilobase-search-indexing-dlq",
  });
  expect(background.triggers.crons).toContain("* * * * *");
});
