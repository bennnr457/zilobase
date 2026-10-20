import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient } from "@tanstack/react-query";
import {
  ZilobaseFeaturesProvider,
  initializeZilobaseClient,
  type ZilobaseFeaturesConfig,
} from "@zilobase/features";
import {
  useAddDatabaseView,
  useDatabaseBootstrap,
  useDatabaseCreationFailed,
} from "@zilobase/features/databases/react";
import { useDatabaseViewData } from "../../../packages/features/src/databases/queries/view-data";
import {
  createTestDatabasePayload,
  setTestDatabaseClientState,
} from "../../../packages/features/src/databases/mutations/test-helpers";
import { databaseBootstrapQueryKey } from "../../../packages/features/src/databases/queries/keys";
import {
  resolveDatabaseBootstrap,
  resolveRecordWindow,
} from "../../../packages/features/src/databases/cache-references";
import type {
  DatabaseBootstrapResponse,
  DatabaseCommandRequest,
} from "@zilobase/features/databases";
import { useEditorResourceActions } from "@/sections/pages/editor/commands/hooks/use-editor-actions";
import { ShortcutProvider } from "@/app/shortcuts/shortcut-provider";
import { PageEditorRegistryProvider } from "@/sections/pages/editor/runtime/components/page-editor-registry";

const client = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
});
const session = {
  user: { id: "actor" },
  session: { id: "test-session", userId: "actor", expiresAt: "2099-01-01" },
};
client.setQueryData(["session"], session);
initializeZilobaseClient(client, "creation-proof");
setTestDatabaseClientState(client, createTestDatabasePayload());
const bootstrap = resolveDatabaseBootstrap(
  client,
  client.getQueryData(databaseBootstrapQueryKey("test-session", { databaseId: "database-1" })),
)!;
const windowReference = client.getQueriesData<{ pages: unknown[] }>({
  queryKey: ["db", "test-session", "database-1", "window"],
})[0]?.[1]?.pages[0];
const initialWindow = resolveRecordWindow(client, windowReference)!;
const confirmed = new Map<string, DatabaseBootstrapResponse>([["database-1", bootstrap]]);
const requests: string[] = [];
const pending: Array<{ finish: () => void; reject: (error: Error) => void }> = [];
let version = 0;
const apiFetch = (async (path: string, init?: RequestInit) => {
  requests.push(path);
  if (path.endsWith("/commands")) {
    const request = JSON.parse(String(init?.body)) as DatabaseCommandRequest;
    return new Promise((resolve, reject) => {
      pending.push({
        reject,
        finish: () => {
          const command = request.command;
          let databaseId: string, result: unknown, changes: object;
          if (command.type === "database.create") {
            databaseId = request.commandId;
            const creation: DatabaseBootstrapResponse = {
              database: {
                ...bootstrap.database,
                id: databaseId,
                name: command.name,
                version: 1,
                pageId: command.pageId ?? null,
              },
              dataSources: [],
              properties: [],
              views: [],
            };
            confirmed.set(databaseId, creation);
            result = { database: creation.database, activeDataSource: null, navDelta: {} };
            changes = { databases: [creation.database] };
          } else if (command.type === "view.create") {
            databaseId = "database-1";
            const view = {
              ...bootstrap.views[0],
              id: command.viewId!,
              databaseId,
              dataSourceId: command.dataSourceId,
              name: command.name,
              type: command.viewType,
              config: command.config,
              position: confirmed.get(databaseId)!.views.length,
            };
            const current = confirmed.get(databaseId)!;
            confirmed.set(databaseId, {
              ...current,
              database: { ...current.database, version: version + 1 },
              views: [...current.views, view],
            });
            changes = { views: [view] };
            result = view;
          } else throw Error(`Unexpected command: ${command.type}`);
          version++;
          resolve({
            commandId: request.commandId,
            result,
            sourceVersions: {},
            event: {
              actorId: "actor",
              areas: [command.type === "database.create" ? "databases" : "views"],
              changes,
              commandId: request.commandId,
              committedAt: new Date().toISOString(),
              databaseId,
              dataSourceId: null,
              eventId: request.commandId,
              protocolVersion: 2,
              type: "database.mutation",
              version,
            },
          });
        },
      });
    });
  }
  const hostId = path.match(/^\/databases\/([^/]+)\/bootstrap/)?.[1];
  if (hostId && confirmed.has(hostId)) return confirmed.get(hostId);
  if (path.includes("/records"))
    return {
      ...initialWindow,
      queryHash: new URL(path, "http://proof").searchParams.get("expectedQueryHash"),
      databaseVersion: confirmed.get("database-1")!.database.version,
    };
  throw Error(`Unexpected read: ${path}`);
}) as ZilobaseFeaturesConfig["apiFetch"];
Object.assign(window, {
  creationProof: {
    requests,
    finish: () => pending.shift()?.finish(),
    reject: () =>
      pending.shift()?.reject(Object.assign(Error("Creation rejected"), { status: 403 })),
    pending: () => pending.length,
  },
});

function CreatedDatabase({ id, onRemove }: { id: string; onRemove: () => void }) {
  const state = useDatabaseBootstrap({ databaseId: id });
  const failed = useDatabaseCreationFailed(id);
  useEffect(() => {
    if (failed) onRemove();
  }, [failed, onRemove]);
  return (
    <section data-testid="created-database" data-status={state.status}>
      <h2>{state.data?.database.name}</h2>
      <p>Database setup</p>
    </section>
  );
}
function Proof() {
  const { createEditorDatabase } = useEditorResourceActions("org-1", "page-root");
  const addView = useAddDatabaseView();
  const state = useDatabaseBootstrap({ databaseId: "database-1" });
  const [selected, select] = useState(bootstrap.views[0].id);
  const [databaseId, setDatabaseId] = useState<string | null>(null);
  const data = useDatabaseViewData({
    databaseId: "database-1",
    bootstrap: state.data,
    serverBootstrap: state.serverData,
    activeViewId: selected,
    includeDeleted: false,
  });
  useEffect(() => {
    if (!state.data?.views.some((view) => view.id === selected)) select(bootstrap.views[0].id);
  }, [selected, state.data]);
  return (
    <main>
      <h1>Optimistic creation</h1>
      <button
        onClick={() => {
          void createEditorDatabase().then(setDatabaseId);
        }}
      >
        Create editor database
      </button>
      <button
        onClick={() => {
          void addView
            .mutateAsync({
              databaseId: "database-1",
              dataSourceId: "data-source-1",
              name: "List",
              type: "list",
              onOptimistic: (view) => select(view.id),
            })
            .catch(() => undefined);
        }}
      >
        Add List view
      </button>
      <nav>
        {state.data?.views.map((view) => (
          <button key={view.id} aria-pressed={selected === view.id} onClick={() => select(view.id)}>
            {view.name}
          </button>
        ))}
      </nav>
      <div data-testid="records" data-status={data.recordWindow.status}>
        {data.viewData?.records.map((row) => (
          <p key={row.id}>{row.page.name}</p>
        ))}
      </div>
      {databaseId ? <CreatedDatabase id={databaseId} onRemove={() => setDatabaseId(null)} /> : null}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(
  <ZilobaseFeaturesProvider
    value={{
      queryClient: client,
      deployment: "creation-proof",
      apiFetch,
      auth: { getSession: async () => session } as unknown as ZilobaseFeaturesConfig["auth"],
    }}
  >
    <ShortcutProvider>
      <PageEditorRegistryProvider>
        <Proof />
      </PageEditorRegistryProvider>
    </ShortcutProvider>
  </ZilobaseFeaturesProvider>,
);
