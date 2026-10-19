import { createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient } from "@tanstack/react-query";
import { initializeZilobaseClient } from "@zilobase/features";
import { usePageProperties } from "@zilobase/features/pages/react";
import { pageQueryOptions, type PagePropertyContext } from "@zilobase/features/pages";
import {
  ZilobaseFeaturesProvider,
  type ZilobaseFeaturesConfig,
} from "../../../packages/features/src/shared/context";
import {
  createTestDatabasePayload,
  setTestDatabaseClientState,
} from "../../../packages/features/src/databases/mutations/test-helpers";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
});
const session = {
  user: { id: "actor" },
  session: { id: "session", userId: "actor", expiresAt: "2099-01-01" },
};
queryClient.setQueryData(["session"], session);
initializeZilobaseClient(queryClient, "property-test");
const payload = createTestDatabasePayload();
setTestDatabaseClientState(queryClient, payload);
const requests: string[] = [];
let finish: ((value: unknown) => void) | undefined;
let fail: ((reason: unknown) => void) | undefined;
const pending: Array<(value: unknown) => void> = [];
const apiFetch = (async (path: string) => {
  requests.push(path);
  return new Promise((resolve, reject) => {
    finish = resolve;
    fail = reject;
    pending.push(resolve);
  });
}) as ZilobaseFeaturesConfig["apiFetch"];
const proof = {
  requests,
  queryClient,
  fail(status: number) {
    fail?.(Object.assign(new Error("Property read failed"), { status }));
  },
  changeAccount() {
    queryClient.setQueryData(["session"], {
      user: { id: "second" },
      session: { id: "second-session", userId: "second", expiresAt: "2099-01-01" },
    });
  },
  resolveOriginal() {
    pending[0]?.({
      workspaceId: "org-1",
      properties: payload.properties.map((p) => p.property),
      values: payload.values,
    });
  },
  async authorize(patch: Partial<PagePropertyContext> = {}) {
    const page = {
      id: "page-1",
      workspaceId: "org-1",
      name: "Alpha",
      type: "pageblock",
      url: "#",
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
    };
    const propertyIds = payload.properties.map((binding) => binding.propertyId);
    const propertyContext: PagePropertyContext = {
      pageId: page.id,
      workspaceId: page.workspaceId,
      propertyIds,
      databaseIds: ["database-1"],
      databaseVersions: { "database-1": 0 },
      sourceVersions: { "data-source-1": 0 },
      presenceTargets: [
        { databaseId: "database-1", dataSourceId: "data-source-1", rowId: "row-1", propertyIds },
      ],
      ...patch,
    };
    await queryClient.fetchQuery(
      pageQueryOptions(
        (async () => ({
          page,
          viewerType: "member",
          propertyContext,
        })) as ZilobaseFeaturesConfig["apiFetch"],
        page.id,
      ),
    );
  },
  resolve() {
    finish?.({
      workspaceId: "org-1",
      properties: payload.properties.map((p) => p.property),
      values: payload.values,
      databaseIds: ["database-1"],
    });
  },
  open: (_pageId: string, _databaseId?: string | null) => {},
};
Object.assign(window, { propertyProof: proof });
function Metadata({ pageId, databaseId }: { pageId: string; databaseId?: string | null }) {
  const result = usePageProperties(pageId, { databaseId });
  return (
    <output data-testid="metadata">
      {JSON.stringify({
        names: result.data?.properties.map((p) => p.name),
        values: result.data?.values.map((v) => v.value),
        coverage: result.coverage,
        loading: result.isLoading,
        refreshing: result.isRefreshing,
        refreshError: Boolean(result.refreshError),
      })}
    </output>
  );
}
function Proof() {
  const [opened, setOpened] = useState<{ pageId: string; databaseId?: string | null } | null>(null);
  proof.open = (pageId, databaseId) => setOpened({ pageId, databaseId });
  return (
    <>
      <button onClick={() => setOpened({ pageId: "page-1", databaseId: "database-1" })}>
        Open loaded item
      </button>
      <button onClick={() => setOpened(null)}>Close item</button>
      {opened && <Metadata {...opened} />}
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  createElement(
    ZilobaseFeaturesProvider,
    {
      value: {
        queryClient,
        apiFetch,
        deployment: "property-test",
        databaseRealtimeEnabled: false,
        auth: { getSession: async () => session, signOut: async () => undefined },
      } as unknown as ZilobaseFeaturesConfig,
    },
    createElement(Proof),
  ),
);
