import { z } from "zod";
import type { QueryClient } from "@tanstack/react-query";
import { sharedClient, type SharedClient } from "../data/client";
import type { PagePropertiesPayload, PagePropertyContext } from "./contracts";
import { propertyCacheEntitySchema } from "../databases/schema/cache-entities";
import { valueIdentity, valueCacheEntitySchema } from "../databases/schema/cache-entities";
import { pagePropertyValueEntitySchema } from "../databases/core/entities";
import {
  databaseBootstrapReferenceSchema,
  databaseWindowReferenceSchema,
  resolveDatabaseBootstrap,
} from "../databases/cache-references";
import type { PageDetailReference } from "./cache";
import type { DatabaseMutationEventV2 } from "../databases/core/entities";

const payloadSchema = z
  .object({
    workspaceId: z.string().min(1),
    viewerType: z.enum(["member", "guest"]).optional(),
    properties: z.array(propertyCacheEntitySchema),
    values: z.array(pagePropertyValueEntitySchema),
    databaseIds: z.array(z.string()).optional(),
    databaseVersions: z.record(z.string(), z.number().int().nonnegative()).optional(),
    presenceTargets: z
      .array(
        z
          .object({
            databaseId: z.string(),
            dataSourceId: z.string(),
            propertyIds: z.array(z.string()),
            rowId: z.string(),
          })
          .strict(),
      )
      .optional(),
  })
  .strict();
export type PagePropertiesReference = Omit<PagePropertiesPayload, "properties" | "values"> & {
  cacheId: string;
  propertyIds: string[];
  pageId: string;
  valuePropertyIds: string[];
  /** Present only when a page-detail receipt supplied complete membership. */
  propertyContext?: PagePropertyContext;
  verifiedAt?: number;
  membershipInvalidated?: boolean;
};

export const pagePropertyContextSchema = z
  .object({
    pageId: z.string().min(1),
    workspaceId: z.string().min(1),
    propertyIds: z.array(z.string()),
    databaseIds: z.array(z.string()),
    databaseVersions: z.record(z.string(), z.number().int().nonnegative()),
    sourceVersions: z.record(z.string(), z.number().int().nonnegative()),
    presenceTargets: payloadSchema.shape.presenceTargets.unwrap(),
  })
  .strict();

export const PAGE_PROPERTY_STALE_TIME = 30_000;

export type PagePropertyCoverage = {
  state: "missing" | "partial" | "complete";
  data?: PagePropertiesPayload;
  reference?: PagePropertiesReference;
  updatedAt: number;
};

