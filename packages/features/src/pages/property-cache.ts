import { z } from "zod";
import type { QueryClient } from "@tanstack/react-query";
import { sharedClient, type SharedClient } from "../data/client";
import type { PagePropertiesPayload } from "./contracts";
import { propertyCacheEntitySchema } from "../databases/schema/cache-entities";
import { valueIdentity, valueCacheEntitySchema } from "../databases/schema/cache-entities";
import { pagePropertyValueEntitySchema } from "../databases/core/entities";
import {
  databaseBootstrapReferenceSchema,
  databaseWindowReferenceSchema,
  resolveDatabaseBootstrap,
} from "../databases/cache-references";
import type { PageDetailReference } from "./cache";

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
};

export type PagePropertyCoverage = {
  state: "missing" | "partial" | "complete";
  data?: PagePropertiesPayload;
  reference?: PagePropertiesReference;
  updatedAt: number;
};

/** A loaded result proves its own rows, never the page's entire membership. */
export function readCachedPagePropertyCoverage(
  client: QueryClient,
  pageId: string,
  databaseId?: string | null,
): PagePropertyCoverage {
  const missing: PagePropertyCoverage = { state: "missing", updatedAt: 0 };
  const detailState = client.getQueryState<PageDetailReference | null>(["page", pageId]);
  const detail = detailState?.data;
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
      state: cached.properties.length === existing!.propertyIds.length ? "complete" : "partial",
      data: cached,
      reference: existing,
      updatedAt: propertyState!.dataUpdatedAt,
    };
  }
  if (!databaseId || (detail && detail.viewerType !== "member")) return missing;
  const cache = sharedClient(client);
  for (const query of client.getQueryCache().findAll({ queryKey: ["db"] })) {
    if (query.queryKey[2] !== databaseId || query.queryKey[3] !== "bootstrap") continue;
    const parsed = databaseBootstrapReferenceSchema.safeParse(query.state.data);
    if (!parsed.success) continue;
    const ref = parsed.data;
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
        const record = window.data.recordIds
          .map((id) => owner.databases.resolveRecord(id))
          .find((row) => row?.pageId === pageId && row.dataSourceId === window.data.dataSourceId);
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
          databaseIds: [databaseId],
          databaseVersions: { [databaseId]: window.data.databaseVersion },
          presenceTargets: [
            { databaseId, dataSourceId: record.dataSourceId, rowId: record.id, propertyIds },
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
  const { cacheId: _cacheId, propertyIds, pageId, valuePropertyIds, ...context } = reference;
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
