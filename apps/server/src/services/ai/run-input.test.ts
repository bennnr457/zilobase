import { expect, test } from "vitest";
import { openRunInput, sealRunInput } from "./run-input";
const env = { AI_RUN_PAYLOAD_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64") };
test("queued input is authenticated to its run and rejects the wrong key or identity", () => {
  const input = {
    messages: [{ role: "user" as const, content: "unsynced secret" }],
    maxOutputTokens: 100,
  };
  const sealed = sealRunInput(env, "run", input);
  expect(sealed).not.toContain("unsynced secret");
  expect(openRunInput(env, "run", sealed)).toEqual(input);
  expect(() => openRunInput(env, "other", sealed)).toThrow();
  expect(() =>
    openRunInput(
      { AI_RUN_PAYLOAD_ENCRYPTION_KEY: Buffer.alloc(32, 8).toString("base64") },
      "run",
      sealed,
    ),
  ).toThrow();
  expect(() => sealRunInput({}, "run", input)).toThrow(/ENCRYPTION_KEY/);
});
