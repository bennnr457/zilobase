import type { QueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { sharedClient, type SharedClient } from "../data/client";
import {
  databaseBootstrapResponseSchema,
  databasePropertyEntitySchema,
  databaseHostEntitySchema,
  databaseViewEntitySchema,
  dataSourceEntitySchema,
  pagePropertyEntitySchema,
  type DatabaseBootstrapResponse,
  databaseRecordWindowResponseSchema,
  type DatabaseRecordWindowResponse,
} from "./core/entities";
import {
  hostCacheEntitySchema,
  sourceCacheEntitySchema,
  sourceLinkIdentity,
  viewCacheEntitySchema,
  bindingCacheEntitySchema,
} from "./schema/cache-entities";
// Query owns authorized membership and read revision, not canonical entity fields.
export const databaseBootstrapReferenceSchema = z
  .object({
    cacheId: z.string(),
    databaseId: z.string(),
    databaseVersion: z.number().int().nonnegative(),
    accessLevel: databaseHostEntitySchema.shape.accessLevel,
    sourceIds: z.array(z.string()),
    bindingIds: z.array(z.string()),
    viewIds: z.array(z.string()),
    includeDeleted: z.boolean(),
  })
  .strict();

export type DatabaseBootstrapReference = z.infer<typeof databaseBootstrapReferenceSchema>;

export function normalizeDatabaseBootstrap(
  client: QueryClient,
  read: ReturnType<SharedClient["capture"]>,
  databaseId: string,
  input: unknown,
  includeDeleted = false,
): DatabaseBootstrapReference {
  const incoming = databaseBootstrapResponseSchema.parse(input);
  const owner = sharedClient(client).resolve(
    read,
    incoming.database.workspaceId,
    incoming.viewerType === "guest" || incoming.viewerType === "public"
      ? { kind: incoming.viewerType, id: databaseId }
      : read.identity.viewer.kind === "public"
        ? { kind: "public", id: databaseId }
        : undefined,
  );
  const result = owner.databases.ingestBootstrap(databaseId, incoming);
  return {
    cacheId: owner.session.id,
    databaseId,
    databaseVersion: result.version,
    accessLevel: result.accessLevel,
    sourceIds: result.sourceIds,
    bindingIds: result.bindingIds,
    viewIds: result.viewIds,
    includeDeleted,
  };
}

export function resolveDatabaseBootstrap(
  client: QueryClient,
  input: unknown,
  confirmed = false,
): DatabaseBootstrapResponse | undefined {
  const parsed = databaseBootstrapReferenceSchema.safeParse(input);
  if (!parsed.success) return undefined;
  const owner = sharedClient(client).get(parsed.data.cacheId);
  if (!owner) return undefined;
  const { bindingIds, sourceIds, viewIds, databaseId, accessLevel, includeDeleted } = parsed.data;
  const host = confirmed
    ? owner.databases.hosts.collection.base.get(databaseId)
    : owner.databases.hosts.get(databaseId);
  if (!host) return undefined;
  const properties = bindingIds.flatMap((id) => {
    const binding = owner.databases.bindings.get(id);
    const definition = binding && owner.databases.definitions.get(binding.propertyId);
    if (!binding || !definition || (!includeDeleted && definition.deletedAt)) return [];
    return [
      databasePropertyEntitySchema.parse({
        ...bindingCacheEntitySchema.strip().parse(binding),
        property: pagePropertyEntitySchema.strip().parse(definition),
      }),
    ];
  });
  const dataSources = sourceIds
    .flatMap((id) => {
      const source = confirmed
        ? owner.databases.sources.collection.base.get(id)
        : owner.databases.sources.get(id);
      const link = owner.databases.links.get(sourceLinkIdentity(databaseId, id));
      return source && link
        ? [
            dataSourceEntitySchema.parse({
              ...sourceCacheEntitySchema.strip().parse(source),
              position: link.position,
              linkedAt: link.linkedAt,
            }),
          ]
        : [];
    })
    .sort((a, b) => a.position - b.position);
  const views = viewIds
    .flatMap((id) => {
      const view = confirmed
        ? owner.databases.views.collection.base.get(id)
        : owner.databases.views.get(id);
      if (!view || !dataSources.some((source) => source.id === view.dataSourceId)) return [];
      const { hostVersion: _hostVersion, ...fields } = viewCacheEntitySchema.strip().parse(view);
      return [databaseViewEntitySchema.parse(fields)];
    })
    .sort((a, b) => a.position - b.position);
  return {
    database: databaseHostEntitySchema.strip().parse({
      ...hostCacheEntitySchema.strip().parse(host),
      accessLevel,
    }),
    dataSources,
    properties: properties.sort((a, b) => a.position - b.position),
    views,
  };
}

/** Only typed, admitted facets update result memberships; record filters stay server-owned. */
export function reconcileBootstrapReferences(
  client: QueryClient,
  event: import("./core/entities").DatabaseMutationEventV2,
  cacheId: string,
) {
  const reconcile = (
    ref: DatabaseBootstrapReference,
    viewId?: string,
  ): DatabaseBootstrapReference => {
    if (
      ref.cacheId !== cacheId ||
      ref.databaseId !== event.databaseId ||
      event.version < ref.databaseVersion
    )
      return ref;
    const sources = new Set(
      ref.sourceIds.filter((id) => !event.changes.removedDataSourceIds?.includes(id)),
    );
    const bindings = new Set(
      ref.bindingIds.filter(
        (id) => ref.includeDeleted || !event.changes.removedPropertyIds?.includes(id),
      ),
    );
    for (const binding of event.changes.properties ?? [])
      if (sources.has(binding.dataSourceId) && (ref.includeDeleted || !binding.property.deletedAt))
        bindings.add(binding.id);
    const views = new Set(ref.viewIds.filter((id) => !event.changes.removedViewIds?.includes(id)));
    for (const view of event.changes.views ?? [])
      if (sources.has(view.dataSourceId) && (!viewId || viewId === view.id)) views.add(view.id);
    return {
      ...ref,
      databaseVersion: event.version,
      sourceIds: [...sources],
      bindingIds: [...bindings],
      viewIds: [...views],
    };
  };
  for (const query of client.getQueryCache().findAll({ queryKey: ["db"] })) {
    if (query.queryKey[2] !== event.databaseId || query.queryKey[3] !== "bootstrap") continue;
    const parsed = databaseBootstrapReferenceSchema.safeParse(query.state.data);
    if (parsed.success)
      client.setQueryData(
        query.queryKey,
        reconcile(parsed.data, query.queryKey[4] ? String(query.queryKey[4]) : undefined),
      );
  }
  for (const query of client
    .getQueryCache()
    .findAll({ queryKey: ["database-context-export", event.databaseId] })) {
    const ref = query.state.data as
      | import("./export-references").DatabaseExportReference
      | undefined;
    if (ref?.bootstrap)
      client.setQueryData(query.queryKey, { ...ref, bootstrap: reconcile(ref.bootstrap) });
  }
  client.setQueriesData<import("../pages/cache").PageNavigationReference>(
    { queryKey: ["pages"] },
    (current) => {
      if (!current?.databases) return current;
      return {
        ...current,
        databases: current.databases.map((ref) => {
          if (
            ref.cacheId !== cacheId ||
            ref.id !== event.databaseId ||
            event.version < ref.databaseVersion
          )
            return ref;
          const sources = ref.sourceIds.filter(
            (id) => !event.changes.removedDataSourceIds?.includes(id),
          );
          const views = new Set(
            ref.viewIds.filter((id) => !event.changes.removedViewIds?.includes(id)),
          );
          for (const view of event.changes.views ?? [])
            if (sources.includes(view.dataSourceId)) views.add(view.id);
          return {
            ...ref,
            sourceIds: sources,
            viewIds: [...views],
            databaseVersion: event.version,
            primarySourceId:
              ref.primarySourceId && sources.includes(ref.primarySourceId)
                ? ref.primarySourceId
                : (sources[0] ?? null),
          };
        }),
      };
    },
  );
}

export const databaseWindowReferenceSchema = databaseRecordWindowResponseSchema
  .omit({ records: true })
  .extend({ cacheId: z.string(), recordIds: z.array(z.string()), dataSourceId: z.string() });

export type DatabaseWindowReference = z.infer<typeof databaseWindowReferenceSchema>;

export function normalizeRecordWindow(
  client: QueryClient,
  databaseId: string,
  dataSourceId: string,
  queryHash: string,
  input: unknown,
  cacheId?: string,
): DatabaseWindowReference {
  const owner = cacheId
    ? sharedClient(client).get(cacheId)
    : sharedClient(client).database(databaseId);
  if (!owner) throw new Error("Record read requires an authorized bootstrap");
  const result = owner.databases.ingestWindow(databaseId, dataSourceId, queryHash, input);
  return { ...result, cacheId: owner.session.id, dataSourceId };
}

export function resolveRecordWindow(
  client: QueryClient,
  input: unknown,
): DatabaseRecordWindowResponse | undefined {
  const parsed = databaseWindowReferenceSchema.safeParse(input);
  if (!parsed.success) return undefined;
  const { cacheId, recordIds, dataSourceId, ...result } = parsed.data;
  const owner = sharedClient(client).get(cacheId);
  if (!owner) return undefined;
  return {
    ...result,
    records: recordIds.flatMap((id) => {
      const record = owner.databases.resolveRecord(id);
      return record?.dataSourceId === dataSourceId ? [record] : [];
    }),
  };
}

/** Only the admitted capability's referenced entities can change these projections. */
export function bootstrapPublicationInterests(
  client: QueryClient,
  input: unknown,
): import("../data/publication").PublicationInterest[] {
  const parsed = databaseBootstrapReferenceSchema.safeParse(input);
  if (!parsed.success) return [];
  const ref = parsed.data;
  const owner = sharedClient(client).get(ref.cacheId);
  if (!owner) return [];
  const interests: import("../data/publication").PublicationInterest[] = [];
  const add = (collection: string, ids: string[]) =>
    interests.push(...ids.map((id) => ({ scopeId: ref.cacheId, collection, id })));
  add("database-hosts", [ref.databaseId]);
  add("sources", ref.sourceIds);
  add(
    "source-links",
    ref.sourceIds.map((id) => sourceLinkIdentity(ref.databaseId, id)),
  );
  add("property-bindings", ref.bindingIds);
  add(
    "property-definitions",
    ref.bindingIds.flatMap((id) => owner.databases.bindings.get(id)?.propertyId ?? []),
  );
  add("views", ref.viewIds);
  return interests;
}

export function recordPublicationInterests(
  client: QueryClient,
  scopeId: string | undefined,
  recordIds: readonly string[],
): import("../data/publication").PublicationInterest[] {
  const owner = scopeId ? sharedClient(client).get(scopeId) : undefined;
  if (!owner || !scopeId) return [];
  const interests: import("../data/publication").PublicationInterest[] = [];
  const allBindings = [...owner.databases.bindings.collection.values()];
  const bindingsBySource = new Map<string, typeof allBindings>();
  for (const binding of allBindings) {
    const group = bindingsBySource.get(binding.dataSourceId) ?? [];
    group.push(binding);
    bindingsBySource.set(binding.dataSourceId, group);
  }
  for (const id of recordIds) {
    interests.push({ scopeId, collection: "records", id });
    const record = owner.databases.records.get(id);
    if (!record) continue;
    interests.push({ scopeId, collection: "pages", id: record.pageId });
    const bindings = bindingsBySource.get(record.dataSourceId) ?? [];
    for (const binding of bindings) {
      interests.push({ scopeId, collection: "property-bindings", id: binding.id });
      interests.push({
        scopeId,
        collection: "property-values",
        id: JSON.stringify([record.pageId, binding.propertyId]),
      });
    }
    for (const id of record.valueIds)
      interests.push({ scopeId, collection: "property-values", id });
  }
  return [...new Map(interests.map((interest) => [JSON.stringify(interest), interest])).values()];
}

export function windowPublicationInterests(client: QueryClient, input: unknown) {
  const parsed = databaseWindowReferenceSchema.safeParse(input);
  return parsed.success
    ? recordPublicationInterests(client, parsed.data.cacheId, parsed.data.recordIds)
    : [];
}