/** Every supporting read must be current; a source version alone cannot prove a row was read. */
export function readPageDetailPropertyCoverage(
  client: QueryClient,
  pageId: string,
): PagePropertyCoverage {
  const missing: PagePropertyCoverage = { state: "missing", updatedAt: 0 };
  const state = client.getQueryState<PageDetailReference | null>(["page", pageId]);
  const detail = state?.data;
  const context = detail?.propertyContext;
  if (
    !detail ||
    !context ||
    detail.viewerType !== "member" ||
    state?.status === "error" ||
    state?.isInvalidated
  )
    return missing;
  const owner = sharedClient(client).get(detail.page.cacheId);
  if (
    !owner ||
    owner.session.scope.viewer.kind !== "account" ||
    context.pageId !== pageId ||
    context.workspaceId !== owner.session.scope.workspaceId
  )
    return missing;
  let updatedAt = state.dataUpdatedAt;
  const stale = (stamp: number) => Date.now() - stamp >= PAGE_PROPERTY_STALE_TIME;
  if (stale(updatedAt)) return missing;
  const covered = new Set<string>();
  for (const target of context.presenceTargets) {
    const bootstraps = client
      .getQueryCache()
      .findAll({ queryKey: ["db"] })
      .filter((q) => q.queryKey[2] === target.databaseId && q.queryKey[3] === "bootstrap");
    const bootstrap = bootstraps.find((q) => {
      const parsed = databaseBootstrapReferenceSchema.safeParse(q.state.data);
      if (
        !parsed.success ||
        parsed.data.cacheId !== owner.session.id ||
        q.state.isInvalidated ||
        q.state.status === "error" ||
        stale(q.state.dataUpdatedAt)
      )
        return false;
      return target.propertyIds.every((id) =>
        parsed.data.bindingIds.some((bindingId) => {
          const binding = owner.databases.bindings.get(bindingId);
          return binding?.dataSourceId === target.dataSourceId && binding.propertyId === id;
        }),
      );
    });
    const host = owner.databases.hosts.collection.base.get(target.databaseId);
    const source = owner.databases.sources.collection.base.get(target.dataSourceId);
    if (
      !bootstrap ||
      !host ||
      host.deletedAt ||
      host.version < context.databaseVersions[target.databaseId]! ||
      !source ||
      source.version < context.sourceVersions[target.dataSourceId]!
    )
      return missing;
    const record = owner.databases.resolveRecord(target.rowId);
    if (
      !record ||
      record.pageId !== pageId ||
      record.dataSourceId !== target.dataSourceId ||
      record.page.deletedAt
    )
      return missing;
    const window = client
      .getQueryCache()
      .findAll({ queryKey: bootstrap.queryKey.slice(0, 3) })
      .find((q) => {
        if (
          q.queryKey[3] !== "window" ||
          q.state.status === "error" ||
          q.state.isInvalidated ||
          stale(q.state.dataUpdatedAt)
        )
          return false;
        return ((q.state.data as { pages?: unknown[] } | undefined)?.pages ?? []).some((input) => {
          const parsed = databaseWindowReferenceSchema.safeParse(input);
          return (
            parsed.success &&
            parsed.data.cacheId === owner.session.id &&
            parsed.data.dataSourceId === target.dataSourceId &&
            parsed.data.dataSourceVersion >= context.sourceVersions[target.dataSourceId]! &&
            parsed.data.recordIds.includes(target.rowId)
          );
        });
      });
    if (!window) return missing;
    target.propertyIds.forEach((id) => covered.add(id));
    updatedAt = Math.min(updatedAt, bootstrap.state.dataUpdatedAt, window.state.dataUpdatedAt);
  }
  if (
    context.databaseIds.some(
      (id) => !context.presenceTargets.some((target) => target.databaseId === id),
    )
  )
    return missing;
  if (
    context.propertyIds.some(
      (id) =>
        !covered.has(id) ||
        !owner.databases.definitions.get(id) ||
        owner.databases.definitions.get(id)?.deletedAt,
    )
  )
    return missing;
  const { sourceVersions: _versions, propertyIds, ...payload } = context;
  const reference: PagePropertiesReference = {
    ...payload,
    cacheId: owner.session.id,
    viewerType: "member",
    propertyIds,
    valuePropertyIds: propertyIds,
    propertyContext: context,
    verifiedAt: updatedAt,
  };
  return {
    state: "complete",
    reference,
    data: resolvePageProperties(client, reference),
    updatedAt,
  };
}

/** A loaded result proves its own rows, never the page's entire membership. */
export function readCachedPagePropertyCoverage(
  client: QueryClient,
  pageId: string,
  databaseId?: string | null,
): PagePropertyCoverage {
  const missing: PagePropertyCoverage = { state: "missing", updatedAt: 0 };
  const detailState = client.getQueryState<PageDetailReference | null>(["page", pageId]);
  const detail = detailState?.data;
  if (detailState?.status === "success" && detail === null) return missing;
  if (detailState?.status === "error" && isDenied(detailState.error)) return missing;
  const propertyState = client.getQueryState<PagePropertiesReference>([
    "page",
    pageId,
    "properties",
  ]);
  if (propertyState?.status === "error" && isDenied(propertyState.error)) return missing;
  const existing = propertyState?.data;
  const cached = resolvePageProperties(client, existing);
  if (cached && (!detail || detail.page.cacheId === existing?.cacheId)) {
    return {
      state:
        !existing!.membershipInvalidated &&
        cached.properties.length === existing!.propertyIds.length
          ? "complete"
          : "partial",
      data: existing!.membershipInvalidated ? { ...cached, presenceTargets: [] } : cached,
      reference: existing,
      updatedAt: propertyState!.dataUpdatedAt,
    };
  }
  if (detail && detail.viewerType !== "member") return missing;
  const cache = sharedClient(client);
  for (const query of client.getQueryCache().findAll({ queryKey: ["db"] })) {
    if ((databaseId && query.queryKey[2] !== databaseId) || query.queryKey[3] !== "bootstrap")
      continue;
    const parsed = databaseBootstrapReferenceSchema.safeParse(query.state.data);
    if (!parsed.success) continue;
    const ref = parsed.data;
    const hostId = ref.databaseId;
    const owner = cache.get(ref.cacheId);
    if (!owner || owner.session.scope.viewer.kind !== "account") continue;
    if (detail && detail.page.cacheId !== ref.cacheId) continue;
    const bootstrap = resolveDatabaseBootstrap(client, ref);
    if (!bootstrap || bootstrap.database.deletedAt) continue;
    for (const windowQuery of client
      .getQueryCache()
      .findAll({ queryKey: query.queryKey.slice(0, 3) })) {
      if (windowQuery.queryKey[3] !== "window") continue;
      const windows = windowQuery.state.data as { pages?: unknown[] } | undefined;
      for (const input of windows?.pages ?? []) {
        const window = databaseWindowReferenceSchema.safeParse(input);
        if (!window.success || window.data.cacheId !== ref.cacheId) continue;
        const recordId = window.data.recordIds.find((id) => {
          const row = owner.databases.records.get(id);
          return row?.pageId === pageId && row.dataSourceId === window.data.dataSourceId;
        });
        const record = recordId ? owner.databases.resolveRecord(recordId) : undefined;
        if (!record || record.page.deletedAt) continue;
        const propertyIds = [
          ...new Set(
            bootstrap.properties
              .filter((binding) => binding.dataSourceId === record.dataSourceId)
              .map((binding) => binding.propertyId),
          ),
        ];
        const reference: PagePropertiesReference = {
          cacheId: ref.cacheId,
          workspaceId: owner.session.scope.workspaceId,
          viewerType: "member",
          pageId,
          propertyIds,
          valuePropertyIds: propertyIds,
          databaseIds: [hostId],
          databaseVersions: { [hostId]: window.data.databaseVersion },
          presenceTargets: [
            {
              databaseId: hostId,
              dataSourceId: record.dataSourceId,
              rowId: record.id,
              propertyIds,
            },
          ],
        };
        return {
          state: "partial",
          reference,
          data: resolvePageProperties(client, reference),
          updatedAt: Math.min(query.state.dataUpdatedAt, windowQuery.state.dataUpdatedAt),
        };
      }
    }
  }
  return missing;
}

