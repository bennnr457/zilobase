import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { checkRuntimeBoundaries } from "./check-runtime-ports.mjs";

test("domain boundary rejects runtime providers and ambient adapters", async () => {
  const root = await mkdtemp(join(tmpdir(), "runtime-ports-boundary-"));
  try {
    await mkdir(join(root, "apps/server/src/services/example"), { recursive: true });
    await mkdir(join(root, "apps/server/src/infrastructure/runtime"), { recursive: true });
    await mkdir(join(root, "packages/features/src/example"), { recursive: true });
    await mkdir(join(root, "packages/runtime-adapter/src/example"), { recursive: true });
    await writeFile(
      join(root, "apps/server/src/services/example/bad.ts"),
      'import "@zilobase/runtime-adapter/worker"; getRuntimeAdapter();\n',
    );
    await writeFile(
      join(root, "packages/features/src/example/good.ts"),
      'export const publish = (ports, value) => ports.fanout.publish("x", value);\n',
    );
    await writeFile(
      join(root, "packages/runtime-adapter/src/example/bad.ts"),
      "setRuntimePorts({}); type OptionalBus = NodeRealtimeBus | null;\n",
    );
    await writeFile(
      join(root, "apps/server/src/infrastructure/runtime/runtime-adapter.ts"),
      'export * from "@zilobase/runtime-adapter";\n',
    );
    assert.deepEqual(checkRuntimeBoundaries(root), [
      "apps/server/src/services/example/bad.ts: ambient runtime adapter",
      "apps/server/src/services/example/bad.ts: Worker runtime provider import",
      "packages/runtime-adapter/src/example/bad.ts: ambient runtime port setter",
      "packages/runtime-adapter/src/example/bad.ts: nullable Node realtime bus",
      "apps/server/src/infrastructure/runtime/runtime-adapter.ts: retired runtime compatibility shim",
    ]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("application source ownership rejects retired folders", async () => {
  const root = await mkdtemp(join(tmpdir(), "source-ownership-boundary-"));
  const folders = ["apps/web/src/features", "apps/web/src/shared", "apps/server/src/features"];
  try {
    for (const folder of folders) {
      await mkdir(join(root, folder), { recursive: true });
      await writeFile(join(root, folder, "misplaced.ts"), "export const value = 1;\n");
    }
    assert.deepEqual(
      checkRuntimeBoundaries(root),
      folders.map((folder) => `${folder}: retired application source folder`),
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
