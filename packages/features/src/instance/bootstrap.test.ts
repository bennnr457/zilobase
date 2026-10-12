import assert from "node:assert/strict";
import test from "node:test";
import type { ApiFetcher } from "../shared/api-fetcher";
import { bootstrapInstance } from "./bootstrap";

test("bootstrap retains token headers, normalized fields, and completion before sign-in", async () => {
  const calls: unknown[] = [];
  const apiFetch = (async (path: string, init?: RequestInit & { auth?: boolean }) => {
    calls.push("bootstrap");
    assert.equal(path, "/api/instance/bootstrap");
    assert.equal(init?.auth, false);
    assert.deepEqual(init?.headers, { "x-zilobase-bootstrap-token": "token" });
    assert.deepEqual(JSON.parse(String(init?.body)), {
      email: "owner@test.dev",
      name: "Owner",
      password: " password ",
      workspaceName: "Work",
    });
  }) as ApiFetcher;
  await bootstrapInstance(
    apiFetch,
    {
      signInWithPassword: async (input) => {
        calls.push(input);
        return { token: "t", user: {} };
      },
    },
    {
      email: " Owner@Test.Dev ",
      name: " Owner ",
      password: " password ",
      workspaceName: " Work ",
      bootstrapToken: " token ",
    },
    () => calls.push("completed"),
  );
  assert.deepEqual(calls, [
    "bootstrap",
    "completed",
    { email: "owner@test.dev", password: " password " },
  ]);
});
