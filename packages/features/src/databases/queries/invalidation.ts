import type { QueryClient } from "@tanstack/react-query";
import { databaseWindowReferenceSchema, resolveDatabaseBootstrap } from "../cache-references";
import { sharedClient } from "../../data/client";
import { dependentFields } from "./dependencies";
import { normalizeDatabaseViewQuery, databaseViewQueryHash } from "../views/query-hash";
import type { PagePropertiesPayload } from "../../pages/contracts";
import { databaseQueryRoot } from "./keys";
/** Server-owned membership/count/order recovery, restricted to affected source results. */
export function refreshRecordResults(
  client: QueryClient,
  cacheId: string,
  versions: Readonly<Record<string, number>>,
) {
  for (const query of client.getQueryCache().findAll({ queryKey: ["db"] })) {
    if (query.queryKey[3] !== "window" || versions[String(query.queryKey[4])] === undefined)
      continue;
    const data = query.state.data as { pages?: unknown[] } | undefined;
    if (
      !data?.pages?.some((page) => {
        const parsed = databaseWindowReferenceSchema.safeParse(page);
        return parsed.success && parsed.data.cacheId === cacheId;
      })
    )
      continue;
    void client.invalidateQueries({ queryKey: query.queryKey, exact: true }).catch(() => undefined);
  }
  for (const query of client.getQueryCache().findAll({ queryKey: ["database-context-export"] })) {
    const ref = query.state.data as
      | import("../export-references").DatabaseExportReference
      | undefined;
    if (
      ref?.bootstrap.cacheId !== cacheId ||
      !ref.activeSourceId ||
      versions[ref.activeSourceId] === undefined
    )
      continue;
    void client.invalidateQueries({ queryKey: query.queryKey, exact: true }).catch(() => undefined);
  }
}

function referencesFields(value: unknown, fields: ReadonlySet<string>): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((value) => referencesFields(value, fields));
  const record = value as Record<string, unknown>;
  return (
    (typeof record.propertyId === "string" && fields.has(record.propertyId)) ||
    (typeof record.column === "string" && fields.has(record.column)) ||
    Object.values(record).some((value) => referencesFields(value, fields))
  );
}

/** Titles affect only results evaluated with a dependent filter or sort. */
export function refreshTitleMembership(client: QueryClient, pageIds: readonly string[]) {
  if (!pageIds.length) return;
  const sources = new Set(
    sharedClient(client)
      .all()
      .flatMap((owner) => owner.databases.sourcesForPages(pageIds)),
  );
  refreshPropertyMembership(client, ["name"], { sources });
}

export function refreshPropertyMembership(
  client: QueryClient,
  propertyIds: readonly string[],
  options: { sources?: ReadonlySet<string>; definitionsChanged?: boolean } = {},
) {
  if (!propertyIds.length) return;
  const fields = new Set(propertyIds);
  const windows = new Set<string>();
  for (const query of client.getQueryCache().findAll({ queryKey: ["db"] })) {
    if (query.queryKey[3] !== "bootstrap") continue;
    const parsed = resolveDatabaseBootstrap(client, query.state.data, true);
    if (!parsed) continue;
    const { database, views, properties } = parsed;
    for (const view of views) {
      if (options.sources && !options.sources.has(view.dataSourceId)) continue;
      const config = view.config ?? database.config;
      const sourceProperties = properties.filter(
        (binding) => binding.dataSourceId === view.dataSourceId,
      );
      if (
        !fields.has("name") &&
        !sourceProperties.some(
          (binding) => fields.has(binding.id) || fields.has(binding.propertyId),
        )
      )
        continue;
      const dependent = dependentFields(sourceProperties, fields, options.definitionsChanged);
      if (!referencesFields(normalizeDatabaseViewQuery(config), dependent)) continue;
      windows.add(
        JSON.stringify([
          query.queryKey[1],
          database.id,
          view.dataSourceId,
          databaseViewQueryHash(config, query.queryKey[5] === true),
          query.queryKey[5] === true,
        ]),
      );
    }
  }
  for (const query of client.getQueryCache().findAll({ queryKey: ["db"] })) {
    const key = query.queryKey;
    if (key[3] !== "window") continue;
    if (windows.has(JSON.stringify([key[1], key[2], key[4], key[5], key[6]])))
      void client.invalidateQueries({ queryKey: key, exact: true }).catch(() => undefined);
  }
}

function isPagePropertiesQueryKey(queryKey: readonly unknown[]): boolean {
  return queryKey[0] === "page" && queryKey[2] === "properties";
}

export function invalidateDatabaseQueries(
  queryClient: QueryClient,
  sessionId: string,
  hostDatabaseId: string,
): void {
  void queryClient
    .invalidateQueries({
      queryKey: [databaseQueryRoot, sessionId, hostDatabaseId],
    })
    .catch(() => undefined);

  for (const [queryKey, payload] of queryClient.getQueriesData<PagePropertiesPayload | undefined>({
    queryKey: ["page"],
  })) {
    if (!isPagePropertiesQueryKey(queryKey as readonly unknown[])) continue;
    if (!payload?.databaseIds?.includes(hostDatabaseId)) continue;
    void queryClient.invalidateQueries({ exact: true, queryKey }).catch(() => undefined);
  }

  void queryClient
    .invalidateQueries({
      queryKey: ["database-context-export", hostDatabaseId],
    })
    .catch(() => undefined);
}
