import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import type { ApiFetcher } from "../shared/api-fetcher";
import type { ZilobaseAuthClient } from "../shared/auth-client";
import { createZilobaseClient } from "../shared/client";
import { ZilobaseFeaturesProvider } from "../shared/context";
import { clientDatabaseController } from "../shared/operation-context";
import { getDatabaseBootstrap, updateDatabase } from "./index";
import { createTestDatabasePayload, setTestDatabaseClientState } from "./mutations/test-helpers";
import { useDatabaseMetadata } from "./react";

test("imperative database updates publish into the existing React consumer's collections", async () => {
  const apiFetch: ApiFetcher = async <T>(_path: string, init?: RequestInit) => {
    const { commandId } = JSON.parse(String(init?.body));
    const database = {
      ...clientDatabaseController(context).bootstrap("database-1")!.database,
      name: "Updated outside React",
      version: 1,
    };
    return {
      commandId,
      event: {
        actorId: "account",
        areas: ["databases"],
        changes: { databases: [database] },
        commandId,
        committedAt: "2026-10-19T00:00:00Z",
        databaseId: "database-1",
        dataSourceId: null,
        eventId: commandId,
        protocolVersion: 2,
        type: "database.mutation",
        version: 1,
      },
      sourceVersions: {},
      result: database,
    } as T;
  };
  const runtime = createZilobaseClient({ deployment: "server", apiFetch });
  const context = { queryClient: runtime.queryClient, apiFetch };
  runtime.queryClient.setQueryData(["session"], {
    user: { id: "account" },
    session: { id: "test-session" },
  });
  setTestDatabaseClientState(runtime.queryClient, createTestDatabasePayload());
  try {
    const result = await updateDatabase(context, {
      databaseId: "database-1",
      name: "Updated outside React",
    });
    assert.equal(result.name, "Updated outside React");
    assert.equal(
      (await getDatabaseBootstrap(context, { databaseId: "database-1" }))?.database.name,
      result.name,
    );
    let observed: string | undefined;
    function Consumer() {
      observed = useDatabaseMetadata("database-1").data?.database.name;
      return null;
    }
    renderToString(
      createElement(
        ZilobaseFeaturesProvider,
        { value: { ...context, deployment: "server", auth: {} as ZilobaseAuthClient } },
        createElement(Consumer),
      ),
    );
    assert.equal(observed, result.name);
  } finally {
    runtime.dispose();
  }
});