function isDenied(error: unknown) {
  return Boolean(
    error &&
    typeof error === "object" &&
    "status" in error &&
    (error.status === 401 || error.status === 403 || error.status === 404),
  );
}

export function normalizePageProperties(
  client: QueryClient,
  read: ReturnType<SharedClient["capture"]>,
  pageId: string,
  input: unknown,
): PagePropertiesReference {
  const payload = payloadSchema.parse(input);
  if (payload.properties.some((property) => property.workspaceId !== payload.workspaceId))
    throw new Error("Page property workspace mismatch");
  if (payload.values.some((value) => value.pageId !== pageId))
    throw new Error("Page property value identity mismatch");
  const entities = sharedClient(client).resolve(
    read,
    payload.workspaceId,
    payload.viewerType === "guest" ? { kind: "guest", id: pageId } : undefined,
  );
  if (entities.session.scope.workspaceId !== payload.workspaceId)
    throw new Error("Page property scope mismatch");
  entities.session.ingest([
    entities.databases.definitions.stage(payload.properties),
    entities.databases.values.stage(
      payload.values.map((value) => ({
        ...value,
        valueId: value.id,
        id: valueIdentity(value.pageId, value.propertyId),
      })),
    ),
  ]);
  entities.databases.admitPageProperties(pageId, payload.presenceTargets ?? []);
  const { properties, values, ...context } = payload;
  return {
    ...context,
    cacheId: entities.session.id,
    pageId,
    propertyIds: properties.map(({ id }) => id),
    valuePropertyIds: values.map((value) => value.propertyId),
  };
}

export function resolvePageProperties(
  client: QueryClient,
  reference: PagePropertiesReference | undefined,
): PagePropertiesPayload | undefined {
  if (!reference) return undefined;
  const owner = sharedClient(client).get(reference.cacheId);
  if (!owner) return undefined;
  const {
    cacheId: _cacheId,
    propertyIds,
    pageId,
    valuePropertyIds,
    propertyContext: _coverage,
    verifiedAt: _verifiedAt,
    membershipInvalidated: _invalidated,
    ...context
  } = reference;
  return {
    ...context,
    values: [...new Set([...propertyIds, ...valuePropertyIds])].flatMap((propertyId) => {
      const value = owner.databases.values.get(valueIdentity(pageId, propertyId));
      if (!value) return [];
      const { valueId, ...fields } = valueCacheEntitySchema.strip().parse(value);
      return [{ ...fields, id: valueId }];
    }),
    properties: propertyIds.flatMap((id) => {
      const property = owner.databases.definitions.get(id);
      return property && !property.deletedAt
        ? [
            {
              ...propertyCacheEntitySchema.strip().parse(property),
              createdAt: property.createdAt ?? property.updatedAt,
            },
          ]
        : [];
    }),
  };
}

