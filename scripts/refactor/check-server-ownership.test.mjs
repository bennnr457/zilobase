import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { checkServerOwnership } from "./check-server-ownership.mjs";

function fixture(files, check) {
  const root = mkdtempSync(join(tmpdir(), "server-ownership-"));
  try {
    for (const [name, source] of Object.entries(files)) {
      const file = join(root, "apps/server/src", name);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, source);
    }
    check(checkServerOwnership(root));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("rejects service HTTP dependencies, route queries, infrastructure inversion, and forwarding modules", () => {
  fixture(
    {
      "routes/pages/routes.ts":
        'import { db } from "../../infrastructure/database/client"; export const handler = () => db;',
      "infrastructure/database/client.ts":
        'import { operation } from "../../services/pages/operation"; export const db = operation;',
      "services/pages/operation.ts":
        'import type { Context } from "hono"; import { handler } from "../../routes/pages/routes"; export const operation = () => handler;',
      "services/pages/index.ts": 'export { operation } from "./operation";',
    },
    (errors) => {
      assert(errors.some((error) => error.includes("services must not depend on HTTP")));
      assert(errors.some((error) => error.includes("routes must call services")));
      assert(errors.some((error) => error.includes("infrastructure must not depend")));
      assert(errors.some((error) => error.includes("forwarding-only")));
      assert(errors.some((error) => error.includes("cross-layer runtime cycle")));
    },
  );
});

test("shared support allows type-only extension contracts but rejects runtime domain imports", () => {
  fixture(
    {
      "shared/contracts/edition.ts":
        'import type { Hono } from "hono"; import type { Domain } from "../../services/pages/operation"; export type Extension = {app: Hono; domain: Domain};',
      "shared/bad.ts":
        'import { operation } from "../services/pages/operation"; export const helper = operation;',
      "services/pages/operation.ts":
        "export type Domain = string; export const operation = () => 1;",
    },
    (errors) => {
      assert.equal(errors.length, 1);
      assert.match(errors[0], /shared runtime support/);
    },
  );
});

test("checks dynamic imports and provider dependencies and ignores test files", () => {
  fixture(
    {
      "services/pages/operation.ts":
        'export const operation = () => import("../../routes/pages/routes");',
      "routes/pages/routes.ts": "export const handler = () => 1;",
      "services/pages/provider.ts":
        'import { runtime } from "@zilobase/runtime-adapter/worker"; export const provider = runtime;',
      "services/pages/operation.test.ts":
        'import { Hono } from "hono"; export const app = new Hono();',
    },
    (errors) => {
      assert.equal(errors.length, 2);
      assert(errors.some((error) => error.includes("HTTP adapters")));
      assert(errors.some((error) => error.includes("runtime capabilities")));
    },
  );
});

test("allows a domain route/service/infrastructure flow and the supported schema export surface", () => {
  fixture(
    {
      "routes/pages/routes.ts":
        'import { operation } from "../../services/pages/operation"; export const handler = () => operation();',
      "services/pages/operation.ts":
        'import { db } from "../../infrastructure/database/client"; export const operation = () => db;',
      "infrastructure/database/client.ts": "export const db = 1;",
      "infrastructure/database/schema.ts": 'export { db } from "./client";',
      "public/adapter-api.ts": 'export { operation } from "../services/pages/operation";',
    },
    (errors) => assert.deepEqual(errors, []),
  );
});

test("resolves directory imports to their index before checking database ownership", () => {
  fixture(
    {
      "routes/pages/routes.ts":
        'import { db } from "../../infrastructure/database"; export const handler = () => db;',
      "infrastructure/database/index.ts": "export const db = 1;",
    },
    (errors) => {
      assert.equal(errors.length, 1);
      assert.match(errors[0], /routes must call services/);
    },
  );
});
