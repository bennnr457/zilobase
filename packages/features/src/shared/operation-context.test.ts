import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import type { ApiFetcher } from "./api-fetcher";
import type { ZilobaseAuthClient } from "./auth-client";
import { createZilobaseClient } from "./client";
import { ZilobaseFeaturesProvider } from "./context";
import {
  captureClientOperation,
  clientDatabaseController,
  ExpiredClientOperationError,
} from "./operation-context";

const apiFetch: ApiFetcher = async () => {
  throw new Error("Unexpected request");
};

test("imperative and provider operations share a client/session controller", async () => {
  const runtime = createZilobaseClient({ deployment: "server", apiFetch });
  const context = { queryClient: runtime.queryClient, apiFetch };
  runtime.queryClient.setQueryData(["session"], {
    user: { id: "account" },
    session: { id: "first" },
  });
  const first = clientDatabaseController(context);
  assert.equal(first.sessionId, "first");
  renderToString(
    createElement(ZilobaseFeaturesProvider, {
      value: { ...context, deployment: "server", auth: {} as ZilobaseAuthClient },
    }),
  );
  await Promise.resolve();
  assert.equal(clientDatabaseController(context), first);
  runtime.queryClient.setQueryData(["session"], {
    user: { id: "account" },
    session: { id: "second" },
  });
  assert.notEqual(clientDatabaseController(context), first);
  await assert.rejects(
    first.execute({ databaseId: "host", command: { type: "database.archive" } }),
    /ended/,
  );
  const scope = captureClientOperation(context);
  runtime.dispose();
  assert.equal(scope.isCurrent(), false);
  assert.throws(scope.assertCurrent, ExpiredClientOperationError);
});

test("late transport success cannot reach operation reconciliation after account replacement", async () => {
  let complete!: (value: unknown) => void;
  const apiFetch: ApiFetcher = <T>() =>
    new Promise<T>((resolve) => {
      complete = resolve as typeof complete;
    });
  const runtime = createZilobaseClient({ deployment: "server", apiFetch });
  const context = { queryClient: runtime.queryClient, apiFetch };
  const captured = captureClientOperation(context);
  const pending = captured.context.apiFetch("/pages");
  runtime.queryClient.setQueryData(["session"], {
    user: { id: "other" },
    session: { id: "other-session" },
  });
  complete({ private: "old identity" });
  await assert.rejects(pending, ExpiredClientOperationError);
  runtime.dispose();
});
