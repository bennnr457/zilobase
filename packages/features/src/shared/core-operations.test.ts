import assert from "node:assert/strict";
import test from "node:test";
import { createDatabaseAutomation } from "../automations/index";
import { defaultCalendarPreferences, saveCalendarPreferences } from "../calendar/index";
import { calendarPreferencesQueryOptions } from "../calendar/queries";
import { addTeamspacePrincipal } from "../teamspaces/index";
import { teamspacePrincipalsQueryKey } from "../teamspaces/queries";
import { updateUserSettings } from "../user-settings/index";
import { defaultUserSettings, userSettingsQueryKey } from "../user-settings/queries";
import { createWorkspace } from "../workspaces/index";
import type { ApiFetcher } from "./api-fetcher";
import type { ZilobaseAuthClient } from "./auth-client";
import { createZilobaseClient } from "./client";
import { ExpiredClientOperationError } from "./operation-context";

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
function setup(apiFetch: ApiFetcher) {
  const runtime = createZilobaseClient({ deployment: "server", apiFetch });
  runtime.queryClient.setQueryData(["session"], {
    user: { id: "a" },
    session: { id: "a-session" },
  });
  return { ...runtime, context: { apiFetch, queryClient: runtime.queryClient } };
}

test("imperative teamspace principal writes use the existing request and invalidate shared queries once", async () => {
  const calls: Array<{ path: string; input?: RequestInit }> = [];
  const runtime = setup(async <T>(path: string, input?: RequestInit) => {
    calls.push({ path, input });
    return { ok: true } as T;
  });
  const key = teamspacePrincipalsQueryKey("workspace", "teamspace");
  runtime.queryClient.setQueryData(key, { version: 1 });
  let invalidations = 0;
  const unsubscribe = runtime.queryClient.getQueryCache().subscribe((event) => {
    if (event.type === "updated" && event.action.type === "invalidate") invalidations++;
  });
  try {
    await addTeamspacePrincipal(runtime.context, {
      workspaceId: "workspace",
      teamspaceId: "teamspace",
      role: "member",
      userId: "other",
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.path, "/workspaces/workspace/teamspaces/teamspace/principals");
    assert.equal(calls[0]!.input?.method, "POST");
    assert.equal(JSON.parse(String(calls[0]!.input?.body)).userId, "other");
    assert.equal(invalidations, 1);
    assert.equal(runtime.queryClient.getQueryState(key)?.isInvalidated, true);
  } finally {
    unsubscribe();
    runtime.dispose();
  }
});

test("an older settings failure cannot roll back a newer optimistic edit", async () => {
  const requests = [deferred<unknown>(), deferred<unknown>()];
  let n = 0;
  const runtime = setup(<T>() => requests[n++]!.promise as Promise<T>);
  try {
    runtime.queryClient.setQueryData(userSettingsQueryKey, defaultUserSettings);
    const first = updateUserSettings(runtime.context, { pageFullWidth: true });
    const firstFailure = assert.rejects(first, /first failed/);
    await flush();
    const second = updateUserSettings(runtime.context, { embeddedItemsOpenAs: "sidepanel" });
    await flush();
    requests[0]!.reject(new Error("first failed"));
    await firstFailure;
    assert.equal(
      runtime.queryClient.getQueryData<typeof defaultUserSettings>(userSettingsQueryKey)
        ?.embeddedItemsOpenAs,
      "sidepanel",
    );
    const settings = {
      ...defaultUserSettings,
      pageFullWidth: true,
      embeddedItemsOpenAs: "sidepanel" as const,
    };
    requests[1]!.resolve({ settings });
    await second;
    assert.deepEqual(runtime.queryClient.getQueryData(userSettingsQueryKey), settings);
  } finally {
    runtime.dispose();
  }
});

for (const outcome of ["resolve", "reject"] as const)
  test(`late settings ${outcome} leaves the next account untouched`, async () => {
    const request = deferred<unknown>();
    const runtime = setup(<T>() => request.promise as Promise<T>);
    try {
      runtime.queryClient.setQueryData(userSettingsQueryKey, defaultUserSettings);
      const pending = updateUserSettings(runtime.context, { pageFullWidth: true });
      const rejected = assert.rejects(
        pending,
        outcome === "resolve" ? ExpiredClientOperationError : /request failed/,
      );
      await flush();
      runtime.queryClient.setQueryData(["session"], {
        user: { id: "b" },
        session: { id: "b-session" },
      });
      const settings = { ...defaultUserSettings, embeddedItemsOpenAs: "sidepanel" as const };
      runtime.queryClient.setQueryData(userSettingsQueryKey, settings);
      if (outcome === "resolve") request.resolve({ settings: defaultUserSettings });
      else request.reject(new Error("request failed"));
      await rejected;
      assert.deepEqual(runtime.queryClient.getQueryData(userSettingsQueryKey), settings);
    } finally {
      runtime.dispose();
    }
  });

test("late auth-port results cannot activate an old account's newly created workspace", async () => {
  const request = deferred<unknown>();
  let activations = 0;
  const runtime = setup(async () => {
    throw new Error("unexpected HTTP request");
  });
  const auth = {
    createWorkspace: () => request.promise,
    setActiveWorkspace: async () => {
      activations++;
    },
  } as unknown as ZilobaseAuthClient;
  try {
    const pending = createWorkspace({ ...runtime.context, auth }, "Workspace");
    const rejected = assert.rejects(pending, ExpiredClientOperationError);
    await flush();
    runtime.queryClient.setQueryData(["session"], {
      user: { id: "b" },
      session: { id: "b-session" },
    });
    request.resolve({ id: "new-workspace" });
    await rejected;
    assert.equal(activations, 0);
  } finally {
    runtime.dispose();
  }
});

test("imperative calendar preferences publish to the same query used by hooks", async () => {
  const runtime = setup(
    async <T>(_path: string, init?: RequestInit) => JSON.parse(String(init?.body)) as T,
  );
  try {
    const preferences = { ...defaultCalendarPreferences(), showWeekends: false };
    await saveCalendarPreferences(runtime.context, { workspaceId: "workspace", preferences });
    assert.deepEqual(
      runtime.queryClient.getQueryData(
        calendarPreferencesQueryOptions(runtime.context.apiFetch, "workspace").queryKey,
      ),
      preferences,
    );
  } finally {
    runtime.dispose();
  }
});

test("automation creation preserves the matching receipt key and publishes its detail", async () => {
  let body: Record<string, unknown> | undefined,
    header: string | null = null;
  const runtime = setup(async <T>(_path: string, init?: RequestInit) => {
    body = JSON.parse(String(init?.body));
    header = new Headers(init?.headers).get("Idempotency-Key");
    return { id: "automation", name: "Example" } as T;
  });
  try {
    await createDatabaseAutomation(runtime.context, {
      databaseId: "database",
      dataSourceId: "source",
      name: "Example",
      definition: {
        definitionVersion: 1,
        scope: { type: "data_source" },
        timezone: "UTC",
        trigger: { kind: "event", match: "any", clauses: [{ id: "added", type: "page_added" }] },
        actions: [],
      },
    });
    assert.ok(header);
    assert.equal(header, body?.idempotencyKey);
    assert.equal(body?.dataSourceId, "source");
  } finally {
    runtime.dispose();
  }
});

test("login refresh publishes its own identity transition without expiring the successful operation", async () => {
  const { QueryObserver } = await import("@tanstack/react-query");
  const { signInWithPassword, sessionQueryOptions } = await import("../auth/index");
  const runtime = createZilobaseClient({ deployment: "test" });
  runtime.queryClient.setDefaultOptions({ queries: { retry: false, gcTime: Infinity } });
  let signedIn = false;
  const signedInSession = { user: { id: "signed-in" }, session: { id: "signed-in-session" } };
  const auth = {
    getSession: async () => (signedIn ? signedInSession : { user: null, session: null }),
    signInWithPassword: async () => {
      signedIn = true;
      return { user: signedInSession.user };
    },
  } as unknown as ZilobaseAuthClient;
  const options = sessionQueryOptions(auth);
  const observer = new QueryObserver(runtime.queryClient, options);
  const unsubscribe = observer.subscribe(() => {});
  try {
    await runtime.queryClient.fetchQuery(options);
    await signInWithPassword(
      {
        queryClient: runtime.queryClient,
        apiFetch: async () => {
          throw new Error("Unexpected API request");
        },
        auth,
      },
      { email: "a@example.test", password: "password" },
    );
    assert.equal(observer.getCurrentResult().data?.user?.id, "signed-in");
    await runtime.queryClient.invalidateQueries({ queryKey: ["session"] });
    assert.equal(observer.getCurrentResult().status, "success");
    assert.equal(observer.getCurrentResult().data?.user?.id, "signed-in");
  } finally {
    unsubscribe();
    runtime.dispose();
  }
});
