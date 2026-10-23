import { sharedClient } from "../data/client";
import { publishDatabaseEvent } from "../databases/cache-publication";
import type { DatabaseMutationEventV2 } from "../databases/core/entities";
import { setPageDetailCache } from "../shared/item-action-cache";
import { captureClientOperation, type ClientOperationContext } from "../shared/operation-context";
import { readCachedPage, resolvePageDetailReference } from "./cache";
import { createPage } from "./content-operations";
import type { Page } from "./contracts";
import { buildPageDuplicateInput, hasPageBodyContent } from "./models";
import type { PagePropertiesReference } from "./property-cache";
import {
  resolvePageProperties,
  readCachedPagePropertyCoverage,
  PAGE_PROPERTY_STALE_TIME,
} from "./property-cache";
import { submitRecordChange } from "../databases/interactions/record-change";
import { clientDatabaseController } from "../shared/operation-context";
import {
  pagePropertiesQueryKey,
  pagePropertiesQueryOptions,
  pageQueryKey,
  pageQueryOptions,
} from "./queries";

export async function getPage(
  context: ClientOperationContext,
  input: { pageId: string; fresh?: boolean },
) {
  const scope = captureClientOperation(context);
  const reference = await context.queryClient.fetchQuery({
    ...pageQueryOptions(scope.context.apiFetch, input.pageId),
    ...(input.fresh ? { staleTime: 0 } : {}),
  });
  scope.assertCurrent();
  return resolvePageDetailReference(context.queryClient, reference);
}

export async function getPageContent(context: ClientOperationContext, input: { pageId: string }) {
  const detail = await getPage(context, input);
  return detail ? { content: detail.page.content, updatedAt: detail.page.updatedAt } : null;
}

/** Preserve existing duplication: create one page from its current body/metadata. */
export async function duplicatePage(
  context: ClientOperationContext,
  input: { pageId: string; parentItemId?: string },
) {
  const scope = captureClientOperation(context);
  const detail = await getPage(context, input);
  scope.assertCurrent();
  if (!detail) throw new Error("Page not found");
  return createPage(context, buildPageDuplicateInput(detail.page, input.parentItemId));
}

export type ReplacePageContentInput = { pageId: string; content: unknown; baseUpdatedAt?: string };
export async function replacePageContent(
  context: ClientOperationContext,
  input: ReplacePageContentInput,
) {
  const scope = captureClientOperation(context);
  const previous = readCachedPage(context.queryClient, input.pageId);
  const result = await scope.context.apiFetch<{ page: Pick<Page, "id" | "updatedAt"> | Page }>(
    `/pages/${encodeURIComponent(input.pageId)}/content`,
    {
      method: "PATCH",
      body: JSON.stringify({
        content: input.content,
        baseUpdatedAt: input.baseUpdatedAt ?? previous?.updatedAt,
      }),
    },
  );
  scope.assertCurrent();
  if (previous)
    setPageDetailCache(
      context.queryClient,
      {
        ...previous,
        ...result.page,
        content: input.content,
        hasContent: hasPageBodyContent(input.content),
      },
      scope.read,
    );
  else await context.queryClient.invalidateQueries({ queryKey: pageQueryKey(input.pageId) });
  return result;
}

export async function getPageProperties(
  context: ClientOperationContext,
  input: { pageId: string },
) {
  const scope = captureClientOperation(context);
  const result = await context.queryClient.fetchQuery(
    pagePropertiesQueryOptions(scope.context.apiFetch, input.pageId),
  );
  scope.assertCurrent();
  return resolvePageProperties(context.queryClient, result);
}

export async function updatePagePropertyValue(
  context: ClientOperationContext,
  input: { pageId: string; propertyId: string; value: unknown },
) {
  const scope = captureClientOperation(context);
  const result = await scope.context.apiFetch<{ events: DatabaseMutationEventV2[] }>(
    `/pages/${encodeURIComponent(input.pageId)}/properties/${encodeURIComponent(input.propertyId)}/value`,
    { method: "PUT", body: JSON.stringify({ value: input.value }) },
  );
  scope.assertCurrent();
  const reference = context.queryClient.getQueryData<PagePropertiesReference>(
    pagePropertiesQueryKey(input.pageId),
  );
  const owner = reference ? sharedClient(context.queryClient).get(reference.cacheId) : undefined;
  let confirmed = Boolean(owner && result.events.length);
  if (owner) {
    for (const event of result.events)
      if (publishDatabaseEvent(context.queryClient, owner, event) !== "published")
        confirmed = false;
  } else await context.queryClient.invalidateQueries({ queryKey: ["db"] });
  scope.assertCurrent();
  if (!confirmed)
    await context.queryClient.invalidateQueries({ queryKey: pagePropertiesQueryKey(input.pageId) });
  return result;
}