/** Membership recovery is scoped to affected pages and retains values while refreshing. */
export function invalidatePagePropertyContexts(
  client: QueryClient,
  databaseId: string,
  cacheId?: string,
  pageId?: string,
) {
  for (const query of client.getQueryCache().findAll({ queryKey: ["page"] })) {
    const data = query.state.data as PageDetailReference | PagePropertiesReference | undefined;
    if (!data) continue;
    const databaseIds =
      "page" in data ? (data.propertyContext?.databaseIds ?? data.databaseIds) : data.databaseIds;
    if (pageId ? query.queryKey[1] !== pageId : !databaseIds?.includes(databaseId)) continue;
    const ownerId = "page" in data ? data.page.cacheId : data.cacheId;
    if (cacheId && ownerId !== cacheId) continue;
    if (query.queryKey.length === 2 && "page" in data) {
      client.setQueryData(
        query.queryKey,
        { ...data, propertyContext: undefined },
        { updatedAt: query.state.dataUpdatedAt },
      );
    } else if (query.queryKey[2] === "properties") {
      client.setQueryData(
        query.queryKey,
        { ...data, membershipInvalidated: true },
        { updatedAt: query.state.dataUpdatedAt },
      );
    } else continue;
    void client.invalidateQueries({ queryKey: query.queryKey, exact: true }).catch(() => undefined);
  }
}

export function reconcilePagePropertyReferences(
  client: QueryClient,
  event: DatabaseMutationEventV2,
  cacheId: string,
) {
  const changes = event.changes;
  for (const query of client.getQueryCache().findAll({ queryKey: ["page"] })) {
    const data = query.state.data as PageDetailReference | PagePropertiesReference | undefined;
    if (!data) continue;
    const detail = query.queryKey.length === 2 && "page" in data ? data : undefined;
    const properties = query.queryKey[2] === "properties" && "cacheId" in data ? data : undefined;
    const context = detail?.propertyContext ?? properties;
    if (!context || (detail?.page.cacheId ?? properties?.cacheId) !== cacheId) continue;
    const pageId = String(query.queryKey[1]);
    const records = (changes.records ?? []).filter((record) => record.pageId === pageId);
    if (!context.databaseIds?.includes(event.databaseId) && !records.length) continue;
    const version = context.databaseVersions?.[event.databaseId];
    if (version !== undefined && event.version <= version) continue;
    const targets = context.presenceTargets ?? [];
    const membershipChanged =
      event.requiresReset ||
      version === undefined ||
      event.version > version + 1 ||
      !!(
        changes.properties?.some(
          (binding) =>
            binding.property.deletedAt ||
            targets.some(
              (target) =>
                target.dataSourceId === binding.dataSourceId &&
                !target.propertyIds.includes(binding.propertyId),
            ),
        ) ||
        changes.removedPropertyIds?.length ||
        changes.dataSources?.length ||
        changes.removedDataSourceIds?.length
      ) ||
      targets.some((target) => changes.removedRecordIds?.includes(target.rowId)) ||
      records.some(
        (record) =>
          record.page.deletedAt ||
          !targets.some(
            (target) =>
              target.databaseId === event.databaseId &&
              target.dataSourceId === record.dataSourceId &&
              target.rowId === record.id,
          ),
      );
    if (membershipChanged) {
      invalidatePagePropertyContexts(client, event.databaseId, cacheId, pageId);
      continue;
    }
    const databaseVersions = { ...context.databaseVersions, [event.databaseId]: event.version };
    const next = detail
      ? { ...detail, propertyContext: { ...detail.propertyContext!, databaseVersions } }
      : {
          ...properties!,
          databaseVersions,
          ...(properties!.propertyContext
            ? { propertyContext: { ...properties!.propertyContext, databaseVersions } }
            : {}),
        };
    // An admitted delta advances membership proof, not the age of its supporting reads.
    client.setQueryData(query.queryKey, next, { updatedAt: query.state.dataUpdatedAt });
  }
}

/** Apply sparse pending intentions to an already authorized property projection. */
export function projectPagePropertyIntentions(
  data: PagePropertiesPayload | undefined,
  pageId: string,
  intentions: readonly import("../databases/interactions/model").DatabaseIntention[],
) {
  if (!data) return data;
  let values = data.values;
  for (const intention of intentions) {
    if (intention.status === "committed") continue;
    for (const effect of intention.effects) {
      const target = data.presenceTargets?.find(
        (target) => target.dataSourceId === effect.dataSourceId && target.rowId === effect.rowId,
      );
      if (!target) continue;
      for (const [propertyId, value] of Object.entries(effect.values ?? {})) {
        const property = data.properties.find((property) => property.id === propertyId);
        if (!property || !target.propertyIds.includes(propertyId)) continue;
        const previous = values.find((candidate) => candidate.propertyId === propertyId);
        if (JSON.stringify(previous?.value) === JSON.stringify(value)) continue;
        const next = {
          ...previous,
          id: previous?.id ?? `draft:${effect.rowId}:${propertyId}`,
          pageId,
          propertyId,
          value,
          createdAt: previous?.createdAt ?? property.createdAt,
          updatedAt: previous?.updatedAt ?? property.updatedAt,
        };
        values = [...values.filter((candidate) => candidate.propertyId !== propertyId), next];
      }
    }
  }
  return values === data.values ? data : { ...data, values };
}
