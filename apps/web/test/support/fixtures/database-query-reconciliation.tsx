import { QueryClient } from "@tanstack/react-query";
import { initializeZilobaseClient } from "@zilobase/features";
import { z } from "zod";
import { createElement, memo } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { sharedClient } from "../../../../../packages/features/src/data/client";
import {
  normalizeDatabaseBootstrap,
  normalizeRecordWindow,
  resolveDatabaseBootstrap,
} from "../../../../../packages/features/src/databases/cache-references";
import type { DatabaseBootstrapResponse } from "../../../../../packages/features/src/databases/core/entities";
import {
  databaseController,
  disposeDatabaseController,
} from "../../../../../packages/features/src/databases/interactions/store";
import { useDatabaseBootstrap } from "../../../../../packages/features/src/databases/queries/bootstrap-react";
import { databaseBootstrapQueryKey } from "../../../../../packages/features/src/databases/queries/keys";
import { useDatabaseViewData } from "../../../../../packages/features/src/databases/queries/view-data";
import { databaseViewQueryHash } from "../../../../../packages/features/src/databases/views/query-hash";
import {
  ZilobaseFeaturesProvider,
  type ZilobaseFeaturesConfig,
} from "../../../../../packages/features/src/shared/context";

export function mountQueryReconciliation(container: HTMLElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity, retry: false } },
  });
  const session = {
    user: { id: "user" },
    session: { id: "query-test", userId: "user", expiresAt: "2099-01-01" },
  };
  queryClient.setQueryData(["session"], session);
  initializeZilobaseClient(queryClient, "query-test");
  const now = "2026-09-29T00:00:00.000Z";
  let server: DatabaseBootstrapResponse = {
    database: {
      id: "host",
      name: "Database",
      version: 1,
      workspaceId: "workspace",
      config: {},
      pageId: null,
      accessLevel: "full",
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    },
    dataSources: [
      {
        id: "source",
        name: "Source",
        version: 1,
        configVersion: 1,
        config: {},
        position: 0,
        parentDatabaseId: "host",
        workspaceId: "workspace",
        linkedAt: null,
        createdAt: now,
        updatedAt: now,
      },
    ],
    properties: [],
    views: ["table", "kanban"].map((id, position) => ({
      id,
      position,
      databaseId: "host",
      dataSourceId: "source",
      name: id,
      type: id,
      config: {},
      createdAt: now,
      updatedAt: now,
    })),
  };
  const key = databaseBootstrapQueryKey("query-test", { databaseId: "host" });
  const owner = sharedClient(queryClient);
  owner
    .resolve(owner.capture(), server.database.workspaceId)
    .databases.ingestBootstrap("host", server);
  queryClient.setQueryData(
    key,
    normalizeDatabaseBootstrap(queryClient, owner.capture(), "host", server),
  );

  const other: DatabaseBootstrapResponse = {
    ...server,
    database: { ...server.database, id: "other-host" },
    dataSources: server.dataSources.map((source) => ({
      ...source,
      id: "other-source",
      parentDatabaseId: "other-host",
    })),
    views: [
      {
        ...server.views[0]!,
        id: "other-table",
        databaseId: "other-host",
        dataSourceId: "other-source",
      },
    ],
  };
  queryClient.setQueryData(
    databaseBootstrapQueryKey("query-test", { databaseId: "other-host" }),
    normalizeDatabaseBootstrap(queryClient, owner.capture(), "other-host", other),
  );
  const entities = owner.database("host", "query-test")!;
  const presence = entities.session.register({
    name: "fixture-presence",
    schema: z.object({ id: z.string(), active: z.boolean() }),
  });
  const rowsFor = (otherHost: boolean, revision = 1) =>
    ["first", "second"].map((suffix) => {
      const id = `${otherHost ? "other" : "host"}-${suffix}`;
      const timestamp = new Date(
        Date.parse(now) + (suffix === "first" ? revision : 1),
      ).toISOString();
      return {
        id,
        pageId: id,
        dataSourceId: otherHost ? "other-source" : "source",
        parentRowId: null,
        orderKey: suffix === "first" ? "1024" : "2048",
        createdAt: now,
        updatedAt: timestamp,
        valuesByPropertyId: {},
        page: {
          id,
          name: `${id}-${suffix === "first" ? revision : 1}`,
          createdAt: now,
          updatedAt: timestamp,
          deletedAt: null,
          hasContent: false,
          metadata: null,
        },
      };
    });
  const counts = {
    renders: {} as Record<string, number>,
    models: {} as Record<string, number>,
    rows: {} as Record<string, number>,
  };
  const lastRecords = new Map<string, unknown>();
  const Row = memo(({ record }: { record: ReturnType<typeof rowsFor>[number] }) => {
    counts.rows[record.id] = (counts.rows[record.id] ?? 0) + 1;
    return createElement("span", { "data-query-row": record.id }, record.page.name);
  });
  const requests: string[] = [];
  const otherRequests: string[] = [];
  let confirm: (() => void) | undefined;
  const sorts = [{ column: "name", direction: "descending" }];
  const apiFetch = (async (path: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      const { commandId } = JSON.parse(String(init.body));
      return new Promise((resolve) => {
        confirm = () => {
          server = {
            ...server,
            database: { ...server.database, version: 2 },
            views: server.views.map((view) =>
              view.id === "table" ? { ...view, config: { sorts } } : view,
            ),
          };
          resolve({
            commandId,
            sourceVersions: {},
            result: server.views[0],
            event: {
              actorId: "actor",
              areas: ["views"],
              changes: { views: [server.views[0]!] },
              commandId,
              committedAt: now,
              databaseId: "host",
              dataSourceId: null,
              eventId: commandId,
              protocolVersion: 2,
              type: "database.mutation",
              version: 2,
            },
          });
        };
      });
    }
    const otherHost = path.includes("/other-host/");
    const activeServer = otherHost ? other : server;
    if (path.includes("/bootstrap")) return activeServer;
    (otherHost ? otherRequests : requests).push(path);
    const params = new URL(path, "https://test.invalid").searchParams;
    const view = activeServer.views.find(({ id }) => id === params.get("viewId"));
    const queryHash = databaseViewQueryHash(view?.config);
    if (params.get("expectedQueryHash") !== queryHash)
      throw { status: 409, body: { code: "VIEW_QUERY_CHANGED" } };
    return {
      queryHash,
      databaseVersion: activeServer.database.version,
      dataSourceVersion: 1,
      hasMore: false,
      offset: 0,
      records: rowsFor(otherHost),
      snapshot: "snapshot",
      totalCount: 2,
    };
  }) as ZilobaseFeaturesConfig["apiFetch"];
  const controller = databaseController(queryClient, "query-test", apiFetch);
  const output: Record<string, { config: unknown; hash?: string; status: string }> = {};
  function Capture({ viewId, host = "host" }: { viewId: string; host?: string }) {
    counts.renders[viewId] = (counts.renders[viewId] ?? 0) + 1;
    const bootstrap = useDatabaseBootstrap({ databaseId: host });
    const { recordWindow: records } = useDatabaseViewData({
      databaseId: host,
      bootstrap: bootstrap.data,
      serverBootstrap: bootstrap.serverData,
      activeViewId: viewId,
      includeDeleted: false,
    });
    output[viewId] = {
      config: bootstrap.data?.views.find(({ id }) => id === viewId)?.config,
      hash: records.scope?.queryHash,
      status: records.status,
    };
    if (lastRecords.get(viewId) !== records.records) {
      counts.models[viewId] = (counts.models[viewId] ?? 0) + 1;
      lastRecords.set(viewId, records.records);
    }
    return createElement(
      "div",
      null,
      records.records.map((record) => createElement(Row, { key: record.id, record })),
    );
  }
  const root = createRoot(container);
  flushSync(() =>
    root.render(
      createElement(
        ZilobaseFeaturesProvider,
        {
          value: {
            deployment: "query-test",
            queryClient,
            apiFetch,
            auth: { getSession: async () => session } as ZilobaseFeaturesConfig["auth"],
          },
        },
        createElement(Capture, { viewId: "table" }),
        createElement(Capture, { viewId: "kanban" }),
        createElement(Capture, { viewId: "other-table", host: "other-host" }),
      ),
    ),
  );
  return {
    requests,
    output,
    counts,
    presence() {
      entities.session.ingest([presence.stage([{ id: "peer", active: true }])]);
    },
    publishOther() {
      normalizeRecordWindow(
        queryClient,
        "other-host",
        "other-source",
        databaseViewQueryHash({}),
        {
          queryHash: databaseViewQueryHash({}),
          databaseVersion: 2,
          dataSourceVersion: 2,
          records: rowsFor(true, 2),
          offset: 0,
          hasMore: false,
          snapshot: "snapshot",
          totalCount: 2,
        },
        entities.session.id,
      );
    },
    edit() {
      void controller
        .execute({
          databaseId: "host",
          command: {
            type: "view.update",
            viewId: "table",
            patch: { configuration: [{ operation: "set", path: ["sorts"], value: sorts }] },
          },
        })
        .catch(() => undefined);
    },
    confirm: () => confirm!(),
    rawConfig: () =>
      resolveDatabaseBootstrap(queryClient, queryClient.getQueryData(key), true)?.views[0]?.config,
    close() {
      flushSync(() => root.unmount());
      disposeDatabaseController(queryClient, "query-test");
      queryClient.clear();
    },
  };
}