export type GetPageInput = Parameters<typeof getPage>[1];
export type GetPageResult = Awaited<ReturnType<typeof getPage>>;
export type GetPageContentInput = Parameters<typeof getPageContent>[1];
export type GetPageContentResult = Awaited<ReturnType<typeof getPageContent>>;
export type DuplicatePageInput = Parameters<typeof duplicatePage>[1];
export type DuplicatePageResult = Awaited<ReturnType<typeof duplicatePage>>;
export type ReplacePageContentResult = Awaited<ReturnType<typeof replacePageContent>>;
export type GetPagePropertiesInput = Parameters<typeof getPageProperties>[1];
export type GetPagePropertiesResult = Awaited<ReturnType<typeof getPageProperties>>;
export type UpdatePagePropertyValueInput = Parameters<typeof updatePagePropertyValue>[1];
export type UpdatePagePropertyValueResult = Awaited<ReturnType<typeof updatePagePropertyValue>>;

export type ChangePagePropertyInput = {
  pageId: string;
  propertyId: string;
  value: unknown;
  databaseId?: string | null;
};
type PendingPropertyEdit = {
  input: ChangePagePropertyInput;
  submitted: boolean;
  current: () => boolean;
  promise: Promise<void>;
};
const propertyEdits = new WeakMap<
  ClientOperationContext["queryClient"],
  Map<string, PendingPropertyEdit>
>();

/** Retain user intentions across a read, never authorization or copied entity state. */
export function changePagePropertyValue(
  context: ClientOperationContext,
  input: ChangePagePropertyInput,
): Promise<void> {
  const scope = captureClientOperation(context);
  const client = context.queryClient;
  const key = JSON.stringify([input.pageId, input.propertyId, input.databaseId ?? null]);
  const pending = propertyEdits.get(client) ?? new Map<string, PendingPropertyEdit>();
  propertyEdits.set(client, pending);
  const existing = pending.get(key);
  if (existing?.current() && !existing.submitted) {
    existing.input = input;
    return existing.promise;
  }
  const edit: PendingPropertyEdit = {
    input,
    submitted: false,
    current: scope.isCurrent,
    promise: Promise.resolve(),
  };
  pending.set(key, edit);
  edit.promise = (async () => {
    try {
      let coverage = readCachedPagePropertyCoverage(client, input.pageId, input.databaseId);
      const verified = Math.min(
        coverage.updatedAt,
        coverage.reference?.verifiedAt ?? coverage.updatedAt,
      );
      if (
        coverage.state !== "complete" ||
        Date.now() - verified >= PAGE_PROPERTY_STALE_TIME ||
        client.getQueryState(pagePropertiesQueryKey(input.pageId))?.isInvalidated
      ) {
        await client.fetchQuery({
          ...pagePropertiesQueryOptions(scope.context.apiFetch, input.pageId),
          staleTime: 0,
        });
        scope.assertCurrent();
        coverage = readCachedPagePropertyCoverage(client, input.pageId, input.databaseId);
      }
      scope.assertCurrent();
      const latest = edit.input;
      const targets = (coverage.data?.presenceTargets ?? []).filter(
        (target) =>
          target.propertyIds.includes(latest.propertyId) &&
          (!latest.databaseId || target.databaseId === latest.databaseId),
      );
      if (
        coverage.state !== "complete" ||
        targets.length !== 1 ||
        !coverage.data?.properties.some(
          (property) => property.id === latest.propertyId && !property.deletedAt,
        )
      )
        throw new Error("This property is no longer editable in this page. Refresh and try again.");
      const target = targets[0]!;
      edit.submitted = true;
      await submitRecordChange(clientDatabaseController(scope.context), {
        databaseId: target.databaseId,
        dataSourceId: target.dataSourceId,
        rowId: target.rowId,
        valuesByPropertyId: { [latest.propertyId]: latest.value },
      });
    } finally {
      if (pending.get(key) === edit) pending.delete(key);
    }
  })();
  return edit.promise;
}
